import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, Minus, Plus, ScanLine, Volume2, VolumeX, X } from 'lucide-react'

import { products as productsApi, shipments as shipmentsApi } from '@/api'
import type { ScanMatch } from '@/api/products'
import { Button, Input, Spinner } from '@/components/Shared Components'
import { BarcodeScanner, createWedgeListener } from '@/components/scanner'
import { ConfirmCommit } from '@/features/scanning/ConfirmCommit'
import { ScanPanel, type ScanOutcome } from '@/features/scanning/ScanPanel'
import { StepRail } from '@/features/scanning/StepRail'
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
  const [confirming, setConfirming] = useState(false)
  const [lastScan, setLastScan] = useState<ScanOutcome | null>(null)

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
        setLastScan({
          tone: 'refused',
          title: 'Not in stock',
          detail: `${code} has to be received before it can ship`,
        })
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
        setLastScan({
          tone: 'refused',
          title: 'Which client is this?',
          detail: `${code} belongs to ${matches.length} different clients`,
        })
        signal('refused')
        return
      }

      const refusal = describeForeignPick(match, clientId, clientName)
      if (refusal) {
        setError(refusal)
        setLastScan({
          tone: 'refused',
          title: 'Wrong client',
          detail: `${match.productName} belongs to ${match.client?.companyName ?? 'someone else'}`,
        })
        signal('refused')
        return
      }

      // One bin holding it is not a decision — take one and carry on. This
      // used to be an effect inside the split dialog, which StrictMode ran
      // twice in development, adding the line twice and reading as quantity 2
      // for a single scan.
      const bins = binsFor(match)
      if (bins.length === 1) {
        setLines((prev) =>
          mergeLines(prev, toPickLines(match, bins, { [bins[0].locationId]: 1 })),
        )
        setLastScan({
          tone: 'ok',
          title: match.productName,
          detail: `${match.skuCode} from ${bins[0].locationName}`,
          count: 1,
        })
        signal('accepted')
        return
      }

      // Nothing on the shelf: say so here rather than opening a dialog whose
      // only content is an apology.
      if (bins.length === 0) {
        setError(
          `${match.productName} has no stock available — every bin holding it is empty or already reserved.`,
        )
        setLastScan({
          tone: 'refused',
          title: 'Nothing on the shelf',
          detail: `${match.productName} is out of stock or fully reserved`,
        })
        signal('refused')
        return
      }

      // Genuinely several bins. Outbound has to come off shelves that hold the
      // stock, so this one stays a decision.
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
        <header className="border-b border-slate-200 bg-white">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
            <h1 className="text-base font-semibold tracking-tight text-slate-900">Outbound</h1>
            <span className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.09em] text-slate-500">
              Dispatch
            </span>

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
            current={1}
            steps={[
              { label: 'Label', hint: 'The reference on the parcel' },
              { label: 'Pick items' },
              { label: 'Dispatch' },
            ]}
          />
        </header>

        <div className="flex flex-1 items-start justify-center bg-slate-50 p-6">
          <div className="w-full max-w-lg border border-slate-200 bg-white p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-slate-500">
              Step 1 of 3
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">
              Shipment label
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-slate-600">
              Scan or enter the reference on the parcel. Items cannot be picked until the
              shipment has one, and each reference can be used only once.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                void acceptReference(referenceDraft)
              }}
              className="mt-4 flex gap-2"
            >
              <Input
                value={referenceDraft}
                onChange={(e) => setReferenceDraft(e.target.value)}
                placeholder="SHP-000123"
                aria-label="Shipment label"
                className="h-10 font-mono text-sm [@media(pointer:coarse)]:h-12"
                loading={checkingReference}
                autoFocus
              />
              <Button
                type="submit"
                className="h-10 px-5 text-sm [@media(pointer:coarse)]:h-12"
                disabled={!referenceDraft.trim()}
                loading={checkingReference}
              >
                Continue
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 px-3 text-sm [@media(pointer:coarse)]:h-12"
                onClick={() => setScannerOpen(true)}
                aria-label="Use the camera"
              >
                <Camera size={16} />
              </Button>
            </form>

            <p className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.09em] text-slate-400">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
              Scanner listening
            </p>

            {error ? (
              <p
                className="mt-4 border border-slate-200 border-l-4 border-l-rose-600 bg-white px-4 py-3 text-sm text-rose-700"
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
      <header className="border-b border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
          <h1 className="text-base font-semibold tracking-tight text-slate-900">Outbound</h1>
          <span className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.09em] text-slate-500">
            Dispatch
          </span>

          <Button
            variant="secondary"
            className="ml-auto h-9 px-3 text-[13px] [@media(pointer:coarse)]:h-11"
            onClick={() => setScannerOpen(true)}
          >
            <ScanLine size={16} className="mr-1.5" />
            Camera
          </Button>
          <button
            type="button"
            onClick={toggleMute}
            aria-pressed={muted}
            className="flex h-9 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-50 [@media(pointer:coarse)]:h-11"
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
            { label: 'Label' },
            { label: 'Pick items', hint: 'The first item sets the client' },
            { label: 'Dispatch', hint: 'Nothing moves until confirmed' },
          ]}
        />

        {/* What this shipment is, as facts rather than controls: the reference
            was scanned and the client is settled by the goods. */}
        <dl className="flex flex-wrap items-end gap-x-8 gap-y-3 border-t border-slate-200 px-5 py-3">
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-[0.09em] text-slate-500">
              Shipment
            </dt>
            <dd className="font-mono text-sm font-semibold leading-tight text-slate-900">
              {reference}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-[0.09em] text-slate-500">
              Client
            </dt>
            <dd className="text-sm font-semibold leading-tight text-slate-900">
              {clientName ?? <span className="font-normal text-slate-400">set by first item</span>}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-[0.09em] text-slate-500">
              Lines
            </dt>
            <dd className="text-sm font-semibold tabular-nums leading-tight text-slate-900">
              {lines.length}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-[0.09em] text-slate-500">
              Units
            </dt>
            <dd className="text-sm font-semibold tabular-nums leading-tight text-slate-900">
              {units}
            </dd>
          </div>
        </dl>
      </header>

      <div className="flex-1 space-y-4 bg-slate-50 p-5">
        <ScanPanel
          outcome={lastScan}
          idleHint="Scanner is live. A code can also be typed in below."
        />

        <form
          onSubmit={(e) => {
            e.preventDefault()
            void handleProductCode(manual)
          }}
          className="flex gap-2"
        >
          <Input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="Barcode or SKU"
            aria-label="Barcode or SKU"
            className="h-10 font-mono text-sm [@media(pointer:coarse)]:h-12"
            loading={looking}
            autoFocus
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

        {error ? (
          <div
            className="border border-slate-200 border-l-4 border-l-rose-600 bg-white px-4 py-3 text-sm text-rose-700"
            role="alert"
          >
            {error}
          </div>
        ) : null}

        <div className="overflow-x-auto border border-slate-200 bg-white">
          <table className="w-full min-w-[44rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-[0.09em] text-slate-500">
                <th scope="col" className="px-4 py-2 font-semibold">
                  Item
                </th>
                <th scope="col" className="px-4 py-2 font-semibold">
                  SKU
                </th>
                <th scope="col" className="px-4 py-2 font-semibold">
                  From
                </th>
                <th scope="col" className="px-4 py-2 text-center font-semibold">
                  Qty
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
                    No items picked. The first item sets the client for this shipment.
                  </td>
                </tr>
              ) : (
                lines.map((line, index) => (
                  <tr key={`${line.productId}:${line.locationId}`} className="align-middle">
                    <td className="px-4 py-2.5 font-medium text-slate-900">{line.productName}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{line.skuCode}</td>
                    <td className="px-4 py-2.5 text-slate-600">{line.locationName}</td>

                    <td className="px-4 py-2.5">
                      <div className="mx-auto flex w-fit items-center">
                        <button
                          type="button"
                          onClick={() =>
                            setLines((prev) =>
                              setLineQuantity(prev, index, Math.max(1, line.quantity - 1)),
                            )
                          }
                          aria-label={`One fewer ${line.productName}`}
                          className="flex size-8 items-center justify-center rounded-l-md border border-slate-300 text-slate-600 transition-colors hover:bg-slate-100 [@media(pointer:coarse)]:size-11"
                        >
                          <Minus size={14} />
                        </button>
                        <Input
                          type="number"
                          min="1"
                          className="h-8 w-14 rounded-none border-x-0 text-center text-sm font-semibold tabular-nums [@media(pointer:coarse)]:h-11"
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
                          className="flex size-8 items-center justify-center rounded-r-md border border-slate-300 text-slate-600 transition-colors hover:bg-slate-100 [@media(pointer:coarse)]:size-11"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </td>

                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => setLines((prev) => removeLineAt(prev, index))}
                        className="rounded-md px-2 py-1.5 text-[13px] font-medium text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-700 [@media(pointer:coarse)]:px-3 [@media(pointer:coarse)]:py-2.5"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <footer className="sticky bottom-0 flex flex-wrap items-end gap-x-6 gap-y-3 border-t border-slate-200 bg-white px-5 py-3">
        {/* Step three, offered once there is something to send. The courier
            issues this at collection, which is after the goods are picked. */}
        {lines.length > 0 ? (
          <div className="min-w-[16rem] flex-1 sm:max-w-sm">
            <label
              htmlFor="dispatch-tracking"
              className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.09em] text-slate-500"
            >
              Tracking number <span className="font-normal normal-case">(optional)</span>
            </label>
            <Input
              id="dispatch-tracking"
              value={trackingId}
              onChange={(e) => setTrackingId(e.target.value)}
              placeholder="Courier reference"
              className="h-10 font-mono text-sm [@media(pointer:coarse)]:h-12"
            />
          </div>
        ) : null}

        <p className="ml-auto text-sm text-slate-600">
          <span className="font-semibold tabular-nums text-slate-900">{units}</span>{' '}
          {units === 1 ? 'unit' : 'units'} on{' '}
          <span className="font-semibold tabular-nums text-slate-900">{lines.length}</span>{' '}
          {lines.length === 1 ? 'line' : 'lines'}
        </p>

        <Button
          className="h-10 px-5 text-sm [@media(pointer:coarse)]:h-12"
          onClick={() => setConfirming(true)}
          disabled={lines.length === 0}
          loading={saving}
        >
          {saving ? 'Dispatching…' : 'Dispatch shipment'}
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
            const taken = picked.reduce((s, l) => s + l.quantity, 0)
            setLastScan({
              tone: 'ok',
              title: picking.productName,
              detail: `from ${picked.length} ${picked.length === 1 ? 'bin' : 'bins'}`,
              count: taken,
            })
            signal('accepted')
          }}
        />
      ) : null}

      <ConfirmCommit
        open={confirming}
        title="Confirm dispatch"
        confirmLabel="Dispatch"
        busy={saving}
        warning="Stock is deducted and the client is charged on confirmation. Use a return to reverse an item."
        onCancel={() => setConfirming(false)}
        onConfirm={() => void dispatch()}
        facts={[
          { label: 'Shipment', value: reference },
          { label: 'Client', value: clientName ?? 'unknown' },
          {
            label: 'Goods',
            value: `${units} ${units === 1 ? 'unit' : 'units'} on ${lines.length} ${lines.length === 1 ? 'line' : 'lines'}`,
          },
          {
            label: 'Tracking',
            value: trackingId.trim() || 'not recorded',
            emphasis: !trackingId.trim(),
          },
        ]}
      />

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
  // Only ever opened for two or more bins: the caller resolves the single-bin
  // and empty cases itself, so this renders a real choice or nothing.
  const bins = useMemo(() => binsFor(match), [match])
  const [quantities, setQuantities] = useState<Record<string, number>>({})

  // One problem per offending bin, so a three-bin split shows all of its
  // errors at once rather than one at a time.
  const problems = validateSplit(bins, quantities)
  const total = splitTotal(quantities)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-6">
      <div className="w-full max-w-md border border-slate-200 bg-white shadow-xl">
        <div className="border-b border-slate-200 px-5 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-slate-500">
            Stock held in {bins.length} locations
          </p>
          <p className="mt-0.5 text-base font-semibold text-slate-900">{match.productName}</p>
          <p className="font-mono text-xs text-slate-500">{match.skuCode}</p>
        </div>

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-[0.09em] text-slate-500">
              <th scope="col" className="px-5 py-2 font-semibold">
                Location
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                Available
              </th>
              <th scope="col" className="px-5 py-2 text-right font-semibold">
                Take
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {bins.map((bin) => (
              <tr key={bin.locationId}>
                <td className="px-5 py-2 font-medium text-slate-800">{bin.locationName}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                  {availableIn(bin)}
                </td>
                <td className="px-5 py-2 text-right">
                  <Input
                    type="number"
                    min="0"
                    max={String(availableIn(bin))}
                    className="h-9 w-20 text-center text-sm font-semibold tabular-nums [@media(pointer:coarse)]:h-11"
                    aria-label={`Take from ${bin.locationName}`}
                    value={String(quantities[bin.locationId] ?? '')}
                    onChange={(e) =>
                      setQuantities((prev) => ({
                        ...prev,
                        [bin.locationId]: Number(e.target.value),
                      }))
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {problems.length > 0 ? (
          <ul
            className="space-y-1 border-t border-slate-200 border-l-4 border-l-rose-600 px-5 py-3 text-[13px] text-rose-700"
            role="alert"
          >
            {problems.map((p) => (
              <li key={p.locationId}>{p.message}</li>
            ))}
          </ul>
        ) : null}

        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <Button
            variant="outline"
            className="h-10 px-4 text-sm [@media(pointer:coarse)]:h-12"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            className="h-10 px-5 text-sm [@media(pointer:coarse)]:h-12"
            disabled={problems.length > 0 || total === 0}
            onClick={() => onPicked(toPickLines(match, bins, quantities))}
          >
            Add {total || ''}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default DispatchSession
