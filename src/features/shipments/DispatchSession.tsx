import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, Minus, Plus, ScanLine, Volume2, VolumeX, X } from 'lucide-react'

import { products as productsApi, shipments as shipmentsApi } from '@/api'
import type { ScanMatch } from '@/api/products'
import { Button, Input, Spinner } from '@/components/Shared Components'
import { BarcodeScanner, createWedgeListener } from '@/components/scanner'
import { errorMessage } from '@/lib/errors'
import { isMuted, setMuted, signal } from '@/lib/feedback'

import {
  availableIn,
  basketUnitCount,
  binsFor,
  splitTotal,
  toPickLines,
  validateSplit,
  clientOfBasket,
  describeForeignPick,
  mergeLines,
  removeLineAt,
  setLineQuantity,
  toShipmentItems,
  type PickLine,
} from './picking'

/**
 * Outbound, at the bench.
 *
 * The old form asked six questions before a single product was picked: client,
 * operator, shipment type, packaging, courier, billable services. Five were
 * either knowable from the goods or not knowable yet. Then it walked a
 * three-state machine describing a process that had already happened — the
 * parcel is packed and labelled before anyone opens this screen.
 *
 * So: scan the label, scan the goods, add the tracking number, dispatch.
 *
 * The label comes first and is mandatory. Everything a shipment is later
 * queried by hangs off it, and letting the goods be picked before there is
 * something to attach them to is how a pile of half-made shipments accumulates.
 */

type ClientLite = { id: string; companyName: string }

type Props = {
  /** Only used to name the client the basket settled on. */
  clients: ClientLite[]
  onDone: () => void
  onDispatched: (summary: { reference: string; units: number }) => void
}

