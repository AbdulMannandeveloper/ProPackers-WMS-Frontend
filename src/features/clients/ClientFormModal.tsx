import { useEffect, useState } from 'react'
import { Button, Input, Modal } from '@/components/Shared Components'

interface ClientFormModalProps {
  open: boolean
  onClose: () => void
  onSave: (data: { companyName: string; contactName: string; email: string; mobile?: string; address?: string }, id?: string) => Promise<void>
  initial?: {
    id?: string
    companyName?: string
    contactName?: string
    email?: string
    mobile?: string
    address?: string
  } | null
}

export default function ClientFormModal({ open, onClose, onSave, initial }: ClientFormModalProps) {
  const [companyName, setCompanyName] = useState('')
  const [contactName, setContactName] = useState('')
  const [email, setEmail] = useState('')
  const [mobile, setMobile] = useState('')
  const [address, setAddress] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (initial) {
      setCompanyName(initial.companyName || '')
      setContactName(initial.contactName || '')
      setEmail(initial.email || '')
      setMobile(initial.mobile || '')
      setAddress(initial.address || '')
    } else {
      setCompanyName('')
      setContactName('')
      setEmail('')
      setMobile('')
      setAddress('')
    }
  }, [initial, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!companyName || !contactName || !email) {
      alert('Company name, contact name, and email are required.')
      return
    }

    setLoading(true)
    try {
      await onSave(
        {
          companyName,
          contactName,
          email,
          mobile: mobile || undefined,
          address: address || undefined,
        },
        initial?.id,
      )
      onClose()
    } catch (e) {
      alert((e as any)?.message || 'Failed to save client')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose}>
      <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md">
        <h3 className="text-lg font-semibold mb-4">{initial ? 'Edit Client' : 'New Client'}</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Company Name *</label>
            <Input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Enter company name"
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Contact Name *</label>
            <Input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Enter contact name"
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Email *</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter email"
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Phone</label>
            <Input
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              placeholder="Enter phone number"
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Address</label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Enter address"
              disabled={loading}
            />
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="secondary" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  )
}
