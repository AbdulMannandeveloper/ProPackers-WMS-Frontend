import { useEffect, useState } from 'react'
import { Button, Input, Modal, Select } from '@/components/Shared Components'
import type { WarehouseLocation, WarehouseLocationClass } from '@/api/warehouseLocations'
import { useFeedback } from '@/hooks/useFeedback'

interface Props {
  open: boolean
  onClose: () => void
  onSave: (data: { locationName: string; locationClassId: string; parentLocationId?: string | null }, id?: string) => Promise<void>
  classes: WarehouseLocationClass[]
  locations: WarehouseLocation[]
  initial?: WarehouseLocation | null
  /** Pre-seeds parent + matching child class when adding from the explorer. */
  defaultParentId?: string | null
}

export default function WarehouseLocationFormModal({ open, onClose, onSave, classes, locations, initial, defaultParentId }: Props) {
  const { dialog, showError, showMessage } = useFeedback()

  const [locationName, setLocationName] = useState('')
  const [locationClassId, setLocationClassId] = useState('')
  const [parentLocationId, setParentLocationId] = useState('')
  const [loading, setLoading] = useState(false)

  const selectedClass = classes.find((c) => c.id === locationClassId)
  const requiredParentClass = selectedClass?.parentClassId
    ? classes.find((c) => c.id === selectedClass.parentClassId)
    : null

  const filteredLocations = locations.filter((loc) => {
    if (loc.id === initial?.id) return false
    return selectedClass?.parentClassId ? loc.locationClassId === selectedClass.parentClassId : false
  })

  useEffect(() => {
    if (initial) {
      setLocationName(initial.locationName || '')
      setLocationClassId(initial.locationClassId || '')
      setParentLocationId(initial.parentLocationId || '')
      return
    }

    setLocationName('')

    const parent = defaultParentId ? locations.find((loc) => loc.id === defaultParentId) : null
    const childClass = parent
      ? classes.find((c) => c.parentClassId === parent.locationClassId)
      : null

    setLocationClassId(childClass?.id || classes[0]?.id || '')
    setParentLocationId(childClass ? parent!.id : '')
  }, [initial, open, classes, locations, defaultParentId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!locationName || !locationClassId) {
      showMessage('Location name and class are required')
      return
    }

    if (selectedClass?.parentClassId && !parentLocationId) {
      showMessage(`A parent location of class "${requiredParentClass?.name || 'parent class'}" is required.`)
      return
    }

    setLoading(true)
    try {
      await onSave(
        {
          locationName,
          locationClassId,
          parentLocationId: parentLocationId || null,
        },
        initial?.id,
      )
      onClose()
    } catch (e) {
      showError(e, 'Could not save this location')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? 'Edit Warehouse Location' : 'New Warehouse Location'}
      description='Choose class and optional parent to preserve hierarchy rules.'
      size='md'
      contentClassName='space-y-4'
      footer={
        <div className='flex justify-end gap-2'>
          <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button type="submit" form="warehouse-location-form" disabled={loading}>{loading ? 'Saving...' : 'Save'}</Button>
        </div>
      }
    >
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Location details</div>
        <form id="warehouse-location-form" onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Location name *</label>
            <Input value={locationName} onChange={(e) => setLocationName(e.target.value)} placeholder="e.g. Aisle A, Shelf 3, Bin 12" disabled={loading} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Class *</label>
            <Select
              value={locationClassId}
              onChange={(e) => {
                const newClassId = e.target.value
                setLocationClassId(newClassId)
                const newClassObj = classes.find((c) => c.id === newClassId)
                if (!newClassObj?.parentClassId) {
                  setParentLocationId('')
                } else {
                  const currentParent = locations.find((l) => l.id === parentLocationId)
                  if (currentParent && currentParent.locationClassId !== newClassObj.parentClassId) {
                    setParentLocationId('')
                  }
                }
              }}
              disabled={loading}
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              {!selectedClass?.parentClassId
                ? 'Parent location (not allowed for root class)'
                : `Parent location (required - must be a ${requiredParentClass?.name || 'parent class'})`}
            </label>
            <Select
              value={parentLocationId}
              onChange={(e) => setParentLocationId(e.target.value)}
              disabled={loading || !selectedClass?.parentClassId}
            >
              <option value="">Select a parent...</option>
              {filteredLocations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.locationName}
                </option>
              ))}
            </Select>
            {selectedClass?.parentClassId && filteredLocations.length === 0 && (
              <p className="mt-1 text-xs text-amber-600">
                Warning: No locations of class "{requiredParentClass?.name}" exist yet. Please create a parent location first.
              </p>
            )}
          </div>
        </form>
      </div>
    </Modal>

      {dialog}
    </>
  )
}
