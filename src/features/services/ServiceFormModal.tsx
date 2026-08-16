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
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? 'Edit Service' : 'New Service'}
      description="Define the service description, idea price, and billing unit."
      size="sm"
      closeOnBackdropClick={!loading}
      closeOnEsc={!loading}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" form="service-form" disabled={loading}>
            {loading ? 'Saving…' : 'Save'}
          </Button>
        </div>
      }
    >
      <form id="service-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Description *</label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Enter service description"
            disabled={loading}
            className="h-9 rounded-lg"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Idea Price (£) *</label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={ideaPrice}
            onChange={(e) => setIdeaPrice(e.target.value)}
            placeholder="0.00"
            disabled={loading}
            className="h-9 rounded-lg"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Unit *</label>
          <Input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="e.g. hourly, item, package"
            disabled={loading}
            className="h-9 rounded-lg"
          />
        </div>
      </form>
    </Modal>
  )
}
