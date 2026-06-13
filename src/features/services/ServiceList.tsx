import { useEffect, useState } from 'react'
import { services as apiServices } from '@/api'
import { Button } from '@/components/Shared Components'
import ServiceFormModal from './ServiceFormModal'

type Service = {
  id: string
  description?: string
  ideaPrice?: number
  unit?: string
}

export default function ServiceList() {
  const [items, setItems] = useState<Service[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Service | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const data = await apiServices.getAllServices()
      setItems(Array.isArray(data) ? data : [])
    } catch (_) {
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  const handleCreateClick = () => {
    setEditing(null)
    setModalOpen(true)
  }

  const handleEditClick = (s: Service) => {
    setEditing(s)
    setModalOpen(true)
  }

  const handleSave = async (payload: { description: string; ideaPrice: number; unit: string }, id?: string) => {
    if (id) {
      await apiServices.updateService(id, payload)
    } else {
      await apiServices.createService(payload)
    }
    await load()
  }

  useEffect(() => {
    void load()
  }, [])

  const handleDelete = async (s: Service) => {
    const serviceLabel = s.description || 'this service'
    if (!confirm(`Delete service ${serviceLabel}?`)) return
    try {
      await apiServices.deleteService(s.id)
      await load()
    } catch (e) {
      alert((e as any)?.message || 'Failed to delete service')
    }
  }

  return (
    <div className="bg-white rounded-xl p-4 shadow">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium">Services</h2>
        <Button onClick={handleCreateClick}>New Service</Button>
      </div>
      <ServiceFormModal open={modalOpen} onClose={() => setModalOpen(false)} onSave={handleSave} initial={editing} />

      {loading ? (
        <div>Loading…</div>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th className="py-2">Description</th>
              <th className="py-2">Price</th>
              <th className="py-2">Unit</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id} className="border-t">
                <td className="py-2">{s.description ?? '—'}</td>
                <td className="py-2">{s.ideaPrice ?? '—'}</td>
                <td className="py-2">{s.unit ?? '—'}</td>
                <td className="py-2">
                  <Button variant="ghost" size="sm" onClick={() => handleEditClick(s)}>
                    Edit
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => handleDelete(s)} className="ml-2">
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
