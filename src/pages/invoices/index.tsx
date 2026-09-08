import { useEffect, useState, useMemo } from 'react'
import { useAuthStore } from '@/stores/auth'
import { invoices as invoicesApi, clients as clientsApi, clientServices as clientServicesApi } from '@/api'
import type { MonthlyInvoice, InvoiceLineItem } from '@/api/invoices'
import type { Client } from '@/api/types'
import {
  Button,
  Card,
  CardContent,
  Badge,
  Input,
  Select,
  Modal,
} from '@/components/Shared Components'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number | string) =>
  `£${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

const fmtShort = (d: string) =>
  new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

const statusConfig: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'Draft', cls: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-200' },
  APPROVED: { label: 'Approved', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200' },
  PAID: { label: 'Paid', cls: 'bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-950 dark:text-cyan-200' },
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InvoicesPage() {
  const role = useAuthStore((s) => s.role)
  const isAdmin = role === 'admin'

  // ── Data ──
  const [allInvoices, setAllInvoices] = useState<MonthlyInvoice[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(false)

  // ── Toast ──
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const showToast = (message: string, type: 'success' | 'error' = 'success') => setToast({ message, type })
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 4500)
      return () => clearTimeout(t)
    }
  }, [toast])

  // ── Modals ──
  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [manualChargeModalOpen, setManualChargeModalOpen] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<MonthlyInvoice | null>(null)

  // ── Filters ──
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'DRAFT' | 'APPROVED' | 'PAID'>('ALL')
  const [filterClientId, setFilterClientId] = useState('')

  // ── Manual Charge Form ──
  const [chargeDescription, setChargeDescription] = useState('')
  const [chargeQty, setChargeQty] = useState(1)
  const [chargePrice, setChargePrice] = useState<number | ''>('')
  const [chargeDate, setChargeDate] = useState(new Date().toISOString().split('T')[0])
  const [chargeSaving, setChargeSaving] = useState(false)
  // The platform tax rate. Held here so the table can show what ticking the box
  // would add, before it is ticked.
  const [taxRate, setTaxRate] = useState<number>(20)
  const [taxRateDraft, setTaxRateDraft] = useState<string>('')
  const [savingRate, setSavingRate] = useState(false)
  const [togglingTax, setTogglingTax] = useState<string | null>(null)

  const [clientServices, setClientServices] = useState<any[]>([])
  const [selectedClientServiceId, setSelectedClientServiceId] = useState('')

  /** Changes the rate future invoices are taxed at. Already-taxed ones keep theirs. */
  const handleSaveTaxRate = async () => {
    const rate = Number(taxRateDraft)
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      showToast('Tax rate must be a number between 0 and 100.', 'error')
      return
    }

    setSavingRate(true)
    try {
      const { rate: saved } = await invoicesApi.setTaxRate(rate)
      setTaxRate(saved)
      setTaxRateDraft(String(saved))
      showToast(
        `Tax rate set to ${saved}%. Invoices already taxed keep the rate they were issued at.`,
      )
    } catch (err: any) {
      showToast(
        err?.response?.data?.error || err?.message || 'Could not save the tax rate.',
        'error',
      )
    } finally {
      setSavingRate(false)
    }
  }

  /** Applies or removes tax on one draft invoice. */
  const handleToggleTax = async (invoice: MonthlyInvoice, applied: boolean) => {
    setTogglingTax(invoice.id)
    try {
      await invoicesApi.setInvoiceTax(invoice.id, applied)
      await loadData()
    } catch (err: any) {
      showToast(
        err?.response?.data?.error || err?.message || 'Could not change the tax.',
        'error',
      )
    } finally {
      setTogglingTax(null)
    }
  }

  // ── Load ──
  const loadData = async () => {
    setLoading(true)
    try {
      const [invoicesData, clientsData, rateData] = await Promise.all([
        invoicesApi.getAllInvoices(),
        clientsApi.getAllClients().catch(() => [] as Client[]),
        invoicesApi.getTaxRate().catch(() => ({ rate: 20 })),
      ])
      setAllInvoices(invoicesData || [])
      setClients(clientsData || [])
      setTaxRate(rateData?.rate ?? 20)
      setTaxRateDraft(String(rateData?.rate ?? 20))
    } catch (err: any) {
      showToast(err?.response?.data?.error || err?.message || 'Failed to load invoices.', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadData() }, [])

  // ── Derived / Filtered ──
  const filteredInvoices = useMemo(() => {
    return allInvoices.filter((inv) => {
      if (filterStatus !== 'ALL' && inv.status !== filterStatus) return false
      if (filterClientId && inv.clientId !== filterClientId) return false
      return true
    })
  }, [allInvoices, filterStatus, filterClientId])

  const draftCount = useMemo(() => allInvoices.filter((i) => i.status === 'DRAFT').length, [allInvoices])
  const approvedCount = useMemo(() => allInvoices.filter((i) => i.status === 'APPROVED').length, [allInvoices])
  const paidCount = useMemo(() => allInvoices.filter((i) => i.status === 'PAID').length, [allInvoices])
  const totalRevenue = useMemo(
    () => allInvoices.filter((i) => i.status !== 'DRAFT').reduce((acc, i) => acc + Number(i.totalAmount), 0),
    [allInvoices]
  )

  // ── Actions ──
  const handleOpenDetail = (inv: MonthlyInvoice) => {
    setSelectedInvoice(inv)
    setDetailModalOpen(true)
  }

  // Payment capture. Optional detail, but it is the first thing anyone asks for
  // when a payment is queried, so it is prompted for rather than assumed.
  const [payModalOpen, setPayModalOpen] = useState(false)
  const [payMethod, setPayMethod] = useState('BACS')
  const [payReference, setPayReference] = useState('')

  const handleMarkPaid = async () => {
    if (!selectedInvoice) return
    try {
      await invoicesApi.markInvoicePaid(selectedInvoice.id, {
        paymentMethod: payMethod || undefined,
        paymentReference: payReference || undefined,
      })
      showToast('Invoice marked as paid.')
      setPayModalOpen(false)
      setDetailModalOpen(false)
      setPayReference('')
      await loadData()
    } catch (err: any) {
      showToast(err?.response?.data?.error || err?.message || 'Failed to mark invoice paid.', 'error')
    }
  }

  // The stored document, as issued. Available once approved.
  const handleDownloadPdf = async (invoice: MonthlyInvoice) => {
    try {
      const blob = await invoicesApi.downloadInvoicePdf(invoice.id)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `Pro_Packers_UK_Invoice_${invoice.id.slice(0, 8).toUpperCase()}_${new Date(
        invoice.billingPeriod
      )
        .toISOString()
        .slice(0, 7)}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      showToast(
        err?.response?.data?.error || err?.message || 'Could not download the invoice PDF.',
        'error'
      )
    }
  }

  const handleApprove = async () => {
    if (!selectedInvoice) return
    try {
      await invoicesApi.approveInvoice(selectedInvoice.id)
      showToast('Invoice approved successfully.')
      setDetailModalOpen(false)
      await loadData()
    } catch (err: any) {
      showToast(err?.response?.data?.error || err?.message || 'Failed to approve invoice.', 'error')
    }
  }

  const handleDelete = async () => {
    if (!selectedInvoice) return
    try {
      await invoicesApi.deleteInvoice(selectedInvoice.id)
      showToast('Invoice deleted.')
      setDeleteModalOpen(false)
      setDetailModalOpen(false)
      setSelectedInvoice(null)
      await loadData()
    } catch (err: any) {
      showToast(err?.response?.data?.error || err?.message || 'Failed to delete invoice.', 'error')
    }
  }

  useEffect(() => {
    if (manualChargeModalOpen && selectedInvoice?.clientId) {
      const fetchClientServices = async () => {
        try {
          const res = await clientServicesApi.getClientServicesByClientId(selectedInvoice.clientId)
          setClientServices(Array.isArray(res) ? res : [])
        } catch {
          setClientServices([])
        }
      }
      void fetchClientServices()
    } else {
      setClientServices([])
      setSelectedClientServiceId('')
    }
  }, [manualChargeModalOpen, selectedInvoice])

  const handleServiceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value
    setSelectedClientServiceId(val)
    if (val === '') {
      setChargeDescription('')
      setChargePrice('')
    } else {
      const match = clientServices.find((cs) => cs.id === val)
      if (match) {
        setChargeDescription(`Provided service "${match.service?.description || 'Service'}"`)
        setChargePrice(match.chargedPrice ? Number(match.chargedPrice) : '')
      }
    }
  }

  const handleAddManualCharge = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedInvoice) return
    if (!chargeDescription.trim() || !chargePrice || chargeQty < 1) {
      showToast('Please fill in all charge fields.', 'error')
      return
    }
    setChargeSaving(true)
    try {
      await invoicesApi.createLineItem(selectedInvoice.id, {
        description: chargeDescription.trim(),
        quantity: chargeQty,
        unitPrice: Number(chargePrice),
        dateOfService: chargeDate,
      })
      showToast('Manual charge added to invoice.')
      setManualChargeModalOpen(false)
      setChargeDescription('')
      setChargeQty(1)
      setChargePrice('')
      setSelectedClientServiceId('')
      // Reload so modal gets fresh line items
      const updated = await invoicesApi.getInvoiceById(selectedInvoice.id)
      setSelectedInvoice(updated)
      await loadData()
    } catch (err: any) {
      showToast(err?.response?.data?.error || err?.message || 'Failed to add charge.', 'error')
    } finally {
      setChargeSaving(false)
    }
  }

  const handleDeleteLineItem = async (item: InvoiceLineItem) => {
    if (!selectedInvoice) return
    try {
      await invoicesApi.deleteLineItem(selectedInvoice.id, item.id)
      showToast('Line item removed.')
      const updated = await invoicesApi.getInvoiceById(selectedInvoice.id)
      setSelectedInvoice(updated)
      await loadData()
    } catch (err: any) {
      showToast(err?.response?.data?.error || err?.message || 'Failed to remove line item.', 'error')
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-7xl mx-auto relative">

      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-[100] rounded-2xl border p-4 shadow-xl flex items-center gap-3 transition-all duration-300 ${
            toast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/90 dark:border-emerald-800 dark:text-emerald-100'
              : 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/90 dark:border-rose-800 dark:text-rose-100'
          }`}
        >
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
          <span className="text-sm font-medium">{toast.message}</span>
          <button type="button" onClick={() => setToast(null)} className="ml-4 text-slate-400 hover:text-slate-600 font-bold text-base">×</button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Invoices & Billing</h1>
          <p className="text-sm text-slate-500 mt-1">
            Monthly client billing records generated from shipment dispatches and manual service charges.
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            label: 'Draft Invoices',
            value: draftCount,
            sub: 'Awaiting approval',
            color: 'text-amber-700 bg-amber-50 border-amber-100 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-300',
            dot: 'bg-amber-400',
          },
          {
            label: 'Approved Invoices',
            value: approvedCount,
            sub: 'Ready for payment',
            color: 'text-emerald-700 bg-emerald-50 border-emerald-100 dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-300',
            dot: 'bg-emerald-400',
          },
          {
            label: 'Paid Invoices',
            value: paidCount,
            sub: 'Settled',
            color: 'text-teal-700 bg-teal-50 border-teal-100 dark:bg-teal-950/30 dark:border-teal-900 dark:text-teal-300',
            dot: 'bg-teal-400',
          },
          {
            label: 'Total Billed Revenue',
            value: fmt(totalRevenue),
            sub: 'Approved + Paid invoices',
            color: 'text-cyan-700 bg-cyan-50 border-cyan-100 dark:bg-cyan-950/30 dark:border-cyan-900 dark:text-cyan-300',
            dot: 'bg-cyan-400',
          },
        ].map(({ label, value, sub, color, dot }) => (
          <div key={label} className={`border rounded-2xl p-5 shadow-sm ${color}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`w-2.5 h-2.5 rounded-full ${dot}`} />
              <p className="text-xs uppercase tracking-wider font-semibold opacity-70">{label}</p>
            </div>
            <p className="text-3xl font-extrabold leading-tight">{value}</p>
            <p className="text-xs mt-1 opacity-60">{sub}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden text-sm">
          {(['ALL', 'DRAFT', 'APPROVED', 'PAID'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilterStatus(s)}
              className={`px-4 py-2 font-medium transition-colors ${
                filterStatus === s
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                  : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              {s === 'ALL' ? 'All' : statusConfig[s].label}
            </button>
          ))}
        </div>
        <select
          value={filterClientId}
          onChange={(e) => setFilterClientId(e.target.value)}
          className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200 px-3 py-2 h-10"
        >
          <option value="">All Clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.companyName}</option>
          ))}
        </select>
        <span className="text-xs text-slate-400">{filteredInvoices.length} invoice{filteredInvoices.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Invoice Table */}
      <Card className="shadow-md border-slate-200 dark:border-slate-800">
        <CardContent className="p-0">
          {/* The platform tax rate. Changing it affects invoices taxed from now
              on — an invoice already taxed keeps the rate it was issued at, so a
              rate change never restates what a client has already been sent. */}
          {isAdmin && (
            <div className="flex items-end gap-3 flex-wrap border-b border-slate-100 dark:border-slate-800 px-6 py-4">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Platform tax rate (%)
                </label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  className="w-28"
                  value={taxRateDraft}
                  onChange={(e) => setTaxRateDraft(e.target.value)}
                  aria-label="Platform tax rate percentage"
                />
              </div>
              <Button
                variant="outline"
                loading={savingRate} disabled={taxRateDraft === String(taxRate)}
                onClick={() => void handleSaveTaxRate()}
              >
                {savingRate ? 'Saving…' : 'Save rate'}
              </Button>
              <p className="text-xs text-slate-400 flex-1 min-w-[16rem]">
                Applied per invoice with the Tax box below, while it is still a
                draft. Invoices already taxed keep the rate they were issued at.
              </p>
            </div>
          )}

          {loading ? (
            <div className="py-16 text-center text-slate-400">Loading billing records...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[68rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 text-slate-500">
                    <th className="px-6 py-4 font-semibold">Client</th>
                    <th className="px-6 py-4 font-semibold">Billing Period</th>
                    <th className="px-6 py-4 font-semibold text-center">Line Items</th>
                    <th className="px-6 py-4 font-semibold text-right">Subtotal</th>
                    <th className="px-6 py-4 font-semibold text-center">Tax</th>
                    <th className="px-6 py-4 font-semibold text-right">Total Due</th>
                    <th className="px-6 py-4 font-semibold text-center">Status</th>
                    <th className="px-6 py-4 font-semibold">Created</th>
                    <th className="px-6 py-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-900">
                  {filteredInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        {filterStatus !== 'ALL' || filterClientId
                          ? 'No invoices match your filters.'
                          : 'No invoices yet. Dispatch a shipment to auto-generate the first one.'}
                      </td>
                    </tr>
                  ) : (
                    filteredInvoices.map((inv) => {
                      const sc = statusConfig[inv.status] ?? statusConfig.DRAFT
                      return (
                        <tr key={inv.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-900/40 transition-colors">
                          <td className="px-6 py-4">
                            <div className="font-semibold text-slate-900 dark:text-slate-100">
                              {inv.client?.companyName ?? '—'}
                            </div>
                            <div className="text-xs text-slate-400">{inv.client?.contactName}</div>
                          </td>
                          <td className="px-6 py-4 font-medium text-slate-700 dark:text-slate-300">
                            {fmtDate(inv.billingPeriod)}
                          </td>
                          <td className="px-6 py-4 text-center font-bold text-slate-600 dark:text-slate-400">
                            {inv.lineItems?.length ?? 0}
                          </td>
                          <td className="px-6 py-4 text-right text-slate-600 dark:text-slate-400 tabular-nums">
                            {fmt(inv.totalAmount)}
                          </td>
                          <td className="px-6 py-4 text-center">
                            {/* Only while DRAFT: once approved the invoice has
                                been sent, and the amount asked for must not move
                                underneath the client. */}
                            {inv.status === 'DRAFT' && isAdmin ? (
                              <label className="inline-flex items-center gap-2 cursor-pointer [@media(pointer:coarse)]:py-2">
                                <input
                                  type="checkbox"
                                  className="check-target"
                                  checked={Boolean(inv.taxApplied)}
                                  disabled={togglingTax === inv.id}
                                  aria-label={`Apply ${taxRate}% tax to this invoice`}
                                  onChange={(e) => void handleToggleTax(inv, e.target.checked)}
                                />
                                <span className="text-xs text-slate-500 tabular-nums">
                                  {inv.taxApplied ? fmt(inv.taxAmount ?? 0) : `${taxRate}%`}
                                </span>
                              </label>
                            ) : Number(inv.taxAmount ?? 0) > 0 ? (
                              <span className="text-xs text-slate-500 tabular-nums">
                                {fmt(inv.taxAmount ?? 0)}
                                {inv.taxRate != null && (
                                  <span className="text-slate-400"> ({Number(inv.taxRate)}%)</span>
                                )}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-300">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                            {fmt(invoicesApi.grandTotal(inv))}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <Badge variant="secondary" className={sc.cls}>{sc.label}</Badge>
                          </td>
                          <td className="px-6 py-4 text-xs text-slate-400 font-mono">
                            {fmtShort(inv.createdAt)}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <Button size="sm" variant="secondary" onClick={() => handleOpenDetail(inv)}>
                              View Details
                            </Button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── MODAL: Invoice Detail ─────────────────────────────────────────────── */}
      <Modal
        open={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        title="Invoice Details"
        description="Full billing record including auto-generated service charges and manual line items."
        size="lg"
        contentClassName="space-y-5"
        footer={
          <div className="flex justify-between gap-2 w-full">
            <div className="flex gap-2">
              {isAdmin && selectedInvoice?.status === 'DRAFT' && (
                <Button variant="destructive" size="sm" onClick={() => setDeleteModalOpen(true)}>
                  Delete Invoice
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setDetailModalOpen(false)}>Close</Button>
              {selectedInvoice && selectedInvoice.status !== 'DRAFT' && (
                <Button variant="secondary" onClick={() => handleDownloadPdf(selectedInvoice)}>
                  Download PDF
                </Button>
              )}
              {isAdmin && selectedInvoice?.status === 'DRAFT' && (
                <Button onClick={() => setManualChargeModalOpen(true)} variant="secondary">
                  + Add Manual Charge
                </Button>
              )}
              {isAdmin && selectedInvoice?.status === 'DRAFT' && (
                <Button onClick={handleApprove}>
                  Approve Invoice
                </Button>
              )}
              {isAdmin && selectedInvoice?.status === 'APPROVED' && (
                <Button onClick={() => setPayModalOpen(true)}>
                  Mark as Paid
                </Button>
              )}
            </div>
          </div>
        }
      >
        {selectedInvoice && (
          <div className="space-y-5">
            {/* Meta Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 text-sm">
              <div>
                <span className="text-slate-400 block text-xs uppercase tracking-wider font-semibold mb-0.5">Client</span>
                <strong className="text-slate-800 dark:text-slate-200">{selectedInvoice.client?.companyName}</strong>
              </div>
              <div>
                <span className="text-slate-400 block text-xs uppercase tracking-wider font-semibold mb-0.5">Billing Period</span>
                <strong className="text-slate-800 dark:text-slate-200">{fmtDate(selectedInvoice.billingPeriod)}</strong>
              </div>
              <div>
                <span className="text-slate-400 block text-xs uppercase tracking-wider font-semibold mb-0.5">
                  {Number(selectedInvoice.taxAmount ?? 0) > 0 ? 'Total Due' : 'Total Amount'}
                </span>
                <strong className="text-lg text-slate-900 dark:text-slate-100">
                  {fmt(invoicesApi.grandTotal(selectedInvoice))}
                </strong>
                {Number(selectedInvoice.taxAmount ?? 0) > 0 && (
                  <span className="block text-xs text-slate-400">
                    {fmt(selectedInvoice.totalAmount)} + {fmt(selectedInvoice.taxAmount ?? 0)} tax
                    {selectedInvoice.taxRate != null && ` (${Number(selectedInvoice.taxRate)}%)`}
                  </span>
                )}
              </div>
              <div>
                <span className="text-slate-400 block text-xs uppercase tracking-wider font-semibold mb-0.5">Issued by</span>
                {/* Which company the PDF goes out as, and therefore which bank
                    account the client pays into. Shown before approval, because
                    approval is when the document is rendered and frozen. */}
                <strong className="text-slate-800 dark:text-slate-200">
                  {invoicesApi.issuingCompany(selectedInvoice)}
                </strong>
              </div>
              <div>
                <span className="text-slate-400 block text-xs uppercase tracking-wider font-semibold mb-0.5">Status</span>
                <Badge variant="secondary" className={statusConfig[selectedInvoice.status]?.cls}>
                  {statusConfig[selectedInvoice.status]?.label}
                </Badge>
                {selectedInvoice.approvedAt && (
                  <div className="text-xs text-slate-400 mt-1">Approved {fmtShort(selectedInvoice.approvedAt)}</div>
                )}
              </div>
            </div>

            {/* Line Items Table */}
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-2">Line Items</h3>
              <div className="overflow-x-auto border border-slate-100 dark:border-slate-800 rounded-xl">
                <table className="w-full min-w-[52rem] text-left text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 border-b border-slate-100 dark:border-slate-800">
                    <tr>
                      <th className="p-3 font-semibold">Description</th>
                      <th className="p-3 font-semibold">Type</th>
                      <th className="p-3 font-semibold">Date</th>
                      <th className="p-3 text-center font-semibold">Qty</th>
                      <th className="p-3 text-right font-semibold">Unit Price</th>
                      <th className="p-3 text-right font-semibold">Total</th>
                      {isAdmin && selectedInvoice.status === 'DRAFT' && <th className="p-3" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-900">
                    {!selectedInvoice.lineItems || selectedInvoice.lineItems.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-4 text-center text-slate-400 text-sm">
                          No line items yet. Dispatch a shipment or add a manual charge.
                        </td>
                      </tr>
                    ) : (
                      selectedInvoice.lineItems.map((item) => (
                        <tr key={item.id}>
                          <td className="p-3 text-slate-700 dark:text-slate-300 max-w-xs">
                            <span className="line-clamp-2">{item.description}</span>
                          </td>
                          <td className="p-3">
                            <Badge
                              variant="secondary"
                              className={
                                item.itemType === 'MANUAL_CHARGE'
                                  ? 'bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-950 dark:text-violet-200'
                                  : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300'
                              }
                            >
                              {item.itemType === 'MANUAL_CHARGE' ? 'Manual' : 'Auto'}
                            </Badge>
                          </td>
                          <td className="p-3 text-xs text-slate-400 font-mono whitespace-nowrap">
                            {fmtShort(item.dateOfService)}
                          </td>
                          <td className="p-3 text-center font-mono">{Number(item.quantity).toLocaleString()}</td>
                          <td className="p-3 text-right font-mono tabular-nums">{fmt(item.unitPrice)}</td>
                          <td className="p-3 text-right font-bold font-mono tabular-nums">{fmt(item.totalPrice)}</td>
                          {isAdmin && selectedInvoice.status === 'DRAFT' && (
                            <td className="p-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleDeleteLineItem(item)}
                                className="text-rose-400 hover:text-rose-600 text-xs font-semibold transition-colors"
                              >
                                Remove
                              </button>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                  {selectedInvoice.lineItems && selectedInvoice.lineItems.length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/60">
                        <td colSpan={isAdmin && selectedInvoice.status === 'DRAFT' ? 5 : 5} className="p-3 text-right text-sm font-semibold text-slate-600 dark:text-slate-400">
                          Invoice Total
                        </td>
                        <td className="p-3 text-right font-extrabold text-slate-900 dark:text-slate-100 text-base tabular-nums">
                          {fmt(selectedInvoice.totalAmount)}
                        </td>
                        {isAdmin && selectedInvoice.status === 'DRAFT' && <td />}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ── MODAL: Add Manual Charge ──────────────────────────────────────────── */}
      <Modal
        open={manualChargeModalOpen}
        onClose={() => setManualChargeModalOpen(false)}
        title="Add Manual Charge"
        description="Manually bill the client for an additional service or one-off cost."
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setManualChargeModalOpen(false)} disabled={chargeSaving}>
              Cancel
            </Button>
            <Button type="submit" form="manual-charge-form" loading={chargeSaving}>
              {chargeSaving ? 'Adding...' : 'Add Charge'}
            </Button>
          </div>
        }
      >
        <form id="manual-charge-form" onSubmit={handleAddManualCharge} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
              Select Provided Service (Optional)
            </label>
            <Select
              value={selectedClientServiceId}
              onChange={handleServiceChange}
            >
              <option value="">-- Custom Charge (Enter Manually) --</option>
              {clientServices.map((cs) => (
                <option key={cs.id} value={cs.id}>
                  {cs.service?.description || 'Service'} (£{Number(cs.chargedPrice).toFixed(2)} / {cs.unit})
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
              Description *
            </label>
            <Input
              placeholder="e.g. Extra packing materials, Special handling fee"
              value={chargeDescription}
              onChange={(e) => setChargeDescription(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                Quantity *
              </label>
              <Input
                type="number"
                min="1"
                value={chargeQty}
                onChange={(e) => setChargeQty(parseInt(e.target.value) || 1)}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                Unit Price (£) *
              </label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={chargePrice}
                onChange={(e) => setChargePrice(parseFloat(e.target.value) || '')}
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
              Date of Service
            </label>
            <Input
              type="date"
              value={chargeDate}
              onChange={(e) => setChargeDate(e.target.value)}
            />
          </div>
          {chargePrice !== '' && chargeQty > 0 && (
            <div className="rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 p-3 flex items-center justify-between">
              <span className="text-xs text-slate-500 font-semibold">Charge total</span>
              <span className="font-extrabold text-slate-900 dark:text-slate-100">{fmt(Number(chargePrice) * chargeQty)}</span>
            </div>
          )}
        </form>
      </Modal>

      {/* ── MODAL: Confirm Delete ─────────────────────────────────────────────── */}
      <Modal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Delete Invoice"
        description="This will permanently remove the invoice and all its line items. This cannot be undone."
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteModalOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Confirm Delete</Button>
          </div>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Are you sure you want to delete the invoice for{' '}
          <strong className="text-rose-600">{selectedInvoice?.client?.companyName}</strong>{' '}
          for billing period <strong>{selectedInvoice ? fmtDate(selectedInvoice.billingPeriod) : ''}</strong>?
        </p>
      </Modal>

      {/* ───────────────────────────────── MODAL: RECORD PAYMENT ───────────────────────────────── */}
      <Modal
        open={payModalOpen}
        onClose={() => setPayModalOpen(false)}
        title="Record Payment"
        description="Marks the invoice paid. The method and reference are what a payment query gets answered from later."
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPayModalOpen(false)}>Cancel</Button>
            <Button onClick={handleMarkPaid}>Confirm Payment</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Recording payment of{' '}
            <strong>{selectedInvoice ? fmt(Number(selectedInvoice.totalAmount)) : ''}</strong>{' '}
            from <strong>{selectedInvoice?.client?.companyName}</strong>.
          </p>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
              Method
            </label>
            <Select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
              <option value="BACS">BACS</option>
              <option value="Card">Card</option>
              <option value="Cheque">Cheque</option>
              <option value="Cash">Cash</option>
              <option value="Other">Other</option>
            </Select>
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
              Reference <span className="normal-case text-slate-400">(optional)</span>
            </label>
            <Input
              value={payReference}
              onChange={(e) => setPayReference(e.target.value)}
              placeholder="e.g. FT24019283"
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
