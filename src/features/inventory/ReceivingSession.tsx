import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, Check, Minus, Plus, Volume2, VolumeX, X } from 'lucide-react'

import { inventory as inventoryApi, products as productsApi } from '@/api'
import type { Product } from '@/api/products'
import { Button, Input, Select, Spinner } from '@/components/Shared Components'
import { BarcodeScanner, createWedgeListener } from '@/components/scanner'
import { ConfirmCommit } from '@/features/scanning/ConfirmCommit'
import { ScanPanel, type ScanOutcome } from '@/features/scanning/ScanPanel'
import { StepRail } from '@/features/scanning/StepRail'
import { useDefaultSelection } from '@/hooks/useDefaultSelection'
import { errorMessage } from '@/lib/errors'
import { isMuted, setMuted, signal } from '@/lib/feedback'

import {
  addNewProductLine,
  addScannedProduct,
  findLineByCode,
  findSkuClash,
  isNewLine,
  removeLine,
  setLineLocation,
  setQuantity,
  toBatchPayload,
  totals,
  validateBasket,
  type NewProductDraft,
  type ReceivingLine,
} from './receiving'

/**
 * Goods-in, sized for someone holding a carton.
 *
 * Three things drive the layout, all of them from how a bench actually runs:
 *
 * 1. The gun is the main input. A USB or Bluetooth scanner in HID mode types
 *    the code and presses Enter, so this listens on the document and nothing
 *    needs focus. Typing and the camera are the other two ways in, and all
 *    three land in the same place.
 * 2. The eyes are on the carton, not the screen. Every scan beeps and buzzes,
 *    and the last one is the biggest thing on the page, so confirming it takes
 *    a glance rather than a read.
 * 3. The hands may be gloved. Steppers instead of a number spinner, labelled
 *    buttons instead of icons, generous rows.
 *
 * Nothing is written until Check in, which is what lets a mis-scan be deleted
 * rather than reversed.
 */

type LocationOption = {
  id: string
  locationName: string
  materializedPath?: string | null
  zone?: string | null
}

type ClientOption = { id: string; companyName: string }

type Props = {
  locations: LocationOption[]
  clients: ClientOption[]
  /** Used to catch a SKU the client already has before committing. */
  catalogue: Product[]
  onDone: () => void
  onReceived: (summary: { linesReceived: number; productsCreated: number }) => void
}

const locationLabel = (l: LocationOption) => l.materializedPath || l.locationName

const EMPTY_DRAFT = (clientId: string, barcode: string): NewProductDraft => ({
  clientId,
  skuCode: '',
  productName: '',
  barcode: barcode || null,
})