export function DispatchSession({ clients, onDone, onDispatched }: Props) {
  const [reference, setReference] = useState<string | null>(null)
  const [referenceDraft, setReferenceDraft] = useState('')
  const [checkingReference, setCheckingReference] = useState(false)

  const [lines, setLines] = useState<PickLine[]>([])
  const [manual, setManual] = useState('')
  const [looking, setLooking] = useState(false)
  const [picking, setPicking] = useState<ScanMatch | null>(null)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [trackingId, setTrackingId] = useState('')

  const [error, setError] = useState('')
  const [muted, setMutedState] = useState(isMuted)
  const [saving, setSaving] = useState(false)

  const clientId = useMemo(() => clientOfBasket(lines), [lines])
  const clientName = useMemo(
    () => clients.find((c) => c.id === clientId)?.companyName ?? null,
    [clients, clientId],
  )
  const units = useMemo(() => basketUnitCount(lines), [lines])

  const toggleMute = () => {
    const next = !muted
    setMuted(next)
    setMutedState(next)
  }

  /** Step one. Nothing else is reachable until this is settled. */
  const acceptReference = async (raw: string) => {
    const value = raw.trim()
    if (!value || checkingReference) return

    setError('')
    setCheckingReference(true)
    try {
      // Asked now rather than at save: finding out a label was already used
      // after picking a pallet means picking it back again.
      const existing = await shipmentsApi.findByReference(value)
      if (existing) {
        const when = new Date(existing.createdAt).toLocaleDateString('en-GB')
        setError(
          `Label ${value} was already used on ${when} for ${existing.client?.companyName ?? 'another client'}. Scan a different label.`,
        )
        signal('refused')
        return
      }
      setReference(value)
      setReferenceDraft('')
      signal('accepted')
    } catch (err) {
      setError(errorMessage(err, 'Could not check that label.'))
      signal('refused')
    } finally {
      setCheckingReference(false)
    }
  }

  /** Step two. A code becomes a pick, or a refusal. */
  const handleProductCode = async (raw: string) => {
    const code = raw.trim()
    if (!code || looking || picking) return

    setError('')
    setManual('')
    setLooking(true)
    try {
      const { matches } = await productsApi.lookupByCode(code)

      if (matches.length === 0) {
        // Outbound cannot invent a product: you cannot ship what was never
        // received. This is the one place a new product is wrong.
        setError(`Nothing matches ${code}. It has to be received before it can ship.`)
        signal('refused')
        return
      }

      const match =
        matches.length === 1
          ? matches[0]
          : matches.find((m) => m.clientId === clientId) ?? null

      if (!match) {
        setError(
          `${code} matches ${matches.length} products across different clients. Pick it from the products list instead.`,
        )
        signal('refused')
        return
      }

      const refusal = describeForeignPick(match, clientId, clientName)
      if (refusal) {
        setError(refusal)
        signal('refused')
        return
      }

      // Which bins, and how many from each. Outbound has to come off shelves
      // that actually hold the stock, so this stays a decision.
      setPicking(match)
      signal('accepted')
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 404) {
        setError(`Nothing matches ${code}. It has to be received before it can ship.`)
      } else {
        setError(errorMessage(err, 'Could not look that code up.'))
      }
      signal('refused')
    } finally {
      setLooking(false)
    }
  }

  // The gun feeds whichever step is open, and is paused while the split dialog
  // is up so a scan cannot land behind it.
  const routeRef = useRef<(code: string) => void>(() => {})
  routeRef.current = (code: string) => {
    if (!reference) void acceptReference(code)
    else void handleProductCode(code)
  }

  useEffect(() => {
    if (picking) return
    return createWedgeListener({ onScan: (value) => routeRef.current(value) })
  }, [picking])

  const dispatch = async () => {
    if (lines.length === 0 || !reference || saving) return

    setSaving(true)
    setError('')
    try {
      await shipmentsApi.createShipment({
        reference,
        trackingId: trackingId.trim() || undefined,
        shipmentItems: toShipmentItems(lines),
      })
      onDispatched({ reference, units })
      setReference(null)
      setLines([])
      setTrackingId('')
    } catch (err) {
      setError(errorMessage(err, 'Could not dispatch this shipment.'))
      signal('refused')
    } finally {
      setSaving(false)
    }
  }

  /* ── Step one: the label ─────────────────────────────────────────────── */
  if (!reference) {
    return (
      <div className="flex min-h-screen flex-col">
        <header className="flex items-center justify-end gap-3 border-b border-slate-200 bg-white px-5 py-4">
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? 'Turn scan sounds on' : 'Turn scan sounds off'}
            aria-pressed={muted}
            className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            {muted ? <VolumeX size={22} /> : <Volume2 size={22} />}
          </button>
          <button
            type="button"
            onClick={onDone}
            aria-label="Close dispatch"
            className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            <X size={22} />
          </button>
        </header>

        <div className="flex flex-1 items-center justify-center p-6">
          <div className="w-full max-w-xl space-y-6 text-center">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                Scan the shipment label
              </h1>
              <p className="mt-2 text-lg text-slate-500">
                Every shipment is identified by the label on the parcel. Nothing can
                be picked until it is scanned.
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                void acceptReference(referenceDraft)
              }}
              className="flex gap-3"
            >
              <Input
                value={referenceDraft}
                onChange={(e) => setReferenceDraft(e.target.value)}
                placeholder="Scan, or type the label"
                aria-label="Shipment label"
                className="h-16 text-center text-xl font-semibold"
                loading={checkingReference}
                autoFocus
              />
              <Button
                type="submit"
                className="h-16 px-8 text-base"
                disabled={!referenceDraft.trim()}
                loading={checkingReference}
              >
                Start
              </Button>
            </form>

            <Button
              variant="outline"
              className="h-14 px-6 text-base"
              onClick={() => setScannerOpen(true)}
            >
              <Camera size={20} className="mr-2" />
              Use the camera
            </Button>

            {error ? (
              <p
                className="rounded-2xl border-2 border-rose-200 bg-rose-50 px-4 py-3 text-base text-rose-700"
                role="alert"
              >
                {error}
              </p>
            ) : null}
          </div>
        </div>

        <BarcodeScanner
          open={scannerOpen}
          onClose={() => setScannerOpen(false)}
          onScan={(value) => {
            setScannerOpen(false)
            void acceptReference(value)
          }}
          title="Scan the shipment label"
          description="The label on the parcel becomes this shipment's ID."
        />
      </div>
    )
  }

  /* ── Steps two and three ─────────────────────────────────────────────── */
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center gap-4 border-b border-slate-200 bg-white px-5 py-4">
        <div className="flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Shipment
          </p>
          <p className="font-mono text-xl font-bold text-slate-900">{reference}</p>
        </div>

        {/* Settled by the goods, not chosen. Shown as fact, not as a control. */}
        <div className="flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Client
          </p>
          <p className="text-xl font-semibold text-slate-900">
            {clientName ?? (
              <span className="text-slate-400">set by the first item</span>
            )}
          </p>
        </div>

        <Button variant="secondary" className="h-12 px-5" onClick={() => setScannerOpen(true)}>
          <ScanLine size={20} className="mr-2" />
          Scan
        </Button>
        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? 'Turn scan sounds on' : 'Turn scan sounds off'}
          aria-pressed={muted}
          className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 text-slate-600 hover:bg-slate-50"
        >
          {muted ? <VolumeX size={22} /> : <Volume2 size={22} />}
        </button>
        <button
          type="button"
          onClick={onDone}
          aria-label="Close dispatch"
          className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 text-slate-600 hover:bg-slate-50"
        >
          <X size={22} />
        </button>
      </header>

      <div className="flex-1 space-y-5 p-5">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void handleProductCode(manual)
          }}
          className="flex gap-3"
        >
          <Input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="Scan or type a barcode or SKU"
            aria-label="Barcode or SKU"
            className="h-14 text-base"
            loading={looking}
            autoFocus
          />
          <Button
            type="submit"
            variant="secondary"
            className="h-14 px-6 text-base"
            disabled={!manual.trim() || looking}
          >
            Add
          </Button>
        </form>

        {error ? (
          <div
            className="rounded-2xl border-2 border-rose-200 bg-rose-50 px-4 py-3 text-base text-rose-700"
            role="alert"
          >
            {error}
          </div>
        ) : null}

        {lines.length === 0 ? (
          <p className="rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50 p-10 text-center text-lg text-slate-400">
            Scan the first item. Whoever it belongs to becomes this shipment's client.
          </p>
        ) : (
          <div className="space-y-3">
            {lines.map((line, index) => (
              <div
                key={`${line.productId}:${line.locationId}`}
                className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4"
              >
                <div className="min-w-[12rem] flex-1">
                  <p className="text-lg font-semibold text-slate-900">{line.productName}</p>
                  <p className="font-mono text-sm text-slate-500">
                    {line.skuCode} · from {line.locationName}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setLines((prev) =>
                        setLineQuantity(prev, index, Math.max(1, line.quantity - 1)),
                      )
                    }
                    aria-label={`One fewer ${line.productName}`}
                    className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100"
                  >
                    <Minus size={20} />
                  </button>
                  <Input
                    type="number"
                    min="1"
                    className="h-12 w-20 text-center text-lg font-bold"
                    value={String(line.quantity)}
                    aria-label={`Quantity of ${line.productName}`}
                    onChange={(e) =>
                      setLines((prev) => setLineQuantity(prev, index, Number(e.target.value)))
                    }
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setLines((prev) => setLineQuantity(prev, index, line.quantity + 1))
                    }
                    aria-label={`One more ${line.productName}`}
                    className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100"
                  >
                    <Plus size={20} />
                  </button>
                </div>

                <Button
                  variant="outline"
                  className="h-12 px-4"
                  onClick={() => setLines((prev) => removeLineAt(prev, index))}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Step three, offered once there is something to send. The courier
            issues this at collection, which is after the goods are picked. */}
        {lines.length > 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <label
              htmlFor="dispatch-tracking"
              className="mb-2 block text-sm font-semibold text-slate-700"
            >
              Tracking number <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <Input
              id="dispatch-tracking"
              value={trackingId}
              onChange={(e) => setTrackingId(e.target.value)}
              placeholder="Scan or type the courier's number"
              className="h-14 text-base"
            />
          </div>
        ) : null}
      </div>

      <footer className="sticky bottom-0 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 bg-white px-5 py-4">
        <div>
          <p className="text-2xl font-bold tabular-nums text-slate-900">
            {units} {units === 1 ? 'unit' : 'units'}
          </p>
          <p className="text-sm text-slate-500">
            {lines.length} {lines.length === 1 ? 'line' : 'lines'}
            {clientName ? ` · ${clientName}` : ''}
          </p>
        </div>
        <Button
          className="h-14 px-8 text-base"
          onClick={() => void dispatch()}
          disabled={lines.length === 0}
          loading={saving}
        >
          {saving ? 'Dispatching…' : 'Dispatch'}
        </Button>
      </footer>

      {/* Which bins to draw from. Outbound must come off shelves that actually
          hold the stock, so this stays a decision even at speed — but it is
          skipped outright when there is only one bin to take from. */}
      {picking ? (
        <BinSplit
          match={picking}
          onCancel={() => setPicking(null)}
          onPicked={(picked) => {
            setLines((prev) => mergeLines(prev, picked))
            setPicking(null)
            signal('accepted')
          }}
        />
      ) : null}

      <BarcodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={(value) => void handleProductCode(value)}
        title="Scan the goods"
        description="Everything on this shipment must belong to one client."
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

/**
 * How many come out of which bin.
 *
 * Stock lives per bin, so an order larger than any single one holds has to be
 * split — and the split is what ShipmentItem models, one row per bin. Skipped
 * when there is only one bin holding the product, because asking a question
 * with one answer is not a decision.
 */
function BinSplit({
  match,
  onCancel,
  onPicked,
}: {
  match: ScanMatch
  onCancel: () => void
  onPicked: (lines: PickLine[]) => void
}) {
  const bins = useMemo(() => binsFor(match), [match])
  const [quantities, setQuantities] = useState<Record<string, number>>({})

  // One bin, one answer. Take one and get out of the way.
  useEffect(() => {
    if (bins.length === 1) {
      onPicked(toPickLines(match, bins, { [bins[0].locationId]: 1 }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bins])

  if (bins.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-6">
        <div className="w-full max-w-md space-y-4 rounded-3xl bg-white p-6 text-center">
          <p className="text-lg font-semibold text-slate-900">
            {match.productName} has no stock available
          </p>
          <p className="text-slate-600">
            Every bin holding it is empty or already reserved for another shipment.
          </p>
          <Button className="h-14 w-full text-base" onClick={onCancel}>
            Back
          </Button>
        </div>
      </div>
    )
  }

  if (bins.length === 1) return null

  // One problem per offending bin, so a three-bin split shows all of its
  // errors at once rather than one at a time.
  const problems = validateSplit(bins, quantities)
  const total = splitTotal(quantities)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-6">
      <div className="w-full max-w-lg space-y-5 rounded-3xl bg-white p-6">
        <div>
          <p className="text-xl font-bold text-slate-900">{match.productName}</p>
          <p className="font-mono text-sm text-slate-500">{match.skuCode}</p>
          <p className="mt-2 text-slate-600">
            Held in {bins.length} bins. Say how many come out of each.
          </p>
        </div>

        <div className="space-y-3">
          {bins.map((bin) => (
            <div key={bin.locationId} className="flex items-center gap-4">
              <div className="flex-1">
                <p className="font-medium text-slate-800">{bin.locationName}</p>
                <p className="text-sm text-slate-500">
                  {availableIn(bin)} available
                </p>
              </div>
              <Input
                type="number"
                min="0"
                max={String(availableIn(bin))}
                className="h-12 w-24 text-center text-lg font-bold"
                aria-label={`Take from ${bin.locationName}`}
                value={String(quantities[bin.locationId] ?? '')}
                onChange={(e) =>
                  setQuantities((prev) => ({
                    ...prev,
                    [bin.locationId]: Number(e.target.value),
                  }))
                }
              />
            </div>
          ))}
        </div>

        {problems.length > 0 ? (
          <ul className="space-y-1 rounded-2xl bg-rose-50 px-4 py-3 text-base text-rose-700" role="alert">
            {problems.map((p) => (
              <li key={p.locationId}>{p.message}</li>
            ))}
          </ul>
        ) : null}

        <div className="flex gap-3">
          <Button
            className="h-14 flex-1 text-base"
            disabled={problems.length > 0 || total === 0}
            onClick={() => onPicked(toPickLines(match, bins, quantities))}
          >
            Take {total || ''}
          </Button>
          <Button variant="outline" className="h-14 px-6 text-base" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}

export default DispatchSession
