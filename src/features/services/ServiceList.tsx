import { useEffect, useState } from 'react'
import { services as apiServices } from '@/api'
import { Button } from '@/components/ui/button'

type Service = { id: string; description?: string; ideaPrice?: number; unit?: string }

export default function ServiceList() {
  const [items, setItems] = useState<Service[]>([])
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [description, setDescription] = useState('')
  const [ideaPrice, setIdeaPrice] = useState('')
  const [unit, setUnit] = useState('')

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

  useEffect(() => {
    void load()
  }, [])

  const handleCreate = async (e?: React.FormEvent) => {
    e?.preventDefault()
    try {
      await apiServices.createService({ description, ideaPrice: Number(ideaPrice || 0), unit })
      setShowCreate(false)
      setDescription('')
      setIdeaPrice('')
      setUnit('')
      await load()
    } catch (err: any) {
      alert(err?.message || 'Failed to create service')
    }
  }

  return (
    <div className="bg-white rounded-xl p-4 shadow">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium">Services</h2>
        <Button onClick={() => setShowCreate(true)}>New Service</Button>
      </div>

      {loading ? (
        <div>Loading…</div>
      ) : (
        <ul className="space-y-2">
          {items.map((s) => (
            <li key={s.id} className="border p-2 rounded">
              <div className="font-medium">{s.description ?? '—'}</div>
              <div className="text-sm text-muted-foreground">Price: {s.ideaPrice ?? '—'} {s.unit ?? ''}</div>
            </li>
          ))}
        </ul>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center">
          <div className="bg-white p-6 rounded shadow-md w-full max-w-md">
            <h3 className="text-lg font-medium mb-4">Create Service</h3>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="block text-sm">Description</label>
                <input className="mt-1 block w-full border rounded p-2" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm">Idea Price</label>
                <input className="mt-1 block w-full border rounded p-2" value={ideaPrice} onChange={(e) => setIdeaPrice(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm">Unit</label>
                <input className="mt-1 block w-full border rounded p-2" value={unit} onChange={(e) => setUnit(e.target.value)} />
              </div>

              <div className="flex justify-end space-x-2">
                <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button type="submit">Create</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
