import { useEffect, useState, useMemo } from 'react'
import { useAuthStore } from '@/stores/auth'
import {
  shipments as shipmentsApi,
  employees as employeesApi,
  clients as clientsApi,
  clientServices as clientServicesApi,
} from '@/api'
import type { Shipment } from '@/api/shipments'

type EmployeeOption = {
  id: string
  firstName: string | null
  lastName: string | null
}

type ClientOption = {
  id: string
  companyName: string
}
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
import { TrackingChip } from '@/components/TrackingChip'
import { ProductPicker } from '@/features/shipments/ProductPicker'
import {
  basketUnitCount,
  estimateDispatchCharge,
  foreignLines,
  mergeLines,
  toShipmentItems,
  type PickLine,
} from '@/features/shipments/picking'
import { COURIERS, validateTrackingId, normaliseTrackingId } from '@/lib/couriers'

export default function ShipmentsPage() {
  const role = useAuthStore((s) => s.role)
  const isAdmin = role === 'admin'
  const isEmployee = role === 'employee'
  const isStaff = isAdmin || isEmployee

  // Data States
  const [shipments, setShipments] = useState<Shipment[]>([])
  // The lookup shape, not the full Employee: /api/employees/lookup returns id
  // and name only, deliberately, so a dropdown does not carry NI numbers and
  // salaries into the browser.
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  // The lookup shape, not the full Client: /api/clients/lookup is what staff
  // are allowed to read, and id + companyName is all this page renders.
  const [clients, setClients] = useState<ClientOption[]>([])
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

  // Tracking number editor, inside the details drawer.
  // Returning a dispatched line. Held per item id so two rows cannot share a
  // draft quantity.
  const [returnDrafts, setReturnDrafts] = useState<Record<string, string>>({})
  const [returning, setReturning] = useState<string | null>(null)

  const [trackingDraft, setTrackingDraft] = useState('')
  const [savingTracking, setSavingTracking] = useState(false)

  // Create Shipment Form State
  const [formClientId, setFormClientId] = useState('')
  const [formEmployeeId, setFormEmployeeId] = useState('')
  const [formShipmentType, setFormShipmentType] = useState('Standard')
  const [formPackagingType, setFormPackagingType] = useState('Box')
  const [formCourierName, setFormCourierName] = useState('DPD')
  // Basket lines, one per (product, bin). A product drawn from three bins is
  // three lines, which is exactly what ShipmentItem models server-side.
  const [formItems, setFormItems] = useState<PickLine[]>([])
  // Billable services. Admin-only: the API refuses them from an employee, matching
  // the admin-only /services endpoints.
  const [clientRates, setClientRates] = useState<ClientServiceRate[]>([])
  const [formServices, setFormServices] = useState<{ serviceId: string; quantity: number }[]>([])
  const [saving, setSaving] = useState(false)

  // Load All Core WMS Components
  const loadData = async () => {
    setLoading(true)
    // Records which optional list failed, so the reason reaches the user
    // instead of becoming an empty dropdown.
    const loadFailures: string[] = []
    const track = (label: string) => (err: unknown): never[] => {
      console.error(`Failed to load ${label}:`, err)
      loadFailures.push(label)
      return []
    }
    try {
      // No product or stock preload: ProductPicker resolves a scanned or typed
      // code through the barcode lookup and reads that product's bins from the
      // response, so pulling the whole catalogue and every stock row on page
      // load was work nobody used.
      const [shipmentsData, empsData, clientsData] = await Promise.all([
        shipmentsApi.getAllShipments(),
        // Lookups, not the full lists. getAllEmployees and getAllClients are
        // both admin-only, so an employee raising a shipment got a 403 that the
        // .catch() swallowed — leaving the dropdowns empty and the create dialog
        // refusing to open with "Need registered clients and employees", which
        // is a nonsense message when both plainly exist.
        //
        // Failures are recorded rather than silently flattened to []: that habit
        // is what turned one 403 into two separate bug reports.
        employeesApi.getEmployeeLookup().catch(track('operators')),
        clientsApi.getClientLookup().catch(track('clients')),
      ])

      if (loadFailures.length > 0) {
        showToast(
          `Could not load ${loadFailures.join(' or ')}. Some options will be missing.`,
          'error'
        )
      }

      setShipments(shipmentsData || [])
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
  /** Adds picked lines, merging a repeat of the same product and bin. */
  const handleAddPicked = (lines: PickLine[]) => {
    setFormItems((prev) => mergeLines(prev, lines))
  }

  const handleRemoveItemRow = (idx: number) => {
    setFormItems((prev) => prev.filter((_, i) => i !== idx))
  }

  /**
   * The client's agreed per-item dispatch rate, or null if they have none.
   *
   * Read from the rate card, matching what the server charges. Only admins can
   * read /api/client-services, so for an employee this is null and no estimate
   * is shown — which is honest: an employee genuinely does not know the rate.
   */
  const dispatchRate = (() => {
    const row = clientRates.find((r) => r.service?.code === 'SHIPMENT_DISPATCH')
    return row ? Number(row.chargedPrice) : null
  })()

  // Save Shipment
  const handleSaveShipment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (formItems.length === 0) {
      showToast('Please add at least one product item to this shipment.', 'error')
      return
    }

    // The picker already refuses over-picking a bin and a foreign product, but
    // the client can be changed after items are added — so re-check here rather
    // than trusting a basket assembled under a different client.
    const foreign = foreignLines(formItems, formClientId)
    if (foreign.length > 0) {
      showToast(
        `${foreign[0].productName} belongs to another client. Remove it or change the client.`,
        'error'
      )
      return
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
        shipmentItems: toShipmentItems(formItems),
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
    setTrackingDraft(shipment.trackingId || '')
    setDetailsModalOpen(true)
  }

  /**
   * Staff, and deliberately still available once DISPATCHED — that is normally
   * when the courier hands over the number. Only CANCELLED is refused, and the
   * server is the authority on that; this just avoids offering a control that
   * would 400.
   */
  /**
   * Sends part of a dispatched line back to the bin it came from.
   *
   * The invoice is untouched by design — the server does not change it and
   * neither does this. Worth saying on the screen too, so nobody expects a
   * credit to appear.
   */
  const handleReturnItem = async (itemId: string, outstanding: number) => {
    const raw = returnDrafts[itemId] ?? ''
    const quantity = Number(raw)

    if (!Number.isInteger(quantity) || quantity <= 0) {
      showToast('Enter a whole number above zero to return.', 'error')
      return
    }
    if (quantity > outstanding) {
      showToast(`Only ${outstanding} of that line is still out.`, 'error')
      return
    }

    setReturning(itemId)
    try {
      await shipmentsApi.returnShipmentItem(itemId, quantity)
      showToast(`${quantity} returned to stock. The invoice is unchanged.`)
      setReturnDrafts((prev) => ({ ...prev, [itemId]: '' }))

      const refreshed = await shipmentsApi.getShipmentById(selectedShipment!.id)
      setSelectedShipment(refreshed)
      await loadData()
    } catch (err: any) {
      showToast(
        err?.response?.data?.error || err?.message || 'Could not return the item.',
        'error'
      )
    } finally {
      setReturning(null)
    }
  }

  const handleSaveTracking = async (override?: string) => {
    if (!selectedShipment) return

    // Taken as an argument rather than read from state, because Clear needs to
    // save a value the state has not committed yet — a deferred call would
    // otherwise close over the previous draft and re-save the old number.
    const value = override ?? trackingDraft

    const problem = validateTrackingId(value)
    if (problem) {
      showToast(problem, 'error')
      return
    }

    const cleaned = normaliseTrackingId(value)
    if (cleaned === (selectedShipment.trackingId || '')) return

    setSavingTracking(true)
    try {
      const updated = await shipmentsApi.setShipmentTracking(
        selectedShipment.id,
        cleaned
      )
      // Keep the open drawer in step without closing it — the operator is
      // usually reading the number off a label and may correct it twice.
      setSelectedShipment(updated)
      setTrackingDraft(updated.trackingId || '')
      showToast(cleaned ? 'Tracking number saved.' : 'Tracking number cleared.')
      await loadData()
    } catch (err: any) {
      showToast(
        err?.response?.data?.error || err?.message || 'Could not save the tracking number.',
        'error'
      )
    } finally {
      setSavingTracking(false)
    }
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
                          {s.trackingId ? (
                            <div className="mt-1">
                              <TrackingChip
                                trackingId={s.trackingId}
                                courierName={s.courierName}
                                onNotify={showToast}
                              />
                            </div>
                          ) : null}
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
                    {[emp.firstName, emp.lastName].filter(Boolean).join(' ') || 'Unnamed'}
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
                {COURIERS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-3">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              Items to pick
            </h3>

            <ProductPicker
              clientId={formClientId}
              onAdd={handleAddPicked}
              onError={(m) => showToast(m, 'error')}
            />

            {formItems.length === 0 ? (
              <div className="text-center py-6 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-slate-400 text-sm">
                Nothing picked yet. Scan or search for a product above.
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {formItems.map((item, idx) => (
                  <div
                    key={`${item.productId}-${item.locationId}`}
                    className="flex items-center gap-3 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800/80"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-slate-800 dark:text-slate-200 truncate">
                        {item.productName}
                      </div>
                      <div className="text-xs text-slate-400 font-mono truncate">
                        {item.skuCode} · from {item.locationName}
                      </div>
                    </div>
                    <Badge variant="secondary">{item.quantity}</Badge>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => handleRemoveItemRow(idx)}
                      className="px-3"
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {formItems.length > 0 && (
              <div className="flex items-center justify-between gap-2 flex-wrap rounded-xl bg-slate-50 dark:bg-slate-900/50 px-3 py-2 text-sm">
                <span className="text-slate-500">
                  <strong className="text-slate-800 dark:text-slate-200">
                    {basketUnitCount(formItems)}
                  </strong>{' '}
                  item{basketUnitCount(formItems) === 1 ? '' : 's'} across{' '}
                  {formItems.length} location{formItems.length === 1 ? '' : 's'}
                </span>
                {/* Per item, matching the server. Absent rather than zero when
                    the rate is unknown: "not charged" and "charged nothing"
                    read differently. */}
                {dispatchRate !== null && (
                  <span className="text-slate-500">
                    Dispatch charge{' '}
                    <strong className="text-slate-800 dark:text-slate-200">
                      £{estimateDispatchCharge(formItems, dispatchRate)?.toFixed(2)}
                    </strong>{' '}
                    <span className="text-xs text-slate-400">
                      ({basketUnitCount(formItems)} × £{dispatchRate.toFixed(2)})
                    </span>
                  </span>
                )}
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

            {/* Courier consignment number. Editable by any staff member, in every
                status but CANCELLED — the courier normally issues it at the
                moment of dispatch, which is exactly when the rest of the
                shipment freezes. */}
            <div className="rounded-2xl border border-slate-100 dark:border-slate-800/80 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">
                    Courier Tracking Number
                  </h3>
                  <p className="text-xs text-slate-400">
                    Click the number to copy it, or the arrow to open{' '}
                    {selectedShipment.courierName}.
                  </p>
                </div>
                {selectedShipment.trackingId ? (
                  <TrackingChip
                    trackingId={selectedShipment.trackingId}
                    courierName={selectedShipment.courierName}
                    onNotify={showToast}
                  />
                ) : (
                  <span className="text-xs text-slate-400 italic">Not recorded yet</span>
                )}
              </div>

              {isStaff && selectedShipment.status !== 'CANCELLED' && (
                <div className="flex items-end gap-2 flex-wrap">
                  <div className="flex-1 min-w-[12rem]">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                      {selectedShipment.trackingId ? 'Correct the number' : 'Add the number'}
                    </label>
                    <Input
                      value={trackingDraft}
                      onChange={(e) => setTrackingDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleSaveTracking()
                        }
                      }}
                      placeholder="Scan or type the consignment number"
                      className="font-mono"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </div>
                  <Button
                    onClick={() => handleSaveTracking()}
                    disabled={
                      savingTracking ||
                      normaliseTrackingId(trackingDraft) ===
                        (selectedShipment.trackingId || '')
                    }
                  >
                    {savingTracking ? 'Saving…' : 'Save'}
                  </Button>
                  {selectedShipment.trackingId && (
                    <Button
                      variant="outline"
                      disabled={savingTracking}
                      onClick={() => {
                        // Clearing is a save of the empty value, not just a
                        // blanked box — otherwise the number stays on the row.
                        setTrackingDraft('')
                        handleSaveTracking('')
                      }}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              )}
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
                      {((isStaff && selectedShipment.status === 'PENDING') ||
                        (isAdmin && selectedShipment.status === 'DISPATCHED')) && (
                        <th className="p-3 text-right">Action</th>
                      )}
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
                          <td className="p-3 text-center font-bold">
                            {item.quantity} units
                            {(item.returnedQuantity ?? 0) > 0 && (
                              <span className="block text-xs font-normal text-amber-600 dark:text-amber-400">
                                {item.returnedQuantity} returned
                              </span>
                            )}
                          </td>
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
                          {isAdmin && selectedShipment.status === 'DISPATCHED' && (
                            <td className="p-3 text-right">
                              {(() => {
                                const outstanding =
                                  item.quantity - (item.returnedQuantity ?? 0)
                                if (outstanding <= 0) {
                                  return (
                                    <span className="text-xs text-slate-400">
                                      Fully returned
                                    </span>
                                  )
                                }
                                return (
                                  <div className="flex items-center justify-end gap-2">
                                    <div className="w-20">
                                      <Input
                                        type="number"
                                        min={1}
                                        max={outstanding}
                                        placeholder={String(outstanding)}
                                        value={returnDrafts[item.id] ?? ''}
                                        onChange={(e) =>
                                          setReturnDrafts((prev) => ({
                                            ...prev,
                                            [item.id]: e.target.value,
                                          }))
                                        }
                                        aria-label={`Quantity to return of ${item.product?.skuCode ?? 'item'}`}
                                      />
                                    </div>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={returning === item.id}
                                      onClick={() => handleReturnItem(item.id, outstanding)}
                                      title={`Puts stock back in ${item.sourceLocation?.locationName ?? 'its original location'}. The invoice is not changed.`}
                                    >
                                      {returning === item.id ? 'Returning…' : 'Return'}
                                    </Button>
                                  </div>
                                )
                              })()}
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
