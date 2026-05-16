import { useEffect, useState } from 'react'
import { clients as apiClients } from '@/api'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth'

type Client = { id: string; companyName?: string; email?: string }

export default function ClientList() {
  const [items, setItems] = useState<Client[]>([])
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [companyName, setCompanyName] = useState('')
  const [contactName, setContactName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')

  const adminId = useAuthStore((s) => s.userId)

  const load = async () => {
    setLoading(true)
    try {
      const data = await apiClients.getAllClients()
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
    if (!adminId) return alert('You must be signed in as admin to create clients.')
    try {
      await apiClients.addClient({ adminId, companyName, contactName, email, phone, address })
      setShowCreate(false)
      setCompanyName('')
      setContactName('')
      setEmail('')
      setPhone('')
      setAddress('')
      await load()
    } catch (err: any) {
      alert(err?.message || 'Failed to create client')
    }
  }

  return (
    <div className="bg-white rounded-xl p-4 shadow">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium">Clients</h2>
        <Button onClick={() => setShowCreate(true)}>New Client</Button>
      </div>

      {loading ? (
        <div>Loading…</div>
      ) : (
        <ul className="space-y-2">
          {items.map((c) => (
            <li key={c.id} className="border p-2 rounded">
              <div className="font-medium">{c.companyName ?? '—'}</div>
              <div className="text-sm text-muted-foreground">{c.email ?? '—'}</div>
            </li>
          ))}
        </ul>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center">
          <div className="bg-white p-6 rounded shadow-md w-full max-w-md">
            <h3 className="text-lg font-medium mb-4">Create Client</h3>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="block text-sm">Company name</label>
                <input className="mt-1 block w-full border rounded p-2" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm">Contact name</label>
                <input className="mt-1 block w-full border rounded p-2" value={contactName} onChange={(e) => setContactName(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm">Email</label>
                <input className="mt-1 block w-full border rounded p-2" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm">Phone</label>
                <input className="mt-1 block w-full border rounded p-2" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm">Address</label>
                <input className="mt-1 block w-full border rounded p-2" value={address} onChange={(e) => setAddress(e.target.value)} />
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
