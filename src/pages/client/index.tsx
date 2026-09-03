import { useEffect, useState, useMemo } from 'react'
import { useLocation } from 'react-router'
import { TrackingChip } from '@/components/TrackingChip'
import { useAuthStore } from '@/stores/auth'
import {
  clients as apiClients,
  products as productsApi,
  stock as stockApi,
  inventory as inventoryApi,
  invoices as invoicesApi,
  shipments as shipmentsApi,
} from '@/api'
import clientServicesApi from '@/api/clientServices'
import type { MonthlyInvoice, InvoiceLineItem } from '@/api/invoices'
import type { Shipment } from '@/api/shipments'
import type { Product } from '@/api/products'
import type { StockLevel } from '@/api/stock'
import type { InventoryLedgerEntry } from '@/api/inventory'
import type { Client } from '@/api/types'
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

type Section =
  | 'overview'
  | 'inventory'
  | 'shipments'
  | 'billing'
  | 'services'
  | 'profile'

/** Which portal section each address shows. Mirrors src/routes/client.ts. */
const SECTION_BY_PATH: Record<string, Section> = {
  '/client': 'overview',
  '/client/inventory': 'inventory',
  '/client/shipments': 'shipments',
  '/client/billing': 'billing',
  '/client/services': 'services',
  '/client/profile': 'profile',
}

const SECTION_TITLES: Record<Section, string> = {
  overview: 'Client Portal',
  inventory: 'My Inventory',
  shipments: 'Shipments',
  billing: 'Billing & Invoices',
  services: 'Services',
  profile: 'Profile',
}

const SECTION_BLURBS: Record<Section, string> = {
  overview: 'View your inventory, services, and billing information.',
  inventory: 'Stock we are holding for you right now.',
  shipments: 'Orders we have packed and sent for you.',
  billing: 'Your statements, invoices and payment history.',
  services: 'The services you are signed up for.',
  profile: 'Your account and contact details.',
}

/** '/client/' and '/client' are the same page. */
const stripTrailingSlash = (path: string) =>
  path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path

