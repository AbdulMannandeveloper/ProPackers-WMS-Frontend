import { useEffect, useState } from 'react'
import { Button, Input, Modal } from '@/components/Shared Components'

interface ServiceFormModalProps {
  open: boolean
  onClose: () => void
  onSave: (data: { description: string; ideaPrice: number; unit: string }, id?: string) => Promise<void>
  initial?: {
    id?: string
    description?: string
    ideaPrice?: number
    unit?: string
  } | null
}

export default function ServiceFormModal({ open, onClose, onSave, initial }: ServiceFormModalProps) {
  const [description, setDescription] = useState('')
  const [ideaPrice, setIdeaPrice] = useState('')
  const [unit, setUnit] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (initial) {
      setDescription(initial.description || '')
      setIdeaPrice(initial.ideaPrice?.toString() || '')
      setUnit(initial.unit || '')
    } else {
      setDescription('')
      setIdeaPrice('')
      setUnit('')
    }
  }, [initial, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!description || !ideaPrice || !unit) {
      alert('Description, price, and unit are required.')
      return
    }

    setLoading(true)
    try {
      await onSave(
        {
          description,
          ideaPrice: Number(ideaPrice),
          unit,
        },
        initial?.id,
      )
      onClose()
    } catch (e) {
      alert((e as any)?.message || 'Failed to save service')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose}>
      <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md">
        <h3 className="text-lg font-semibold mb-4">{initial ? 'Edit Service' : 'New Service'}</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Description *</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter service description"
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Idea Price *</label>
            <Input
              type="number"
              step="0.01"
              value={ideaPrice}
              onChange={(e) => setIdeaPrice(e.target.value)}
              placeholder="Enter price"
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Unit *</label>
            <Input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="Enter unit (e.g., hourly, item)"
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
