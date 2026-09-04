import { useEffect, useState } from 'react'
import { Modal, Button, Input, Select } from '@/components/Shared Components'
import { services as apiServices } from '@/api'
import { default as apiClientServices } from '@/api/clientServices'
import type { Service } from '@/api/types'
import { Save, Trash2, Plus } from 'lucide-react'
import { useFeedback } from '@/hooks/useFeedback'

interface ClientServiceEntry {
  id?: string
  clientId: string
  serviceId: string
  chargedPrice: number
  unit?: string
  /** Billed every period whether or not anything shipped. */
  service?: Service
}

interface Props {
  open: boolean
  clientId: string | null
  onClose: () => void
  onUpdated?: () => void
}

export default function ClientServicesModal({ open, clientId, onClose, onUpdated }: Props) {
  const { dialog, showError, showMessage } = useFeedback()

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
        showMessage('Missing assignment id for this row. Please refresh and try again.')
        void load()
        return
      }
      setSavingId(entry.id)
      await apiClientServices.updateClientService(entry.id, {
        chargedPrice: Number(entry.chargedPrice),
        unit: entry.unit ?? '',
      })
      void load()
      onUpdated?.()
    } catch (e) {
      showError(e, 'Could not update this rate')
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
      showError(e, 'Could not remove this rate')
    } finally {
      setDeleting(false)
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
    if (!clientId || !newServiceId) return showMessage('Select a service')
    if (!newUnit.trim()) return showMessage('Unit is required.')
    if (items.some((x) => x.serviceId === newServiceId)) {
      showMessage('This service is already assigned to the client. Edit the existing row instead.')
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
      showError(e, 'Could not add this service')
    } finally {
      setAdding(false)
    }
  }

  return (
    <>
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
                            <div className="flex justify-end">
                              <div className="inline-flex items-center gap-0.5 rounded-lg border border-border/80 bg-white p-0.5 shadow-sm">
                                <button
                                  type="button"
                                  title="Save changes"
                                  aria-label="Save changes"
                                  disabled={savingId === it.id}
                                  onClick={() => void handleSaveEntry(it)}
                                  className="icon-action text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
                                >
                                  <Save className="size-3.5" strokeWidth={1.75} />
                                </button>
                                <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
                                <button
                                  type="button"
                                  title="Delete assignment"
                                  aria-label="Delete assignment"
                                  onClick={() => handleDeleteClick(it.id)}
                                  className="icon-action text-slate-500 hover:bg-rose-50 hover:text-rose-600"
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
            <Button variant="destructive" onClick={() => void executeDelete()} loading={deleting}>
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

      {dialog}
    </>
  )
}
