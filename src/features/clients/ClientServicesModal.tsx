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
  const [newUnit, setNewUnit] = useState<string>('1')

  const load = async () => {
    if (!clientId) return
    setLoading(true)
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
    } catch (e) {
      setItems([])
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
      await apiClientServices.updateClientService(entry.id, { chargedPrice: Number(entry.chargedPrice), unit: entry.unit ?? '1' })
      void load()
      onUpdated?.()
    } catch (e) {
      alert((e as any)?.response?.data?.error || (e as any)?.message || 'Failed to update')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this client-service assignment?')) return
    try {
      await apiClientServices.deleteClientService(id)
      void load()
      onUpdated?.()
    } catch (e) {
      alert((e as any)?.response?.data?.error || (e as any)?.message || 'Failed to delete')
    }
  }

  const handleAdd = async () => {
    if (!clientId || !newServiceId) return alert('Select a service')
    if (items.some((x) => x.serviceId === newServiceId)) {
      alert('This service is already assigned to the client. Edit the existing row instead.')
      return
    }
    try {
      // include unit provided by admin (default '1')
      await apiClientServices.addClientService({ clientId, serviceId: newServiceId, chargedPrice: newPrice ? Number(newPrice) : undefined, unit: newUnit || '1' })
      setNewServiceId(null)
      setNewPrice('')
      setNewUnit('1')
      void load()
      onUpdated?.()
    } catch (e) {
      alert((e as any)?.response?.data?.error || (e as any)?.message || 'Failed to add')
    }
  }

  return (
    <Modal open={open} onClose={onClose}>
      <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-4xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Client Services</h3>
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>

        {loading ? (
          <div>Loading…</div>
        ) : (
          <div>
            <table className="w-full text-left mb-4">
              <thead>
                <tr>
                  <th className="py-2">Service</th>
                  <th className="py-2">Price</th>
                  <th className="py-2">Unit</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-t">
                      <td className="py-2 font-medium">{it.service?.description ?? it.serviceId}</td>
                      <td className="py-2">
                        <Input value={String(it.chargedPrice ?? '')} onChange={(e) => setItems((s) => s.map(x => x.id === it.id ? ({...x, chargedPrice: Number(e.target.value)}) : x))} />
                      </td>
                      <td className="py-2">
                        <Input value={it.unit ?? '1'} onChange={(e) => setItems((s) => s.map(x => x.id === it.id ? ({...x, unit: e.target.value}) : x))} />
                      </td>
                      <td className="py-2">
                        <Button size="sm" onClick={() => handleSaveEntry(it)}>Save</Button>
                        <Button size="sm" variant="destructive" onClick={() => handleDelete(it.id)} className="ml-2">Delete</Button>
                      </td>
                    </tr>
                ))}
              </tbody>
            </table>

            <div className="border-t pt-4">
              <h4 className="font-medium mb-2">Add service</h4>
              <div className="flex gap-2 items-center">
                <Select value={newServiceId ?? ''} onChange={(e) => setNewServiceId(e.target.value || null)}>
                  <option value="">Select a service</option>
                  {allServices.map((s) => (
                    <option key={s.id} value={s.id}>{s.description}</option>
                  ))}
                </Select>
                <Input placeholder="Price" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} />
                <Input placeholder="Unit" value={newUnit} onChange={(e) => setNewUnit(e.target.value)} />
                <Button onClick={handleAdd}>Add</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
