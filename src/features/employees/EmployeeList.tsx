import { useEffect, useState } from 'react'
import { employees as apiEmployees } from '@/api'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth'
import type { Employee } from '@/api/types'
import { useFeedback } from '@/hooks/useFeedback'

export default function EmployeeList() {
  const { dialog, showError, showMessage } = useFeedback()

  const [items, setItems] = useState<Employee[]>([])
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')

  const adminId = useAuthStore((s) => s.userId)

  const load = async () => {
    setLoading(true)
    try {
      const data = await apiEmployees.getAllEmployees()
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
    if (!adminId) return showMessage('You must be signed in as admin to create employees.')
    try {
      await apiEmployees.addEmployee({ adminId, firstName, lastName, email })
      setShowCreate(false)
      setFirstName('')
      setLastName('')
      setEmail('')
      await load()
    } catch (err: any) {
      showError(err, 'Could not create this employee')
    }
  }

  return (
    <>
    <div className="bg-white rounded-xl p-4 shadow">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium">Employees</h2>
        <Button onClick={() => setShowCreate(true)}>New Employee</Button>
      </div>

      {loading ? (
        <div>Loading…</div>
      ) : (
        <ul className="space-y-2">
          {items.map((c) => (
            <li key={c.id} className="border p-2 rounded">
              <div className="font-medium">{c.jobTitle ?? 'Employee'}</div>
              <div className="text-sm text-muted-foreground">{c.email ?? '—'}</div>
            </li>
          ))}
        </ul>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center">
          <div className="bg-white p-6 rounded shadow-md w-full max-w-md">
            <h3 className="text-lg font-medium mb-4">Create Employee</h3>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="block text-sm">First name</label>
                <input className="mt-1 block w-full border rounded p-2" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm">Last name</label>
                <input className="mt-1 block w-full border rounded p-2" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm">Email</label>
                <input className="mt-1 block w-full border rounded p-2" value={email} onChange={(e) => setEmail(e.target.value)} />
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

      {dialog}
    </>
  )
}
