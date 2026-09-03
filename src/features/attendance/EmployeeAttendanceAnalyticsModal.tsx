import { useEffect, useMemo, useState } from 'react'
import { attendance as api } from '@/api'
import type { AttendanceAnalytics } from '@/api/attendance'
import { Button, Modal, Select } from '@/components/Shared Components'

interface Props {
  open: boolean
  userId: string | null
  userName?: string
  onClose: () => void
}

const MONTHS = [
  { value: '', label: 'All months' },
  { value: '1', label: 'January' },
  { value: '2', label: 'February' },
  { value: '3', label: 'March' },
  { value: '4', label: 'April' },
  { value: '5', label: 'May' },
  { value: '6', label: 'June' },
  { value: '7', label: 'July' },
  { value: '8', label: 'August' },
  { value: '9', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
]

const formatMonthLabel = (key: string) => {
  const [y, m] = key.split('-')
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, 1))
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

const formatTime = (iso?: string | null) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function EmployeeAttendanceAnalyticsModal({ open, userId, userName, onClose }: Props) {
  const [year, setYear] = useState('')
  const [month, setMonth] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState<AttendanceAnalytics | null>(null)

  useEffect(() => {
    if (!open || !userId) return

    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const result = await api.getEmployeeAttendanceAnalytics(userId, {
          ...(year ? { year } : {}),
          ...(month ? { month } : {}),
        })
        if (!cancelled) setData(result)
      } catch (e: any) {
        if (!cancelled) {
          setData(null)
          setError(e?.response?.data?.error || e?.message || 'Failed to load analytics.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, userId, year, month])

  useEffect(() => {
    if (!open) {
      setYear('')
      setMonth('')
      setData(null)
      setError('')
    }
  }, [open])

  const yearOptions = useMemo(() => {
    const years = new Set<string>()
    for (const row of data?.history ?? data?.months ?? []) {
      years.add(row.month.slice(0, 4))
    }
    years.add(String(new Date().getUTCFullYear()))
    return ['', ...[...years].sort((a, b) => Number(b) - Number(a))]
  }, [data])

  const displayName =
    userName ||
    [data?.user?.firstName, data?.user?.lastName].filter(Boolean).join(' ') ||
    data?.user?.email ||
    'Employee'

  const periodLabel =
    year && month
      ? formatMonthLabel(`${year}-${month.padStart(2, '0')}`)
      : year
        ? `Year ${year}`
        : month
          ? MONTHS.find((m) => m.value === month)?.label || 'Selected month'
          : 'All time'

  const stats = data?.period ?? data?.allTime

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Employee attendance analytics"
      description={`${displayName} — summary of on-time, late, leave, and holiday days.`}
      size="xl"
      contentClassName="space-y-5"
      footer={
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Year
            </label>
            <Select value={year} onChange={(e) => setYear(e.target.value)}>
              <option value="">All years</option>
              {yearOptions
                .filter(Boolean)
                .map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Month
            </label>
            <Select value={month} onChange={(e) => setMonth(e.target.value)}>
              {MONTHS.map((m) => (
                <option key={m.value || 'all'} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {(year || month) && (
          <Button
            variant="secondary"
            onClick={() => {
              setYear('')
              setMonth('')
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      {loading && !data ? (
        <div className="py-10 text-center text-sm text-muted-foreground">Loading analytics…</div>
      ) : data ? (
        <>
          {/* All-time strip */}
          <section className="rounded-xl border border-border bg-muted/30 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                All-time record
              </h3>
              <span className="text-xs text-muted-foreground">
                {data.allTime.monthsCovered} month{data.allTime.monthsCovered === 1 ? '' : 's'} covered
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {[
                { label: 'On time', value: data.allTime.totalOnTimeDays },
                { label: 'Late', value: data.allTime.totalLateArrivals },
                { label: 'Present', value: data.allTime.totalDaysPresent },
                { label: 'Leave', value: data.allTime.totalLeaveDays },
                { label: 'Holiday days', value: data.allTime.totalHolidayDays },
                { label: 'Hours', value: data.allTime.totalHoursWorked },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-border bg-white px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {item.label}
                  </div>
                  <div className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">{item.value}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Filtered period */}
          <section className="rounded-xl border border-border bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Period · {periodLabel}
              </h3>
              {loading ? <span className="text-xs text-muted-foreground">Updating…</span> : null}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {[
                { label: 'On time', value: stats?.totalOnTimeDays ?? 0, tone: 'text-emerald-700' },
                { label: 'Late', value: stats?.totalLateArrivals ?? 0, tone: 'text-amber-700' },
                { label: 'Present', value: stats?.totalDaysPresent ?? 0, tone: 'text-foreground' },
                { label: 'Leave', value: stats?.totalLeaveDays ?? 0, tone: 'text-violet-700' },
                { label: 'Holiday days', value: stats?.totalHolidayDays ?? 0, tone: 'text-sky-700' },
                { label: 'Hours', value: stats?.totalHoursWorked ?? 0, tone: 'text-foreground' },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {item.label}
                  </div>
                  <div className={`mt-0.5 text-lg font-semibold tabular-nums ${item.tone}`}>{item.value}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Monthly breakdown */}
          <section className="overflow-hidden rounded-xl border border-border">
            <div className="border-b border-border bg-muted/40 px-4 py-2.5">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Monthly breakdown
              </h3>
            </div>
            {data.months.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                No attendance data for this filter.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[45rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Month</th>
                      <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">On time</th>
                      <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Late</th>
                      <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Leave</th>
                      <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Holidays</th>
                      <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Hours</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.months.map((row) => (
                      <tr key={row.month} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3 font-medium text-foreground">
                          {formatMonthLabel(row.month)}
                          {row.source === 'live' ? (
                            <span className="ml-2 text-[10px] font-normal uppercase tracking-wide text-slate-400">
                              live
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-emerald-700">{row.totalOnTimeDays}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-amber-700">{row.totalLateArrivals}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-violet-700">{row.totalLeaveDays}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-sky-700">{row.totalHolidayDays}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-foreground">{row.totalHoursWorked}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Daily detail when a single month is selected and logs still exist */}
          {year && month ? (
            <section className="overflow-hidden rounded-xl border border-border">
              <div className="border-b border-border bg-muted/40 px-4 py-2.5">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Daily detail · {formatMonthLabel(`${year}-${month.padStart(2, '0')}`)}
                </h3>
              </div>
              {data.dailyLogs.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No daily logs for this month (older months keep summary only after archive).
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Date</th>
                        <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">In</th>
                        <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Out</th>
                        <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {data.dailyLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50/80">
                          <td className="px-4 py-3 font-medium">
                            {new Date(log.date).toLocaleDateString('en-GB')}
                          </td>
                          <td className="px-4 py-3">{formatTime(log.loginTimestamp)}</td>
                          <td className="px-4 py-3">{formatTime(log.logoutTimestamp)}</td>
                          <td className="px-4 py-3 capitalize">{log.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ) : null}
        </>
      ) : null}
    </Modal>
  )
}
