import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import {
  holidays as holidaysApi,
  shipments as shipmentsApi,
  stock as stockApi,
  products as productsApi,
  invoices as invoicesApi,
} from '@/api'
import type { Holiday } from '@/api/holidays'
import { useAuthStore } from '@/stores/auth'

/**
 * These were two hardcoded arrays — "128 inbound orders", "2.4k tracked SKUs",
 * "Zone A 82% full" — none of it real, against a warehouse holding 190 units
 * and 2 SKUs. Numbers that look authoritative and are fiction are worse than no
 * numbers, because eventually somebody acts on them.
 *
 * Everything below is derived from endpoints that already exist and that both
 * admins and employees may call, which is who this page is for.
 */

const money = (value: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(value)

const TONES = [
  { tone: 'bg-blue-50', accent: 'bg-blue-500', bar: 'bg-blue-500' },
  { tone: 'bg-emerald-50', accent: 'bg-emerald-500', bar: 'bg-emerald-500' },
  { tone: 'bg-orange-50', accent: 'bg-orange-500', bar: 'bg-orange-500' },
  { tone: 'bg-violet-50', accent: 'bg-violet-500', bar: 'bg-violet-500' },
  { tone: 'bg-sky-50', accent: 'bg-sky-500', bar: 'bg-sky-500' },
]

const formatHolidayRange = (holiday: Holiday) => {
  const start = new Date(holiday.startDate)
  const end = new Date(holiday.endDate || holiday.startDate)
  const startLabel = start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const endLabel = end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const sameDay =
    start.getUTCFullYear() === end.getUTCFullYear() &&
    start.getUTCMonth() === end.getUTCMonth() &&
    start.getUTCDate() === end.getUTCDate()
  return sameDay ? startLabel : `${startLabel} – ${endLabel}`
}

type Metrics = {
  awaitingDispatch: number
  readyToGo: number
  dispatchedThisMonth: number
  unitsInStock: number
  trackedSkus: number
  clientsWithStock: number
  byLocation: { name: string; units: number }[]
  draftInvoiceValue: number | null
  draftInvoiceCount: number
}

const EMPTY: Metrics = {
  awaitingDispatch: 0,
  readyToGo: 0,
  dispatchedThisMonth: 0,
  unitsInStock: 0,
  trackedSkus: 0,
  clientsWithStock: 0,
  byLocation: [],
  draftInvoiceValue: null,
  draftInvoiceCount: 0,
}

export default function DashboardIndex() {
  const role = useAuthStore((s) => s.role)
  const isAdmin = role === 'admin'

  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [holidaysLoading, setHolidaysLoading] = useState(true)

  const [metrics, setMetrics] = useState<Metrics>(EMPTY)
  const [metricsLoading, setMetricsLoading] = useState(true)
  const [metricsError, setMetricsError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setMetricsLoading(true)
      const failed: string[] = []
      const track = (label: string) => (err: unknown) => {
        console.error(`Dashboard: failed to load ${label}`, err)
        failed.push(label)
        return [] as never[]
      }

      try {
        const [shipments, stockLevels, products, invoices] = await Promise.all([
          shipmentsApi.getAllShipments().catch(track('shipments')),
          stockApi.getAllStockLevels().catch(track('stock')),
          productsApi.getAllProducts().catch(track('products')),
          // Admin-only endpoint. An employee getting nothing back here is
          // expected, not a failure, so it is not tracked as one.
          isAdmin ? invoicesApi.getAllInvoices().catch(() => []) : Promise.resolve([]),
        ])

        if (cancelled) return

        const now = new Date()
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

        const open = shipments.filter(
          (sh) => sh.status === 'PENDING' || sh.status === 'READY_FOR_DISPATCH'
        )

        // Units per location, busiest first. The original showed a percentage
        // full, which cannot be computed: WarehouseLocation has no capacity
        // column, so there is nothing to be a percentage of.
        const perLocation = new Map<string, number>()
        for (const level of stockLevels) {
          const name = level.location?.locationName ?? 'Unassigned'
          perLocation.set(name, (perLocation.get(name) ?? 0) + (level.currentQuantity ?? 0))
        }

        const drafts = invoices.filter((inv) => inv.status === 'DRAFT')

        setMetrics({
          awaitingDispatch: open.length,
          readyToGo: open.filter((sh) => sh.status === 'READY_FOR_DISPATCH').length,
          dispatchedThisMonth: shipments.filter(
            (sh) => sh.status === 'DISPATCHED' && new Date(sh.createdAt) >= monthStart
          ).length,
          unitsInStock: stockLevels.reduce((sum, l) => sum + (l.currentQuantity ?? 0), 0),
          trackedSkus: products.filter((p) => !p.isDeactivated).length,
          clientsWithStock: new Set(
            stockLevels.map((l) => l.product?.clientId).filter(Boolean)
          ).size,
          byLocation: [...perLocation.entries()]
            .map(([name, units]) => ({ name, units }))
            .sort((a, b) => b.units - a.units)
            .slice(0, 5),
          draftInvoiceValue: isAdmin
            ? drafts.reduce((sum, inv) => sum + invoicesApi.grandTotal(inv), 0)
            : null,
          draftInvoiceCount: drafts.length,
        })

        setMetricsError(
          failed.length > 0
            ? `Could not load ${failed.join(' or ')} — those figures are missing.`
            : ''
        )
      } finally {
        if (!cancelled) setMetricsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isAdmin])

  /** The tiles, in the order they read best. */
  const kpis = useMemo(() => {
    const tiles = [
      {
        label: 'Awaiting dispatch',
        value: String(metrics.awaitingDispatch),
        delta: metrics.readyToGo > 0 ? `${metrics.readyToGo} ready to go` : 'None ready yet',
      },
      {
        label: 'Dispatched this month',
        value: String(metrics.dispatchedThisMonth),
        delta: metrics.dispatchedThisMonth > 0 ? 'Billed on dispatch' : 'Nothing yet',
      },
      {
        label: 'Units in stock',
        value: metrics.unitsInStock.toLocaleString('en-GB'),
        delta:
          metrics.clientsWithStock > 0
            ? `across ${metrics.clientsWithStock} client${metrics.clientsWithStock === 1 ? '' : 's'}`
            : 'No stock held',
      },
      {
        label: 'Tracked SKUs',
        value: String(metrics.trackedSkus),
        delta: metrics.byLocation.length
          ? `in ${metrics.byLocation.length} location${metrics.byLocation.length === 1 ? '' : 's'}`
          : 'No locations in use',
      },
    ]

    if (metrics.draftInvoiceValue !== null) {
      tiles.push({
        label: 'Draft invoices',
        value: money(metrics.draftInvoiceValue),
        delta: `${metrics.draftInvoiceCount} not yet approved`,
      })
    }

    return tiles.map((tile, i) => ({ ...tile, ...TONES[i % TONES.length] }))
  }, [metrics])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setHolidaysLoading(true)
      try {
        const data = await holidaysApi.getAllHolidays()
        if (!cancelled) setHolidays(Array.isArray(data) ? data : [])
      } catch {
        if (!cancelled) setHolidays([])
      } finally {
        if (!cancelled) setHolidaysLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const upcomingHolidays = useMemo(() => {
    const today = new Date()
    const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())

    return holidays
      .filter((h) => {
        const end = new Date(h.endDate || h.startDate)
        const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate())
        return endUtc >= todayUtc
      })
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
      .slice(0, 5)
  }, [holidays])

  return (
    <div className="space-y-6">
      <section className="dashboard-hero relative">
        <div className="grid gap-6 p-6 lg:grid-cols-[1.5fr_1fr] lg:p-8">
          <div className="relative overflow-hidden rounded-[1.5rem] border border-border bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-6 text-white">
            <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-cyan-400/15 blur-3xl" />
            <div className="relative z-10 max-w-2xl space-y-4">
              <div className="dashboard-badge border-white/10 bg-white/8 text-white/80">Warehouse control tower</div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Operational visibility for the whole warehouse flow.</h1>
                <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300 md:text-base">
                  A cleaner cockpit for stock, shipments, and team activity, styled to match the mockup’s sharper admin dashboard.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link to="/app/warehouse-locations" className="inline-flex items-center gap-2 rounded-full bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-400">
                  Open warehouse map
                  <span>→</span>
                </Link>
                <Link to="/app/services" className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-4 py-2.5 text-sm font-semibold text-white/90 transition-colors hover:bg-white/12">
                  Review services
                </Link>
              </div>
            </div>
          </div>

          <div className="dashboard-panel p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Today&apos;s pulse</div>
                <div className="mt-1 text-lg font-semibold text-foreground">Upcoming holidays</div>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-50 text-sky-600">
                <div className="grid grid-cols-2 gap-0.5">
                  <span className="h-1.5 w-1.5 rounded-sm bg-sky-500" />
                  <span className="h-1.5 w-1.5 rounded-sm bg-sky-500" />
                  <span className="h-1.5 w-1.5 rounded-sm bg-sky-500" />
                  <span className="h-1.5 w-1.5 rounded-sm bg-sky-500" />
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {holidaysLoading ? (
                <div className="rounded-2xl border border-border bg-white/60 px-4 py-8 text-center text-sm text-muted-foreground backdrop-blur">
                  Loading holidays…
                </div>
              ) : upcomingHolidays.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-white/40 px-4 py-10 text-center backdrop-blur">
                  <p className="text-sm font-medium text-foreground">No upcoming holidays.</p>
                  <p className="mt-1 text-sm text-muted-foreground">Configured holidays will appear here when they are coming up.</p>
                </div>
              ) : (
                upcomingHolidays.map((holiday) => (
                  <div key={holiday.id} className="rounded-2xl border border-border bg-white/60 p-4 backdrop-blur">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-semibold text-foreground">{holiday.name}</div>
                        <div className="mt-1 text-sm text-muted-foreground">{formatHolidayRange(holiday)}</div>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-sky-600">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-sky-500" />
                        Holiday
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      {metricsError && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {metricsError}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metricsLoading
          ? // Skeletons rather than zeros: a real 0 and "not loaded yet" mean
            // very different things to somebody checking whether work is waiting.
            Array.from({ length: 4 }).map((_, i) => (
              <div key={`skeleton-${i}`} className="dashboard-kpi animate-pulse">
                <div className="h-11 w-11 rounded-2xl bg-muted" />
                <div className="mt-4 h-8 w-20 rounded bg-muted" />
                <div className="mt-2 h-4 w-28 rounded bg-muted" />
              </div>
            ))
          : kpis.map((item) => {
          return (
            <div key={item.label} className="dashboard-kpi">
              <div className="flex items-center justify-between">
                <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${item.tone}`}>
                  <span className={`h-3.5 w-3.5 rounded-full ${item.accent}`} />
                </div>
                <span className="dashboard-badge">{item.delta}</span>
              </div>
              <div className="mt-4 text-3xl font-semibold tracking-tight text-foreground">{item.value}</div>
              <div className="mt-1 text-sm text-muted-foreground">{item.label}</div>
            </div>
          )
        })}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.25fr_0.95fr]">
        <div className="dashboard-panel p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Where the stock is</div>
              <h2 className="mt-1 text-lg font-semibold text-foreground">Units by location</h2>
            </div>
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-muted text-muted-foreground">WM</span>
          </div>

          <div className="mt-5 space-y-4">
            {metricsLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={`bar-${i}`} className="animate-pulse">
                    <div className="mb-2 h-4 w-40 rounded bg-muted" />
                    <div className="h-2 rounded-full bg-muted" />
                  </div>
                ))}
              </div>
            ) : metrics.byLocation.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No stock recorded yet. Add products and check them in to see this
                fill up.
              </p>
            ) : (
              metrics.byLocation.map((loc, i) => {
                // Scaled against the busiest location, not a capacity — there is
                // no capacity column, so a percentage would be invented.
                const busiest = metrics.byLocation[0]?.units || 1
                const width = Math.max(4, Math.round((loc.units / busiest) * 100))
                return (
                  <div key={loc.name}>
                    <div className="mb-2 flex items-center justify-between gap-4 text-sm">
                      <span className="font-medium text-foreground truncate">{loc.name}</span>
                      <span className="text-muted-foreground whitespace-nowrap">
                        {loc.units.toLocaleString('en-GB')} units
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full ${TONES[i % TONES.length].bar}`}
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        <div className="dashboard-panel p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Quick links</div>
              <h2 className="mt-1 text-lg font-semibold text-foreground">Common actions</h2>
            </div>
            <span className="text-muted-foreground">→</span>
          </div>

          <div className="mt-5 grid gap-3">
            <Link to="/app/users" className="rounded-2xl border border-border bg-white/70 p-4 transition-colors hover:bg-white">
              <div className="text-sm font-semibold text-foreground">Manage users</div>
              <div className="mt-1 text-sm text-muted-foreground">Review accounts and access.</div>
            </Link>
            <Link to="/app/clients" className="rounded-2xl border border-border bg-white/70 p-4 transition-colors hover:bg-white">
              <div className="text-sm font-semibold text-foreground">View clients</div>
              <div className="mt-1 text-sm text-muted-foreground">Check client inventory and status.</div>
            </Link>
            <Link to="/app/services" className="rounded-2xl border border-border bg-white/70 p-4 transition-colors hover:bg-white">
              <div className="text-sm font-semibold text-foreground">Edit services</div>
              <div className="mt-1 text-sm text-muted-foreground">Update packing and storage services.</div>
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
