import { useEffect, useRef, useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useAuthStore } from '@/stores/auth'
import { invoices as invoicesApi, clientServices as clientServicesApi } from '@/api'
import type { MonthlyInvoice } from '@/api/invoices'
import {
  Button,
  Card,
  CardContent,
  Badge,
  Input,
  Select,
  Modal,
} from '@/components/Shared Components'
import { errorMessage } from '@/lib/errors'
import { SlidersHorizontal } from 'lucide-react'

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

// Line items and tax stay open on an APPROVED invoice so an admin can correct
// one after the fact — the API re-renders the PDF and re-notifies the client
// on every such change. PAID is frozen, and the invoice itself (as opposed to
// its contents) is only ever deletable while still DRAFT.
const isContentEditable = (status: string) => status === 'DRAFT' || status === 'APPROVED'

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InvoicesPage() {
  const role = useAuthStore((s) => s.role)
  const isAdmin = role === 'admin'

  // ── Data ──
  const [allInvoices, setAllInvoices] = useState<MonthlyInvoice[]>([])
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
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [confirmApplyOpen, setConfirmApplyOpen] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<MonthlyInvoice | null>(null)

  // ── Filters ──
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'DRAFT' | 'APPROVED' | 'PAID'>('ALL')
  const [filterSearch, setFilterSearch] = useState('')
  const [filterBillingFrom, setFilterBillingFrom] = useState('')
  const [filterBillingTo, setFilterBillingTo] = useState('')
  const [filterTotalMin, setFilterTotalMin] = useState('')
  const [filterTotalMax, setFilterTotalMax] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const filtersRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!filtersOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (filtersRef.current && !filtersRef.current.contains(e.target as Node)) {
        setFiltersOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [filtersOpen])

  // ── Edit Invoice (staged changes, form for adding a line item) ──
  const [chargeDescription, setChargeDescription] = useState('')
  const [chargeQty, setChargeQty] = useState(1)
  const [chargePrice, setChargePrice] = useState<number | ''>('')
  const [chargeDate, setChargeDate] = useState(new Date().toISOString().split('T')[0])
  // The platform tax rate. Held here so the table can show what ticking the box
  // would add, before it is ticked.
  const [taxRate, setTaxRate] = useState<number>(20)
  const [taxRateDraft, setTaxRateDraft] = useState<string>('')
  const [savingRate, setSavingRate] = useState(false)

  const [clientServices, setClientServices] = useState<any[]>([])
  const [selectedClientServiceId, setSelectedClientServiceId] = useState('')

  // Nothing here reaches the API until "Apply Changes" is confirmed — staged
  // locally so an admin editing an already-approved invoice does not trigger a
  // PDF re-render and a client email for every checkbox click.
  const [pendingRemovedIds, setPendingRemovedIds] = useState<Set<string>>(new Set())
  const [pendingNewItems, setPendingNewItems] = useState<
    Array<{ tempId: string; description: string; quantity: number; unitPrice: number; dateOfService: string }>
  >([])
  const [pendingTaxApplied, setPendingTaxApplied] = useState(false)
  const [applyingChanges, setApplyingChanges] = useState(false)

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


  // ── Load ──
  const loadData = async () => {
    setLoading(true)
    try {
      const [invoicesData, rateData] = await Promise.all([
        invoicesApi.getAllInvoices(),
        invoicesApi.getTaxRate().catch(() => ({ rate: 20 })),
      ])
      setAllInvoices(invoicesData || [])
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
    const q = filterSearch.trim().toLowerCase()
    const billingFrom = filterBillingFrom ? new Date(`${filterBillingFrom}-01`) : null
    const billingTo = filterBillingTo ? new Date(`${filterBillingTo}-01`) : null
    const totalMin = filterTotalMin.trim() === '' ? null : Number(filterTotalMin)
    const totalMax = filterTotalMax.trim() === '' ? null : Number(filterTotalMax)
    return allInvoices.filter((inv) => {
      if (filterStatus !== 'ALL' && inv.status !== filterStatus) return false
      const billingPeriod = new Date(inv.billingPeriod)
      if (billingFrom && billingPeriod < billingFrom) return false
      if (billingTo && billingPeriod > billingTo) return false
      if (totalMin !== null || totalMax !== null) {
        const total = invoicesApi.grandTotal(inv)
        if (totalMin !== null && !Number.isNaN(totalMin) && total < totalMin) return false
        if (totalMax !== null && !Number.isNaN(totalMax) && total > totalMax) return false
      }
      if (!q) return true
      const client = (inv.client?.companyName || '').toLowerCase()
      const contact = (inv.client?.contactName || '').toLowerCase()
      const id = inv.id.toLowerCase()
      return client.includes(q) || contact.includes(q) || id.includes(q)
    })
  }, [allInvoices, filterStatus, filterSearch, filterBillingFrom, filterBillingTo, filterTotalMin, filterTotalMax])

  const activeInvoiceFilterCount = [
    filterStatus !== 'ALL',
    Boolean(filterBillingFrom),
    Boolean(filterBillingTo),
    Boolean(filterTotalMin),
    Boolean(filterTotalMax),
  ].filter(Boolean).length

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
    if (editModalOpen && selectedInvoice?.clientId) {
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
  }, [editModalOpen, selectedInvoice])

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

  /** Opens the edit modal with a clean slate of staged changes, from the invoice as it is now. */
  const handleOpenEdit = () => {
    if (!selectedInvoice) return
    setPendingRemovedIds(new Set())
    setPendingNewItems([])
    setPendingTaxApplied(Boolean(selectedInvoice.taxApplied))
    setChargeDescription('')
    setChargeQty(1)
    setChargePrice('')
    setChargeDate(new Date().toISOString().split('T')[0])
    setSelectedClientServiceId('')
    setEditModalOpen(true)
  }

  /** Stages a new line item locally. Nothing is sent until Apply Changes is confirmed. */
  const handleStageNewItem = () => {
    if (!chargeDescription.trim() || !chargePrice || chargeQty < 1) {
      showToast('Please fill in all charge fields.', 'error')
      return
    }
    setPendingNewItems((prev) => [
      ...prev,
      {
        tempId: `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        description: chargeDescription.trim(),
        quantity: chargeQty,
        unitPrice: Number(chargePrice),
        dateOfService: chargeDate,
      },
    ])
    setChargeDescription('')
    setChargeQty(1)
    setChargePrice('')
    setSelectedClientServiceId('')
  }

  const handleDiscardNewItem = (tempId: string) => {
    setPendingNewItems((prev) => prev.filter((it) => it.tempId !== tempId))
  }

  /** Marks an existing item for removal, or un-marks it — nothing is deleted yet. */
  const handleToggleRemoveItem = (itemId: string) => {
    setPendingRemovedIds((prev) => {
      const next = new Set(prev)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }

  const editOriginalItems = selectedInvoice?.lineItems ?? []
  const editRemainingItems = editOriginalItems.filter((it) => !pendingRemovedIds.has(it.id))
  const editSubtotal =
    editRemainingItems.reduce((sum, it) => sum + Number(it.totalPrice), 0) +
    pendingNewItems.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0)
  const editTaxChanged = pendingTaxApplied !== Boolean(selectedInvoice?.taxApplied)
  // Newly ticked on: preview at the current platform rate, since that is the
  // rate the API will freeze onto the invoice. Left ticked on: keep previewing
  // at whatever rate it was already issued at, since re-applying does not
  // move it — mirrors what setInvoiceTax / applyInvoiceEdits actually do.
  const editEffectiveTaxRate = editTaxChanged ? taxRate : Number(selectedInvoice?.taxRate ?? taxRate)
  const editTaxAmount = pendingTaxApplied
    ? Number(((editSubtotal * editEffectiveTaxRate) / 100).toFixed(2))
    : 0
  const editHasChanges = pendingRemovedIds.size > 0 || pendingNewItems.length > 0 || editTaxChanged

  const handleRequestApply = () => {
    if (!editHasChanges) return
    setConfirmApplyOpen(true)
  }

  /** The single commit point: everything staged above goes to the API in one call. */
  const handleConfirmApply = async () => {
    if (!selectedInvoice) return
    const wasApproved = selectedInvoice.status === 'APPROVED'
    setApplyingChanges(true)
    try {
      // The response already IS the fresh invoice — using it directly means a
      // hiccup in a follow-up call below can never masquerade as this having
      // failed when it did not.
      const updated = await invoicesApi.applyInvoiceEdits(selectedInvoice.id, {
        addLineItems: pendingNewItems.map(({ tempId: _tempId, ...rest }) => rest),
        removeLineItemIds: Array.from(pendingRemovedIds),
        taxApplied: editTaxChanged ? pendingTaxApplied : undefined,
      })

      showToast(
        wasApproved ? 'Invoice updated — the client has been sent a revised invoice.' : 'Invoice updated.',
      )
      setConfirmApplyOpen(false)
      setEditModalOpen(false)
      setPendingRemovedIds(new Set())
      setPendingNewItems([])
      setSelectedInvoice(updated)

      // Best-effort refresh of the table behind the modal. The edit itself
      // already succeeded and is reflected above regardless of this.
      try {
        await loadData()
      } catch (refreshErr) {
        console.error('Failed to refresh invoice list after applying changes:', refreshErr)
      }
    } catch (err: unknown) {
      // Logged as well as shown: the toast is transient, and the raw error is
      // what says whether the request was refused, rejected, or never arrived.
      console.error('Applying invoice changes failed:', err)
      showToast(errorMessage(err, 'Failed to apply changes.'), 'error')
    } finally {
      setApplyingChanges(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-7xl mx-auto relative">

      {/* Toast — portalled to the body because the dashboard layout wraps page
          content in `relative z-10`, which is a stacking context. Rendered in
          place, no z-index could lift this above a Modal (itself portalled to
          the body at z-50), so every error raised from inside a modal was
          painted underneath its backdrop and never seen. */}
      {toast &&
        createPortal(
          <div
            className={`fixed top-4 right-4 z-200 rounded-2xl border p-4 shadow-xl flex items-center gap-3 transition-all duration-300 ${
              toast.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/90 dark:border-emerald-800 dark:text-emerald-100'
                : 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/90 dark:border-rose-800 dark:text-rose-100'
            }`}
          >
            <div className={`w-2 h-2 rounded-full shrink-0 ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            <span className="text-sm font-medium">{toast.message}</span>
            <button type="button" onClick={() => setToast(null)} className="ml-4 text-slate-400 hover:text-slate-600 font-bold text-base">×</button>
          </div>,
          document.body,
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

      {/* Platform tax rate. Changing it affects invoices taxed from now on — an
          invoice already taxed keeps the rate it was issued at, so a rate
          change never restates what a client has already been sent. */}
      {isAdmin && (
        <div className="flex items-end gap-3 flex-wrap rounded-2xl border border-slate-200 dark:border-slate-800 bg-card p-4">
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
            Applied per invoice with the Tax box below, while it is draft or
            approved. Invoices already taxed keep the rate they were issued at.
          </p>
        </div>
      )}

      {/* Invoice Table */}
      <Card className="shadow-md border-slate-200 dark:border-slate-800">
        <CardContent className="p-0">
          {/* Search + Filters toolbar — moved here from above the card, where
              the tax rate panel now sits instead. */}
          <div className="flex flex-wrap gap-3 items-center border-b border-slate-100 dark:border-slate-800 px-6 py-4">
            <Input
              placeholder="Search invoices..."
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              className="max-w-xs"
            />
            {(filterSearch || activeInvoiceFilterCount > 0) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFilterSearch('')
                  setFilterStatus('ALL')
                  setFilterBillingFrom('')
                  setFilterBillingTo('')
                  setFilterTotalMin('')
                  setFilterTotalMax('')
                }}
              >
                Clear All
              </Button>
            )}
            <div ref={filtersRef} className="relative ml-auto">
              <Button
                variant="outline"
                onClick={() => setFiltersOpen((open) => !open)}
                className="gap-2"
              >
                <SlidersHorizontal className="w-4 h-4" />
                Filters
                {activeInvoiceFilterCount > 0 && (
                  <Badge variant="default" className="ml-1 px-1.5 py-0 text-[10px] leading-4">
                    {activeInvoiceFilterCount}
                  </Badge>
                )}
              </Button>

              {filtersOpen && (
                <div className="absolute right-0 z-20 mt-2 w-80 rounded-2xl border border-slate-200 dark:border-slate-800 bg-card p-4 shadow-lg space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                      Status
                    </label>
                    <div className="flex rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden text-sm">
                      {(['ALL', 'DRAFT', 'APPROVED', 'PAID'] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setFilterStatus(s)}
                          className={`flex-1 px-2 py-2 font-medium transition-colors ${
                            filterStatus === s
                              ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                              : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800'
                          }`}
                        >
                          {s === 'ALL' ? 'All' : statusConfig[s].label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                      Billing Period
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-1">From</label>
                        <Input
                          type="month"
                          value={filterBillingFrom}
                          onChange={(e) => setFilterBillingFrom(e.target.value)}
                          className="min-w-0"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-1">To</label>
                        <Input
                          type="month"
                          value={filterBillingTo}
                          onChange={(e) => setFilterBillingTo(e.target.value)}
                          className="min-w-0"
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                      Total Due (£)
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Min"
                        value={filterTotalMin}
                        onChange={(e) => setFilterTotalMin(e.target.value)}
                        className="min-w-0"
                      />
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Max"
                        value={filterTotalMax}
                        onChange={(e) => setFilterTotalMax(e.target.value)}
                        className="min-w-0"
                      />
                    </div>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-slate-100 dark:border-slate-800">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={activeInvoiceFilterCount === 0}
                      onClick={() => {
                        setFilterStatus('ALL')
                        setFilterBillingFrom('')
                        setFilterBillingTo('')
                        setFilterTotalMin('')
                        setFilterTotalMax('')
                      }}
                    >
                      Clear Filters
                    </Button>
                    <Button size="sm" onClick={() => setFiltersOpen(false)}>
                      Done
                    </Button>
                  </div>
                </div>
              )}
            </div>
            {/* <span className="text-xs text-slate-400">{filteredInvoices.length} invoice{filteredInvoices.length !== 1 ? 's' : ''}</span> */}
          </div>

          {loading ? (
            <div className="py-16 text-center text-slate-400">Loading billing records...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-272 text-left text-sm">
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
                        {filterStatus !== 'ALL' || activeInvoiceFilterCount > 0 || filterSearch
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
                            {/* Read-only here — tax is only ever changed from
                                inside Edit Invoice, staged and confirmed. */}
                            {Number(inv.taxAmount ?? 0) > 0 ? (
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
              {isAdmin && selectedInvoice && isContentEditable(selectedInvoice.status) && (
                <Button onClick={handleOpenEdit} variant="secondary">
                  Edit Invoice
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
                <table className="w-full min-w-208 text-left text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 border-b border-slate-100 dark:border-slate-800">
                    <tr>
                      <th className="p-3 font-semibold">Description</th>
                      <th className="p-3 font-semibold">Type</th>
                      <th className="p-3 font-semibold">Date</th>
                      <th className="p-3 text-center font-semibold">Qty</th>
                      <th className="p-3 text-right font-semibold">Unit Price</th>
                      <th className="p-3 text-right font-semibold">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-900">
                    {!selectedInvoice.lineItems || selectedInvoice.lineItems.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-4 text-center text-slate-400 text-sm">
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
                        </tr>
                      ))
                    )}
                  </tbody>
                  {selectedInvoice.lineItems && selectedInvoice.lineItems.length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/60">
                        <td colSpan={5} className="p-3 text-right text-sm font-semibold text-slate-600 dark:text-slate-400">
                          Invoice Total
                        </td>
                        <td className="p-3 text-right font-extrabold text-slate-900 dark:text-slate-100 text-base tabular-nums">
                          {fmt(selectedInvoice.totalAmount)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ── MODAL: Edit Invoice ────────────────────────────────────────────────
          Everything here is staged locally. Nothing reaches the API until
          Apply Changes is confirmed in the modal below. */}
      <Modal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Edit Invoice"
        description={
          selectedInvoice?.status === 'APPROVED'
            ? 'Stage changes below, then Apply Changes to commit them. This invoice is already approved — applying will regenerate its PDF and notify the client.'
            : 'Stage changes below, then Apply Changes to commit them.'
        }
        size="lg"
        contentClassName="space-y-5"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRequestApply} disabled={!editHasChanges}>
              Apply Changes
            </Button>
          </div>
        }
      >
        {selectedInvoice && (
          <div className="space-y-5">
            {/* Tax */}
            <div className="rounded-xl border border-slate-100 dark:border-slate-800 p-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Tax</p>
                <p className="text-xs text-slate-400">
                  {pendingTaxApplied ? `Applied at ${editEffectiveTaxRate}%` : 'Not applied'}
                </p>
              </div>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="check-target"
                  checked={pendingTaxApplied}
                  onChange={(e) => setPendingTaxApplied(e.target.checked)}
                />
                <span className="text-sm text-slate-600 dark:text-slate-400">Apply tax</span>
              </label>
            </div>

            {/* Line Items */}
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-2">Line Items</h3>
              <div className="overflow-x-auto border border-slate-100 dark:border-slate-800 rounded-xl">
                <table className="w-full min-w-208 text-left text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 border-b border-slate-100 dark:border-slate-800">
                    <tr>
                      <th className="p-3 font-semibold">Description</th>
                      <th className="p-3 font-semibold">Type</th>
                      <th className="p-3 font-semibold">Date</th>
                      <th className="p-3 text-center font-semibold">Qty</th>
                      <th className="p-3 text-right font-semibold">Unit Price</th>
                      <th className="p-3 text-right font-semibold">Total</th>
                      <th className="p-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-900">
                    {editOriginalItems.length === 0 && pendingNewItems.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-4 text-center text-slate-400 text-sm">
                          No line items yet.
                        </td>
                      </tr>
                    ) : (
                      <>
                        {editOriginalItems.map((item) => {
                          const removed = pendingRemovedIds.has(item.id)
                          return (
                            <tr key={item.id} className={removed ? 'opacity-40' : undefined}>
                              <td className="p-3 text-slate-700 dark:text-slate-300 max-w-xs">
                                <span className={`line-clamp-2 ${removed ? 'line-through' : ''}`}>
                                  {item.description}
                                </span>
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
                              <td className="p-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleToggleRemoveItem(item.id)}
                                  className={`text-xs font-semibold transition-colors ${
                                    removed
                                      ? 'text-emerald-600 hover:text-emerald-700'
                                      : 'text-rose-400 hover:text-rose-600'
                                  }`}
                                >
                                  {removed ? 'Undo' : 'Remove'}
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                        {pendingNewItems.map((item) => (
                          <tr key={item.tempId} className="bg-emerald-50/50 dark:bg-emerald-950/20">
                            <td className="p-3 text-slate-700 dark:text-slate-300 max-w-xs">
                              <span className="line-clamp-2">{item.description}</span>
                            </td>
                            <td className="p-3">
                              <Badge
                                variant="secondary"
                                className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200"
                              >
                                New
                              </Badge>
                            </td>
                            <td className="p-3 text-xs text-slate-400 font-mono whitespace-nowrap">
                              {fmtShort(item.dateOfService)}
                            </td>
                            <td className="p-3 text-center font-mono">{item.quantity.toLocaleString()}</td>
                            <td className="p-3 text-right font-mono tabular-nums">{fmt(item.unitPrice)}</td>
                            <td className="p-3 text-right font-bold font-mono tabular-nums">
                              {fmt(item.quantity * item.unitPrice)}
                            </td>
                            <td className="p-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleDiscardNewItem(item.tempId)}
                                className="text-rose-400 hover:text-rose-600 text-xs font-semibold transition-colors"
                              >
                                Discard
                              </button>
                            </td>
                          </tr>
                        ))}
                      </>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/60">
                      <td colSpan={6} className="p-3 text-right text-sm font-semibold text-slate-600 dark:text-slate-400">
                        {pendingTaxApplied ? 'Subtotal (staged)' : 'Total (staged)'}
                      </td>
                      <td className="p-3 text-right font-extrabold text-slate-900 dark:text-slate-100 text-base tabular-nums">
                        {fmt(editSubtotal)}
                      </td>
                    </tr>
                    {pendingTaxApplied && (
                      <tr className="bg-slate-50/80 dark:bg-slate-900/60">
                        <td colSpan={6} className="p-3 text-right text-sm font-semibold text-slate-600 dark:text-slate-400">
                          Tax
                        </td>
                        <td className="p-3 text-right font-bold text-slate-700 dark:text-slate-300 tabular-nums">
                          {fmt(editTaxAmount)}
                        </td>
                      </tr>
                    )}
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Add a line item — stages into the table above, does not save yet */}
            <div className="rounded-xl border border-slate-100 dark:border-slate-800 p-4 space-y-3">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Add a Line Item</h3>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Select Provided Service (Optional)
                </label>
                <Select value={selectedClientServiceId} onChange={handleServiceChange}>
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
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Date of Service
                </label>
                <Input type="date" value={chargeDate} onChange={(e) => setChargeDate(e.target.value)} />
              </div>
              <div className="flex items-center justify-between gap-3">
                {chargePrice !== '' && chargeQty > 0 ? (
                  <span className="text-xs text-slate-500">
                    Charge total: <strong className="text-slate-800 dark:text-slate-200">{fmt(Number(chargePrice) * chargeQty)}</strong>
                  </span>
                ) : <span />}
                <Button type="button" variant="secondary" size="sm" onClick={handleStageNewItem}>
                  + Add to Changes
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ── MODAL: Confirm Invoice Changes ────────────────────────────────────── */}
      <Modal
        open={confirmApplyOpen}
        onClose={() => {
          if (!applyingChanges) setConfirmApplyOpen(false)
        }}
        title="Confirm Invoice Changes"
        description="Review what is about to change before it is committed."
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmApplyOpen(false)} disabled={applyingChanges}>
              Go Back
            </Button>
            <Button variant="destructive" onClick={() => void handleConfirmApply()} loading={applyingChanges}>
              {applyingChanges ? 'Applying...' : 'Apply Changes'}
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
          <ul className="list-disc pl-5 space-y-1">
            {pendingNewItems.length > 0 && (
              <li>{pendingNewItems.length} line item{pendingNewItems.length === 1 ? '' : 's'} will be added.</li>
            )}
            {pendingRemovedIds.size > 0 && (
              <li>{pendingRemovedIds.size} line item{pendingRemovedIds.size === 1 ? '' : 's'} will be removed.</li>
            )}
            {editTaxChanged && <li>Tax will be {pendingTaxApplied ? 'applied' : 'removed'}.</li>}
          </ul>
          <p className="font-semibold text-slate-800 dark:text-slate-200">
            New total due: {fmt(editSubtotal + editTaxAmount)}
          </p>
          {selectedInvoice?.status === 'APPROVED' && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-900 p-3 text-amber-800 dark:text-amber-200 text-xs font-medium">
              This invoice has already been approved and may have been sent to the client.
              Applying these changes will regenerate the invoice PDF and email the client
              a notice that their invoice has been revised. This cannot be undone.
            </div>
          )}
        </div>
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