export default function ClientPortalPage() {
  const userId = useAuthStore((s) => s.userId)
  const displayName = useAuthStore((s) => s.displayName) ?? 'Client'

  // The section comes from the URL, not from local state: the sidebar drives it
  // like every other part of the app, so back/forward works and a client can
  // bookmark their invoices.
  const { pathname } = useLocation()
  const activeTab = SECTION_BY_PATH[stripTrailingSlash(pathname)] ?? 'overview'
  const [loading, setLoading] = useState(false)
  const [myClient, setMyClient] = useState<Client | null>(null)

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

  // Shipments — read-only. The one thing a client actually rings about.
  const [shipments, setShipments] = useState<Shipment[]>([])

  // Ledger (US-063)
  const [, setLedgers] = useState<InventoryLedgerEntry[]>([])

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
        // The server resolves the client record from the session, so a client can
        // only ever load its own account.
        const client = await apiClients.getMyClient().catch(() => null)
        setMyClient(client || null)

        if (!client) {
          setLoading(false)
          return
        }

        // Load everything in parallel. Products and stock come back already
        // narrowed to this client by the API.
        const [clientSvcList, prodsData, stockData, invoiceData, ledgerData, shipmentData] =
          await Promise.all([
            clientServicesApi.getClientServicesByClientId(client.id).catch(() => []),
            productsApi.getAllProducts().catch(() => []),
            stockApi.getAllStockLevels().catch(() => []),
            invoicesApi.getInvoicesByClientId(client.id).catch(() => []),
            inventoryApi.getInventoryLedgerByClientId(client.id).catch(() => []),
            shipmentsApi.getShipmentsByClientId(client.id).catch(() => []),
          ])

        setShipments(Array.isArray(shipmentData) ? shipmentData : [])

        // Services (description/unit arrive on the included service relation)
        const cs = Array.isArray(clientSvcList) ? clientSvcList : []
        setServiceItems(
          cs.map((entry: any) => ({
            description: entry.service?.description ?? entry.serviceId,
            chargedPrice: Number(entry.chargedPrice ?? 0),
            unit: entry.unit || entry.service?.unit || '',
          }))
        )

        // Products
        const myProducts = Array.isArray(prodsData) ? prodsData : []
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
  // US-097: Download invoice PDF.
  //
  // The document is rendered and stored server-side when the invoice is
  // approved, so what downloads here is the invoice as it was issued. This used
  // to be rebuilt in the browser on every view, which meant a change to any
  // figure silently redrew the "old" invoice with the new one.
  const handleDownloadInvoicePDF = async (invoice: MonthlyInvoice) => {
    try {
      const blob = await invoicesApi.downloadInvoicePdf(invoice.id)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `ProPackers_Invoice_${invoice.id.slice(0, 8).toUpperCase()}_${new Date(
        invoice.billingPeriod
      )
        .toISOString()
        .slice(0, 7)}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      showToast('Invoice PDF downloaded.')
    } catch (err: any) {
      showToast(
        err?.response?.data?.error || err?.message || 'Could not download the invoice PDF.',
        'error'
      )
    }
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
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          {SECTION_TITLES[activeTab]}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Welcome, {displayName}. {SECTION_BLURBS[activeTab]}
        </p>
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
              loading={loading}
                  value={inventorySearch}
                  onChange={(e) => setInventorySearch(e.target.value)}
                  className="max-w-sm"
                />
              </div>
              <Card className="shadow-md border-slate-200">
                <CardContent className="p-6">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[38rem] text-left text-sm">
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
          {/* ──────────────────── SHIPMENTS ──────────────────── */}
          {activeTab === 'shipments' && (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[45rem] text-left text-sm">
                    <thead className="border-b border-slate-100 text-slate-500">
                      <tr>
                        <th className="p-4 font-semibold">Order</th>
                        <th className="p-4 font-semibold">Courier</th>
                        <th className="p-4 font-semibold text-center">Items</th>
                        <th className="p-4 font-semibold">Tracking</th>
                        <th className="p-4 font-semibold">Raised</th>
                        <th className="p-4 font-semibold text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {shipments.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-10 text-center text-slate-400">
                            No shipments yet.
                          </td>
                        </tr>
                      ) : (
                        shipments.map((sh) => (
                          <tr key={sh.id}>
                            <td className="p-4 font-mono font-semibold text-slate-800">
                              {sh.id.slice(0, 8).toUpperCase()}
                            </td>
                            <td className="p-4">
                              <div>{sh.courierName}</div>
                              <span className="block text-xs text-slate-400">
                                {sh.packagingType}
                              </span>
                            </td>
                            {/* Item count only. Which bin they came out of is our
                                warehouse layout, not the client's business. */}
                            <td className="p-4 text-center font-bold">
                              {sh.shipmentItems?.length ?? 0}
                            </td>
                            <td className="p-4">
                              {sh.trackingId ? (
                                <TrackingChip
                                  trackingId={sh.trackingId}
                                  courierName={sh.courierName}
                                  onNotify={showToast}
                                />
                              ) : (
                                <span className="text-xs text-slate-400">
                                  {sh.status === 'DISPATCHED' ? 'Not provided' : 'Once dispatched'}
                                </span>
                              )}
                            </td>
                            <td className="p-4 text-xs font-mono text-slate-500">
                              {new Date(sh.createdAt).toLocaleDateString()}
                            </td>
                            <td className="p-4 text-center">
                              <Badge
                                variant="secondary"
                                className={
                                  sh.status === 'DISPATCHED'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : sh.status === 'CANCELLED'
                                      ? 'bg-slate-100 text-slate-600'
                                      : sh.status === 'READY_FOR_DISPATCH'
                                        ? 'bg-indigo-100 text-indigo-800'
                                        : 'bg-amber-100 text-amber-800'
                                }
                              >
                                {sh.status === 'READY_FOR_DISPATCH' ? 'READY' : sh.status}
                              </Badge>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

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
                    <table className="w-full min-w-[38rem] text-left text-sm">
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
                              {/* totalAmount is ex-tax throughout the system, so
                                  showing it alone would understate what is owed. */}
                              <td className="py-3 text-right font-bold">
                                £{invoicesApi.grandTotal(inv).toFixed(2)}
                                {Number(inv.taxAmount ?? 0) > 0 && (
                                  <span className="block text-[11px] font-normal text-slate-400">
                                    incl. £{Number(inv.taxAmount).toFixed(2)} tax
                                  </span>
                                )}
                              </td>
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
                <span className="text-slate-400 block text-xs uppercase tracking-wider font-semibold">
                  {Number(selectedInvoice.taxAmount ?? 0) > 0 ? 'Total Due' : 'Total Amount'}
                </span>
                <strong className="text-lg">
                  £{invoicesApi.grandTotal(selectedInvoice).toFixed(2)}
                </strong>
                {Number(selectedInvoice.taxAmount ?? 0) > 0 && (
                  <span className="block text-[11px] text-slate-400">
                    £{Number(selectedInvoice.totalAmount).toFixed(2)} + £
                    {Number(selectedInvoice.taxAmount).toFixed(2)} tax
                    {selectedInvoice.taxRate != null &&
                      ` (${Number(selectedInvoice.taxRate)}%)`}
                  </span>
                )}
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
                <table className="w-full min-w-[45rem] text-left text-sm">
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
