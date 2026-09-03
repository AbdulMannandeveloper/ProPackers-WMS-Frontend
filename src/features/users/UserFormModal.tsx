import { useEffect, useState } from 'react'
import { Modal, Input, Button } from '@/components/Shared Components'
import type { User } from './types'
import { useFeedback } from '@/hooks/useFeedback'

type Props = {
  open: boolean
  onClose: () => void
  onSave: (payload: { firstName: string; lastName: string; email: string; username?: string | null; role: string }, id?: string) => Promise<void>
  initial?: User | null
}

export default function UserFormModal({ open, onClose, onSave, initial }: Props) {
  const { dialog, showError, showMessage } = useFeedback()

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState<string | undefined>(undefined)
  const [role, setRole] = useState('employee')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (initial) {
      setFirstName(initial.firstName || '')
      setLastName(initial.lastName || '')
      setEmail(initial.email || '')
      setUsername(initial.username ?? undefined)
      setRole(initial.role || 'employee')
    } else {
      setFirstName('')
      setLastName('')
      setEmail('')
      setUsername(undefined)
      setRole('employee')
    }
  }, [initial, open])

  const submit = async () => {
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      showMessage('First name, last name and email are required')
      return
    }

    setSaving(true)
    try {
      await onSave({ firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), username: username?.trim() || undefined, role }, initial?.id)
      onClose()
    } catch (e) {
      showError(e, 'Unable to save this user')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
    <Modal open={open} onClose={onClose} title={initial ? 'Edit User' : 'New User'} size="md">
      <div className="grid grid-cols-1 gap-3">
        <label className="text-sm">First name</label>
        <Input value={firstName} onChange={(e) => setFirstName((e.target as HTMLInputElement).value)} />

        <label className="text-sm">Last name</label>
        <Input value={lastName} onChange={(e) => setLastName((e.target as HTMLInputElement).value)} />

        <label className="text-sm">Email</label>
        <Input value={email} onChange={(e) => setEmail((e.target as HTMLInputElement).value)} type="email" />

        <label className="text-sm">Username (optional)</label>
        <Input value={username ?? ''} onChange={(e) => setUsername((e.target as HTMLInputElement).value || undefined)} />

        <label className="text-sm">Role</label>
        <select className="rounded-xl border px-3 py-2" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="employee">Employee</option>
          <option value="admin">Admin</option>
        </select>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} loading={saving}>{saving ? 'Saving…' : 'Save'}</Button>
      </div>
    </Modal>

      {dialog}
    </>
  )
}
