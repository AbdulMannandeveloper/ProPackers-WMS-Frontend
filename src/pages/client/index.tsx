import { useEffect, useState, useMemo } from 'react'
import { useAuthStore } from '@/stores/auth'
import {
  clients as apiClients,
  services as apiServices,
  products as productsApi,
  stock as stockApi,
  inventory as inventoryApi,
  invoices as invoicesApi,
} from '@/api'
import clientServicesApi from '@/api/clientServices'
import type { MonthlyInvoice, InvoiceLineItem } from '@/api/invoices'
import type { Product } from '@/api/products'
import type { StockLevel } from '@/api/stock'
import type { InventoryLedgerEntry } from '@/api/inventory'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Badge,
  Input,
  Select,
  Modal,
} from '@/components/Shared Components'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

type ClientRecord = {
  id: string
  companyName?: string
  contactName?: string
  email?: string
  mobile?: string
  address?: string
  userId?: string
}

export default function ClientPortalPage() {
  const userId = useAuthStore((s) => s.userId)
  const displayName = useAuthStore((s) => s.displayName) ?? 'Client'

  const [activeTab, setActiveTab] = useState<'overview' | 'inventory' | 'billing' | 'services' | 'profile'>('overview')
  const [loading, setLoading] = useState(false)
  const [myClient, setMyClient] = useState<ClientRecord | null>(null)

  // Services tab
  const [serviceItems, setServiceItems] = useState<{ description: string; chargedPrice: number; unit?: string }[]>([])

  // Inventory tab (US-092, US-093)
  const [products, setProducts] = useState<Product[]>([])
  const [stockLevels, setStockLevels] = useState<StockLevel[]>([])
  const [inventorySearch, setInventorySearch] = useState('')

  // Billing tab (US-094, US-095, US-096)
  const [invoices, setInvoices] = useState<MonthlyInvoice[]>([])
  const [billingStatusFilter, setBillingStatusFilter] = useState('')
  const [billingStartDate, setBillingStartDate] = useState('')
  const [billingEndDate, setBillingEndDate] = useState('')
  const [selectedInvoice, setSelectedInvoice] = useState<MonthlyInvoice | null>(null)
  const [invoiceDetailOpen, setInvoiceDetailOpen] = useState(false)
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([])
  const [lineItemsLoading, setLineItemsLoading] = useState(false)

  // Ledger (US-063)
  const [ledgers, setLedgers] = useState<InventoryLedgerEntry[]>([])

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const showToast = (message: string, type: 'success' | 'error' = 'success') => setToast({ message, type })
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000)
      return () => clearTimeout(timer)
    }
  }, [toast])

  // Load all data
  useEffect(() => {
    const load = async () => {
      if (!userId) return
      setLoading(true)
      try {
        // Find client record for this user
        const all = await apiClients.getAllClients()
        const client = Array.isArray(all) ? (all as ClientRecord[]).find((c) => c.userId === userId) : null
        setMyClient(client || null)

        if (!client) {
          setLoading(false)
          return
        }

        // Load everything in parallel
        const [svcList, clientSvcList, prodsData, stockData, invoiceData, ledgerData] = await Promise.all([
          apiServices.getAllServices().catch(() => []),
          clientServicesApi.getClientServicesByClientId(client.id).catch(() => []),
          productsApi.getAllProducts().catch(() => []),
          stockApi.getAllStockLevels().catch(() => []),
          invoicesApi.getInvoicesByClientId(client.id).catch(() => []),
          inventoryApi.getInventoryLedgerByClientId(client.id).catch(() => []),
        ])

        // Services
        const svcs = Array.isArray(svcList) ? svcList : []
        const cs = Array.isArray(clientSvcList) ? clientSvcList : []
        setServiceItems(
          cs.map((entry: any) => ({
            description: svcs.find((s: any) => s.id === entry.serviceId)?.description ?? entry.serviceId,
            chargedPrice: Number(entry.chargedPrice ?? 0),
            unit: entry.unit || svcs.find((s: any) => s.id === entry.serviceId)?.unit || '',
          }))
        )

        // Products (filtered to this client)
        const allProds = Array.isArray(prodsData) ? prodsData : []
        const myProducts = allProds.filter((p) => p.clientId === client.id)
        setProducts(myProducts)

        // Stock levels for my products
        const allStock = Array.isArray(stockData) ? stockData : []
        const myProductIds = new Set(myProducts.map((p) => p.id))
        setStockLevels(allStock.filter((sl) => myProductIds.has(sl.productId)))

        // Invoices
        setInvoices(Array.isArray(invoiceData) ? invoiceData : [])

        // Ledger
        setLedgers(Array.isArray(ledgerData) ? ledgerData : [])
      } catch (e: any) {
        showToast(e?.response?.data?.error || e?.message || 'Failed to load portal data.', 'error')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [userId])

  // Open invoice detail
  const handleOpenInvoice = async (invoice: MonthlyInvoice) => {
    setSelectedInvoice(invoice)
    setInvoiceDetailOpen(true)
    setLineItemsLoading(true)
    try {
      const items = await invoicesApi.getLineItems(invoice.id)
      setLineItems(Array.isArray(items) ? items : [])
    } catch {
      setLineItems(invoice.lineItems || [])
    } finally {
      setLineItemsLoading(false)
    }
  }

  // US-097: Download invoice PDF
  const handleDownloadInvoicePDF = async (invoice: MonthlyInvoice) => {
    const doc = new jsPDF()

    // Load logo
    try {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      await new Promise<void>((resolve) => {
        img.onload = () => {
          doc.addImage(img, 'PNG', 14, 10, 30, 30)
          resolve()
        }
        img.onerror = () => resolve()
        img.src = '/Logo.png'
      })
    } catch {
      // skip logo
    }

    doc.setFontSize(18)
    doc.setTextColor(15, 23, 42)
    doc.text('ProPackers UK', 50, 22)
    doc.setFontSize(10)
    doc.setTextColor(100, 116, 139)
    doc.text('Warehouse Management Services', 50, 28)

    doc.setFontSize(14)
    doc.setTextColor(15, 23, 42)
    doc.text('INVOICE', 14, 52)

    doc.setFontSize(10)
    doc.setTextColor(71, 85, 105)
    const detailY = 60
    doc.text(`Invoice ID: ${invoice.id.slice(0, 8).toUpperCase()}`, 14, detailY)
    doc.text(`Client: ${invoice.client?.companyName || myClient?.companyName || '—'}`, 14, detailY + 6)
    doc.text(`Billing Period: ${new Date(invoice.billingPeriod).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`, 14, detailY + 12)
    doc.text(`Status: ${invoice.status}`, 14, detailY + 18)
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, detailY + 24)

    // Line items
    let items = invoice.lineItems || []
    if (items.length === 0) {
      try {
        const fetched = await invoicesApi.getLineItems(invoice.id)
        items = Array.isArray(fetched) ? fetched : []
      } catch {
        // use empty
      }
    }

    autoTable(doc, {
      startY: detailY + 32,
      head: [['Description', 'Type', 'Date', 'Qty', 'Unit Price (£)', 'Total (£)']],
      body: items.map((li) => [
        li.description,
        li.itemType === 'AUTOMATED_SERVICE' ? 'Auto' : 'Manual',
        li.dateOfService ? new Date(li.dateOfService).toLocaleDateString() : '—',
        String(li.quantity),
        Number(li.unitPrice).toFixed(2),
        Number(li.totalPrice).toFixed(2),
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [15, 118, 110] },
    })

    const finalY = (doc as any).lastAutoTable?.finalY || 120
    doc.setFontSize(12)
    doc.setTextColor(15, 23, 42)
    doc.text(`Total Amount: £${Number(invoice.totalAmount).toFixed(2)}`, 14, finalY + 10)

    doc.setFontSize(8)
    doc.setTextColor(148, 163, 184)
    doc.text('ProPackers UK — Warehouse Management Services | This is a system-generated invoice.', 14, 285)

    doc.save(`ProPackers_Invoice_${invoice.id.slice(0, 8).toUpperCase()}_${new Date(invoice.billingPeriod).toISOString().slice(0, 7)}.pdf`)
    showToast('Invoice PDF downloaded.')
  }

  // Memoized KPIs
  const totalSKUs = products.length
  const totalUnits = useMemo(() => stockLevels.reduce((sum, sl) => sum + sl.currentQuantity, 0), [stockLevels])
  const activeServicesCount = serviceItems.length

  // Filtered products (US-093)
  const filteredProducts = useMemo(() => {
    if (!inventorySearch) return products
    const q = inventorySearch.toLowerCase()
    return products.filter(
      (p) =>
        p.skuCode.toLowerCase().includes(q) ||
        p.productName.toLowerCase().includes(q)
    )
  }, [products, inventorySearch])

  // Filtered invoices (US-096)
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      if (billingStatusFilter && inv.status !== billingStatusFilter) return false
      if (billingStartDate) {
        const invDate = new Date(inv.billingPeriod)
        if (invDate < new Date(billingStartDate)) return false
      }
      if (billingEndDate) {
        const invDate = new Date(inv.billingPeriod)
        if (invDate > new Date(billingEndDate)) return false
      }
      return true
    })
  }, [invoices, billingStatusFilter, billingStartDate, billingEndDate])

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'inventory', label: 'My Inventory' },
    { id: 'billing', label: 'Billing & Invoices' },
    { id: 'services', label: 'Services' },
    { id: 'profile', label: 'Profile' },
  ] as const

  return (
    <div className="space-y-6 max-w-7xl mx-auto relative">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-[100] rounded-2xl border p-4 shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300 ${
            toast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className={`w-2 h-2 rounded-full ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
          <span className="text-sm font-medium">{toast.message}</span>
          <button type="button" onClick={() => setToast(null)} className="ml-4 text-slate-400 hover:text-slate-600 text-base">×</button>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Client Portal</h1>
        <p className="text-sm text-slate-500 mt-1">
          Welcome, {displayName}. View your inventory, services, and billing information.
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-800 flex gap-6 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`pb-3 text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
              activeTab === t.id
                ? 'border-cyan-500 text-cyan-600 dark:text-cyan-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-12 text-center text-slate-500">Loading portal data...</div>
      ) : !myClient ? (
        <div className="py-12 text-center text-slate-400">No client account found. Please contact the administrator.</div>
      ) : (
        <>
          {/* ──────────────────── OVERVIEW TAB (US-092) ──────────────────── */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* KPI Cards */}
              <div className="flex flex-col sm:flex-row gap-4 w-full">
                {[
                  { label: 'Total SKUs', value: totalSKUs, color: 'text-indigo-700 bg-indigo-50 border-indigo-100' },
                  { label: 'Total Units in Stock', value: totalUnits, color: 'text-teal-700 bg-teal-50 border-teal-100' },
                  { label: 'Active Services', value: activeServicesCount, color: 'text-violet-700 bg-violet-50 border-violet-100' },
                ].map(({ label, value, color }) => (
                  <div key={label} className={`flex-1 border rounded-2xl p-5 shadow-sm ${color}`}>
                    <p className="text-xs uppercase tracking-wider font-semibold opacity-80">{label}</p>
                    <p className="text-3xl font-extrabold mt-1">{value}</p>
                  </div>
                ))}
              </div>

              {/* Top Products */}
              <Card className="shadow-md border-slate-200">
                <CardHeader>
                  <CardTitle>Top Products by Stock</CardTitle>
                  <CardDescription>Your highest-quantity products currently in the warehouse.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 text-slate-500">
                          <th className="pb-3 font-semibold">SKU</th>
                          <th className="pb-3 font-semibold">Product</th>
                          <th className="pb-3 font-semibold text-right">Total Stock</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {products
                          .map((p) => ({
                            ...p,
                            totalStock: stockLevels
                              .filter((sl) => sl.productId === p.id)
                              .reduce((sum, sl) => sum + sl.currentQuantity, 0),
                          }))
                          .sort((a, b) => b.totalStock - a.totalStock)
                          .slice(0, 5)
                          .map((p) => (
                            <tr key={p.id}>
                              <td className="py-3 font-mono font-bold text-slate-800">{p.skuCode}</td>
                              <td className="py-3">{p.productName}</td>
                              <td className="py-3 text-right font-bold text-teal-600">{p.totalStock} units</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ──────────────────── INVENTORY TAB (US-092, US-093) ──────────────────── */}
          {activeTab === 'inventory' && (
            <div className="space-y-4">
              <div className="flex gap-4">
                <Input
                  placeholder="Search by SKU or product name..."
                  value={inventorySearch}
                  onChange={(e) => setInventorySearch(e.target.value)}
                  className="max-w-sm"
                />
              </div>
              <Card className="shadow-md border-slate-200">
                <CardContent className="p-6">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 text-slate-500">
                          <th className="pb-3 font-semibold">SKU Code</th>
                          <th className="pb-3 font-semibold">Product Name</th>
                          <th className="pb-3 font-semibold">Location</th>
                          <th className="pb-3 font-semibold text-center">Quantity</th>
                          <th className="pb-3 font-semibold text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {filteredProducts.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-slate-400">No products found.</td>
                          </tr>
                        ) : (
                          filteredProducts.map((p) => {
                            const prodStocks = stockLevels.filter((sl) => sl.productId === p.id)
                            const totalQty = prodStocks.reduce((sum, sl) => sum + sl.currentQuantity, 0)
                            const isLow = totalQty < p.thresholdLimit && !p.isDeactivated
                            return (
                              <tr key={p.id} className={p.isDeactivated ? 'opacity-50' : ''}>
                                <td className="py-3 font-mono font-bold text-slate-800">{p.skuCode}</td>
                                <td className="py-3">
                                  <div className="font-medium">{p.productName}</div>
                                  {p.barcode && <span className="text-xs text-slate-400 font-mono">Barcode: {p.barcode}</span>}
                                </td>
                                <td className="py-3 text-slate-600">
                                  {prodStocks.length > 0
                                    ? prodStocks.map((sl) => sl.location?.locationName || '—').join(', ')
                                    : 'No allocation'}
                                </td>
                                <td className="py-3 text-center">
                                  <span className="font-bold">{totalQty}</span>
                                  {isLow && (
                                    <span className="ml-2 inline-flex items-center gap-1 text-xs text-rose-600">
                                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                                      Low
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 text-center">
                                  <Badge variant={p.isDeactivated ? 'secondary' : 'default'}>
                                    {p.isDeactivated ? 'Inactive' : 'Active'}
                                  </Badge>
                                </td>
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ──────────────────── BILLING TAB (US-094, US-095, US-096, US-097) ──────────────────── */}
          {activeTab === 'billing' && (
            <div className="space-y-4">
              {/* Filters (US-096) */}
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                <Select
                  value={billingStatusFilter}
                  onChange={(e) => setBillingStatusFilter(e.target.value)}
                  className="max-w-xs"
                >
                  <option value="">All Statuses</option>
                  <option value="DRAFT">Draft</option>
                  <option value="APPROVED">Approved</option>
                  <option value="PAID">Paid</option>
                </Select>
                <Input
                  type="date"
                  value={billingStartDate}
                  onChange={(e) => setBillingStartDate(e.target.value)}
                  className="max-w-xs"
                />
                <Input
                  type="date"
                  value={billingEndDate}
                  onChange={(e) => setBillingEndDate(e.target.value)}
                  className="max-w-xs"
                />
              </div>

              <Card className="shadow-md border-slate-200">
                <CardContent className="p-6">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 text-slate-500">
                          <th className="pb-3 font-semibold">Invoice ID</th>
                          <th className="pb-3 font-semibold">Billing Period</th>
                          <th className="pb-3 font-semibold">Status</th>
                          <th className="pb-3 font-semibold text-right">Amount (£)</th>
                          <th className="pb-3 font-semibold text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {filteredInvoices.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-slate-400">No invoices found.</td>
                          </tr>
                        ) : (
                          filteredInvoices.map((inv) => (
                            <tr key={inv.id}>
                              <td className="py-3 font-mono font-bold text-slate-800">{inv.id.slice(0, 8).toUpperCase()}</td>
                              <td className="py-3">
                                {new Date(inv.billingPeriod).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
                              </td>
                              <td className="py-3">
                                <Badge
                                  variant={inv.status === 'PAID' ? 'default' : inv.status === 'APPROVED' ? 'default' : 'secondary'}
                                  className={
                                    inv.status === 'APPROVED' ? 'bg-indigo-100 text-indigo-800 border-indigo-200' :
                                    inv.status === 'PAID' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : ''
                                  }
                                >
                                  {inv.status}
                                </Badge>
                              </td>
                              <td className="py-3 text-right font-bold">£{Number(inv.totalAmount).toFixed(2)}</td>
                              <td className="py-3 text-right">
                                <div className="flex justify-end gap-2">
                                  <Button size="sm" variant="secondary" onClick={() => handleOpenInvoice(inv)}>
                                    View
                                  </Button>
                                  <Button size="sm" onClick={() => handleDownloadInvoicePDF(inv)}>
                                    Download PDF
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ──────────────────── SERVICES TAB ──────────────────── */}
          {activeTab === 'services' && (
            <Card className="shadow-md border-slate-200">
              <CardHeader>
                <CardTitle>Assigned Services</CardTitle>
                <CardDescription>Services assigned to your account with negotiated pricing.</CardDescription>
              </CardHeader>
              <CardContent>
                {serviceItems.length === 0 ? (
                  <div className="py-8 text-center text-slate-400">No services assigned yet.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 text-slate-500">
                          <th className="pb-3 font-semibold">Service</th>
                          <th className="pb-3 font-semibold">Unit</th>
                          <th className="pb-3 font-semibold text-right">Price (£)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {serviceItems.map((it, idx) => (
                          <tr key={idx}>
                            <td className="py-3 font-medium">{it.description}</td>
                            <td className="py-3 text-slate-500">{it.unit || '—'}</td>
                            <td className="py-3 text-right font-bold">£{it.chargedPrice.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ──────────────────── PROFILE TAB (US-023) ──────────────────── */}
          {activeTab === 'profile' && (
            <Card className="shadow-md border-slate-200">
              <CardHeader>
                <CardTitle>Business Profile</CardTitle>
                <CardDescription>Your registered business details. Contact the administrator to make changes.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {[
                    { label: 'Company Name', value: myClient.companyName },
                    { label: 'Contact Name', value: myClient.contactName },
                    { label: 'Email Address', value: myClient.email },
                    { label: 'Phone Number', value: myClient.mobile },
                    { label: 'Business Address', value: myClient.address },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-1">{label}</span>
                      <p className="text-slate-800 dark:text-slate-200 font-medium">{value || '—'}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ────────────────────── MODAL: INVOICE DETAIL (US-095) ────────────────────── */}
      <Modal
        open={invoiceDetailOpen}
        onClose={() => setInvoiceDetailOpen(false)}
        title="Invoice Details"
        description={`Billing period: ${selectedInvoice ? new Date(selectedInvoice.billingPeriod).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : ''}`}
        size="xl"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setInvoiceDetailOpen(false)}>Close</Button>
            {selectedInvoice && (
              <Button onClick={() => handleDownloadInvoicePDF(selectedInvoice)}>Download PDF</Button>
            )}
          </div>
        }
      >
        {selectedInvoice && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-100 text-sm">
              <div>
                <span className="text-slate-400 block text-xs uppercase tracking-wider font-semibold">Invoice ID</span>
                <strong className="font-mono">{selectedInvoice.id.slice(0, 8).toUpperCase()}</strong>
              </div>
              <div>
                <span className="text-slate-400 block text-xs uppercase tracking-wider font-semibold">Status</span>
                <Badge
                  variant={selectedInvoice.status === 'PAID' ? 'default' : 'secondary'}
                  className={selectedInvoice.status === 'APPROVED' ? 'bg-indigo-100 text-indigo-800' : selectedInvoice.status === 'PAID' ? 'bg-emerald-100 text-emerald-800' : ''}
                >
                  {selectedInvoice.status}
                </Badge>
              </div>
              <div>
                <span className="text-slate-400 block text-xs uppercase tracking-wider font-semibold">Total Amount</span>
                <strong className="text-lg">£{Number(selectedInvoice.totalAmount).toFixed(2)}</strong>
              </div>
              <div>
                <span className="text-slate-400 block text-xs uppercase tracking-wider font-semibold">Created</span>
                <strong>{new Date(selectedInvoice.createdAt).toLocaleDateString()}</strong>
              </div>
            </div>

            {lineItemsLoading ? (
              <div className="py-4 text-center text-slate-500">Loading line items...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-500">
                      <th className="pb-3 font-semibold">Description</th>
                      <th className="pb-3 font-semibold">Type</th>
                      <th className="pb-3 font-semibold">Date</th>
                      <th className="pb-3 font-semibold text-center">Qty</th>
                      <th className="pb-3 font-semibold text-right">Unit Price (£)</th>
                      <th className="pb-3 font-semibold text-right">Total (£)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {lineItems.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-4 text-center text-slate-400">No line items.</td>
                      </tr>
                    ) : (
                      lineItems.map((li) => (
                        <tr key={li.id}>
                          <td className="py-3 font-medium">{li.description}</td>
                          <td className="py-3">
                            <Badge variant={li.itemType === 'AUTOMATED_SERVICE' ? 'default' : 'secondary'}>
                              {li.itemType === 'AUTOMATED_SERVICE' ? 'Auto' : 'Manual'}
                            </Badge>
                          </td>
                          <td className="py-3 text-slate-500">
                            {li.dateOfService ? new Date(li.dateOfService).toLocaleDateString() : '—'}
                          </td>
                          <td className="py-3 text-center">{li.quantity}</td>
                          <td className="py-3 text-right">£{Number(li.unitPrice).toFixed(2)}</td>
                          <td className="py-3 text-right font-bold">£{Number(li.totalPrice).toFixed(2)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
