import { useState } from 'react'

import { products as productsApi } from '@/api'
import type { ScanMatch } from '@/api/products'
import { BarcodeScanner } from '@/components/scanner'
import { Badge, Button, Input } from '@/components/Shared Components'

import {
  availableIn,
  binsFor,
  splitTotal,
  toPickLines,
  totalAvailable,
  validateSplit,
  type Bin,
  type PickLine,
} from './picking'

type Props = {
  /** Whose shipment this is — products belonging to anyone else are refused. */
  clientId: string
  onAdd: (lines: PickLine[]) => void
  onError: (message: string) => void
}

/**
 * Finding a product and saying which bins it comes out of.
 *
 * Scanning and typing land in the same place deliberately: the camera is faster
 * when it works, and a smudged label at the back of a cold aisle is why typing
 * has to stay. Both resolve through the same lookup.
 *
 * The split is the point. Stock lives per bin, so an order for 25 when the
 * fullest bin holds 10 has to come from several — and the operator, not the
 * software, decides which, because they are the one standing in the warehouse
 * and may know one pallet is easier to reach than another.
 */
export function ProductPicker({ clientId, onAdd, onError }: Props) {
  const [scanning, setScanning] = useState(false)
  const [code, setCode] = useState('')
  const [looking, setLooking] = useState(false)

  const [product, setProduct] = useState<ScanMatch | null>(null)
  const [bins, setBins] = useState<Bin[]>([])
  const [quantities, setQuantities] = useState<Record<string, number>>({})

  const reset = () => {
    setProduct(null)
    setBins([])
    setQuantities({})
    setCode('')
  }

  const resolve = async (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return

    setLooking(true)
    try {
      const { matches } = await productsApi.lookupByCode(trimmed)

      if (!matches || matches.length === 0) {
        onError(`Nothing matches "${trimmed}".`)
        return
      }

      // A SKU is unique only within a client, so a scan can hit two products.
      // Narrowing to this shipment's client resolves it without a prompt.
      const mine = matches.filter((m) => m.clientId === clientId)
      if (mine.length === 0) {
        onError(
          `"${trimmed}" belongs to another client, so it cannot go on this shipment.`
        )
        return
      }
      if (mine.length > 1) {
        onError(
          `"${trimmed}" matches ${mine.length} products for this client. Search by SKU instead.`
        )
        return
      }

      const found = mine[0]
      const foundBins = binsFor(found)

      if (foundBins.length === 0) {
        onError(`${found.productName} has no available stock in any location.`)
        return
      }

      setProduct(found)
      setBins(foundBins)
      setQuantities({})
      setCode('')
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        (err as Error)?.message
      onError(message || 'Lookup failed.')
    } finally {
      setLooking(false)
    }
  }

  const problems = product ? validateSplit(bins, quantities) : []
  const problemFor = (locationId: string) =>
    problems.find((p) => p.locationId === locationId)?.message
  const picked = splitTotal(quantities)
  const canAdd = product !== null && picked > 0 && problems.length === 0

  const commit = () => {
    if (!product || !canAdd) return
    onAdd(toPickLines(product, bins, quantities))
    reset()
  }

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
      {/* ── Find it ─────────────────────────────────────────────────────── */}
      <div className="flex items-end gap-2 flex-wrap">
        <div className="flex-1 min-w-[12rem]">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
            Scan or type a barcode / SKU
          </label>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                resolve(code)
              }
            }}
            placeholder="e.g. 5012345678900 or SKU-0042"
            className="font-mono"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <Button type="button" onClick={() => resolve(code)} disabled={looking || !code.trim()}>
          {looking ? 'Finding…' : 'Find'}
        </Button>
        <Button type="button" variant="outline" onClick={() => setScanning((s) => !s)}>
          {scanning ? 'Close camera' : 'Scan'}
        </Button>
      </div>

      <BarcodeScanner
        open={scanning}
        onClose={() => setScanning(false)}
        onScan={(value) => {
          setScanning(false)
          resolve(value)
        }}
        title="Scan a product"
        description="Point the camera at the barcode on the item or its shelf label."
      />

      {/* ── Say where it comes from ─────────────────────────────────────── */}
      {product && (
        <div className="space-y-3 border-t border-slate-100 dark:border-slate-800 pt-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <div className="font-semibold text-slate-900 dark:text-slate-100">
                {product.productName}
              </div>
              <div className="text-xs text-slate-400 font-mono">{product.skuCode}</div>
            </div>
            <Badge variant="secondary">
              {totalAvailable(bins)} available across {bins.length} location
              {bins.length === 1 ? '' : 's'}
            </Badge>
          </div>

          <p className="text-xs text-slate-400">
            Enter how many to take from each location. Draw from more than one if
            no single location holds enough.
          </p>

          <div className="space-y-2">
            {bins.map((b) => {
              const problem = problemFor(b.locationId)
              return (
                <div
                  key={b.locationId}
                  className="flex items-center gap-3 flex-wrap rounded-xl border border-slate-100 dark:border-slate-800 p-2"
                >
                  <div className="flex-1 min-w-[10rem]">
                    <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                      {b.locationName}
                    </div>
                    {b.path && (
                      <div className="text-xs text-slate-400 font-mono truncate">{b.path}</div>
                    )}
                  </div>
                  <Badge variant="secondary">{availableIn(b)} available</Badge>
                  <div className="w-24">
                    <Input
                      type="number"
                      min={0}
                      max={availableIn(b)}
                      value={quantities[b.locationId] ?? ''}
                      onChange={(e) =>
                        setQuantities((prev) => ({
                          ...prev,
                          [b.locationId]: e.target.value === '' ? 0 : Number(e.target.value),
                        }))
                      }
                      aria-label={`Quantity from ${b.locationName}`}
                      aria-invalid={Boolean(problem)}
                    />
                  </div>
                  {problem && (
                    <p className="w-full text-xs text-rose-600 dark:text-rose-400">{problem}</p>
                  )}
                </div>
              )
            })}
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-sm text-slate-500">
              Picking <strong className="text-slate-800 dark:text-slate-200">{picked}</strong>{' '}
              item{picked === 1 ? '' : 's'}
            </span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={reset}>
                Cancel
              </Button>
              <Button type="button" onClick={commit} disabled={!canAdd}>
                Add to shipment
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ProductPicker
