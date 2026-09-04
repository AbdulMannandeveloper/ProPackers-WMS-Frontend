import { useEffect, useState, useMemo } from 'react'
import { clients as apiClients, auth as apiAuth } from '@/api'
import ClientServicesModal from './ClientServicesModal'
import BillServiceModal from './BillServiceModal'
import { Button, Modal, Spinner } from '@/components/Shared Components'
import { useAuthStore } from '@/stores/auth'
import ClientFormModal from './ClientFormModal'
import { Search, Briefcase, Pencil, KeyRound, Receipt, Trash2 } from 'lucide-react'
import { useFeedback } from '@/hooks/useFeedback'

type Client = {
  id: string
  companyName?: string
  contactName?: string
  email?: string
  mobile?: string
  address?: string
  userId?: string
}

type ConfirmAction = 'delete' | 'resetEmail'

export default function ClientList() {
  const { dialog, showError, showMessage, showSuccess } = useFeedback()

  const [items, setItems] = useState<Client[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Client | null>(null)
  const [servicesOpen, setServicesOpen] = useState(false)
  const [billOpen, setBillOpen] = useState(false)
  const [billClient, setBillClient] = useState<Client | null>(null)
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const currentUserId = useAuthStore((s) => s.userId)

  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [confirmClient, setConfirmClient] = useState<Client | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

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

  const closeConfirmModal = () => {
    if (actionLoading) return
    setConfirmAction(null)
    setConfirmClient(null)
  }

  const openConfirm = (action: ConfirmAction, client: Client) => {
    setConfirmClient(client)
    setConfirmAction(action)
  }

  const handleDelete = (c: Client) => {
    openConfirm('delete', c)
  }

  const handleViewServices = (c: Client) => {
    setSelectedClientId(c.id)
    setServicesOpen(true)
  }

  /** Charging for work that happened once, as opposed to agreeing its price. */
  const handleBill = (c: Client) => {
    setBillClient(c)
    setBillOpen(true)
  }

  const handleSendResetEmail = (c: Client) => {
    if (!currentUserId) {
      showMessage('Missing logged-in admin id. Please sign in again.')
      return
    }
    if (!c.userId) {
      showMessage('Client user ID not found.')
      return
    }
    openConfirm('resetEmail', c)
  }

  const executeConfirmAction = async () => {
    if (!confirmAction || !confirmClient) return

    setActionLoading(true)
    try {
      if (confirmAction === 'delete') {
        await apiClients.deleteClient(confirmClient.id)
        await load()
      } else if (confirmAction === 'resetEmail') {
        if (!currentUserId) {
          showMessage('Missing logged-in admin id. Please sign in again.')
          return
        }
        if (!confirmClient.userId) {
          showMessage('Client user ID not found.')
          return
        }
        await apiAuth.resetPasswordForUser({ adminId: currentUserId, userId: confirmClient.userId })
        showSuccess('Password reset email sent successfully.')
      }

      setConfirmAction(null)
      setConfirmClient(null)
    } catch (e) {
      if (confirmAction === 'delete') {
        showError(e, 'Could not delete this client')
      } else if (confirmAction === 'resetEmail') {
        showError(e, 'Unable to send reset email')
      }
    } finally {
      setActionLoading(false)
    }
  }

  const confirmClientLabel =
    confirmClient?.companyName || confirmClient?.email || 'this client'

  const confirmModalTitle =
    confirmAction === 'delete'
      ? 'Delete Client'
      : confirmAction === 'resetEmail'
        ? 'Send Reset Email'
        : ''

  const confirmModalDescription =
    confirmAction === 'delete'
      ? 'This action cannot be undone.'
      : confirmAction === 'resetEmail'
        ? 'A password reset link will be emailed to this client.'
        : undefined

  const confirmModalBody =
    confirmAction === 'delete'
      ? `Are you sure you want to delete client ${confirmClientLabel}?`
      : confirmAction === 'resetEmail'
        ? `Send reset-password email to ${confirmClientLabel}?`
        : ''

  const confirmButtonLabel =
    confirmAction === 'delete'
      ? actionLoading
        ? 'Deleting…'
        : 'Delete'
      : confirmAction === 'resetEmail'
        ? actionLoading
          ? 'Sending…'
          : 'Send Email'
        : 'Confirm'

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
    <>
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
            {loading && (
              <span className="pointer-events-none absolute right-2.5 top-2.5 text-muted-foreground">
                <Spinner label="Loading results" />
              </span>
            )}
          </div>
        </div>
      </div>

      <ClientFormModal open={modalOpen} onClose={() => setModalOpen(false)} onSave={handleSave} initial={editing} />
      <BillServiceModal
        open={billOpen}
        clientId={billClient?.id ?? null}
        clientName={billClient?.companyName ?? 'this client'}
        onClose={() => setBillOpen(false)}
        onCharged={(message) => showSuccess(message)}
      />

      <ClientServicesModal open={servicesOpen} clientId={selectedClientId} onClose={() => setServicesOpen(false)} onUpdated={() => void load()} />

      <Modal
        open={Boolean(confirmAction && confirmClient)}
        onClose={closeConfirmModal}
        title={confirmModalTitle}
        description={confirmModalDescription}
        size="sm"
        closeOnBackdropClick={!actionLoading}
        closeOnEsc={!actionLoading}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeConfirmModal} disabled={actionLoading}>
              Cancel
            </Button>
            <Button
              variant={confirmAction === 'delete' ? 'destructive' : 'default'}
              onClick={() => void executeConfirmAction()}
              loading={actionLoading}
            >
              {confirmButtonLabel}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">{confirmModalBody}</p>
      </Modal>

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
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border">
                <th className="py-3 px-5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Company Name</th>
                <th className="py-3 px-5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Contact Name</th>
                <th className="py-3 px-5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Email</th>
                <th className="py-3 px-5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Phone</th>
                <th className="py-3 px-5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground text-right w-[1%] whitespace-nowrap">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredItems.map((c) => (
                <tr key={c.id} className="group transition-colors hover:bg-slate-50/80">
                  <td className="py-3.5 px-5 font-medium text-foreground">{c.companyName ?? '—'}</td>
                  <td className="py-3.5 px-5 text-sm text-muted-foreground">{c.contactName ?? '—'}</td>
                  <td className="py-3.5 px-5 text-sm text-muted-foreground">{c.email ?? '—'}</td>
                  <td className="py-3.5 px-5 text-sm text-muted-foreground">{c.mobile ?? '—'}</td>
                  <td className="py-3.5 px-5">
                    <div className="flex justify-end">
                      <div className="inline-flex items-center gap-0.5 rounded-lg border border-border/80 bg-white p-0.5 shadow-sm">
                        <button
                          type="button"
                          title="Manage services"
                          aria-label="Manage services"
                          onClick={() => handleViewServices(c)}
                          className="icon-action text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                        >
                          <Briefcase className="size-3.5" strokeWidth={1.75} />
                        </button>
                        <button
                          type="button"
                          title="Bill for a service"
                          aria-label={`Bill ${c.companyName} for a service`}
                          onClick={() => handleBill(c)}
                          className="icon-action text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                        >
                          <Receipt className="size-3.5" strokeWidth={1.75} />
                        </button>
                        <button
                          type="button"
                          title="Edit client"
                          aria-label="Edit client"
                          onClick={() => handleEditClick(c)}
                          className="icon-action text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                        >
                          <Pencil className="size-3.5" strokeWidth={1.75} />
                        </button>
                        <button
                          type="button"
                          title="Send password reset email"
                          aria-label="Send password reset email"
                          onClick={() => handleSendResetEmail(c)}
                          className="icon-action text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                        >
                          <KeyRound className="size-3.5" strokeWidth={1.75} />
                        </button>
                        <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
                        <button
                          type="button"
                          title="Delete client"
                          aria-label="Delete client"
                          onClick={() => handleDelete(c)}
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
        )}
      </div>
    </div>

      {dialog}
    </>
  )
}
