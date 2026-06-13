import { useEffect, useState } from 'react'
import { warehouseLocations as api } from '@/api'
import { Button, Input, Select } from '@/components/Shared Components'
import WarehouseLocationFormModal from './WarehouseLocationFormModal'
import type { WarehouseLocation, WarehouseLocationClass } from '@/api/warehouseLocations'


type ClassDraft = {
  name: string
  description: string
  parentClassId: string
}

export default function WarehouseLocationList() {
  const [items, setItems] = useState<WarehouseLocation[]>([])
  const [classes, setClasses] = useState<WarehouseLocationClass[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<WarehouseLocation | null>(null)
  const [editingClassId, setEditingClassId] = useState<string | null>(null)
  const [classDraft, setClassDraft] = useState<ClassDraft>({
    name: '',
    description: '',
    parentClassId: '',
  })
  const [classSaving, setClassSaving] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [locationData, classData] = await Promise.all([
        api.getAllWarehouseLocations(),
        api.getAllWarehouseLocationClasses(),
      ])

      setItems(Array.isArray(locationData) ? locationData : [])
      setClasses(Array.isArray(classData) ? classData : [])
    } catch (e: any) {
      setItems([])
      setClasses([])
      setError(e?.response?.data?.error || e?.message || 'Failed to load warehouse module data.')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateClick = () => {
    setEditing(null)
    setModalOpen(true)
  }

  const handleEditClick = (s: WarehouseLocation) => {
    setEditing(s)
    setModalOpen(true)
  }

  const handleSave = async (
    payload: { locationName: string; locationClassId: string; parentLocationId?: string | null },
    id?: string,
  ) => {
    if (id) {
      await api.updateWarehouseLocation(id, payload)
    } else {
      await api.createWarehouseLocation(payload)
    }
    await load()
  }

  const handleSaveClass = async () => {
    if (!classDraft.name.trim()) {
      alert('Class name is required.')
      return
    }

    setClassSaving(true)
    try {
      if (editingClassId) {
        await api.updateWarehouseLocationClass(editingClassId, {
          name: classDraft.name.trim(),
          description: classDraft.description.trim() || undefined,
          parentClassId: classDraft.parentClassId || null,
        })
        setEditingClassId(null)
      } else {
        await api.createWarehouseLocationClass({
          name: classDraft.name.trim(),
          description: classDraft.description.trim() || undefined,
          parentClassId: classDraft.parentClassId || null,
        })
      }
      setClassDraft({ name: '', description: '', parentClassId: '' })
      await load()
    } catch (e) {
      alert((e as any)?.response?.data?.error || (e as any)?.message || 'Failed to save class')
    } finally {
      setClassSaving(false)
    }
  }

  const handleEditClassClick = (klass: WarehouseLocationClass) => {
    setEditingClassId(klass.id)
    setClassDraft({
      name: klass.name,
      description: klass.description || '',
      parentClassId: klass.parentClassId || '',
    })
  }

  const handleCancelClassEdit = () => {
    setEditingClassId(null)
    setClassDraft({ name: '', description: '', parentClassId: '' })
  }

  const handleDeleteClass = async (klass: WarehouseLocationClass) => {
    if (!confirm(`Delete location class ${klass.name}?`)) return
    try {
      await api.deleteWarehouseLocationClass(klass.id)
      await load()
    } catch (e) {
      alert((e as any)?.response?.data?.error || (e as any)?.message || 'Failed to delete class')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const handleDelete = async (s: WarehouseLocation) => {
    const label = s.locationName || 'this location'
    if (!confirm(`Delete location ${label}?`)) return
    try {
      await api.deleteWarehouseLocation(s.id)
      await load()
    } catch (e) {
      alert((e as any)?.message || 'Failed to delete location')
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl p-4 shadow">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-medium">Warehouse Setup Flow</h2>
            <p className="text-sm text-slate-500 mt-1">Step 1: Create classes. Step 2: Create locations under those classes.</p>
          </div>
        </div>

        {error ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <h3 className="text-base font-semibold mb-3">Step 1: Location Classes</h3>
          <div className="grid gap-2 md:grid-cols-[1.2fr_1.5fr_1.2fr_auto_auto] md:items-center">
            <Input
              placeholder="Class name (e.g. Zone, Aisle, Shelf)"
              value={classDraft.name}
              onChange={(e) => setClassDraft((s) => ({ ...s, name: e.target.value }))}
              disabled={classSaving}
            />
            <Input
              placeholder="Description (optional)"
              value={classDraft.description}
              onChange={(e) => setClassDraft((s) => ({ ...s, description: e.target.value }))}
              disabled={classSaving}
            />
            <Select
              value={classDraft.parentClassId}
              onChange={(e) => setClassDraft((s) => ({ ...s, parentClassId: e.target.value }))}
              disabled={classSaving}
            >
              <option value="">No parent class</option>
              {classes
                .filter((klass) => klass.id !== editingClassId)
                .map((klass) => (
                  <option key={klass.id} value={klass.id}>{klass.name}</option>
                ))}
            </Select>
            <Button onClick={handleSaveClass} disabled={classSaving}>
              {editingClassId ? (classSaving ? 'Saving...' : 'Save Class') : (classSaving ? 'Saving...' : 'Add Class')}
            </Button>
            {editingClassId && (
              <Button variant="secondary" onClick={handleCancelClassEdit} disabled={classSaving}>
                Cancel
              </Button>
            )}
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="py-2">Class</th>
                  <th className="py-2">Parent Class</th>
                  <th className="py-2">Description</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {classes.map((klass) => {
                  const parentClass = classes.find((c) => c.id === klass.parentClassId)
                  return (
                    <tr key={klass.id} className="border-t">
                      <td className="py-2 font-medium">{klass.name}</td>
                      <td className="py-2">{parentClass?.name || '—'}</td>
                      <td className="py-2 text-slate-600">{klass.description || '—'}</td>
                      <td className="py-2 text-right">
                        <Button variant="ghost" size="sm" onClick={() => handleEditClassClick(klass)}>
                          Edit
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => handleDeleteClass(klass)} className="ml-2">
                          Delete
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 shadow">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold">Step 2: Warehouse Locations</h3>
            <p className="text-sm text-slate-500 mt-1">Create physical locations and map each to a class and optional parent.</p>
          </div>
          <Button onClick={handleCreateClick} disabled={classes.length === 0}>New Location</Button>
        </div>
      <WarehouseLocationFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        initial={editing}
        classes={classes}
        locations={items}
      />

      {loading ? (
        <div>Loading…</div>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="py-2">Location</th>
              <th className="py-2">Class</th>
              <th className="py-2">Parent</th>
              <th className="py-2">Path</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id} className="border-t">
                <td className="py-2">{s.locationName ?? '—'}</td>
                <td className="py-2">{s.locationClass?.name ?? '—'}</td>
                <td className="py-2">{s.parentLocation?.locationName ?? '—'}</td>
                <td className="py-2">{s.materializedPath ?? '—'}</td>
                <td className="py-2">
                  <Button variant="ghost" size="sm" onClick={() => handleEditClick(s)}>
                    Edit
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => handleDelete(s)} className="ml-2">
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      </div>
    </div>
  )
}
