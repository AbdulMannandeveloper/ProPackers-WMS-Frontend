import { useMemo, useRef, useState } from 'react'
import { PackagePlus, ScanLine, Trash2, X } from 'lucide-react'

import { inventory as inventoryApi, products as productsApi } from '@/api'
import type { Product } from '@/api/products'
import { Button, Input, Select, Spinner } from '@/components/Shared Components'
import { BarcodeScanner } from '@/components/scanner'
import { useDefaultSelection } from '@/hooks/useDefaultSelection'
import { errorMessage } from '@/lib/errors'

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
 * Goods-in for a whole delivery.
 *
 * The old flow made an operator go scan → modal → location → quantity → save →
 * close → "scan next" for every carton on the pallet. This one asks for the bin
 * once and then gets out of the way: keep scanning, watch the list build, fix
 * anything at the end, commit once.
 *
 * Nothing is written until Check in. That is what lets a mis-scan be deleted
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
  open: boolean
  onClose: () => void
  locations: LocationOption[]
  clients: ClientOption[]
  /** Used to catch a SKU the client already has before committing. */
  catalogue: Product[]
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
  open,
  onClose,
  locations,
  clients,
  catalogue,
  onReceived,
}: Props) {
  const [locationId, setLocationId] = useState(locations[0]?.id ?? '')
  const [lines, setLines] = useState<ReceivingLine[]>([])
  const [scannerOpen, setScannerOpen] = useState(false)
  const [manual, setManual] = useState('')
  const [looking, setLooking] = useState(false)
  const [error, setError] = useState('')
  const [committing, setCommitting] = useState(false)

  // The unknown-code form. Held here rather than in a modal so scanning can
  // carry on around it.
  const [draft, setDraft] = useState<NewProductDraft | null>(null)
  const [draftExtras, setDraftExtras] = useState(false)
  const [draftError, setDraftError] = useState('')

  // Remembered across the session: a delivery is usually for one client.
  const lastClientId = useRef<string>('')

  // Same trap as the product form: a select whose value matches no option
  // still renders the first one, so an empty state behind a filled-looking
  // dropdown gets the delivery refused with nothing on screen to explain it.
  useDefaultSelection(locationId, setLocationId, locations)

  const summary = useMemo(() => totals(lines), [lines])
  const blocker = useMemo(
    () => validateBasket(lines, locationId || undefined),
    [lines, locationId],
  )

  /**
   * One code in, from the camera or the box. Known products fold straight into
   * the basket; unknown ones open the capture form.
   */
  const handleCode = async (raw: string) => {
    const code = raw.trim()
    if (!code || looking) return

    setError('')
    setManual('')

    // Already on the delivery? Count it without asking the server again — the
    // second scan of a carton should be instant.
    const known = findLineByCode(lines, code)
    if (known) {
      setLines((prev) =>
        prev.map((l) => (l.key === known.key ? { ...l, quantity: l.quantity + 1 } : l)),
      )
      return
    }

    setLooking(true)
    try {
      const { matches } = await productsApi.lookupByCode(code)

      if (matches.length === 1) {
        setLines((prev) => addScannedProduct(prev, matches[0]))
        lastClientId.current = matches[0].clientId || lastClientId.current
        return
      }

      if (matches.length > 1) {
        // SKUs are unique per client, so the same code can belong to two.
        // Guessing would put the stock on the wrong client's inventory.
        setError(
          `${code} matches ${matches.length} products across different clients. Add it from the Products tab instead.`,
        )
        return
      }

      setDraft(EMPTY_DRAFT(lastClientId.current || clients[0]?.id || '', code))
      setDraftError('')
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 404) {
        setDraft(EMPTY_DRAFT(lastClientId.current || clients[0]?.id || '', code))
        setDraftError('')
      } else {
        setError(errorMessage(err, 'Could not look that code up.'))
      }
    } finally {
      setLooking(false)
    }
  }

  const commitDraft = () => {
    if (!draft) return

    if (!draft.clientId || !draft.skuCode.trim() || !draft.productName.trim()) {
      setDraftError('Client, SKU and name are needed before this can be received.')
      return
    }

    const clash = findSkuClash(lines, catalogue, draft)
    if (clash) {
      setDraftError(clash)
      return
    }

    setLines((prev) => addNewProductLine(prev, draft))
    lastClientId.current = draft.clientId
    setDraft(null)
    setDraftExtras(false)
    setDraftError('')
  }

  const commit = async () => {
    if (blocker || committing) return

    setCommitting(true)
    setError('')
    try {
      const result = await inventoryApi.checkInBatch(
        toBatchPayload(lines, locationId || undefined),
      )
      setLines([])
      onReceived(result)
    } catch (err) {
      setError(errorMessage(err, 'Could not check this delivery in.'))
    } finally {
      setCommitting(false)
    }
  }

  if (!open) return null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-[14rem] flex-1">
          <label
            htmlFor="receiving-location"
            className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500"
          >
            Receiving into
          </label>
          <Select
            id="receiving-location"
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

        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setScannerOpen(true)}>
            <ScanLine size={16} className="mr-1" />
            Scan
          </Button>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>

      {/* Typed entry sits beside the scanner, not behind it: a damaged label is
          ordinary, and the lookup takes a SKU as readily as a barcode. */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void handleCode(manual)
        }}
        className="flex gap-2"
      >
        <Input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="Type a barcode or SKU, then Enter"
          aria-label="Barcode or SKU"
          loading={looking}
          autoFocus
        />
        <Button type="submit" variant="secondary" disabled={!manual.trim() || looking}>
          Add
        </Button>
      </form>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
          {error}
        </div>
      ) : null}

      {/* An unknown code, captured where it was scanned. */}
      {draft ? (
        <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-800">New product</p>
              <p className="text-xs text-slate-600">
                Nothing matched{' '}
                <span className="font-mono">{draft.barcode || 'that code'}</span>.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDraft(null)}
              aria-label="Discard this new product"
              className="text-slate-400 hover:text-slate-600"
            >
              <X size={16} />
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="draft-client" className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Client
              </label>
              <Select
                id="draft-client"
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
              <label htmlFor="draft-sku" className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                SKU
              </label>
              <Input
                id="draft-sku"
                value={draft.skuCode}
                onChange={(e) => setDraft({ ...draft, skuCode: e.target.value })}
                placeholder="PRO-PK-T-BLUE"
              />
            </div>
            <div>
              <label htmlFor="draft-name" className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Name
              </label>
              <Input
                id="draft-name"
                value={draft.productName}
                onChange={(e) => setDraft({ ...draft, productName: e.target.value })}
                placeholder="Polyester tape, blue"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => setDraftExtras((v) => !v)}
            className="text-xs font-medium text-cyan-700 hover:underline"
          >
            {draftExtras ? 'Fewer details' : 'More details (colour, size, weight)'}
          </button>

          {draftExtras ? (
            <div className="grid gap-3 sm:grid-cols-4">
              <Input
                aria-label="Colour"
                placeholder="Colour"
                value={draft.colour ?? ''}
                onChange={(e) => setDraft({ ...draft, colour: e.target.value })}
              />
              <Input
                aria-label="Size"
                placeholder="Size"
                value={draft.size ?? ''}
                onChange={(e) => setDraft({ ...draft, size: e.target.value })}
              />
              <Input
                aria-label="Weight in kilograms"
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
                type="number"
                min="0"
                placeholder="Threshold"
                value={draft.thresholdLimit ?? ''}
                onChange={(e) =>
                  setDraft({ ...draft, thresholdLimit: Number(e.target.value) || 0 })
                }
              />
            </div>
          ) : null}

          {draftError ? (
            <p className="text-sm text-rose-700" role="alert">
              {draftError}
            </p>
          ) : null}

          <Button onClick={commitDraft}>
            <PackagePlus size={16} className="mr-1" />
            Add and keep scanning
          </Button>
        </div>
      ) : null}

      {/* The delivery so far. */}
      <div className="overflow-hidden rounded-2xl border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            This delivery
          </p>
          <p className="text-xs text-slate-500 tabular-nums">
            {summary.lines} {summary.lines === 1 ? 'line' : 'lines'} · {summary.units}{' '}
            {summary.units === 1 ? 'unit' : 'units'}
            {summary.newProducts > 0 ? ` · ${summary.newProducts} new` : ''}
          </p>
        </div>

        {lines.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-400">
            Scan or type a code to start. Scanning the same item again adds one more.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[45rem] text-left text-sm">
              <thead className="border-b border-slate-100 text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide">Product</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide">Quantity</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide">Into</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {lines.map((line) => {
                  const name = isNewLine(line) ? line.draft.productName : line.productName
                  const sku = isNewLine(line) ? line.draft.skuCode : line.skuCode

                  return (
                    <tr key={line.key}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">
                          {name}
                          {isNewLine(line) ? (
                            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                              New
                            </span>
                          ) : null}
                        </div>
                        <div className="font-mono text-xs text-slate-400">{sku}</div>
                      </td>
                      <td className="px-4 py-3">
                        <Input
                          type="number"
                          min="1"
                          className="h-9 w-24"
                          value={String(line.quantity)}
                          aria-label={`Quantity of ${name}`}
                          onChange={(e) =>
                            setLines((prev) =>
                              setQuantity(prev, line.key, Number(e.target.value)),
                            )
                          }
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Select
                          className="h-9"
                          value={line.locationId ?? locationId}
                          aria-label={`Location for ${name}`}
                          onChange={(e) =>
                            setLines((prev) =>
                              setLineLocation(prev, line.key, e.target.value),
                            )
                          }
                        >
                          {locations.map((l) => (
                            <option key={l.id} value={l.id}>
                              {locationLabel(l)}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setLines((prev) => removeLine(prev, line.key))}
                          aria-label={`Remove ${name} from this delivery`}
                          className="text-slate-400 transition-colors hover:text-rose-600"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          {blocker && lines.length > 0 ? blocker : 'Nothing is saved until you check it in.'}
        </p>
        <Button onClick={() => void commit()} disabled={Boolean(blocker)} loading={committing}>
          {committing ? 'Checking in…' : `Check in ${summary.units || ''}`.trim()}
        </Button>
      </div>

      <BarcodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={(value) => void handleCode(value)}
        title="Scan the delivery"
        description="Keep scanning — the list builds as you go. The same item again adds one more."
        // Stays open between reads; that is the whole point of a goods-in bench.
        continuous
      />

      {looking ? (
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <Spinner /> Looking that code up…
        </p>
      ) : null}
    </div>
  )
}

export default ReceivingSession
