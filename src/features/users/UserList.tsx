import { useEffect, useState, useMemo } from 'react'
import { users as apiUsers, auth as apiAuth } from '@/api'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/Shared Components'
import { Search, Pencil, KeyRound, Trash2, UserX, UserCheck } from 'lucide-react'
import type { User } from './types'
import UserFormModal from './UserFormModal'
import { useAuthStore } from '@/stores/auth'
import { useFeedback } from '@/hooks/useFeedback'

type ConfirmAction = 'delete' | 'toggleActive' | 'resetEmail'

export default function UserList() {
  const { dialog, showError, showMessage, showSuccess } = useFeedback()

  const [items, setItems] = useState<User[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const currentUserId = useAuthStore((s) => s.userId)

  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [confirmUser, setConfirmUser] = useState<User | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  // Filtering and Search State
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  const load = async () => {
    setLoading(true)
    try {
      const data = await apiUsers.getAllUsers()
      setItems(Array.isArray(data) ? data : [])
    } catch (e) {
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  const handleCreateClick = () => {
    setEditing(null)
    setModalOpen(true)
  }

  const handleEditClick = (u: User) => {
    setEditing(u)
    setModalOpen(true)
  }

  const handleSave = async (payload: { firstName: string; lastName: string; email: string; username?: string | null; role: string }, id?: string) => {
    const cleanPayload = {
      firstName: payload.firstName,
      lastName: payload.lastName,
      email: payload.email,
      role: payload.role,
      username: payload.username ?? undefined,
    }
    if (id) {
      await apiUsers.updateUser(id, cleanPayload)
    } else {
      await apiUsers.addUser(cleanPayload)
    }
    await load()
  }

  useEffect(() => {
    void load()
  }, [])

  const closeConfirmModal = () => {
    if (actionLoading) return
    setConfirmAction(null)
    setConfirmUser(null)
  }

  const openConfirm = (action: ConfirmAction, user: User) => {
    setConfirmUser(user)
    setConfirmAction(action)
  }

  const handleDelete = (u: User) => {
    openConfirm('delete', u)
  }

  const handleToggleActive = (u: User) => {
    if (!u.hasPassword) {
      showMessage('Cannot change active state until this user has completed their password setup.')
      return
    }
    openConfirm('toggleActive', u)
  }

  const handleSendResetEmail = (u: User) => {
    if (!currentUserId) {
      showMessage('Missing logged-in admin id. Please sign in again.')
      return
    }
    openConfirm('resetEmail', u)
  }

  const executeConfirmAction = async () => {
    if (!confirmAction || !confirmUser) return

    setActionLoading(true)
    try {
      if (confirmAction === 'delete') {
        if (apiUsers.deleteUser) {
          await apiUsers.deleteUser(confirmUser.id)
        } else {
          const httpClient = (await import('@/api/http-client')).default
          await httpClient({ method: 'DELETE', url: `/api/users/${confirmUser.id}` })
        }
        await load()
      } else if (confirmAction === 'toggleActive') {
        await apiUsers.updateUser(confirmUser.id, { isActive: !confirmUser.isActive })
        await load()
      } else if (confirmAction === 'resetEmail') {
        if (!currentUserId) {
          showMessage('Missing logged-in admin id. Please sign in again.')
          return
        }
        await apiAuth.resetPasswordForUser({ adminId: currentUserId, userId: confirmUser.id })
        showSuccess('Password reset email sent successfully.')
      }

      setConfirmAction(null)
      setConfirmUser(null)
    } catch (e) {
      if (confirmAction === 'delete') {
        showError(e, 'Unable to delete user')
      } else if (confirmAction === 'resetEmail') {
        showError(e, 'Unable to send reset email')
      } else {
        // Was a silent catch: the server refuses this with a reason — for
        // instance an account that has not completed password setup — and
        // swallowing it left the toggle looking broken.
        showError(e, 'Could not change that user\'s active state')
      }
    } finally {
      setActionLoading(false)
    }
  }

  const confirmUserLabel =
    confirmUser
      ? `${confirmUser.firstName || ''} ${confirmUser.lastName || ''}`.trim() || confirmUser.email || 'this user'
      : ''

  const confirmModalTitle =
    confirmAction === 'delete'
      ? 'Delete User'
      : confirmAction === 'toggleActive'
        ? confirmUser?.isActive
          ? 'Deactivate User'
          : 'Activate User'
        : confirmAction === 'resetEmail'
          ? 'Send Reset Email'
          : ''

  const confirmModalDescription =
    confirmAction === 'delete'
      ? 'This action cannot be undone.'
      : confirmAction === 'toggleActive'
        ? confirmUser?.isActive
          ? 'The user will no longer be able to sign in.'
          : 'The user will be able to sign in again.'
        : confirmAction === 'resetEmail'
          ? 'A password reset link will be emailed to this user.'
          : undefined

  const confirmModalBody =
    confirmAction === 'delete'
      ? `Are you sure you want to delete user ${confirmUserLabel}?`
      : confirmAction === 'toggleActive'
        ? `${confirmUser?.isActive ? 'Deactivate' : 'Activate'} user ${confirmUserLabel}?`
        : confirmAction === 'resetEmail'
          ? `Send reset-password email to ${confirmUserLabel}?`
          : ''

  const confirmButtonLabel =
    confirmAction === 'delete'
      ? actionLoading
        ? 'Deleting…'
        : 'Delete'
      : confirmAction === 'toggleActive'
        ? actionLoading
          ? 'Saving…'
          : confirmUser?.isActive
            ? 'Deactivate'
            : 'Activate'
        : confirmAction === 'resetEmail'
          ? actionLoading
            ? 'Sending…'
            : 'Send Email'
          : 'Confirm'

  const confirmButtonVariant =
    confirmAction === 'delete' || (confirmAction === 'toggleActive' && confirmUser?.isActive)
      ? 'destructive'
      : 'default'

  const filteredItems = useMemo(() => {
    return items.filter((u) => u.role !== 'client').filter((u) => {
      const matchesSearch = !searchQuery || 
        `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (u.username || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (u.email || '').toLowerCase().includes(searchQuery.toLowerCase())

      const matchesRole = roleFilter === 'all' || u.role === roleFilter

      let status = 'pending'
      if (u.hasPassword) {
        status = u.isActive ? 'active' : 'deactivated'
      }
      const matchesStatus = statusFilter === 'all' || status === statusFilter

      return matchesSearch && matchesRole && matchesStatus
    })
  }, [items, searchQuery, roleFilter, statusFilter])

  return (
    <>
    <div className="bg-white rounded-xl shadow-sm border border-border">
      <div className="p-5 border-b border-border space-y-4">
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
          <h2 className="text-xl font-semibold text-foreground">Users</h2>
          <Button onClick={handleCreateClick} className="w-full sm:w-auto">New User</Button>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 items-center">
          <div className="relative w-full sm:w-auto flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Search users..." 
              className="pl-9 h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <div className="flex gap-3 w-full sm:w-auto">
            <select 
              className="h-9 w-full sm:w-auto rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <option value="all">All Roles</option>
              <option value="admin">Admin</option>
              <option value="employee">Employee</option>
            </select>

            <select 
              className="h-9 w-full sm:w-auto rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="pending">Pending Setup</option>
              <option value="deactivated">Deactivated</option>
            </select>
          </div>
        </div>
      </div>

      <UserFormModal open={modalOpen} onClose={() => setModalOpen(false)} onSave={handleSave} initial={editing} />

      <Modal
        open={Boolean(confirmAction && confirmUser)}
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
              variant={confirmButtonVariant}
              onClick={() => void executeConfirmAction()}
              disabled={actionLoading}
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
          <div className="py-12 text-center text-muted-foreground">Loading users...</div>
        ) : filteredItems.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-muted-foreground">No users found matching your filters.</p>
            {(searchQuery || roleFilter !== 'all' || statusFilter !== 'all') && (
              <Button 
                variant="link" 
                onClick={() => { setSearchQuery(''); setRoleFilter('all'); setStatusFilter('all'); }}
                className="mt-2 text-primary"
              >
                Clear all filters
              </Button>
            )}
          </div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border">
                <th className="py-3 px-5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Name</th>
                <th className="py-3 px-5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Username</th>
                <th className="py-3 px-5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Email</th>
                <th className="py-3 px-5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Role</th>
                <th className="py-3 px-5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
                <th className="py-3 px-5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground text-right w-[1%] whitespace-nowrap">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredItems.map((u) => {
                const isPending = !u.hasPassword
                const statusText = isPending ? 'Pending' : (u.isActive ? 'Active' : 'Deactivated')
                const statusClass = isPending
                  ? 'bg-amber-50 text-amber-700 ring-amber-200/80'
                  : u.isActive
                    ? 'bg-emerald-50 text-emerald-700 ring-emerald-200/80'
                    : 'bg-slate-100 text-slate-600 ring-slate-200/80'
                const roleClass =
                  u.role === 'admin'
                    ? 'bg-violet-50 text-violet-700 ring-violet-200/80'
                    : 'bg-sky-50 text-sky-700 ring-sky-200/80'

                return (
                  <tr key={u.id} className="group transition-colors hover:bg-slate-50/80">
                    <td className="py-3.5 px-5">
                      <div className="font-medium text-foreground leading-tight">
                        {(u.firstName || '') + ' ' + (u.lastName || '')}
                      </div>
                    </td>
                    <td className="py-3.5 px-5 text-sm text-muted-foreground tabular-nums">
                      {u.username ?? '—'}
                    </td>
                    <td className="py-3.5 px-5 text-sm text-muted-foreground">
                      {u.email ?? '—'}
                    </td>
                    <td className="py-3.5 px-5">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${roleClass}`}>
                        {u.role ?? '—'}
                      </span>
                    </td>
                    <td className="py-3.5 px-5">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statusClass}`}>
                        {statusText}
                      </span>
                    </td>
                    <td className="py-3.5 px-5">
                      <div className="flex justify-end">
                        <div className="inline-flex items-center gap-0.5 rounded-lg border border-border/80 bg-white p-0.5 shadow-sm">
                          <button
                            type="button"
                            title="Edit user"
                            aria-label="Edit user"
                            onClick={() => handleEditClick(u)}
                            className="inline-flex size-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
                          >
                            <Pencil className="size-3.5" strokeWidth={1.75} />
                          </button>
                          <button
                            type="button"
                            title="Send password reset email"
                            aria-label="Send password reset email"
                            onClick={() => handleSendResetEmail(u)}
                            className="inline-flex size-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
                          >
                            <KeyRound className="size-3.5" strokeWidth={1.75} />
                          </button>
                          <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
                          {isPending ? (
                            <button
                              type="button"
                              title="Delete pending user"
                              aria-label="Delete pending user"
                              onClick={() => handleDelete(u)}
                              className="inline-flex size-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600"
                            >
                              <Trash2 className="size-3.5" strokeWidth={1.75} />
                            </button>
                          ) : u.isActive ? (
                            <button
                              type="button"
                              title="Deactivate user"
                              aria-label="Deactivate user"
                              onClick={() => handleToggleActive(u)}
                              className="inline-flex size-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600"
                            >
                              <UserX className="size-3.5" strokeWidth={1.75} />
                            </button>
                          ) : (
                            <button
                              type="button"
                              title="Activate user"
                              aria-label="Activate user"
                              onClick={() => handleToggleActive(u)}
                              className="inline-flex size-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-emerald-50 hover:text-emerald-600"
                            >
                              <UserCheck className="size-3.5" strokeWidth={1.75} />
                            </button>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>

      {dialog}
    </>
  )
}
