import { useEffect, useState } from 'react'
import { users as apiUsers, auth as apiAuth } from '@/api'
import { Button } from '@/components/ui/button'
import type { User } from './types'
import UserFormModal from './UserFormModal'
import { useAuthStore } from '@/stores/auth'

export default function UserList() {
  const [items, setItems] = useState<User[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const currentUserId = useAuthStore((s) => s.userId)

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
    if (id) {
      await apiUsers.updateUser(id, payload)
    } else {
      await apiUsers.addUser(payload)
    }
    await load()
  }

  useEffect(() => {
    void load()
  }, [])

  const handleToggleActive = async (u: User) => {
    const makeActive = !u.isActive
    const action = makeActive ? 'Activate' : 'Deactivate'
    if (!confirm(`${action} user ${u.firstName || ''} ${u.lastName || ''}?`)) return
    try {
      await apiUsers.updateUser(u.id, { isActive: makeActive })
      await load()
    } catch (e) {
      // noop
    }
  }

  const handleSendResetEmail = async (u: User) => {
    if (!currentUserId) {
      alert('Missing logged-in admin id. Please sign in again.')
      return
    }

    const userLabel = `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email || 'this user'
    if (!confirm(`Send reset-password email to ${userLabel}?`)) return

    try {
      await apiAuth.resetPasswordForUser({ adminId: currentUserId, userId: u.id })
      alert('Password reset email sent successfully.')
    } catch (e) {
      alert((e as any)?.response?.data?.error || (e as any)?.message || 'Unable to send reset email')
    }
  }

  return (
    <div className="bg-white rounded-xl p-4 shadow">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium">Users</h2>
        <Button onClick={handleCreateClick}>New User</Button>
      </div>
      <UserFormModal open={modalOpen} onClose={() => setModalOpen(false)} onSave={handleSave} initial={editing} />

      {loading ? (
        <div>Loading…</div>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th className="py-2">Name</th>
              <th className="py-2">Username</th>
              <th className="py-2">Email</th>
              <th className="py-2">Role</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((u) => (
              <tr key={u.id} className="border-t">
                <td className="py-2">{(u.firstName || '') + ' ' + (u.lastName || '')}</td>
                <td className="py-2">{u.username ?? '—'}</td>
                <td className="py-2">{u.email ?? '—'}</td>
                <td className="py-2">{u.role ?? '—'}</td>
                <td className="py-2">
                  <Button variant="ghost" size="sm" onClick={() => handleEditClick(u)}>Edit</Button>
                  <Button variant="secondary" size="sm" onClick={() => handleSendResetEmail(u)} className="ml-2">Send Reset Email</Button>
                  <Button variant={u.isActive ? 'destructive' : 'default'} size="sm" onClick={() => handleToggleActive(u)} className="ml-2">{u.isActive ? 'Deactivate' : 'Activate'}</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
