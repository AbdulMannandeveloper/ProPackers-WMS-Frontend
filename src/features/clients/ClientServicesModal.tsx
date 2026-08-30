import { useEffect, useState } from 'react'
import { Modal, Button, Input, Select } from '@/components/Shared Components'
import { services as apiServices } from '@/api'
import { default as apiClientServices } from '@/api/clientServices'
import type { Service } from '@/api/types'
import { Save, Trash2, Plus } from 'lucide-react'

interface ClientServiceEntry {
  id?: string
  clientId: string
  serviceId: string
  chargedPrice: number
  unit?: string
  /** Billed every period whether or not anything shipped. */
  isRecurring?: boolean
  recurringQuantity?: number | string
  service?: Service
}

interface Props {
  open: boolean
  clientId: string | null
  onClose: () => void
  onUpdated?: () => void
}

export default function ClientServicesModal({ open, clientId, onClose, onUpdated }: Props) {
  const [items, setItems] = useState<ClientServiceEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [allServices, setAllServices] = useState<Service[]>([])
  const [newServiceId, setNewServiceId] = useState<string | null>(null)
  const [newPrice, setNewPrice] = useState<string>('')
  const [newUnit, setNewUnit] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  // A one-off charge against an already-agreed rate. Held per rate id so two
  // rows cannot share a draft quantity.
  const [chargeDrafts, setChargeDrafts] = useState<Record<string, string>>({})
  const [charging, setCharging] = useState<string | null>(null)
  const [chargeNote, setChargeNote] = useState<string>('')

  const load = async () => {
    if (!clientId) return
    setLoading(true)
    setError('')
    try {
      const [svcList, clientSvcList] = await Promise.all([
        apiServices.getAllServices(),
        apiClientServices.getClientServicesByClientId(clientId),
      ])
      const svcs = Array.isArray(svcList) ? svcList : []
      setAllServices(svcs)
      const csList = Array.isArray(clientSvcList) ? clientSvcList : []
      setItems(csList.map((cs: any) => ({ ...(cs as any), service: svcs.find((s) => s.id === (cs as any).serviceId) })))
    } catch (e: any) {
      setItems([])
      setError(e?.response?.data?.error || e?.message || 'Unable to load client services.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) void load()
  }, [open, clientId])

  const handleSaveEntry = async (entry: ClientServiceEntry) => {
    try {
      if (!entry.id) {
        alert('Missing assignment id for this row. Please refresh and try again.')
        void load()
        return
      }
      setSavingId(entry.id)
      await apiClientServices.updateClientService(entry.id, {
        chargedPrice: Number(entry.chargedPrice),
        unit: entry.unit ?? '',
        isRecurring: Boolean(entry.isRecurring),
        // Only meaningful when recurring; the server defaults it to 1 rather
        // than letting a standing charge bill nothing every month.
        ...(entry.isRecurring
          ? { recurringQuantity: Number(entry.recurringQuantity) || 1 }
          : {}),
      })
      void load()
      onUpdated?.()
    } catch (e) {
      alert((e as any)?.response?.data?.error || (e as any)?.message || 'Failed to update')
    } finally {
      setSavingId(null)
    }
  }

  const closeDeleteConfirm = () => {
    if (deleting) return
    setDeleteConfirmId(null)
  }

  const handleDeleteClick = (id?: string) => {
    if (!id) return
    setDeleteConfirmId(id)
  }

  const executeDelete = async () => {
    if (!deleteConfirmId) return
    setDeleting(true)
    try {
      await apiClientServices.deleteClientService(deleteConfirmId)
      setDeleteConfirmId(null)
      void load()
      onUpdated?.()
    } catch (e) {
      alert((e as any)?.response?.data?.error || (e as any)?.message || 'Failed to delete')
    } finally {
      setDeleting(false)
    }
  }

  /**
   * Bills a quantity of this service to the client now, onto whichever invoice
   * period is open. For work that happened once and is not tied to a shipment.
   */
  const handleChargeOnce = async (entry: ClientServiceEntry) => {
    // id is optional on the draft row used when adding a new rate; a charge only
    // makes sense against a rate that has been saved.
    if (!clientId || !entry.id) return
    const entryId = entry.id
    const quantity = Number(chargeDrafts[entryId] ?? '')
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError('Enter a quantity above zero to charge.')
      return
    }

    setCharging(entryId)
    setError('')
    try {
      await apiClientServices.chargeServiceToClient({
        clientId,
        clientServiceId: entryId,
        quantity,
      })
      const total = (quantity * Number(entry.chargedPrice || 0)).toFixed(2)
      setChargeNote(
        `Charged ${quantity} x ${entry.service?.description ?? 'service'} — £${total} added to the open invoice.`,
      )
      setChargeDrafts((prev) => ({ ...prev, [entryId]: '' }))
      onUpdated?.()
    } catch (err: any) {
      setError(
        err?.response?.data?.error || err?.message || 'Could not raise the charge.',
      )
    } finally {
      setCharging(null)
    }
  }

  const handleServiceSelection = (serviceId: string) => {
    const nextServiceId = serviceId || null
    setNewServiceId(nextServiceId)
    if (!nextServiceId) {
      setNewUnit('')
      setNewPrice('')
      return
    }

    const selectedService = allServices.find((service) => service.id === nextServiceId)
    if (selectedService?.unit) {
      setNewUnit(selectedService.unit)
    }
    if (selectedService?.ideaPrice != null) {
      setNewPrice(String(selectedService.ideaPrice))
    }
  }

  const handleAdd = async () => {
    if (!clientId || !newServiceId) return alert('Select a service')
    if (!newUnit.trim()) return alert('Unit is required.')
    if (items.some((x) => x.serviceId === newServiceId)) {
      alert('This service is already assigned to the client. Edit the existing row instead.')
      return
    }
    setAdding(true)
    try {
      await apiClientServices.addClientService({
        clientId,
        serviceId: newServiceId,
        chargedPrice: newPrice ? Number(newPrice) : undefined,
        unit: newUnit.trim(),
      })
      setNewServiceId(null)
      setNewPrice('')
      setNewUnit('')
      void load()
      onUpdated?.()
    } catch (e) {
      alert((e as any)?.response?.data?.error || (e as any)?.message || 'Failed to add')
    } finally {
      setAdding(false)
    }
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        size="xl"
        title="Client Services"
        description="Manage pricing and unit mapping for services assigned to this client."
        contentClassName="space-y-4"
        footer={
          <div className="flex justify-end">
            <Button variant="secondary" onClick={onClose}>Close</Button>
          </div>
        }
      >
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        ) : null}

        {/* A one-off charge is invisible from this screen otherwise — it lands on
            an invoice the admin is not looking at, so say what happened. */}
        {chargeNote ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {chargeNote}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-xl border border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
            Loading services…
          </div>
        ) : (
          <div className="space-y-4">
            {/* Assigned list */}
            <div className="overflow-hidden rounded-xl border border-border">
              <div className="border-b border-border bg-muted/40 px-4 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Assigned services
                  <span className="ml-2 font-normal normal-case tracking-normal text-slate-400">
                    ({items.length})
                  </span>
                </p>
              </div>

              {items.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No services assigned yet. Add one below.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full table-fixed text-left">
                    <colgroup>
                      <col className="w-[36%]" />
                      <col className="w-[18%]" />
                      <col className="w-[22%]" />
                      <col className="w-[24%]" />
                    </colgroup>
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Service</th>
                        <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Price (£)</th>
                        <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Unit</th>
                        <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground" title="Billed every month whether or not anything ships">Monthly</th>
                        <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground" title="Bill a quantity of this service to the open invoice now">Charge once</th>
                        <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {items.map((it) => (
                        <tr key={it.id} className="bg-white hover:bg-slate-50/80">
                          <td className="px-4 py-3 align-middle">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground">
                                {it.service?.description ?? it.serviceId}
                              </p>
                              {it.service?.ideaPrice != null && (
                                <p className="mt-0.5 text-[11px] text-muted-foreground">
                                  Idea price: £{Number(it.service.ideaPrice).toFixed(2)}
                                </p>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 align-middle">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              className="h-9 rounded-lg"
                              value={String(it.chargedPrice ?? '')}
                              onChange={(e) =>
                                setItems((s) =>
                                  s.map((x) =>
                                    x.id === it.id ? { ...x, chargedPrice: Number(e.target.value) } : x,
                                  ),
                                )
                              }
                            />
                          </td>
                          <td className="px-4 py-3 align-middle">
                            <Input
                              className="h-9 rounded-lg"
                              value={it.unit ?? ''}
                              placeholder="e.g. hourly"
                              onChange={(e) =>
                                setItems((s) =>
                                  s.map((x) => (x.id === it.id ? { ...x, unit: e.target.value } : x)),
                                )
                              }
                            />
                          </td>
                          <td className="px-4 py-3 align-middle">
                            {/* A standing charge: raised every period even when
                                nothing ships. This is how a client who stores
                                with us but ships elsewhere gets billed at all. */}
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                className="size-4 rounded border-border"
                                checked={Boolean(it.isRecurring)}
                                aria-label={`Bill ${it.service?.description ?? 'this service'} every month`}
                                onChange={(e) =>
                                  setItems((s) =>
                                    s.map((x) =>
                                      x.id === it.id
                                        ? {
                                            ...x,
                                            isRecurring: e.target.checked,
                                            recurringQuantity:
                                              Number(x.recurringQuantity) > 0
                                                ? x.recurringQuantity
                                                : 1,
                                          }
                                        : x,
                                    ),
                                  )
                                }
                              />
                              {it.isRecurring && (
                                <Input
                                  type="number"
                                  min="1"
                                  className="h-9 w-20 rounded-lg"
                                  value={String(it.recurringQuantity ?? 1)}
                                  aria-label={`Monthly quantity of ${it.service?.description ?? 'this service'}`}
                                  onChange={(e) =>
                                    setItems((s) =>
                                      s.map((x) =>
                                        x.id === it.id
                                          ? { ...x, recurringQuantity: e.target.value }
                                          : x,
                                      ),
                                    )
                                  }
                                />
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 align-middle">
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="Qty"
                                className="h-9 w-20 rounded-lg"
                                value={chargeDrafts[it.id ?? ''] ?? ''}
                                aria-label={`Quantity of ${it.service?.description ?? 'service'} to charge now`}
                                onChange={(e) =>
                                  setChargeDrafts((prev) => ({
                                    ...prev,
                                    [it.id ?? '']: e.target.value,
                                  }))
                                }
                              />
                              <button
                                type="button"
                                disabled={charging === it.id || !chargeDrafts[it.id ?? '']}
                                onClick={() => void handleChargeOnce(it)}
                                title="Adds this to the client's open invoice at the agreed rate"
                                className="inline-flex h-9 items-center rounded-lg border border-border bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                              >
                                {charging === it.id ? 'Charging…' : 'Charge'}
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-3 align-middle">
                            <div className="flex justify-end">
                              <div className="inline-flex items-center gap-0.5 rounded-lg border border-border/80 bg-white p-0.5 shadow-sm">
                                <button
                                  type="button"
                                  title="Save changes"
                                  aria-label="Save changes"
                                  disabled={savingId === it.id}
                                  onClick={() => void handleSaveEntry(it)}
                                  className="inline-flex size-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
                                >
                                  <Save className="size-3.5" strokeWidth={1.75} />
                                </button>
                                <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
                                <button
                                  type="button"
                                  title="Delete assignment"
                                  aria-label="Delete assignment"
                                  onClick={() => handleDeleteClick(it.id)}
                                  className="inline-flex size-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600"
                                >
                                  <Trash2 className="size-3.5" strokeWidth={1.75} />
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Add service */}
            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Plus className="size-4 text-muted-foreground" strokeWidth={1.75} />
                <h4 className="text-sm font-semibold text-foreground">Add service</h4>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-12 md:items-end">
                <div className="md:col-span-5">
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Service
                  </label>
                  <Select
                    value={newServiceId ?? ''}
                    onChange={(e) => handleServiceSelection(e.target.value)}
                    className="h-9 rounded-lg"
                  >
                    <option value="">Select a service</option>
                    {allServices.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.description}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="md:col-span-2">
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Price (£)
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    className="h-9 rounded-lg"
                  />
                </div>

                <div className="md:col-span-3">
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Unit
                  </label>
                  <Input
                    placeholder="e.g. hourly, item"
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value)}
                    className="h-9 rounded-lg"
                  />
                </div>

                <div className="md:col-span-2">
                  <Button onClick={() => void handleAdd()} disabled={adding} className="h-9 w-full">
                    {adding ? 'Adding…' : 'Add'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(deleteConfirmId)}
        onClose={closeDeleteConfirm}
        title="Delete Service Assignment"
        description="This action cannot be undone."
        size="sm"
        closeOnBackdropClick={!deleting}
        closeOnEsc={!deleting}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeDeleteConfirm} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void executeDelete()} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">
          Are you sure you want to delete this client-service assignment?
        </p>
      </Modal>
    </>
  )
}
