import { useEffect, useState } from 'react'
import { users as apiUsers } from '@/api'
import { Button } from '@/components/ui/button'

type User = {
  id: string
  email?: string
  name?: string
  role?: string
}

export default function UserList() {
  const [items, setItems] = useState<User[]>([])
  const [loading, setLoading] = useState(false)

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

  useEffect(() => {
    void load()
  }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('Delete user?')) return
    try {
      await apiUsers.deleteUser(id)
      await load()
    } catch (e) {
      // noop
    }
  }

  return (
    <div className="bg-white rounded-xl p-4 shadow">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium">Users</h2>
        <Button onClick={() => alert('Create user flow (not implemented)')}>New User</Button>
      </div>

      {loading ? (
        <div>Loading…</div>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th className="py-2">Name</th>
              <th className="py-2">Email</th>
              <th className="py-2">Role</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((u) => (
              <tr key={u.id} className="border-t">
                <td className="py-2">{u.name ?? '—'}</td>
                <td className="py-2">{u.email ?? '—'}</td>
                <td className="py-2">{u.role ?? '—'}</td>
                <td className="py-2">
                  <Button variant="ghost" size="sm" onClick={() => alert('Edit user (not implemented)')}>Edit</Button>
                  <Button variant="destructive" size="sm" onClick={() => handleDelete(u.id)} className="ml-2">Delete</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
