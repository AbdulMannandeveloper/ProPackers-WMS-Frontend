import { useEffect, useState, useMemo } from 'react'
import { useAuthStore } from '@/stores/auth'
import {
  shipments as shipmentsApi,
  products as productsApi,
  stock as stockApi,
  employees as employeesApi,
  clients as clientsApi,
  clientServices as clientServicesApi,
} from '@/api'
import type { Shipment } from '@/api/shipments'
import type { Product } from '@/api/products'
import type { StockLevel } from '@/api/stock'
import type { Employee, Client } from '@/api/types'
import type { ClientServiceRate } from '@/api/clientServices'
import {
  Button,
  Card,
  CardContent,
  Badge,
  Input,
  Select,
  Modal,
} from '@/components/Shared Components'

export default function ShipmentsPage() {
  const role = useAuthStore((s) => s.role)
  const isAdmin = role === 'admin'
  const isEmployee = role === 'employee'
  const isStaff = isAdmin || isEmployee

  // Data States
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [stockLevels, setStockLevels] = useState<StockLevel[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(false)

  // Custom Toast Notification State
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type })
  }

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000)
      return () => clearTimeout(timer)
    }
  }, [toast])

  // Modal Toggles
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [detailsModalOpen, setDetailsModalOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  // Selected Records
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null)

  // Create Shipment Form State
  const [formClientId, setFormClientId] = useState('')
  const [formEmployeeId, setFormEmployeeId] = useState('')
  const [formShipmentType, setFormShipmentType] = useState('Standard')
  const [formPackagingType, setFormPackagingType] = useState('Box')
  const [formCourierName, setFormCourierName] = useState('DPD')
  const [formItems, setFormItems] = useState<{ productId: string; sourceLocationId: string; quantity: number }[]>([])
  // Billable services. Admin-only: the API refuses them from an employee, matching
  // the admin-only /services endpoints.
  const [clientRates, setClientRates] = useState<ClientServiceRate[]>([])
  const [formServices, setFormServices] = useState<{ serviceId: string; quantity: number }[]>([])
  const [saving, setSaving] = useState(false)

  // Load All Core WMS Components
  const loadData = async () => {
    setLoading(true)
    try {
      const [shipmentsData, prodsData, stockData, empsData, clientsData] = await Promise.all([
        shipmentsApi.getAllShipments(),
        productsApi.getAllProducts(),
        stockApi.getAllStockLevels(),
        employeesApi.getAllEmployees().catch(() => []),
        clientsApi.getAllClients().catch(() => []),
      ])

      setShipments(shipmentsData || [])
      setProducts(prodsData || [])
      setStockLevels(stockData || [])
      setEmployees(empsData || [])
      setClients(clientsData || [])
    } catch (err: any) {
      showToast(err?.response?.data?.error || err?.message || 'Failed to load shipments metadata.', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  // The rates agreed with the selected client. Only these can be billed, so the
  // picker offers exactly what the server will accept.
  useEffect(() => {
    if (!isAdmin || !formClientId) {
      setClientRates([])
      return
    }
    let cancelled = false
    clientServicesApi
      .getClientServicesByClientId(formClientId)
      .then((rows) => { if (!cancelled) setClientRates(rows) })
      .catch(() => { if (!cancelled) setClientRates([]) })
    return () => { cancelled = true }
  }, [formClientId, isAdmin])

  // Changing client invalidates any services already chosen at the old client's rates.
  useEffect(() => {
    setFormServices([])
  }, [formClientId])

  const handleAddServiceRow = () => {
    const unused = clientRates.filter(
      (r) => !formServices.some((s) => s.serviceId === r.serviceId)
    )
    if (unused.length === 0) {
      showToast('No further services are set up for this client.', 'error')
      return
    }
    setFormServices((prev) => [...prev, { serviceId: unused[0].serviceId, quantity: 1 }])
  }

  const handleRemoveServiceRow = (idx: number) => {
    setFormServices((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleServiceRowChange = (idx: number, field: 'serviceId' | 'quantity', value: any) => {
    setFormServices((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row))
    )
  }

  const rateFor = (serviceId: string) =>
    Number(clientRates.find((r) => r.serviceId === serviceId)?.chargedPrice ?? 0)

  // Open Create Modal & Initialize
  const handleOpenCreateModal = () => {
    if (clients.length === 0 || employees.length === 0) {
      showToast('Need registered clients and employees to configure outbounds.', 'error')
      return
    }
    setFormClientId(clients[0]?.id || '')
    setFormEmployeeId(employees[0]?.id || '')
    setFormShipmentType('Standard')
    setFormPackagingType('Box')
    setFormCourierName('DPD')
    setFormItems([])
    setFormServices([])
    setCreateModalOpen(true)
  }

  // Form Item Row Handlers
  const handleAddItemRow = () => {
    const activeProducts = products.filter((p) => !p.isDeactivated)
    if (activeProducts.length === 0) {
      showToast('No active SKUs in the catalog.', 'error')
      return
    }
    const defaultProduct = activeProducts[0]
    // Filter stock locations having this product
    const availableStocks = stockLevels.filter((s) => s.productId === defaultProduct.id && s.currentQuantity > s.reservedQuantity)
    const defaultLocationId = availableStocks[0]?.locationId || ''

    setFormItems((prev) => [
      ...prev,
      {
        productId: defaultProduct.id,
        sourceLocationId: defaultLocationId,
        quantity: 1,
      },
    ])
  }

  const handleRemoveItemRow = (idx: number) => {
    setFormItems((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleItemRowChange = (idx: number, field: string, value: any) => {
    setFormItems((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item
        const updated = { ...item, [field]: value }

        // If product changes, dynamically recalculate default source location with available stock
        if (field === 'productId') {
          const availableStocks = stockLevels.filter((s) => s.productId === value && s.currentQuantity > s.reservedQuantity)
          updated.sourceLocationId = availableStocks[0]?.locationId || ''
          updated.quantity = 1
        }
        return updated
      })
    )
  }

  // Save Shipment
  const handleSaveShipment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (formItems.length === 0) {
      showToast('Please add at least one product item to this shipment.', 'error')
      return
    }

    // Validate quantities and locations
    for (const item of formItems) {
      if (!item.sourceLocationId) {
        showToast('Source location is missing or has no stock for selected item.', 'error')
        return
      }
      const stock = stockLevels.find((s) => s.productId === item.productId && s.locationId === item.sourceLocationId)
      const available = stock ? (stock.currentQuantity - stock.reservedQuantity) : 0
      if (item.quantity > available) {
        const prod = products.find((p) => p.id === item.productId)
        showToast(`Insufficient quantity for ${prod?.skuCode || 'item'}. Available: ${available} units.`, 'error')
        return
      }
    }

    setSaving(true)
    try {
      const payload = {
        clientId: formClientId,
        employeeId: formEmployeeId,
        shipmentType: formShipmentType,
        packagingType: formPackagingType,
        courierName: formCourierName,
        status: 'PENDING',
        shipmentItems: formItems.map((item) => ({
          productId: item.productId,
          sourceLocationId: item.sourceLocationId,
          quantity: item.quantity,
        })),
        ...(formServices.length > 0
          ? {
              shipmentServices: formServices.map((s) => ({
                serviceId: s.serviceId,
                quantity: s.quantity,
              })),
            }
          : {}),
      }

      await shipmentsApi.createShipment(payload)
      showToast('Outbound shipment registered & inventory reserved.')
      setCreateModalOpen(false)
      await loadData()
    } catch (err: any) {
      showToast(err?.response?.data?.error || err?.message || 'Failed to save shipment.', 'error')
    } finally {
      setSaving(false)
    }
  }

  // Open Details Checklist
  const handleOpenDetails = (shipment: Shipment) => {
    setSelectedShipment(shipment)
    setDetailsModalOpen(true)
  }

  // Handle Mark Item as Picked
  const handlePickItem = async (itemId: string) => {
    try {
      await shipmentsApi.pickShipmentItem(itemId)
      showToast('Item checked off as PICKED.')

      // Update local state details to reflect PICKED
      if (selectedShipment) {
        const updatedItems = selectedShipment.shipmentItems?.map((item) =>
          item.id === itemId ? { ...item, status: 'PICKED' as const } : item
        )
        setSelectedShipment({ ...selectedShipment, shipmentItems: updatedItems })
      }
      await loadData()
    } catch (err: any) {
      showToast(err?.response?.data?.error || err?.message || 'Pick action failed.', 'error')
    }
  }

  // Put a mis-picked line back on the shelf
  const handleUnpickItem = async (itemId: string) => {
    try {
      await shipmentsApi.unpickShipmentItem(itemId)
      showToast('Item returned to PENDING.')

      if (selectedShipment) {
        const updatedItems = selectedShipment.shipmentItems?.map((item) =>
          item.id === itemId ? { ...item, status: 'PENDING' as const } : item
        )
        setSelectedShipment({ ...selectedShipment, shipmentItems: updatedItems })
      }
      await loadData()
    } catch (err: any) {
      showToast(err?.response?.data?.error || err?.message || 'Unpick action failed.', 'error')
    }
  }

  // Complete Picking -> Set Ready for Dispatch
  // The server re-checks that every item is picked; this is no longer a status
  // write but a guarded transition.
  const handleMarkReady = async () => {
    if (!selectedShipment) return
    try {
      await shipmentsApi.markShipmentReady(selectedShipment.id)
      showToast('All items packed. Shipment is ready for courier dispatch.')
      setDetailsModalOpen(false)
      await loadData()
    } catch (err: any) {
      showToast(err?.response?.data?.error || err?.message || 'Status update failed.', 'error')
    }
  }

  // Admin only: pull a prematurely-readied shipment back to PENDING
  const handleReopen = async () => {
    if (!selectedShipment) return
    try {
      await shipmentsApi.reopenShipment(selectedShipment.id)
      showToast('Shipment reopened for picking.')
      setDetailsModalOpen(false)
      await loadData()
    } catch (err: any) {
      showToast(err?.response?.data?.error || err?.message || 'Reopen failed.', 'error')
    }
  }

  // Admin only: cancel and hand the reserved stock back
  const handleCancelShipment = async () => {
    if (!selectedShipment) return
    try {
      await shipmentsApi.cancelShipment(selectedShipment.id)
      showToast('Shipment cancelled. Reserved stock released.')
      setDetailsModalOpen(false)
      await loadData()
    } catch (err: any) {
      showToast(err?.response?.data?.error || err?.message || 'Cancel failed.', 'error')
    }
  }

  // Trigger Outbound Courier Dispatch
  const handleDispatch = async () => {
    if (!selectedShipment) return
    try {
      await shipmentsApi.dispatchShipment(selectedShipment.id)
      showToast('Shipment successfully dispatched. Physical inventory deducted.')
      setDetailsModalOpen(false)
      await loadData()
    } catch (err: any) {
      showToast(err?.response?.data?.error || err?.message || 'Dispatch execution failed.', 'error')
    }
  }

  // Delete Shipment
  const handleDeleteShipment = async () => {
    if (!selectedShipment) return
    try {
      await shipmentsApi.deleteShipment(selectedShipment.id)
      showToast('Shipment record cancelled.')
      setDeleteConfirmOpen(false)
      setSelectedShipment(null)
      await loadData()
    } catch (err: any) {
      showToast(err?.response?.data?.error || err?.message || 'Failed to cancel shipment.', 'error')
    }
  }

  // Memoized Stats
  const pendingCount = useMemo(() => shipments.filter((s) => s.status === 'PENDING').length, [shipments])
  const readyCount = useMemo(() => shipments.filter((s) => s.status === 'READY_FOR_DISPATCH').length, [shipments])
  const dispatchedCount = useMemo(() => shipments.filter((s) => s.status === 'DISPATCHED').length, [shipments])
  const cancelledCount = useMemo(() => shipments.filter((s) => s.status === 'CANCELLED').length, [shipments])

  // Helper to map employee name
  const getEmployeeName = (emp?: any | null) => {
    if (!emp || !emp.user) return 'Unassigned'
    return `${emp.user.firstName} ${emp.user.lastName}`
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto relative">
      {/* Toast popup */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-[100] rounded-2xl border p-4 shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300 ${toast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/90 dark:border-emerald-800 dark:text-emerald-100'
              : 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/90 dark:border-rose-800 dark:text-rose-100'
            }`}
        >
          <div className={`w-2 h-2 rounded-full ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
          <span className="text-sm font-medium">{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="ml-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-base font-bold"
          >
            ×
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Shipments & Outbound Orders</h1>
          <p className="text-sm text-slate-500 mt-1">
            Pick stock, pack items into containers, and dispatch outbound orders to couriers.
          </p>
        </div>
        {isStaff && (
          <Button onClick={handleOpenCreateModal}>
            Register Outbound Order
          </Button>
        )}
      </div>

      {/* Stats Section */}
      <div className="flex flex-col sm:flex-row gap-4 w-full">
        {[
          { label: 'Pending Picking', value: pendingCount, color: 'text-amber-700 bg-amber-50 border-amber-100 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-300' },
          { label: 'Ready for Dispatch', value: readyCount, color: 'text-indigo-700 bg-indigo-50 border-indigo-100 dark:bg-indigo-950/30 dark:border-indigo-900 dark:text-indigo-300' },
          { label: 'Completed Dispatches', value: dispatchedCount, color: 'text-teal-700 bg-teal-50 border-teal-100 dark:bg-teal-950/30 dark:border-teal-900 dark:text-teal-300' },
          { label: 'Cancelled', value: cancelledCount, color: 'text-rose-700 bg-rose-50 border-rose-100 dark:bg-rose-950/30 dark:border-rose-900 dark:text-rose-300' },
        ].map(({ label, value, color }) => (
          <div key={label} className={`flex-1 border rounded-2xl p-5 shadow-sm flex flex-col justify-between ${color}`}>
            <div>
              <p className="text-xs uppercase tracking-wider font-semibold opacity-80">{label}</p>
              <p className="text-3xl font-extrabold mt-1">{value}</p>
            </div>
            <Badge variant="secondary" className="w-fit mt-2">Live Status</Badge>
          </div>
        ))}
      </div>

      {/* Main Grid */}
      <Card className="shadow-md border-slate-200 dark:border-slate-800">
        <CardContent className="p-6">
          {loading ? (
            <div className="py-12 text-center text-slate-500">Syncing shipments database...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-500 pb-2">
                    <th className="pb-3 font-semibold">Shipment Ref</th>
                    <th className="pb-3 font-semibold">Client Company</th>
                    <th className="pb-3 font-semibold">Assigned Operator</th>
                    <th className="pb-3 font-semibold">Courier / Container</th>
                    <th className="pb-3 font-semibold text-center">Items Count</th>
                    <th className="pb-3 font-semibold">Created On</th>
                    <th className="pb-3 font-semibold text-center">Status</th>
                    <th className="pb-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-900">
                  {shipments.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        No shipments found. Register a new outbound order to start.
                      </td>
                    </tr>
                  ) : (
                    shipments.map((s) => (
                      <tr key={s.id}>
                        <td className="py-4 font-mono font-bold text-slate-800 dark:text-slate-200">
                          {s.id.slice(0, 8).toUpperCase()}
                        </td>
                        <td className="py-4 font-semibold text-slate-900 dark:text-slate-100">
                          {s.client?.companyName || '—'}
                        </td>
                        <td className="py-4 text-slate-600 dark:text-slate-400">
                          {getEmployeeName(s.employee)}
                        </td>
                        <td className="py-4">
                          <div className="font-medium">{s.courierName}</div>
                          <span className="text-xs text-slate-400 block">Pkg: {s.packagingType}</span>
                        </td>
                        <td className="py-4 text-center font-bold">
                          {s.shipmentItems?.length || 0} items
                        </td>
                        <td className="py-4 text-slate-500 text-xs font-mono">
                          {new Date(s.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-4 text-center">
                          <Badge
                            variant={
                              s.status === 'DISPATCHED'
                                ? 'default'
                                : s.status === 'READY_FOR_DISPATCH'
                                  ? 'default'
                                  : 'secondary'
                            }
                            className={
                              s.status === 'READY_FOR_DISPATCH'
                                ? 'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-200'
                                : s.status === 'PENDING'
                                  ? 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-200'
                                  : ''
                            }
                          >
                            {s.status === 'READY_FOR_DISPATCH' ? 'Ready' : s.status}
                          </Badge>
                        </td>
                        <td className="py-4 text-right">
                          <div className="flex justify-end gap-1.5">
                            <Button size="sm" variant="secondary" onClick={() => handleOpenDetails(s)}>
                              Checklist
                            </Button>
                            {isStaff && s.status === 'PENDING' && (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => {
                                  setSelectedShipment(s)
                                  setDeleteConfirmOpen(true)
                                }}
                              >
                                Cancel
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ────────────────────────────────── MODAL: CREATE OUTBOUND ORDER ────────────────────────────────── */}
      <Modal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Configure Outbound Shipment"
        description="Specify Client, assigned employee, courier details, and add products from locations with active stock."
        size="lg"
        contentClassName="space-y-4"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreateModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="create-shipment-form" disabled={saving}>
              {saving ? 'Creating Order...' : 'Create Shipment'}
            </Button>
          </div>
        }
      >
        <form id="create-shipment-form" onSubmit={handleSaveShipment} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Client Owner *
              </label>
              <Select value={formClientId} onChange={(e) => setFormClientId(e.target.value)} required>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.companyName}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Assign Operator *
              </label>
              <Select value={formEmployeeId} onChange={(e) => setFormEmployeeId(e.target.value)} required>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {getEmployeeName(emp)}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Shipment Type *
              </label>
              <Select value={formShipmentType} onChange={(e) => setFormShipmentType(e.target.value)} required>
                <option value="Standard">Standard Outbound</option>
                <option value="Express">Express Courier</option>
                <option value="Next Day">Next Day Delivery</option>
                <option value="International">International Shipping</option>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Packaging Container *
              </label>
              <Select value={formPackagingType} onChange={(e) => setFormPackagingType(e.target.value)} required>
                <option value="Box">Corrugated Box</option>
                <option value="Pallet">Shrink Pallet</option>
                <option value="Crate">Wooden Crate</option>
                <option value="Envelope">Bubble Envelope</option>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Courier Carrier *
              </label>
              <Select value={formCourierName} onChange={(e) => setFormCourierName(e.target.value)} required>
                <option value="DPD">DPD Next-Day</option>
                <option value="DHL">DHL Express</option>
                <option value="FedEx">FedEx International</option>
                <option value="Royal Mail">Royal Mail Tracked 24</option>
              </Select>
            </div>
          </div>

          <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Shipment Items & Allocations</h3>
              <Button type="button" size="sm" variant="secondary" onClick={handleAddItemRow}>
                + Add Item
              </Button>
            </div>

            {formItems.length === 0 ? (
              <div className="text-center py-6 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-slate-400 text-sm">
                No items added. Click "+ Add Item" to allocate items to pick.
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {formItems.map((item, idx) => {
                  const activeProducts = products.filter((p) => !p.isDeactivated)
                  // Find locations that have stock for this product
                  const productStocks = stockLevels.filter((s) => s.productId === item.productId && s.currentQuantity > s.reservedQuantity)

                  return (
                    <div key={idx} className="flex gap-2 items-end bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800/80">
                      <div className="flex-1">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Product SKU</label>
                        <Select
                          value={item.productId}
                          onChange={(e) => handleItemRowChange(idx, 'productId', e.target.value)}
                        >
                          {activeProducts.map((p) => (
                            <option key={p.id} value={p.id}>
                              [{p.skuCode}] {p.productName}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div className="flex-1">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Pick Location (Available Stock)</label>
                        <Select
                          value={item.sourceLocationId}
                          onChange={(e) => handleItemRowChange(idx, 'sourceLocationId', e.target.value)}
                          required
                        >
                          {productStocks.length === 0 ? (
                            <option value="">No Stock Available</option>
                          ) : (
                            productStocks.map((stock) => (
                              <option key={stock.locationId} value={stock.locationId}>
                                {stock.location?.locationName} (Avail: {stock.currentQuantity - stock.reservedQuantity} units)
                              </option>
                            ))
                          )}
                        </Select>
                      </div>
                      <div className="w-24">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Quantity</label>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => handleItemRowChange(idx, 'quantity', parseInt(e.target.value) || 1)}
                          required
                        />
                      </div>
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={() => handleRemoveItemRow(idx)}
                        className="mb-0.5 px-3"
                      >
                        Delete
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Billable services. Admin-only: the API refuses them from an employee,
              matching the admin-only /services endpoints. Only rates already
              agreed with this client are offered, because those are the only ones
              the server will accept. */}
          {isAdmin && (
            <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  Billable Services
                </h3>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={handleAddServiceRow}
                  disabled={clientRates.length === 0}
                >
                  + Add Service
                </Button>
              </div>

              {clientRates.length === 0 ? (
                <div className="text-center py-4 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-slate-400 text-sm">
                  No agreed rates for this client. Set them up under Clients &rarr; Services first.
                </div>
              ) : formServices.length === 0 ? (
                <div className="text-center py-4 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-slate-400 text-sm">
                  No services added. These are billed to the client on dispatch.
                </div>
              ) : (
                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                  {formServices.map((row, idx) => {
                    const rate = rateFor(row.serviceId)
                    return (
                      <div
                        key={`svc-${idx}`}
                        className="grid grid-cols-12 gap-2 items-end bg-slate-50 dark:bg-slate-900/50 p-2 rounded-xl border border-slate-100 dark:border-slate-800"
                      >
                        <div className="col-span-6">
                          <label className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                            Service
                          </label>
                          <Select
                            value={row.serviceId}
                            onChange={(e) => handleServiceRowChange(idx, 'serviceId', e.target.value)}
                          >
                            {clientRates.map((r) => (
                              <option key={r.id} value={r.serviceId}>
                                {r.service?.description ?? r.serviceId}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <div className="col-span-2">
                          <label className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                            Qty
                          </label>
                          <Input
                            type="number"
                            min={1}
                            value={row.quantity}
                            onChange={(e) =>
                              handleServiceRowChange(idx, 'quantity', Number(e.target.value))
                            }
                          />
                        </div>
                        <div className="col-span-3">
                          <label className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                            Charge
                          </label>
                          <div className="h-9 flex items-center text-sm font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                            &pound;{(rate * (row.quantity || 0)).toFixed(2)}
                          </div>
                        </div>
                        <div className="col-span-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRemoveServiceRow(idx)}
                          >
                            &times;
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </form>
      </Modal>

      {/* ────────────────────────────── MODAL: SHIPMENT CHECKLIST & DISPATCH ────────────────────────────── */}
      <Modal
        open={detailsModalOpen}
        onClose={() => setDetailsModalOpen(false)}
        title={`Outbound Picking Checklist`}
        description="Audit shipment items status, complete warehouse picking, and trigger outbound courier release."
        size="lg"
        contentClassName="space-y-4"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDetailsModalOpen(false)}>
              Close
            </Button>
            {isStaff && selectedShipment?.status === 'PENDING' && (
              <Button
                onClick={handleMarkReady}
                disabled={!(selectedShipment.shipmentItems?.every((i) => i.status === 'PICKED') && selectedShipment.shipmentItems.length > 0)}
              >
                Mark as Ready for Dispatch
              </Button>
            )}
            {isStaff && selectedShipment?.status === 'READY_FOR_DISPATCH' && (
              <Button onClick={handleDispatch}>
                Confirm Outbound Dispatch
              </Button>
            )}
            {/* Correcting or voiding a shipment is an admin decision. */}
            {isAdmin && selectedShipment?.status === 'READY_FOR_DISPATCH' && (
              <Button variant="outline" onClick={handleReopen}>
                Reopen for Picking
              </Button>
            )}
            {isAdmin &&
              (selectedShipment?.status === 'PENDING' ||
                selectedShipment?.status === 'READY_FOR_DISPATCH') && (
                <Button variant="outline" onClick={handleCancelShipment}>
                  Cancel Shipment
                </Button>
              )}
          </div>
        }
      >
        {selectedShipment && (
          <div className="space-y-4">
            {/* Summary Details */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800/80 text-sm">
              <div>
                <span className="text-slate-400 block text-xs uppercase tracking-wider font-semibold">Client Company</span>
                <strong className="text-slate-700 dark:text-slate-200">{selectedShipment.client?.companyName}</strong>
              </div>
              <div>
                <span className="text-slate-400 block text-xs uppercase tracking-wider font-semibold">Assigned Operator</span>
                <strong className="text-slate-700 dark:text-slate-200">{getEmployeeName(selectedShipment.employee)}</strong>
              </div>
              <div>
                <span className="text-slate-400 block text-xs uppercase tracking-wider font-semibold">Courier / Container</span>
                <strong className="text-slate-700 dark:text-slate-200">{selectedShipment.courierName} ({selectedShipment.packagingType})</strong>
              </div>
              <div>
                <span className="text-slate-400 block text-xs uppercase tracking-wider font-semibold">Shipment Status</span>
                <Badge
                  variant={
                    selectedShipment.status === 'DISPATCHED'
                      ? 'default'
                      : selectedShipment.status === 'READY_FOR_DISPATCH'
                        ? 'default'
                        : 'secondary'
                  }
                  className={
                    selectedShipment.status === 'READY_FOR_DISPATCH'
                      ? 'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-200'
                      : selectedShipment.status === 'PENDING'
                        ? 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-200'
                        : ''
                  }
                >
                  {selectedShipment.status === 'READY_FOR_DISPATCH' ? 'READY' : selectedShipment.status}
                </Badge>
              </div>
            </div>

            {/* Checklist Table */}
            <div className="space-y-2">
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Picking Checklist Items</h3>
              <div className="overflow-x-auto border border-slate-100 dark:border-slate-800 rounded-xl">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 font-semibold border-b border-slate-100 dark:border-slate-800">
                    <tr>
                      <th className="p-3">Product SKU</th>
                      <th className="p-3">Pick Location</th>
                      <th className="p-3 text-center">Qty</th>
                      <th className="p-3 text-center">Status</th>
                      {isStaff && selectedShipment.status === 'PENDING' && <th className="p-3 text-right">Action</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-900">
                    {selectedShipment.shipmentItems?.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-4 text-center text-slate-400">No items allocated to this shipment.</td>
                      </tr>
                    ) : (
                      selectedShipment.shipmentItems?.map((item) => (
                        <tr key={item.id}>
                          <td className="p-3 font-mono font-bold text-slate-800 dark:text-slate-200">
                            {item.product?.skuCode}
                            <span className="block font-normal text-xs text-slate-400">{item.product?.productName}</span>
                          </td>
                          <td className="p-3 text-slate-600 dark:text-slate-400">
                            {item.sourceLocation?.locationName}
                            {item.sourceLocation?.materializedPath && (
                              <span className="block text-xs font-mono text-slate-400">{item.sourceLocation.materializedPath}</span>
                            )}
                          </td>
                          <td className="p-3 text-center font-bold">{item.quantity} units</td>
                          <td className="p-3 text-center">
                            <Badge
                              variant={item.status === 'PICKED' ? 'default' : 'secondary'}
                              className={item.status === 'PICKED' ? 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200' : ''}
                            >
                              {item.status}
                            </Badge>
                          </td>
                          {isStaff && selectedShipment.status === 'PENDING' && (
                            <td className="p-3 text-right">
                              {item.status === 'PENDING' ? (
                                <Button size="sm" onClick={() => handlePickItem(item.id)}>
                                  Mark Picked
                                </Button>
                              ) : (
                                // A mis-scan should be correctable without
                                // cancelling the whole shipment.
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleUnpickItem(item.id)}
                                >
                                  Undo Pick
                                </Button>
                              )}
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* List Mapped Shipment Services (Auditing/Billing details) */}
            {selectedShipment.shipmentServices && selectedShipment.shipmentServices.length > 0 && (
              <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3">
                <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Mapped Logistics Services</h3>
                <div className="flex flex-wrap gap-2">
                  {selectedShipment.shipmentServices.map((ss) => (
                    <Badge key={ss.id} variant="secondary">
                      {ss.service?.description} (Qty: {ss.quantity} | £{Number(ss.appliedUnitPrice).toFixed(2)})
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ────────────────────────────── MODAL: CONFIRM SHIPMENT CANCELLATION ────────────────────────────── */}
      <Modal
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title="Cancel Outbound Shipment"
        description="Verify shipment cancellation. Cancelling will release all reserved inventory items."
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteConfirmOpen(false)}>
              Close
            </Button>
            <Button variant="destructive" onClick={handleDeleteShipment}>
              Confirm Cancel
            </Button>
          </div>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Are you sure you want to cancel shipment <strong className="font-mono text-rose-500">{selectedShipment?.id.slice(0, 8).toUpperCase()}</strong>?
        </p>
      </Modal>
    </div>
  )
}
