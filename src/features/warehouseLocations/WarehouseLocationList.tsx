import { useEffect, useState } from 'react'
import { Maximize, Minimize } from 'lucide-react'
import { warehouseLocations as api } from '@/api'
import { Button, Input, Select } from '@/components/Shared Components'
import WarehouseLocationFormModal from './WarehouseLocationFormModal'
import WarehouseTree from './WarehouseTree'
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
  const [activeTab, setActiveTab] = useState<'setup' | 'locations'>('setup')
  const [viewMode, setViewMode] = useState<'tree' | 'table'>('tree')
  const [isFullscreen, setIsFullscreen] = useState(false)

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
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      <div className="flex border-b border-slate-200">
        <button
          className={`px-6 py-3 font-medium text-sm transition-colors border-b-2 ${
            activeTab === 'setup'
              ? 'border-primary text-primary'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
          onClick={() => setActiveTab('setup')}
        >
          Warehouse Setup
        </button>
        <button
          className={`px-6 py-3 font-medium text-sm transition-colors border-b-2 ${
            activeTab === 'locations'
              ? 'border-primary text-primary'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
          onClick={() => setActiveTab('locations')}
        >
          Warehouse locations
        </button>
      </div>

      {activeTab === 'setup' && (
        <div className="bg-white rounded-xl p-4 shadow">
          <div className="mb-4">
            <h2 className="text-lg font-medium">Location Classes</h2>
            <p className="text-sm text-slate-500 mt-1">Define the types of locations in your warehouse (e.g. Zone, Floor, Aisle, Shelf).</p>
          </div>

          <div className="grid gap-2 md:grid-cols-[1.2fr_1.5fr_1.2fr_auto_auto] md:items-center bg-slate-50/60 p-4 rounded-xl border border-slate-200">
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
                {classes.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-400">
                      No location classes created yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'locations' && (
        <div className="bg-white rounded-xl p-4 shadow flex flex-col min-h-[600px] h-[calc(100vh-200px)]">
          <div className="flex items-center justify-between mb-4 shrink-0">
            <div>
              <h3 className="text-lg font-medium">Physical Locations Hierarchy</h3>
              <p className="text-sm text-slate-500 mt-1">Interactive org-chart style view of your warehouse layout.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setViewMode(viewMode === 'table' ? 'tree' : 'table')}>
                {viewMode === 'table' ? 'View as Tree' : 'View as Table'}
              </Button>
              <Button onClick={handleCreateClick} disabled={classes.length === 0}>New Location</Button>
            </div>
          </div>

          <WarehouseLocationFormModal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            onSave={handleSave}
            initial={editing}
            classes={classes}
            locations={items}
          />

          <div className={
            viewMode === 'tree' 
              ? isFullscreen 
                ? 'fixed inset-0 z-[100] bg-slate-50 flex flex-col' 
                : 'flex-1 bg-slate-50 border border-slate-200 rounded-xl overflow-hidden relative'
              : 'flex-1 overflow-hidden relative'
          }>
            {viewMode === 'tree' && (
              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="absolute top-4 right-4 z-10 bg-white border border-slate-200 rounded p-2 shadow-sm text-slate-500 hover:text-slate-800"
                title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              >
                {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
              </button>
            )}

            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center text-slate-400">Loading data...</div>
            ) : viewMode === 'tree' ? (
              <WarehouseTree
                locations={items}
                classes={classes}
                onEdit={handleEditClick}
                onDelete={handleDelete}
              />
            ) : (
              <div className="overflow-x-auto">
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
                        <td className="py-2 text-slate-500 text-sm">{s.materializedPath ?? '—'}</td>
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
                    {items.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-400">
                          No locations found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
