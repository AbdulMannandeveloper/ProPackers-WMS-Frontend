import { useState } from 'react'

import { inventory as inventoryApi } from '@/api'
import type { ScanMatch } from '@/api/products'
import { Button, Input, Select } from '@/components/Shared Components'

type LocationOption = { id: string; locationName: string; materializedPath?: string | null }

type BookedIn = {
  key: string
  productName: string
  skuCode: string
  quantity: number
  locationName: string
}

type Props = {
  product: ScanMatch
  locations: LocationOption[]
  onBookedIn: () => void
  onError: (message: string) => void
  onDone: () => void
}

/**
 * Books scanned stock in against a bin.
 *
 * Goes through the existing CHECKIN ledger movement, which already adjusts stock
 * atomically — nothing new server-side. The running list matters more than it
 * looks: on a goods-in bench somebody scans thirty cartons in a row, and without
 * it there is no way to tell what has already gone through.
 */
export function CheckInPanel({ product, locations, onBookedIn, onError, onDone }: Props) {
  const [locationId, setLocationId] = useState(
    // Default to a bin this product already occupies — usually the right one.
    product.stockLevels?.[0]?.locationId ?? locations[0]?.id ?? '',
  )
  const [quantity, setQuantity] = useState(1)
  const [saving, setSaving] = useState(false)
  const [booked, setBooked] = useState<BookedIn[]>([])

  const submit = async () => {
    if (!locationId) {
      onError('Choose a location to book this stock into.')
      return
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      onError('Quantity must be a whole number greater than zero.')
      return
    }

    setSaving(true)
    try {
      await inventoryApi.createInventoryLedgerEntry({
        productId: product.id,
        movementType: 'CHECKIN',
        quantity,
        toLocationId: locationId,
      })

      const location = locations.find((l) => l.id === locationId)
      setBooked((prev) => [
        {
          key: `${Date.now()}-${prev.length}`,
          productName: product.productName,
          skuCode: product.skuCode,
          quantity,
          locationName: location?.materializedPath || location?.locationName || '—',
        },
        ...prev,
      ])
      setQuantity(1)
      onBookedIn()
    } catch (err: any) {
      onError(
        err?.response?.data?.error || err?.message || 'Could not book that stock in.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
        <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          {product.productName}
        </div>
        <div className="font-mono text-xs text-slate-500">{product.skuCode}</div>
        {product.client?.companyName && (
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {product.client.companyName}
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Into location
          </label>
          <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            {locations.length === 0 && <option value="">No locations set up</option>}
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.materializedPath || l.locationName}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Quantity
          </label>
          <Input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <Button className="flex-1" onClick={submit} loading={saving} disabled={!locationId}>
          {saving ? 'Booking in…' : 'Book in'}
        </Button>
        <Button variant="secondary" onClick={onDone}>
          Done
        </Button>
      </div>

      {booked.length > 0 && (
        <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Booked in this session
          </p>
          <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
            {booked.map((b) => (
              <div
                key={b.key}
                className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 text-xs dark:bg-emerald-950/30"
              >
                <span className="truncate text-slate-600 dark:text-slate-300">
                  {b.skuCode} → {b.locationName}
                </span>
                <span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                  +{b.quantity}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
