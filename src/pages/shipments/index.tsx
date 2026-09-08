import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router'
import { useAuthStore } from '@/stores/auth'
import {
  shipments as shipmentsApi,
  clientServices as clientServicesApi,
} from '@/api'
import type { Shipment } from '@/api/shipments'


import {
  Button,
  Card,
  CardContent,
  Badge,
  Input,
  Modal,
} from '@/components/Shared Components'
import { TrackingChip } from '@/components/TrackingChip'
import { validateTrackingId, normaliseTrackingId } from '@/lib/couriers'

export default function ShipmentsPage() {
  const navigate = useNavigate()
  const role = useAuthStore((s) => s.role)
  const isAdmin = role === 'admin'
  const isEmployee = role === 'employee'
  const isStaff = isAdmin || isEmployee

  // Data States
  const [shipments, setShipments] = useState<Shipment[]>([])
  // The lookup shape, not the full Employee: /api/employees/lookup returns id
  // and name only, deliberately, so a dropdown does not carry NI numbers and
  // salaries into the browser.
  // The lookup shape, not the full Client: /api/clients/lookup is what staff
  // are allowed to read, and id + companyName is all this page renders.
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
  const [detailsModalOpen, setDetailsModalOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  // Selected Records
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null)

  // Tracking number editor, inside the details drawer.
  // Returning a dispatched line. Held per item id so two rows cannot share a
  // draft quantity.
  const [returnDrafts, setReturnDrafts] = useState<Record<string, string>>({})
  const [returning, setReturning] = useState<string | null>(null)
  // Whether to charge the return, per line. Never remembered between lines and
  // never defaulted on — see the note on the checkbox.
  const [chargeReturn, setChargeReturn] = useState<Record<string, boolean>>({})
  // The client's agreed per-item return fee, or null when they have none. Only
  // admins can read the rate card, and only admins can return, so this is never
  // fetched for an employee.
  const [returnRate, setReturnRate] = useState<number | null>(null)

  const [trackingDraft, setTrackingDraft] = useState('')
  const [savingTracking, setSavingTracking] = useState(false)

  // Create Shipment Form State
  // Basket lines, one per (product, bin). A product drawn from three bins is
  // three lines, which is exactly what ShipmentItem models server-side.
  // Billable services. Admin-only: the API refuses them from an employee, matching
  // the admin-only /services endpoints.

  // Load All Core WMS Components
  const loadData = async () => {
    setLoading(true)
    // Records which optional list failed, so the reason reaches the user
    // instead of becoming an empty dropdown.
    try {
      // Just the shipments. The operator and client dropdowns went with the
      // create form — the client is derived from the goods now, and the
      // creator is whoever is signed in — so there is nothing else to preload.
      const shipmentsData = await shipmentsApi.getAllShipments()

      setShipments(shipmentsData || [])
    } catch (err: any) {
      showToast(err?.response?.data?.error || err?.message || 'Failed to load shipments metadata.', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])


  // Save Shipment

  /**
   * The client's agreed return fee, if they have one.
   *
   * Read when the detail opens rather than up front: it is only ever needed
   * here, and only for an admin.
   */
  const loadReturnRate = async (clientId: string) => {
    setReturnRate(null)
    if (!isAdmin || !clientId) return
    try {
      const rows = await clientServicesApi.getClientServicesByClientId(clientId)
      const row = (Array.isArray(rows) ? rows : []).find(
        (r: { service?: { code?: string | null } }) => r.service?.code === 'ITEM_RETURN'
      )
      setReturnRate(row ? Number((row as { chargedPrice: number }).chargedPrice) : null)
    } catch {
      // No rate shown means no charge offered, which is the safe direction.
      setReturnRate(null)
    }
  }

  // Open Details Checklist
  const handleOpenDetails = (shipment: Shipment) => {
    setSelectedShipment(shipment)
    setTrackingDraft(shipment.trackingId || '')
    setChargeReturn({})
    void loadReturnRate(shipment.clientId)
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
      const charge = chargeReturn[itemId] === true
      const result = await shipmentsApi.returnShipmentItem(itemId, quantity, { chargeReturn: charge })

      // Says which of the two things happened, rather than a generic success:
      // whether a client was billed is not something to leave ambiguous.
      const billed = (result as { returnCharge?: number | null })?.returnCharge
      showToast(
        billed
          ? `${quantity} returned to stock. £${billed.toFixed(2)} return fee added — the shipment's own charge is unchanged.`
          : `${quantity} returned to stock. Nothing was charged.`
      )
      setReturnDrafts((prev) => ({ ...prev, [itemId]: '' }))
      setChargeReturn((prev) => ({ ...prev, [itemId]: false }))

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

  /**
   * Who made the shipment.
   *
   * `createdBy` is the session user, which is the honest answer: an admin
   * dispatching a parcel did the work whether or not they are on the payroll.
   * The employee fallback is for rows written before creators were recorded —
   * those genuinely only know the operator they were booked against.
   *
   * This used to read the employee alone, so an admin's own shipments came back
   * either blank or under somebody else's name.
   */
  const getCreatorName = (s: Shipment) => {
    if (s.createdBy) return `${s.createdBy.firstName} ${s.createdBy.lastName}`
    const legacy = (s as any).employee
    if (legacy?.user) return `${legacy.user.firstName} ${legacy.user.lastName}`
    return 'Unknown'
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
          <Button onClick={() => navigate('/dispatch')}>
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
              <table className="w-full min-w-[60rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-500 pb-2">
                    <th className="pb-3 font-semibold">Shipment Ref</th>
                    <th className="pb-3 font-semibold">Client Company</th>
                    <th className="pb-3 font-semibold">Created By</th>
                    <th className="pb-3 font-semibold">Tracking</th>
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
                        {/* The label scanned off the parcel. This column used to
                            show eight characters of the row's uuid, which
                            matched nothing on the parcel, the invoice or the
                            ledger. */}
                        <td className="py-4 font-mono font-bold text-slate-800 dark:text-slate-200">
                          {s.reference}
                        </td>
                        <td className="py-4 font-semibold text-slate-900 dark:text-slate-100">
                          {s.client?.companyName || '—'}
                        </td>
                        <td className="py-4 text-slate-600 dark:text-slate-400">
                          {getCreatorName(s)}
                        </td>
                        {/* Courier and packaging were dropped from the schema in
                            Phase 20, so this column printed two blanks around
                            the tracking chip. The chip is the column now. */}
                        <td className="py-4">
                          {s.trackingId ? (
                            <TrackingChip trackingId={s.trackingId} onNotify={showToast} />
                          ) : (
                            <span className="text-xs text-slate-400">
                              {s.status === 'DISPATCHED' ? 'Not recorded' : 'Once dispatched'}
                            </span>
                          )}
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
                <span className="text-slate-400 block text-xs uppercase tracking-wider font-semibold">Created By</span>
                <strong className="text-slate-700 dark:text-slate-200">{getCreatorName(selectedShipment)}</strong>
              </div>
              <div>
                <span className="text-slate-400 block text-xs uppercase tracking-wider font-semibold">Shipment Ref</span>
                <strong className="font-mono text-slate-700 dark:text-slate-200">{selectedShipment.reference}</strong>
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
                    Click the number to copy it.
                  </p>
                </div>
                {selectedShipment.trackingId ? (
                  <TrackingChip
                    trackingId={selectedShipment.trackingId}
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
                    loading={savingTracking} disabled={normaliseTrackingId(trackingDraft) ===
                        (selectedShipment.trackingId || '')}
                  >
                    {savingTracking ? 'Saving…' : 'Save'}
                  </Button>
                  {selectedShipment.trackingId && (
                    <Button
                      variant="outline"
                      loading={savingTracking}
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
                <table className="w-full min-w-[38rem] text-left text-sm">
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
                                  <div className="flex flex-col items-end gap-2">
                                    {/* Only when a fee has been agreed, and never
                                        ticked by default: forgetting to untick
                                        would bill for a return meant to be
                                        absorbed. */}
                                    {returnRate !== null ? (
                                      <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-slate-600">
                                        <input
                                          type="checkbox"
                                          className="check-target"
                                          checked={chargeReturn[item.id] === true}
                                          onChange={(e) =>
                                            setChargeReturn((prev) => ({
                                              ...prev,
                                              [item.id]: e.target.checked,
                                            }))
                                          }
                                        />
                                        Charge £{returnRate.toFixed(2)} per item
                                      </label>
                                    ) : null}
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
                                      loading={returning === item.id}
                                      onClick={() => handleReturnItem(item.id, outstanding)}
                                      title={`Puts stock back in ${item.sourceLocation?.locationName ?? 'its original location'}. The shipment's own charge is never changed.`}
                                    >
                                      {returning === item.id ? 'Returning…' : 'Return'}
                                    </Button>
                                    </div>
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
          Are you sure you want to cancel shipment <strong className="font-mono text-rose-500">{selectedShipment?.reference}</strong>?
        </p>
      </Modal>
    </div>
  )
}
