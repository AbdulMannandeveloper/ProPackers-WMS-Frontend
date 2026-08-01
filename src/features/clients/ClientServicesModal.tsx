import { useEffect, useState } from 'react'
import { Modal, Button, Input, Select } from '@/components/Shared Components'
import { services as apiServices } from '@/api'
import { default as apiClientServices } from '@/api/clientServices'
import type { Service } from '@/api/types'

interface ClientServiceEntry {
  id?: string
  clientId: string
  serviceId: string
  chargedPrice: number
  unit?: string
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
      // attach service object when available
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
      // update chargedPrice and unit
      await apiClientServices.updateClientService(entry.id, { chargedPrice: Number(entry.chargedPrice), unit: entry.unit ?? '' })
      void load()
      onUpdated?.()
    } catch (e) {
      alert((e as any)?.response?.data?.error || (e as any)?.message || 'Failed to update')
    }
  }

  const handleDelete = async (id?: string) => {
    if (!id) return
    if (!confirm('Delete this client-service assignment?')) return
    try {
      await apiClientServices.deleteClientService(id)
      void load()
      onUpdated?.()
    } catch (e) {
      alert((e as any)?.response?.data?.error || (e as any)?.message || 'Failed to delete')
    }
  }

  const handleServiceSelection = (serviceId: string) => {
    const nextServiceId = serviceId || null
    setNewServiceId(nextServiceId)
    if (!nextServiceId) {
      setNewUnit('')
      return
    }

    const selectedService = allServices.find((service) => service.id === nextServiceId)
    if (selectedService?.unit) {
      setNewUnit(selectedService.unit)
    }
    // Auto-fill with ideaPrice as suggested default
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
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Client Services"
      description="Manage pricing and unit mapping for services assigned to this client."
      contentClassName="space-y-5"
      footer={<div className="flex justify-end"><Button variant="secondary" onClick={onClose}>Close</Button></div>}
    >
      <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Assigned services</div>

        {error ? <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

        {loading ? (
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">Loading…</div>
        ) : (
          <div className="space-y-4">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-200 text-slate-700">
                  <th className="py-2 pr-3">Service</th>
                  <th className="py-2 pr-3">Price</th>
                  <th className="py-2 pr-3">Unit</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-t">
                      <td className="py-2 pr-3 font-medium text-slate-900">
                        {it.service?.description ?? it.serviceId}
                        {it.service?.ideaPrice != null && (
                          <span className="block text-[10px] text-slate-400 font-normal">Idea price: £{Number(it.service.ideaPrice).toFixed(2)}</span>
                        )}
                      </td>
                      <td className="py-2">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={String(it.chargedPrice ?? '')}
                          onChange={(e) => setItems((s) => s.map(x => x.id === it.id ? ({...x, chargedPrice: Number(e.target.value)}) : x))}
                        />
                      </td>
                      <td className="py-2">
                        <Input
                          value={it.unit ?? ''}
                          placeholder="e.g. hourly, item"
                          onChange={(e) => setItems((s) => s.map(x => x.id === it.id ? ({...x, unit: e.target.value}) : x))}
                        />
                      </td>
                      <td className="py-2">
                        <Button size="sm" onClick={() => handleSaveEntry(it)}>Save</Button>
                        <Button size="sm" variant="destructive" onClick={() => handleDelete(it.id)} className="ml-2">Delete</Button>
                      </td>
                    </tr>
                ))}
              </tbody>
            </table>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h4 className="mb-3 font-medium text-slate-900">Add service</h4>
              <div className="grid gap-2 md:grid-cols-[2fr_1fr_1fr_auto] md:items-center">
                <Select value={newServiceId ?? ''} onChange={(e) => handleServiceSelection(e.target.value)}>
                  <option value="">Select a service</option>
                  {allServices.map((s) => (
                    <option key={s.id} value={s.id}>{s.description}</option>
                  ))}
                </Select>
                <Input type="number" step="0.01" min="0" placeholder="Price" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} />
                <Input placeholder="Unit (text)" value={newUnit} onChange={(e) => setNewUnit(e.target.value)} />
                <Button onClick={handleAdd}>Add</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
