import { useMemo, useState } from 'react'

import { products as productsApi } from '@/api'
import type { Product, ScanMatch } from '@/api/products'
import { Badge, Button, Input } from '@/components/Shared Components'

type Props = {
  code: string
  matches: ScanMatch[]
  /** Set when nothing matched — offers to bind the code to a known product. */
  notFound: boolean
  allProducts: Product[]
  onPick: (product: ScanMatch | Product) => void
  onAttached: () => void
  onError: (message: string) => void
}

const onHand = (m: ScanMatch) =>
  (m.stockLevels ?? []).reduce((sum, s) => sum + (s.currentQuantity ?? 0), 0)

/**
 * What a scan resolved to.
 *
 * Three outcomes, and the awkward one matters most: `skuCode` is unique only
 * within a client, so two clients can stock the same SKU. Picking one silently
 * would attribute stock to the wrong client's inventory and, eventually, their
 * invoice — so when there is more than one match the operator chooses.
 */
export function ScanResultPanel({
  code,
  matches,
  notFound,
  allProducts,
  onPick,
  onAttached,
  onError,
}: Props) {
  const [search, setSearch] = useState('')
  const [attaching, setAttaching] = useState<string | null>(null)

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase()
    const pool = allProducts.filter((p) => !p.isDeactivated)
    if (!q) return pool.slice(0, 8)
    return pool
      .filter(
        (p) =>
          p.skuCode.toLowerCase().includes(q) ||
          p.productName.toLowerCase().includes(q),
      )
      .slice(0, 8)
  }, [allProducts, search])

  const attach = async (product: Product) => {
    setAttaching(product.id)
    try {
      await productsApi.attachBarcode(product.id, code)
      onAttached()
    } catch (err: any) {
      onError(
        err?.response?.data?.error ||
          err?.message ||
          'Could not attach that barcode.',
      )
    } finally {
      setAttaching(null)
    }
  }

  if (notFound) {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            Nothing registered against{' '}
            <span className="font-mono">{code}</span>
          </p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Usually the product is already in the system and this label was never
            registered. Find it below to bind the code to it.
          </p>
        </div>

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by SKU or name"
          autoFocus
        />

        <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
          {candidates.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">
              No product matches that search.
            </p>
          ) : (
            candidates.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/50"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {p.productName}
                  </div>
                  <div className="font-mono text-xs text-slate-400">{p.skuCode}</div>
                </div>
                <Button
                  size="sm"
                  disabled={attaching === p.id}
                  onClick={() => attach(p)}
                >
                  {attaching === p.id ? 'Attaching…' : 'Attach code'}
                </Button>
              </div>
            ))
          )}
        </div>

        {/* Creating a product from a scan is deliberately not offered: a mis-scan
            would create a duplicate SKU, which is expensive to unpick later. */}
        <p className="text-xs text-slate-400">
          Genuinely new stock? Add the product from the catalogue first, then scan it.
        </p>
      </div>
    )
  }

  if (matches.length > 1) {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            {matches.length} products share the SKU{' '}
            <span className="font-mono">{code}</span>
          </p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            SKUs are only unique within a client. Choose whose stock this is —
            picking the wrong one puts it on the wrong client's inventory.
          </p>
        </div>

        <div className="space-y-2">
          {matches.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onPick(m)}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {m.client?.companyName ?? 'Unknown client'}
                </div>
                <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                  {m.productName}
                </div>
                <div className="font-mono text-xs text-slate-400">{m.skuCode}</div>
              </div>
              <Badge variant="secondary">{onHand(m)} on hand</Badge>
            </button>
          ))}
        </div>
      </div>
    )
  }

  const only = matches[0]
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
        <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          {only.productName}
        </div>
        <div className="font-mono text-xs text-slate-500">{only.skuCode}</div>
        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {only.client?.companyName} · {onHand(only)} on hand
        </div>
      </div>

      {(only.stockLevels ?? []).length > 0 && (
        <div className="space-y-1">
          {only.stockLevels!.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-slate-900/50"
            >
              <span className="font-mono text-slate-500">
                {s.location?.materializedPath || s.location?.locationName}
              </span>
              <span className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">
                {s.currentQuantity}
                {s.reservedQuantity > 0 && (
                  <span className="ml-1 font-normal text-amber-600">
                    ({s.reservedQuantity} reserved)
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      <Button className="w-full" onClick={() => onPick(only)}>
        Open this product
      </Button>
    </div>
  )
}
