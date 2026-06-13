import { Link } from 'react-router'

const kpis = [
  { label: 'Inbound orders', value: '128', delta: '+18%', tone: 'bg-blue-50', accent: 'bg-blue-500' },
  { label: 'Active storage zones', value: '14', delta: '2 at capacity', tone: 'bg-emerald-50', accent: 'bg-emerald-500' },
  { label: 'Low stock alerts', value: '07', delta: 'Needs review', tone: 'bg-orange-50', accent: 'bg-orange-500' },
  { label: 'Tracked SKUs', value: '2.4k', delta: '+6% this week', tone: 'bg-violet-50', accent: 'bg-violet-500' },
]

const activity = [
  { title: 'Shipment checked in', detail: 'Receiving bay updated with 840 units from FashionForward.', time: '12 min ago' },
  { title: 'Zone A rebalanced', detail: 'Fast movers shifted closer to outbound staging.', time: '46 min ago' },
  { title: 'Client allocation confirmed', detail: 'GreenLeaf Health inventory reserved for dispatch.', time: '2 hr ago' },
]

const zones = [
  { label: 'Zone A - Fast movers', pct: 82, color: 'bg-blue-500' },
  { label: 'Zone B - Climate control', pct: 61, color: 'bg-emerald-500' },
  { label: 'Zone C - Overflow', pct: 91, color: 'bg-orange-500' },
]

export default function DashboardIndex() {
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
                <div className="mt-1 text-lg font-semibold text-foreground">Warehouse summary</div>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                <div className="grid grid-cols-2 gap-0.5">
                  <span className="h-1.5 w-1.5 rounded-sm bg-blue-500" />
                  <span className="h-1.5 w-1.5 rounded-sm bg-blue-500" />
                  <span className="h-1.5 w-1.5 rounded-sm bg-blue-500" />
                  <span className="h-1.5 w-1.5 rounded-sm bg-blue-500" />
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {activity.map((item) => (
                <div key={item.title} className="rounded-2xl border border-border bg-white/60 p-4 backdrop-blur">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-foreground">{item.title}</div>
                      <div className="mt-1 text-sm text-muted-foreground">{item.detail}</div>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                      {item.time}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map((item) => {
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
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Storage health</div>
              <h2 className="mt-1 text-lg font-semibold text-foreground">Zone utilisation</h2>
            </div>
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-muted text-muted-foreground">WM</span>
          </div>

          <div className="mt-5 space-y-4">
            {zones.map((zone) => (
              <div key={zone.label}>
                <div className="mb-2 flex items-center justify-between gap-4 text-sm">
                  <span className="font-medium text-foreground">{zone.label}</span>
                  <span className="text-muted-foreground">{zone.pct}% full</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className={`h-full rounded-full ${zone.color}`} style={{ width: `${zone.pct}%` }} />
                </div>
              </div>
            ))}
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
