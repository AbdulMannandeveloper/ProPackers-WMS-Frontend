import { useEffect, useState, useMemo } from 'react'
import {
  profitLoss as profitLossApi,
  expenses as expensesApi,
} from '@/api'
import type { PLSummary, PLTrend, ClientProfitability } from '@/api/profit-loss'
import type { Expense } from '@/api/expenses'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/Shared Components'
import { TrendingUp, TrendingDown, DollarSign, BarChart3, Download, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const fmt = (n: number | string) =>
  `£${Math.abs(Number(n)).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function PLPage() {
  const [summary, setSummary] = useState<PLSummary | null>(null)
  const [trends, setTrends] = useState<PLTrend[]>([])
  const [clientRevenues, setClientRevenues] = useState<ClientProfitability[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [, setLoading] = useState(false)

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type })
  }
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 4000)
      return () => clearTimeout(t)
    }
  }, [toast])

  const loadData = async () => {
    setLoading(true)
    try {
      const now = new Date()
      const currentMonthStr = now.toISOString().slice(0, 7) // YYYY-MM
      const [sumData, trendData, clientProfit, expList] = await Promise.all([
        profitLossApi.getPLSummary(`${currentMonthStr}-01`),
        profitLossApi.getPLTrends(6),
        profitLossApi.getClientProfitability(`${currentMonthStr}-01`),
        expensesApi.getAllExpenses({ startDate: `${currentMonthStr}-01` }),
      ])
      setSummary(sumData)
      setTrends(trendData)
      setClientRevenues(clientProfit)
      setExpenses(expList)
    } catch (err: any) {
      showToast(err?.response?.data?.error || err?.message || 'Failed to load P&L summary.', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  // Calculate past month comparison values
  const prevMonthSummary = useMemo(() => {
    if (trends.length < 2) return null
    // The second to last item in trends is the previous month
    return trends[trends.length - 2]
  }, [trends])

  const revenueChange = useMemo(() => {
    if (!summary || !prevMonthSummary) return 0
    return summary.totalEarnings - prevMonthSummary.revenue
  }, [summary, prevMonthSummary])

  const profitChange = useMemo(() => {
    if (!summary || !prevMonthSummary) return 0
    return summary.netProfit - prevMonthSummary.profit
  }, [summary, prevMonthSummary])

  // Group current month's expenses by category
  const expenseBreakdown = useMemo(() => {
    const grouped: Record<string, number> = {}
    for (const exp of expenses) {
      const catName = exp.category?.categoryName || 'General'
      grouped[catName] = (grouped[catName] || 0) + Number(exp.amount)
    }
    return Object.entries(grouped)
      .map(([categoryName, amount]) => ({ categoryName, amount }))
      .sort((a, b) => b.amount - a.amount)
  }, [expenses])

  // PDF report generator
  const handleDownloadPDFReport = () => {
    if (!summary) return
    const doc = new jsPDF()

    // Title / Logo branding
    doc.setFontSize(22)
    doc.setTextColor(15, 23, 42)
    doc.text('Pro Packers UK', 14, 25)
    doc.setFontSize(10)
    doc.setTextColor(100, 116, 139)
    doc.text('Warehouse Management Platform', 14, 30)

    doc.setFontSize(14)
    doc.setTextColor(15, 23, 42)
    const monthName = new Date(summary.monthYear).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    doc.text(`Monthly Financial Performance Report — ${monthName}`, 14, 45)

    // Divider line
    doc.setDrawColor(226, 232, 240)
    doc.setLineWidth(0.5)
    doc.line(14, 50, 196, 50)

    // Summary Metrics Grid
    doc.setFontSize(11)
    doc.setTextColor(71, 85, 105)
    doc.text('Financial Summary:', 14, 60)
    doc.setFontSize(12)
    doc.setTextColor(15, 23, 42)
    doc.text(`Total Earnings (Approved Invoices): ${fmt(summary.totalEarnings)}`, 20, 70)
    doc.text(`Total Operational Expenses: ${fmt(summary.totalExpenses)}`, 20, 78)
    doc.setFont('Helvetica', 'bold')
    doc.text(`Net Operating Profit: ${summary.netProfit < 0 ? '−' : '+'}${fmt(summary.netProfit)}`, 20, 86)
    doc.setFont('Helvetica', 'normal')

    // Expense breakdown table
    const tableBody = expenseBreakdown.map((item) => [
      item.categoryName,
      fmt(item.amount),
      `${((item.amount / (summary.totalExpenses || 1)) * 100).toFixed(1)}%`,
    ])

    doc.setFontSize(11)
    doc.text('Expense breakdown by Category:', 14, 102)

    autoTable(doc, {
      startY: 106,
      head: [['Expense Category', 'Total Spent', 'Percentage of Expenses']],
      body: tableBody,
      headStyles: { fillColor: [15, 23, 42] },
      styles: { cellPadding: 4, fontSize: 10 },
    })

    // Client contribution table
    const clientTableBody = clientRevenues.map((c) => [c.companyName, fmt(c.revenue)])
    const finalY = (doc as any).lastAutoTable.finalY + 12

    doc.text('Client Revenue Contributions:', 14, finalY)

    autoTable(doc, {
      startY: finalY + 4,
      head: [['Client Company', 'Revenue Contribution']],
      body: clientTableBody,
      headStyles: { fillColor: [8, 145, 178] },
      styles: { cellPadding: 4, fontSize: 10 },
    })

    doc.save(`Pro_Packers_UK_PL_Report_${selectedMonthLabel.replace(' ', '_')}.pdf`)
  }

  const selectedMonthLabel = useMemo(() => {
    if (!summary) return ''
    return new Date(summary.monthYear).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  }, [summary])

  // SVG Chart Computations
  const chartHeight = 220
  const chartWidth = 500

  // 1. Bar Chart Coordinates (Revenue vs Expenses)
  const barChartCalculations = useMemo(() => {
    if (trends.length === 0) return { bars: [], gridLines: [], maxVal: 0 }
    const maxVal = Math.max(...trends.map((t) => Math.max(t.revenue, t.expenses)), 1000)

    const gridLines = [0, 0.25, 0.5, 0.75, 1].map((p) => ({
      y: chartHeight - 30 - p * (chartHeight - 60),
      label: `£${Math.round((p * maxVal) / 1000)}k`,
    }))

    const colWidth = (chartWidth - 60) / trends.length
    const bars = trends.map((t, idx) => {
      const x = 50 + idx * colWidth
      const revHeight = (t.revenue / maxVal) * (chartHeight - 60)
      const expHeight = (t.expenses / maxVal) * (chartHeight - 60)

      return {
        month: t.month,
        revenue: {
          x: x + 5,
          y: chartHeight - 30 - revHeight,
          h: revHeight,
          raw: t.revenue,
        },
        expenses: {
          x: x + colWidth / 2 - 2,
          y: chartHeight - 30 - expHeight,
          h: expHeight,
          raw: t.expenses,
        },
        labelX: x + colWidth / 3,
      }
    })

    return { bars, gridLines, maxVal }
  }, [trends])

  // 2. Line Chart Coordinates (Net Profit Trend)
  const lineChartCalculations = useMemo(() => {
    if (trends.length === 0) return { points: '', dots: [], gridLines: [] }

    const profits = trends.map((t) => t.profit)
    const minProfit = Math.min(...profits, 0)
    const maxProfit = Math.max(...profits, 1000)
    const valRange = maxProfit - minProfit || 1

    const gridLines = [0, 0.25, 0.5, 0.75, 1].map((p) => {
      const val = minProfit + p * valRange
      return {
        y: chartHeight - 30 - p * (chartHeight - 60),
        label: `£${Math.round(val / 1000)}k`,
      }
    })

    const colWidth = (chartWidth - 60) / trends.length
    const dots = trends.map((t, idx) => {
      const x = 50 + idx * colWidth + colWidth / 4
      const pRatio = (t.profit - minProfit) / valRange
      const y = chartHeight - 30 - pRatio * (chartHeight - 60)
      return { x, y, month: t.month, raw: t.profit }
    })

    const points = dots.map((d, i) => `${i === 0 ? 'M' : 'L'} ${d.x} ${d.y}`).join(' ')

    return { points, dots, gridLines }
  }, [trends])

  return (
    <div className="space-y-6 max-w-7xl mx-auto relative">
      {/* Toast popup */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-[100] rounded-2xl border p-4 shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300 ${
            toast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/90 dark:border-emerald-800 dark:text-emerald-100'
              : 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/90 dark:border-rose-800 dark:text-rose-100'
          }`}
        >
          <div className={`w-2 h-2 rounded-full ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
          <span className="text-sm font-medium">{toast.message}</span>
          <button type="button" onClick={() => setToast(null)} className="ml-4 text-slate-400 hover:text-slate-600 text-base">
            ×
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Profit & Loss Analytics</h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time operating income, manual ledger costs, client profitability, and multi-month trends.
          </p>
        </div>
        <div>
          {summary && (
            <Button onClick={handleDownloadPDFReport} className="inline-flex items-center gap-2">
              <Download className="w-4 h-4" /> Download P&L Report
            </Button>
          )}
        </div>
      </div>

      {/* Summary KPI Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              label: 'Total Revenue',
              value: fmt(summary.totalEarnings),
              sub: prevMonthSummary ? `vs ${fmt(prevMonthSummary.revenue)} last month` : 'Current operating period',
              change: revenueChange,
              icon: <TrendingUp className="w-5 h-5 text-emerald-600 dark:text-emerald-300" />,
              color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:border-emerald-900',
            },
            {
              label: 'Total Expenses',
              value: fmt(summary.totalExpenses),
              sub: `Salaries + operational overheads`,
              change: 0,
              icon: <TrendingDown className="w-5 h-5 text-rose-600 dark:text-rose-300" />,
              color: 'text-rose-600 bg-rose-50 dark:bg-rose-950/40 dark:border-rose-900',
            },
            {
              label: 'Net Operating Profit',
              value: (summary.netProfit < 0 ? '−' : '+') + fmt(summary.netProfit),
              sub: prevMonthSummary ? `vs ${prevMonthSummary.profit < 0 ? '−' : '+'}${fmt(prevMonthSummary.profit)} last month` : 'Current period margin',
              change: profitChange,
              icon: <DollarSign className="w-5 h-5 text-cyan-600 dark:text-cyan-300" />,
              color:
                summary.netProfit >= 0
                  ? 'text-cyan-600 bg-cyan-50 dark:bg-cyan-950/40 dark:border-cyan-900'
                  : 'text-rose-600 bg-rose-50 dark:bg-rose-950/40 dark:border-rose-900',
            },
          ].map(({ label, value, sub, change, icon, color }) => (
            <div
              key={label}
              className={`border border-slate-200 dark:border-slate-800 rounded-2xl p-5 bg-card shadow-sm flex flex-col justify-between`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}>{icon}</div>
              </div>
              <p className="text-3xl font-extrabold text-slate-900 dark:text-white mt-3 font-mono">{value}</p>
              <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-2">
                {change !== 0 && (
                  change > 0 ? (
                    <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <ArrowDownRight className="w-3.5 h-3.5 text-rose-500" />
                  )
                )}
                <span>{sub}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SVG Interactive Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue vs Expenses Chart */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
              <BarChart3 className="w-4 h-4" /> Revenue vs Expenses (Last 6 Months)
            </CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center py-4 bg-slate-50/50 dark:bg-slate-900/10 rounded-xl m-4 border border-slate-100 dark:border-slate-900">
            <svg height={chartHeight} width={chartWidth} className="overflow-visible select-none">
              {/* Y Grid Lines */}
              {barChartCalculations.gridLines.map((line) => (
                <g key={line.y}>
                  <line x1="50" y1={line.y} x2={chartWidth - 10} y2={line.y} stroke="hsl(var(--border))" strokeWidth="0.5" strokeDasharray="3 3" />
                  <text x="10" y={line.y + 4} fill="currentColor" className="text-[10px] text-slate-400 font-mono">
                    {line.label}
                  </text>
                </g>
              ))}

              {/* Bars */}
              {barChartCalculations.bars.map((bar) => (
                <g key={bar.month} className="group">
                  {/* Revenue Bar */}
                  <rect
                    x={bar.revenue.x}
                    y={bar.revenue.y}
                    width={(chartWidth - 60) / trends.length / 3}
                    height={Math.max(bar.revenue.h, 2)}
                    fill="#3b82f6"
                    rx="2"
                    className="hover:opacity-85 transition-opacity"
                  />
                  {/* Expenses Bar */}
                  <rect
                    x={bar.expenses.x}
                    y={bar.expenses.y}
                    width={(chartWidth - 60) / trends.length / 3}
                    height={Math.max(bar.expenses.h, 2)}
                    fill="#ef4444"
                    rx="2"
                    className="hover:opacity-85 transition-opacity"
                  />
                  {/* Tooltip triggers */}
                  <text
                    x={bar.labelX}
                    y={chartHeight - 10}
                    fill="currentColor"
                    className="text-[10px] text-slate-500 font-semibold"
                  >
                    {bar.month}
                  </text>
                </g>
              ))}
            </svg>
          </CardContent>
          <CardFooter className="flex justify-center gap-4 text-xs font-semibold text-slate-500">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-blue-500" /> Revenue
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-red-500" /> Expenses
            </div>
          </CardFooter>
        </Card>

        {/* Profit Trend Chart */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-500">
              Net Profit Trend (Last 6 Months)
            </CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center py-4 bg-slate-50/50 dark:bg-slate-900/10 rounded-xl m-4 border border-slate-100 dark:border-slate-900">
            <svg height={chartHeight} width={chartWidth} className="overflow-visible select-none">
              {/* Y Grid Lines */}
              {lineChartCalculations.gridLines.map((line) => (
                <g key={line.y}>
                  <line x1="50" y1={line.y} x2={chartWidth - 10} y2={line.y} stroke="hsl(var(--border))" strokeWidth="0.5" strokeDasharray="3 3" />
                  <text x="10" y={line.y + 4} fill="currentColor" className="text-[10px] text-slate-400 font-mono">
                    {line.label}
                  </text>
                </g>
              ))}

              {/* Trend Path */}
              {lineChartCalculations.points && (
                <path
                  d={lineChartCalculations.points}
                  fill="none"
                  stroke="#06b6d4"
                  strokeWidth="2.5"
                  className="animate-in fade-in duration-500"
                />
              )}

              {/* Data points */}
              {lineChartCalculations.dots.map((dot) => (
                <g key={dot.month} className="group">
                  <circle
                    cx={dot.x}
                    cy={dot.y}
                    r="4"
                    fill="#06b6d4"
                    className="hover:r-6 cursor-pointer transition-all"
                  />
                  <text
                    x={dot.x - 12}
                    y={chartHeight - 10}
                    fill="currentColor"
                    className="text-[10px] text-slate-500 font-semibold"
                  >
                    {dot.month}
                  </text>
                </g>
              ))}
            </svg>
          </CardContent>
          <CardFooter className="flex justify-center gap-4 text-xs font-semibold text-slate-500">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-cyan-500" /> Net Profit margin
            </div>
          </CardFooter>
        </Card>
      </div>

      {/* Grid: Client profitability and category expenses */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Client Revenue contributions list */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-500">
              Client Revenue Contribution
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            {clientRevenues.length === 0 ? (
              <p className="text-center text-slate-400 text-sm py-4">No active client invoices detected.</p>
            ) : (
              clientRevenues.map((cli) => {
                const maxVal = Math.max(...clientRevenues.map((c) => c.revenue), 1)
                const percentage = Math.round((cli.revenue / maxVal) * 100)
                return (
                  <div key={cli.clientId} className="flex items-center gap-3">
                    <span className="text-sm font-medium w-36 truncate text-slate-800 dark:text-slate-200">
                      {cli.companyName.replace(' Ltd', '').replace(' UK', '')}
                    </span>
                    <div className="flex-1 bg-slate-100 dark:bg-slate-900 rounded-full h-3 overflow-hidden border border-slate-200/40">
                      <div
                        className="h-full bg-cyan-500 rounded-full transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <span className="text-sm font-bold w-24 text-right text-slate-900 dark:text-white font-mono">
                      {fmt(cli.revenue)}
                    </span>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>

        {/* Expense Category distribution breakdown */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-500">
              Expense Breakdown — {selectedMonthLabel}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-3">
            {expenseBreakdown.length === 0 ? (
              <p className="text-center text-slate-400 text-sm py-4">No logged expenses for this period.</p>
            ) : (
              expenseBreakdown.map((item) => {
                const totalExp = summary?.totalExpenses || 1
                const pct = ((item.amount / totalExp) * 100).toFixed(0)
                return (
                  <div key={item.categoryName} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-900 last:border-0">
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{item.categoryName}</span>
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-slate-400 font-semibold font-mono">{pct}%</span>
                      <span className="text-sm font-bold text-slate-900 dark:text-white font-mono w-24 text-right">
                        {fmt(item.amount)}
                      </span>
                    </div>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