export function ReceivingSession({
  locations,
  clients,
  catalogue,
  onDone,
  onReceived,
}: Props) {
  const [locationId, setLocationId] = useState(locations[0]?.id ?? '')
  const [lines, setLines] = useState<ReceivingLine[]>([])
  const [scannerOpen, setScannerOpen] = useState(false)
  const [manual, setManual] = useState('')
  const [looking, setLooking] = useState(false)
  const [error, setError] = useState('')
  const [committing, setCommitting] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [muted, setMutedState] = useState(isMuted)
  const [lastScan, setLastScan] = useState<ScanOutcome | null>(null)

  const [draft, setDraft] = useState<NewProductDraft | null>(null)
  const [draftExtras, setDraftExtras] = useState(false)
  const [draftError, setDraftError] = useState('')

  const lastClientId = useRef<string>('')

  // Same trap as the product form: a select whose value matches no option still
  // renders the first one, so an empty state behind a filled-looking dropdown
  // gets the delivery refused with nothing on screen to explain it.
  useDefaultSelection(locationId, setLocationId, locations)

  const locationLabelFor = (id: string) => {
    const found = locations.find((l) => l.id === id)
    return found ? locationLabel(found) : 'no shelf chosen'
  }

  const summary = useMemo(() => totals(lines), [lines])
  const blocker = useMemo(
    () => validateBasket(lines, locationId || undefined),
    [lines, locationId],
  )

  // handleCode closes over `lines` and `draft`, and the wedge listener is
  // attached once. A ref keeps the listener calling the current version rather
  // than the one from first render.
  const handleCodeRef = useRef<(code: string) => void>(() => {})

  const handleCode = async (raw: string) => {
    const code = raw.trim()
    if (!code || looking) return

    setError('')
    setManual('')

    // Already on the delivery: count it without another round trip. The second
    // scan of a carton has to feel instant.
    const known = findLineByCode(lines, code)
    if (known) {
      const next = known.quantity + 1
      setLines((prev) =>
        prev.map((l) => (l.key === known.key ? { ...l, quantity: next } : l)),
      )
      setLastScan({
        tone: 'ok',
        title: isNewLine(known) ? known.draft.productName : known.productName,
        detail: isNewLine(known) ? known.draft.skuCode : known.skuCode,
        count: next,
      })
      signal('accepted')
      return
    }

    setLooking(true)
    try {
      const { matches } = await productsApi.lookupByCode(code)

      if (matches.length === 1) {
        const product = matches[0]
        setLines((prev) => addScannedProduct(prev, product))
        lastClientId.current = product.clientId || lastClientId.current
        setLastScan({
          tone: 'ok',
          title: product.productName,
          detail: product.skuCode,
          count: 1,
        })
        signal('accepted')
        return
      }

      if (matches.length > 1) {
        // SKUs are unique per client, not globally. Guessing would put the
        // stock on the wrong client's inventory and eventually their invoice.
        setError(
          `${code} matches ${matches.length} products across different clients. Add it from the Products tab instead.`,
        )
        setLastScan({
          tone: 'refused',
          title: 'Which client is this?',
          detail: `${code} belongs to ${matches.length} different clients`,
        })
        signal('refused')
        return
      }

      openDraftFor(code)
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 404) {
        openDraftFor(code)
      } else {
        setError(errorMessage(err, 'Could not look that code up.'))
        signal('refused')
      }
    } finally {
      setLooking(false)
    }
  }

  const openDraftFor = (code: string) => {
    setDraft(EMPTY_DRAFT(lastClientId.current || clients[0]?.id || '', code))
    setDraftError('')
    setLastScan({
      tone: 'attention',
      title: 'Not in the catalogue yet',
      detail: `${code} — tell us what it is below`,
    })
    signal('attention')
  }

  handleCodeRef.current = (code: string) => void handleCode(code)

  // The gun. Paused while the new-product form is open, so typing a SKU into it
  // is never mistaken for a scan.
  useEffect(() => {
    if (draft) return
    return createWedgeListener({ onScan: (value) => handleCodeRef.current(value) })
  }, [draft])

  const toggleMute = () => {
    const next = !muted
    setMuted(next)
    setMutedState(next)
  }

  const bump = (key: string, by: number) => {
    setLines((prev) =>
      prev.map((l) =>
        l.key === key ? { ...l, quantity: Math.max(1, l.quantity + by) } : l,
      ),
    )
  }

  const commitDraft = () => {
    if (!draft) return

    if (!draft.clientId || !draft.skuCode.trim() || !draft.productName.trim()) {
      setDraftError('Client, SKU and name are needed before this can be received.')
      signal('refused')
      return
    }

    const clash = findSkuClash(lines, catalogue, draft)
    if (clash) {
      setDraftError(clash)
      signal('refused')
      return
    }

    setLines((prev) => addNewProductLine(prev, draft))
    lastClientId.current = draft.clientId
    setLastScan({
      tone: 'ok',
      title: draft.productName,
      detail: `${draft.skuCode} — new product, created when you finish`,
      count: 1,
    })
    signal('accepted')
    setDraft(null)
    setDraftExtras(false)
    setDraftError('')
  }

  const commit = async () => {
    if (blocker || committing) return
    setConfirming(false)

    setCommitting(true)
    setError('')
    try {
      const result = await inventoryApi.checkInBatch(
        toBatchPayload(lines, locationId || undefined),
      )
      setLines([])
      setLastScan(null)
      onReceived(result)
    } catch (err) {
      setError(errorMessage(err, 'Could not check this delivery in.'))
      signal('refused')
    } finally {
      setCommitting(false)
    }
  }

  /* ── The new-product step takes the screen, rather than pushing the list
        around while somebody is mid-flow. ─────────────────────────────────── */
  if (draft) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-6 p-6">
        <div className="rounded-3xl border-2 border-amber-300 bg-amber-50 p-6">
          <p className="text-sm font-semibold uppercase tracking-wider text-amber-800">
            Not in the catalogue
          </p>
          <p className="mt-1 font-mono text-2xl font-bold text-slate-900">
            {draft.barcode || 'New product'}
          </p>
          <p className="mt-2 text-base text-slate-700">
            Tell us what it is, and it will be created when the delivery is checked in.
          </p>
        </div>

        <div className="space-y-5">
          <div>
            <label htmlFor="draft-client" className="mb-2 block text-sm font-semibold text-slate-700">
              Client
            </label>
            <Select
              id="draft-client"
              className="h-14 text-base"
              value={draft.clientId}
              onChange={(e) => setDraft({ ...draft, clientId: e.target.value })}
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.companyName}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label htmlFor="draft-sku" className="mb-2 block text-sm font-semibold text-slate-700">
              SKU
            </label>
            <Input
              id="draft-sku"
              className="h-14 text-base"
              value={draft.skuCode}
              onChange={(e) => setDraft({ ...draft, skuCode: e.target.value })}
              placeholder="PRO-PK-T-BLUE"
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="draft-name" className="mb-2 block text-sm font-semibold text-slate-700">
              Name
            </label>
            <Input
              id="draft-name"
              className="h-14 text-base"
              value={draft.productName}
              onChange={(e) => setDraft({ ...draft, productName: e.target.value })}
              placeholder="Polyester tape, blue"
            />
          </div>

          <button
            type="button"
            onClick={() => setDraftExtras((v) => !v)}
            className="text-sm font-semibold text-cyan-700 hover:underline"
          >
            {draftExtras ? 'Fewer details' : 'More details (colour, size, weight)'}
          </button>

          {draftExtras ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                aria-label="Colour"
                className="h-14 text-base"
                placeholder="Colour"
                value={draft.colour ?? ''}
                onChange={(e) => setDraft({ ...draft, colour: e.target.value })}
              />
              <Input
                aria-label="Size"
                className="h-14 text-base"
                placeholder="Size"
                value={draft.size ?? ''}
                onChange={(e) => setDraft({ ...draft, size: e.target.value })}
              />
              <Input
                aria-label="Weight in kilograms"
                className="h-14 text-base"
                type="number"
                step="0.001"
                placeholder="Weight (kg)"
                value={draft.weight ?? ''}
                onChange={(e) =>
                  setDraft({ ...draft, weight: e.target.value ? Number(e.target.value) : null })
                }
              />
              <Input
                aria-label="Low stock threshold"
                className="h-14 text-base"
                type="number"
                min="0"
                placeholder="Threshold"
                value={draft.thresholdLimit ?? ''}
                onChange={(e) => setDraft({ ...draft, thresholdLimit: Number(e.target.value) || 0 })}
              />
            </div>
          ) : null}

          {draftError ? (
            <p className="rounded-2xl bg-rose-50 px-4 py-3 text-base text-rose-700" role="alert">
              {draftError}
            </p>
          ) : null}

          <div className="flex gap-3">
            <Button className="h-14 flex-1 text-base" onClick={commitDraft}>
              <Check size={20} className="mr-2" />
              Add and keep scanning
            </Button>
            <Button
              variant="outline"
              className="h-14 px-6 text-base"
              onClick={() => {
                setDraft(null)
                setLastScan(null)
              }}
            >
              Skip
            </Button>
          </div>
        </div>
      </div>
    )
  }

  /* ── The bench ────────────────────────────────────────────────────────── */
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white px-5 py-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Receive stock</h1>
            <p className="text-sm text-slate-500">Booking a delivery onto the shelf.</p>
          </div>

          {/* Labelled, not bare icons: nobody guesses what a speaker glyph
              does on a warehouse screen. */}
          <button
            type="button"
            onClick={toggleMute}
            aria-pressed={muted}
            className="flex h-12 items-center gap-2 rounded-2xl border border-slate-200 px-4 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            {muted ? 'Sound off' : 'Sound on'}
          </button>

          <button
            type="button"
            onClick={onDone}
            className="flex h-12 items-center gap-2 rounded-2xl border border-slate-200 px-4 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            <X size={20} />
            Finish
          </button>
        </div>

        <div className="mt-4">
          <StepRail
            current={lines.length > 0 ? 3 : 2}
            steps={[
              { label: 'Choose the shelf' },
              { label: 'Scan the goods', hint: 'Every scan adds one' },
              { label: 'Check and confirm', hint: 'Nothing is saved yet' },
            ]}
          />
        </div>

        <div className="mt-4 max-w-md">
          <label
            htmlFor="receiving-location"
            className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500"
          >
            Putting it on
          </label>
          <Select
            id="receiving-location"
            className="h-12 text-base font-semibold"
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            placeholder={locations.length ? undefined : 'No locations available'}
          >
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {locationLabel(l)}
              </option>
            ))}
          </Select>
        </div>
      </header>

      <div className="flex-1 space-y-5 p-5">
        {/* Says the gun is live, then becomes the confirmation. */}
        <ScanPanel
          outcome={lastScan}
          idleHint="Point the barcode gun at a label, or type the code in below. Scanning the same item again adds one more."
        />

        {/* Typing and the camera, for a damaged label or a tablet. The gun
            needs nothing here — it is heard wherever the cursor is. */}
        <div className="flex flex-wrap gap-3">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void handleCode(manual)
            }}
            className="flex min-w-[18rem] flex-1 gap-3"
          >
            <Input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="Type a barcode or SKU"
              aria-label="Barcode or SKU"
              className="h-14 text-base"
              loading={looking}
            />
            <Button type="submit" variant="secondary" className="h-14 px-6 text-base" disabled={!manual.trim() || looking}>
              Add
            </Button>
          </form>

          <Button
            variant="outline"
            className="h-14 px-6 text-base"
            onClick={() => setScannerOpen(true)}
          >
            <Camera size={20} className="mr-2" />
            Camera
          </Button>
        </div>

        {error ? (
          <div className="rounded-2xl border-2 border-rose-200 bg-rose-50 px-4 py-3 text-base text-rose-700" role="alert">
            {error}
          </div>
        ) : null}

        {/* Newest first: what just happened sits next to the card above it, not
            under nine earlier lines. */}
        <div className="space-y-3">
          {[...lines].reverse().map((line) => {
            const name = isNewLine(line) ? line.draft.productName : line.productName
            const sku = isNewLine(line) ? line.draft.skuCode : line.skuCode

            return (
              <div
                key={line.key}
                className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4"
              >
                <div className="min-w-[12rem] flex-1">
                  <p className="text-lg font-semibold text-slate-900">
                    {name}
                    {isNewLine(line) ? (
                      <span className="ml-2 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-amber-800">
                        New
                      </span>
                    ) : null}
                  </p>
                  <p className="font-mono text-sm text-slate-500">{sku}</p>
                </div>

                {/* Steppers, not a spinner: a number input's arrows are far too
                    small for a gloved hand. */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => bump(line.key, -1)}
                    aria-label={`One fewer ${name}`}
                    className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-300 text-slate-700 transition-colors hover:bg-slate-100"
                  >
                    <Minus size={20} />
                  </button>
                  <Input
                    type="number"
                    min="1"
                    className="h-12 w-20 text-center text-lg font-bold"
                    value={String(line.quantity)}
                    aria-label={`Quantity of ${name}`}
                    onChange={(e) =>
                      setLines((prev) => setQuantity(prev, line.key, Number(e.target.value)))
                    }
                  />
                  <button
                    type="button"
                    onClick={() => bump(line.key, 1)}
                    aria-label={`One more ${name}`}
                    className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-300 text-slate-700 transition-colors hover:bg-slate-100"
                  >
                    <Plus size={20} />
                  </button>
                </div>

                <Select
                  className="h-12 w-44 text-sm"
                  value={line.locationId ?? locationId}
                  aria-label={`Location for ${name}`}
                  onChange={(e) => setLines((prev) => setLineLocation(prev, line.key, e.target.value))}
                >
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {locationLabel(l)}
                    </option>
                  ))}
                </Select>

                <Button
                  variant="outline"
                  className="h-12 px-4"
                  onClick={() => setLines((prev) => removeLine(prev, line.key))}
                >
                  Remove
                </Button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Always reachable, never scrolled past. */}
      <footer className="sticky bottom-0 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 bg-white px-5 py-4">
        <div>
          <p className="text-2xl font-bold tabular-nums text-slate-900">
            {summary.units} {summary.units === 1 ? 'unit' : 'units'}
          </p>
          <p className="text-sm text-slate-500">
            {summary.lines} {summary.lines === 1 ? 'line' : 'lines'}
            {summary.newProducts > 0 ? ` · ${summary.newProducts} new` : ''}
            {blocker && lines.length > 0 ? ` · ${blocker}` : ''}
          </p>
        </div>
        <Button
          className="h-14 px-8 text-base"
          onClick={() => setConfirming(true)}
          disabled={Boolean(blocker)}
          loading={committing}
        >
          {committing ? 'Putting it away…' : 'Put it on the shelf'}
        </Button>
      </footer>

      <ConfirmCommit
        open={confirming}
        title="Put this delivery on the shelf?"
        confirmLabel="Yes, put it away"
        busy={committing}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void commit()}
        facts={[
          {
            label: 'Items',
            value: `${summary.units} across ${summary.lines} ${summary.lines === 1 ? 'line' : 'lines'}`,
          },
          {
            label: 'Going on',
            value: locationLabelFor(locationId),
          },
          ...(summary.newProducts > 0
            ? [
                {
                  label: 'New products',
                  value: `${summary.newProducts} will be created`,
                  emphasis: true,
                },
              ]
            : []),
        ]}
      />

      <BarcodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={(value) => void handleCode(value)}
        title="Scan the delivery"
        description="Keep scanning — the list builds as you go."
        continuous
      />

      {looking ? (
        <p className="pointer-events-none fixed bottom-24 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm text-white">
          <Spinner /> Looking that up…
        </p>
      ) : null}
    </div>
  )
}

export default ReceivingSession
