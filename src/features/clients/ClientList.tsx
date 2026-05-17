import { useEffect, useState } from 'react'
import { clients as apiClients, auth as apiAuth } from '@/api'
import ClientServicesModal from './ClientServicesModal'
import { Button } from '@/components/Shared Components'
import { useAuthStore } from '@/stores/auth'
import ClientFormModal from './ClientFormModal'

type Client = {
  id: string
  companyName?: string
  contactName?: string
  email?: string
  mobile?: string
  address?: string
  userId?: string
}

export default function ClientList() {
  const [items, setItems] = useState<Client[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Client | null>(null)
  const [servicesOpen, setServicesOpen] = useState(false)
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const currentUserId = useAuthStore((s) => s.userId)

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

  const handleCreateClick = () => {
    setEditing(null)
    setModalOpen(true)
  }

  const handleEditClick = (c: Client) => {
    setEditing(c)
    setModalOpen(true)
  }

  const handleSave = async (
    payload: { companyName: string; contactName: string; email: string; mobile?: string; address?: string },
    id?: string,
  ) => {
    if (id) {
      await apiClients.updateClient(id, payload)
    } else {
      if (!currentUserId) throw new Error('Admin ID missing')
      await apiClients.addClient({ ...payload, adminId: currentUserId })
    }
    await load()
  }

  useEffect(() => {
    void load()
  }, [])

  const handleDelete = async (c: Client) => {
    const companyLabel = c.companyName || c.email || 'this client'
    if (!confirm(`Delete client ${companyLabel}?`)) return
    try {
      await apiClients.deleteClient(c.id)
      await load()
    } catch (e) {
      alert((e as any)?.message || 'Failed to delete client')
    }
  }

  const handleViewServices = (c: Client) => {
    setSelectedClientId(c.id)
    setServicesOpen(true)
  }

  const handleSendResetEmail = async (c: Client) => {
    if (!currentUserId) {
      alert('Missing logged-in admin id. Please sign in again.')
      return
    }
    if (!c.userId) {
      alert('Client user ID not found.')
      return
    }

    const clientLabel = c.companyName || c.email || 'this client'
    if (!confirm(`Send reset-password email to ${clientLabel}?`)) return

    try {
      await apiAuth.resetPasswordForUser({ adminId: currentUserId, userId: c.userId })
      alert('Password reset email sent successfully.')
    } catch (e) {
      alert((e as any)?.response?.data?.error || (e as any)?.message || 'Unable to send reset email')
    }
  }

  return (
    <div className="bg-white rounded-xl p-4 shadow">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium">Clients</h2>
        <Button onClick={handleCreateClick}>New Client</Button>
      </div>
      <ClientFormModal open={modalOpen} onClose={() => setModalOpen(false)} onSave={handleSave} initial={editing} />
      <ClientServicesModal open={servicesOpen} clientId={selectedClientId} onClose={() => setServicesOpen(false)} onUpdated={() => void load()} />

      {loading ? (
        <div>Loading…</div>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th className="py-2">Company Name</th>
              <th className="py-2">Contact Name</th>
              <th className="py-2">Email</th>
              <th className="py-2">Phone</th>
              <th className="py-2">Services</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="py-2">{c.companyName ?? '—'}</td>
                <td className="py-2">{c.contactName ?? '—'}</td>
                <td className="py-2">{c.email ?? '—'}</td>
                <td className="py-2">{c.mobile ?? '—'}</td>
                <td className="py-2">
                  <Button variant="ghost" size="sm" onClick={() => handleViewServices(c)}>Services</Button>
                </td>
                <td className="py-2">
                  <Button variant="ghost" size="sm" onClick={() => handleEditClick(c)}>
                    Edit
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => handleSendResetEmail(c)} className="ml-2">
                    Send Reset Email
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => handleDelete(c)} className="ml-2">
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

