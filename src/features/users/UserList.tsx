import { useEffect, useState, useMemo } from 'react'
import { users as apiUsers, auth as apiAuth } from '@/api'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/Shared Components'
import { Search } from 'lucide-react'
import type { User } from './types'
import UserFormModal from './UserFormModal'
import { useAuthStore } from '@/stores/auth'

type ConfirmAction = 'delete' | 'toggleActive' | 'resetEmail'

export default function UserList() {
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
    if (!u.passwordHash) {
      alert('Cannot change active state until this user has completed their password setup.')
      return
    }
    openConfirm('toggleActive', u)
  }

  const handleSendResetEmail = (u: User) => {
    if (!currentUserId) {
      alert('Missing logged-in admin id. Please sign in again.')
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
          alert('Missing logged-in admin id. Please sign in again.')
          return
        }
        await apiAuth.resetPasswordForUser({ adminId: currentUserId, userId: confirmUser.id })
        alert('Password reset email sent successfully.')
      }

      setConfirmAction(null)
      setConfirmUser(null)
    } catch (e) {
      if (confirmAction === 'delete') {
        alert((e as any)?.response?.data?.error || (e as any)?.message || 'Unable to delete user')
      } else if (confirmAction === 'resetEmail') {
        alert((e as any)?.response?.data?.error || (e as any)?.message || 'Unable to send reset email')
      }
      // toggleActive: keep silent catch behavior from before
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
      if (u.passwordHash) {
        status = u.isActive ? 'active' : 'deactivated'
      }
      const matchesStatus = statusFilter === 'all' || status === statusFilter

      return matchesSearch && matchesRole && matchesStatus
    })
  }, [items, searchQuery, roleFilter, statusFilter])

  return (
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
          <table className="w-full text-left whitespace-nowrap">
            <thead>
              <tr className="bg-muted/30">
                <th className="py-3 px-5 font-medium text-muted-foreground text-sm">Name</th>
                <th className="py-3 px-5 font-medium text-muted-foreground text-sm">Username</th>
                <th className="py-3 px-5 font-medium text-muted-foreground text-sm">Email</th>
                <th className="py-3 px-5 font-medium text-muted-foreground text-sm">Role</th>
                <th className="py-3 px-5 font-medium text-muted-foreground text-sm">Status</th>
                <th className="py-3 px-5 w-0"></th>
                <th className="py-3 px-5 w-0"></th>
                <th className="py-3 px-5 w-0"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredItems.map((u) => {
                const isPending = !u.passwordHash
                const statusColor = isPending ? 'bg-amber-100 text-amber-700 border-amber-200' : (u.isActive ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-red-100 text-red-700 border-red-200')
                const statusText = isPending ? 'Pending' : (u.isActive ? 'Active' : 'Deactivated')
                
                const roleColor = u.role === 'admin' ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-blue-100 text-blue-700 border-blue-200'

                return (
                  <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-3 px-5 font-medium text-foreground">
                      {(u.firstName || '') + ' ' + (u.lastName || '')}
                    </td>
                    <td className="py-3 px-5 text-muted-foreground">{u.username ?? '—'}</td>
                    <td className="py-3 px-5 text-muted-foreground">{u.email ?? '—'}</td>
                    <td className="py-3 px-5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border capitalize ${roleColor}`}>
                        {u.role ?? '—'}
                      </span>
                    </td>
                    <td className="py-3 px-5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${statusColor}`}>
                        {statusText}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-right">
                      <Button variant="ghost" size="sm" onClick={() => handleEditClick(u)}>Edit</Button>
                    </td>
                    <td className="py-3 px-2 text-right">
                      <Button variant="secondary" size="sm" onClick={() => handleSendResetEmail(u)}>Send Reset Email</Button>
                    </td>
                    <td className="py-3 px-2 pr-5 text-right">
                      {isPending ? (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(u)}
                          title="User has not set up password. Click to delete."
                        >
                          Delete
                        </Button>
                      ) : (
                        <Button
                          variant={u.isActive ? 'destructive' : 'default'}
                          size="sm"
                          onClick={() => handleToggleActive(u)}
                        >
                          {u.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
