import { useEffect, useState, useMemo } from 'react'
import { clients as apiClients, auth as apiAuth } from '@/api'
import ClientServicesModal from './ClientServicesModal'
import { Button } from '@/components/Shared Components'
import { useAuthStore } from '@/stores/auth'
import ClientFormModal from './ClientFormModal'
import { Search } from 'lucide-react'

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

  const [searchQuery, setSearchQuery] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const data = await apiClients.getAllClients()
      setItems(Array.isArray(data) ? (data as Client[]) : [])
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

  const filteredItems = useMemo(() => {
    return items.filter((c) => {
      if (!searchQuery) return true
      const q = searchQuery.toLowerCase()
      return (
        (c.companyName || '').toLowerCase().includes(q) ||
        (c.contactName || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q)
      )
    })
  }, [items, searchQuery])

  return (
    <div className="bg-white rounded-xl shadow-sm border border-border">
      <div className="p-5 border-b border-border space-y-4">
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
          <h2 className="text-xl font-semibold text-foreground">Clients</h2>
          <Button onClick={handleCreateClick} className="w-full sm:w-auto">New Client</Button>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 items-center">
          <div className="relative w-full sm:w-auto flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Search clients..." 
              className="pl-9 h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      <ClientFormModal open={modalOpen} onClose={() => setModalOpen(false)} onSave={handleSave} initial={editing} />
      <ClientServicesModal open={servicesOpen} clientId={selectedClientId} onClose={() => setServicesOpen(false)} onUpdated={() => void load()} />

      <div className="p-0 overflow-x-auto">
        {loading ? (
          <div className="py-12 text-center text-muted-foreground">Loading clients...</div>
        ) : filteredItems.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-muted-foreground">No clients found matching your search.</p>
            {searchQuery && (
              <Button 
                variant="link" 
                onClick={() => setSearchQuery('')}
                className="mt-2 text-primary"
              >
                Clear search
              </Button>
            )}
          </div>
        ) : (
          <table className="w-full text-left whitespace-nowrap">
            <thead>
              <tr className="bg-muted/30">
                <th className="py-3 px-5 font-medium text-muted-foreground text-sm">Company Name</th>
                <th className="py-3 px-5 font-medium text-muted-foreground text-sm">Contact Name</th>
                <th className="py-3 px-5 font-medium text-muted-foreground text-sm">Email</th>
                <th className="py-3 px-5 font-medium text-muted-foreground text-sm">Phone</th>
                <th className="py-3 px-5 w-0"></th>
                <th className="py-3 px-5 w-0"></th>
                <th className="py-3 px-5 w-0"></th>
                <th className="py-3 px-5 w-0"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredItems.map((c) => (
                <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                  <td className="py-3 px-5 font-medium text-foreground">{c.companyName ?? '—'}</td>
                  <td className="py-3 px-5 text-muted-foreground">{c.contactName ?? '—'}</td>
                  <td className="py-3 px-5 text-muted-foreground">{c.email ?? '—'}</td>
                  <td className="py-3 px-5 text-muted-foreground">{c.mobile ?? '—'}</td>
                  <td className="py-3 px-1 text-right">
                    <Button variant="default" size="sm" onClick={() => handleViewServices(c)}>Services</Button>
                  </td>
                  <td className="py-3 px-1 text-right">
                    <Button variant="outline" size="sm" onClick={() => handleEditClick(c)}>Edit</Button>
                  </td>
                  <td className="py-3 px-1 text-right">
                    <Button variant="secondary" size="sm" onClick={() => handleSendResetEmail(c)}>Send Reset Email</Button>
                  </td>
                  <td className="py-3 px-2 pr-5 text-right">
                    <Button variant="destructive" size="sm" onClick={() => handleDelete(c)}>Delete</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
