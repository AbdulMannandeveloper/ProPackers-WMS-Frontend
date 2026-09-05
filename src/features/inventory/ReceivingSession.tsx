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
      <div className="mx-auto w-full max-w-2xl space-y-5 p-6">
        <div className="border border-slate-200 border-l-4 border-l-amber-500 bg-white px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-amber-700">
            Not in the catalogue
          </p>
          <p className="mt-0.5 font-mono text-lg font-semibold text-slate-900">
            {draft.barcode || 'New product'}
          </p>
          <p className="mt-1 text-[13px] text-slate-600">
            Enter its details. The product is created when the delivery is confirmed.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="draft-client"
              className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.09em] text-slate-500"
            >
              Client
            </label>
            <Select
              id="draft-client"
              className="h-10 text-sm [@media(pointer:coarse)]:h-12"
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
            <label
              htmlFor="draft-sku"
              className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.09em] text-slate-500"
            >
              SKU
            </label>
            <Input
              id="draft-sku"
              className="h-10 font-mono text-sm [@media(pointer:coarse)]:h-12"
              value={draft.skuCode}
              onChange={(e) => setDraft({ ...draft, skuCode: e.target.value })}
              placeholder="PRO-PK-T-BLUE"
              autoFocus
            />
          </div>

          <div>
            <label
              htmlFor="draft-name"
              className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.09em] text-slate-500"
            >
              Name
            </label>
            <Input
              id="draft-name"
              className="h-10 text-sm [@media(pointer:coarse)]:h-12"
              value={draft.productName}
              onChange={(e) => setDraft({ ...draft, productName: e.target.value })}
              placeholder="Polyester tape, blue"
            />
          </div>

          <button
            type="button"
            onClick={() => setDraftExtras((v) => !v)}
            className="text-[13px] font-medium text-blue-700 hover:underline"
          >
            {draftExtras ? 'Fewer details' : 'More details (colour, size, weight)'}
          </button>

          {draftExtras ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                aria-label="Colour"
                className="h-10 text-sm [@media(pointer:coarse)]:h-12"
                placeholder="Colour"
                value={draft.colour ?? ''}
                onChange={(e) => setDraft({ ...draft, colour: e.target.value })}
              />
              <Input
                aria-label="Size"
                className="h-10 text-sm [@media(pointer:coarse)]:h-12"
                placeholder="Size"
                value={draft.size ?? ''}
                onChange={(e) => setDraft({ ...draft, size: e.target.value })}
              />
              <Input
                aria-label="Weight in kilograms"
                className="h-10 text-sm [@media(pointer:coarse)]:h-12"
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
                className="h-10 text-sm [@media(pointer:coarse)]:h-12"
                type="number"
                min="0"
                placeholder="Threshold"
                value={draft.thresholdLimit ?? ''}
                onChange={(e) => setDraft({ ...draft, thresholdLimit: Number(e.target.value) || 0 })}
              />
            </div>
          ) : null}

          {draftError ? (
            <p
              className="border border-slate-200 border-l-4 border-l-rose-600 bg-white px-4 py-3 text-sm text-rose-700"
              role="alert"
            >
              {draftError}
            </p>
          ) : null}

          <div className="flex gap-2">
            <Button
              className="h-10 flex-1 text-sm [@media(pointer:coarse)]:h-12"
              onClick={commitDraft}
            >
              <Check size={16} className="mr-1.5" />
              Add item
            </Button>
            <Button
              variant="outline"
              className="h-10 px-4 text-sm [@media(pointer:coarse)]:h-12"
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
      <header className="border-b border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
          <h1 className="text-base font-semibold tracking-tight text-slate-900">Goods In</h1>
          <span className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.09em] text-slate-500">
            Receiving
          </span>

          {/* Labelled, not bare icons: nobody guesses what a speaker glyph
              does on a warehouse screen. */}
          <button
            type="button"
            onClick={toggleMute}
            aria-pressed={muted}
            className="ml-auto flex h-9 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-50 [@media(pointer:coarse)]:h-11"
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            {muted ? 'Sound off' : 'Sound on'}
          </button>

          <button
            type="button"
            onClick={onDone}
            className="flex h-9 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-50 [@media(pointer:coarse)]:h-11"
          >
            <X size={16} />
            Finish
          </button>
        </div>

        <StepRail
          current={lines.length > 0 ? 3 : 2}
          steps={[
            { label: 'Location' },
            { label: 'Scan items', hint: 'A repeat scan adds one' },
            { label: 'Confirm', hint: 'Nothing is written yet' },
          ]}
        />

        {/* The working set: where it is going, and what is on the delivery so
            far. Read left to right without scrolling to the footer. */}
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3 border-t border-slate-200 px-5 py-3">
          <div className="min-w-[15rem] flex-1 sm:max-w-xs">
            <label
              htmlFor="receiving-location"
              className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.09em] text-slate-500"
            >
              Location
            </label>
            <Select
              id="receiving-location"
              className="h-9 text-sm font-medium [@media(pointer:coarse)]:h-11"
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

          <dl className="flex items-end gap-6">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-[0.09em] text-slate-500">
                Lines
              </dt>
              <dd className="text-lg font-semibold tabular-nums leading-tight text-slate-900">
                {summary.lines}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-[0.09em] text-slate-500">
                Units
              </dt>
              <dd className="text-lg font-semibold tabular-nums leading-tight text-slate-900">
                {summary.units}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-[0.09em] text-slate-500">
                New
              </dt>
              <dd
                className={`text-lg font-semibold tabular-nums leading-tight ${
                  summary.newProducts > 0 ? 'text-amber-700' : 'text-slate-400'
                }`}
              >
                {summary.newProducts}
              </dd>
            </div>
          </dl>
        </div>
      </header>

      <div className="flex-1 space-y-4 bg-slate-50 p-5">
        {/* Says the gun is live, then reports what it read. */}
        <ScanPanel
          outcome={lastScan}
          idleHint="Scanner is live. A repeat scan of the same item adds one."
        />

        {/* Typing and the camera, for a damaged label or a tablet. The gun
            needs nothing here — it is heard wherever the cursor is. */}
        <div className="flex flex-wrap gap-2">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void handleCode(manual)
            }}
            className="flex min-w-[18rem] flex-1 gap-2"
          >
            <Input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="Barcode or SKU"
              aria-label="Barcode or SKU"
              className="h-10 font-mono text-sm [@media(pointer:coarse)]:h-12"
              loading={looking}
            />
            <Button
              type="submit"
              variant="secondary"
              className="h-10 px-4 text-sm [@media(pointer:coarse)]:h-12"
              disabled={!manual.trim() || looking}
            >
              Add
            </Button>
          </form>

          <Button
            variant="outline"
            className="h-10 px-4 text-sm [@media(pointer:coarse)]:h-12"
            onClick={() => setScannerOpen(true)}
          >
            <Camera size={16} className="mr-1.5" />
            Camera
          </Button>
        </div>

        {error ? (
          <div
            className="border border-slate-200 border-l-4 border-l-rose-600 bg-white px-4 py-3 text-sm text-rose-700"
            role="alert"
          >
            {error}
          </div>
        ) : null}

        {/* A manifest. Newest first: what just happened is at the top, not
            under nine earlier lines. */}
        <div className="overflow-x-auto border border-slate-200 bg-white">
          <table className="w-full min-w-[48rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-[0.09em] text-slate-500">
                <th scope="col" className="px-4 py-2 font-semibold">
                  Item
                </th>
                <th scope="col" className="px-4 py-2 font-semibold">
                  SKU
                </th>
                <th scope="col" className="px-4 py-2 text-center font-semibold">
                  Qty
                </th>
                <th scope="col" className="px-4 py-2 font-semibold">
                  Location
                </th>
                <th scope="col" className="px-4 py-2 text-right font-semibold">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-400">
                    No items on this delivery yet.
                  </td>
                </tr>
              ) : (
                [...lines].reverse().map((line) => {
                  const name = isNewLine(line) ? line.draft.productName : line.productName
                  const sku = isNewLine(line) ? line.draft.skuCode : line.skuCode

                  return (
                    <tr key={line.key} className="align-middle">
                      <td className="px-4 py-2.5">
                        <span className="font-medium text-slate-900">{name}</span>
                        {isNewLine(line) ? (
                          <span className="ml-2 rounded-sm border border-amber-300 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.09em] text-amber-700">
                            New
                          </span>
                        ) : null}
                      </td>

                      <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{sku}</td>

                      {/* Steppers, not a spinner: a number input's arrows are
                          far too small for a gloved hand. */}
                      <td className="px-4 py-2.5">
                        <div className="mx-auto flex w-fit items-center">
                          <button
                            type="button"
                            onClick={() => bump(line.key, -1)}
                            aria-label={`One fewer ${name}`}
                            className="flex size-8 items-center justify-center rounded-l-md border border-slate-300 text-slate-600 transition-colors hover:bg-slate-100 [@media(pointer:coarse)]:size-11"
                          >
                            <Minus size={14} />
                          </button>
                          <Input
                            type="number"
                            min="1"
                            className="h-8 w-14 rounded-none border-x-0 text-center text-sm font-semibold tabular-nums [@media(pointer:coarse)]:h-11"
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
                            className="flex size-8 items-center justify-center rounded-r-md border border-slate-300 text-slate-600 transition-colors hover:bg-slate-100 [@media(pointer:coarse)]:size-11"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      </td>

                      <td className="px-4 py-2.5">
                        <Select
                          className="h-8 w-44 text-xs [@media(pointer:coarse)]:h-11"
                          value={line.locationId ?? locationId}
                          aria-label={`Location for ${name}`}
                          onChange={(e) =>
                            setLines((prev) => setLineLocation(prev, line.key, e.target.value))
                          }
                        >
                          {locations.map((l) => (
                            <option key={l.id} value={l.id}>
                              {locationLabel(l)}
                            </option>
                          ))}
                        </Select>
                      </td>

                      <td className="px-4 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => setLines((prev) => removeLine(prev, line.key))}
                          className="rounded-md px-2 py-1.5 text-[13px] font-medium text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-700 [@media(pointer:coarse)]:px-3 [@media(pointer:coarse)]:py-2.5"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Always reachable, never scrolled past. */}
      <footer className="sticky bottom-0 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-slate-200 bg-white px-5 py-3">
        <p className="text-sm text-slate-600">
          <span className="font-semibold tabular-nums text-slate-900">{summary.units}</span>{' '}
          {summary.units === 1 ? 'unit' : 'units'} on{' '}
          <span className="font-semibold tabular-nums text-slate-900">{summary.lines}</span>{' '}
          {summary.lines === 1 ? 'line' : 'lines'}
        </p>

        {blocker && lines.length > 0 ? (
          <p className="text-[13px] text-amber-700">{blocker}</p>
        ) : null}

        <Button
          className="ml-auto h-10 px-5 text-sm [@media(pointer:coarse)]:h-12"
          onClick={() => setConfirming(true)}
          disabled={Boolean(blocker)}
          loading={committing}
        >
          {committing ? 'Confirming…' : 'Confirm receipt'}
        </Button>
      </footer>

      <ConfirmCommit
        open={confirming}
        title="Confirm receipt"
        confirmLabel="Confirm receipt"
        busy={committing}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void commit()}
        facts={[
          {
            label: 'Units',
            value: `${summary.units} on ${summary.lines} ${summary.lines === 1 ? 'line' : 'lines'}`,
          },
          {
            label: 'Location',
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
