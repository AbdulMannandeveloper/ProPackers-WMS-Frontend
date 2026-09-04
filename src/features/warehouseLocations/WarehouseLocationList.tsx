import { useMemo, useState } from 'react'
import { Maximize, Minimize, Pencil, Trash2, ChevronRight, X } from 'lucide-react'
import { warehouseLocations as api } from '@/api'
import { Button, Input, Modal, Select } from '@/components/Shared Components'
import WarehouseLocationFormModal from './WarehouseLocationFormModal'
import WarehouseExplorer from './WarehouseExplorer'
import { useWarehouseMap, depthStyle } from './useWarehouseMap'
import type { WarehouseLocation, WarehouseLocationClass } from '@/api/warehouseLocations'
import { useFeedback } from '@/hooks/useFeedback'

type ClassDraft = {
  name: string
  description: string
  parentClassId: string
}

/**
 * Longest chain of classes reachable through parentClassId, used for the
 * ZONE -> AISLE -> SHELF -> BIN preview strip.
 */
const buildClassLadder = (classes: WarehouseLocationClass[]) => {
  const childrenOf = new Map<string, WarehouseLocationClass[]>()
  const roots: WarehouseLocationClass[] = []

  for (const klass of classes) {
    if (klass.parentClassId) {
      const siblings = childrenOf.get(klass.parentClassId) ?? []
      siblings.push(klass)
      childrenOf.set(klass.parentClassId, siblings)
    } else {
      roots.push(klass)
    }
  }

  const longestFrom = (klass: WarehouseLocationClass, seen: Set<string>): WarehouseLocationClass[] => {
    if (seen.has(klass.id)) return [klass]
    seen.add(klass.id)

    let best: WarehouseLocationClass[] = []
    for (const child of childrenOf.get(klass.id) ?? []) {
      const chain = longestFrom(child, new Set(seen))
      if (chain.length > best.length) best = chain
    }

    return [klass, ...best]
  }

  let ladder: WarehouseLocationClass[] = []
  for (const root of roots) {
    const chain = longestFrom(root, new Set())
    if (chain.length > ladder.length) ladder = chain
  }

  return ladder
}

export default function WarehouseLocationList() {
  const { dialog, showError, showMessage } = useFeedback()

  const { locations: items, classes, stockLevels, roots, nodeById, loading, error, reload } = useWarehouseMap()

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<WarehouseLocation | null>(null)
  const [defaultParentId, setDefaultParentId] = useState<string | null>(null)
  const [editingClassId, setEditingClassId] = useState<string | null>(null)
  const [classDraft, setClassDraft] = useState<ClassDraft>({
    name: '',
    description: '',
    parentClassId: '',
  })
  const [classSaving, setClassSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'setup' | 'locations'>('setup')
  const [viewMode, setViewMode] = useState<'explorer' | 'table'>('explorer')
  const [isFullscreen, setIsFullscreen] = useState(false)

  const [confirmClass, setConfirmClass] = useState<WarehouseLocationClass | null>(null)
  const [confirmLocation, setConfirmLocation] = useState<WarehouseLocation | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const classLadder = useMemo(() => buildClassLadder(classes), [classes])

  const handleCreateClick = () => {
    setEditing(null)
    setDefaultParentId(null)
    setModalOpen(true)
  }

  const handleEditClick = (s: WarehouseLocation) => {
    setEditing(s)
    setDefaultParentId(null)
    setModalOpen(true)
  }

  const handleAddChildClick = (parent: WarehouseLocation) => {
    setEditing(null)
    setDefaultParentId(parent.id)
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
    await reload()
  }

  const handleSaveClass = async () => {
    if (!classDraft.name.trim()) {
      showMessage('Class name is required.')
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
      await reload()
    } catch (e) {
      showError(e, 'Could not save this class')
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

  const closeConfirmModal = () => {
    if (actionLoading) return
    setConfirmClass(null)
    setConfirmLocation(null)
  }

  const executeDelete = async () => {
    setActionLoading(true)
    try {
      if (confirmClass) {
        await api.deleteWarehouseLocationClass(confirmClass.id)
      } else if (confirmLocation) {
        await api.deleteWarehouseLocation(confirmLocation.id)
      }
      setConfirmClass(null)
      setConfirmLocation(null)
      await reload()
    } catch (e) {
      showError(e, `Could not delete that ${confirmClass ? 'class' : 'location'}`)
    } finally {
      setActionLoading(false)
    }
  }

  const confirmTarget = confirmClass
    ? { kind: 'class' as const, label: confirmClass.name }
    : confirmLocation
      ? { kind: 'location' as const, label: confirmLocation.locationName || 'this location' }
      : null

  return (
    <>
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

      <Modal
        open={Boolean(confirmTarget)}
        onClose={closeConfirmModal}
        title={confirmTarget?.kind === 'class' ? 'Delete location class' : 'Delete location'}
        description={
          confirmTarget?.kind === 'class'
            ? 'Classes still in use by locations cannot be removed.'
            : 'Child locations and stock records may block this deletion.'
        }
        size="sm"
        closeOnBackdropClick={!actionLoading}
        closeOnEsc={!actionLoading}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeConfirmModal} disabled={actionLoading}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void executeDelete()} loading={actionLoading}>
              {actionLoading ? 'Deleting…' : 'Delete'}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">
          Are you sure you want to delete <span className="font-medium text-foreground">{confirmTarget?.label}</span>?
          This action cannot be undone.
        </p>
      </Modal>

      {activeTab === 'setup' && (
        <div className="rounded-xl border border-border bg-white shadow-sm">
          <div className="space-y-4 border-b border-border p-5">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Location Classes</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Define the types of locations in your warehouse (e.g. Zone, Aisle, Shelf, Bin).
              </p>
            </div>

            {classLadder.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-3 py-2">
                <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Hierarchy
                </span>
                {classLadder.map((klass, index) => {
                  const style = depthStyle(index)
                  return (
                    <span key={klass.id} className="flex items-center gap-1.5">
                      {index > 0 && <ChevronRight className="size-3 text-slate-300" />}
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full ${style.soft} ${style.text} px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide`}
                      >
                        <span className={`size-1.5 rounded-full ${style.dot}`} aria-hidden />
                        {klass.name}
                      </span>
                    </span>
                  )
                })}
              </div>
            )}

            <div className="grid gap-2 rounded-xl border border-border bg-muted/30 p-4 md:grid-cols-[1.2fr_1.5fr_1.2fr_auto_auto] md:items-center">
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
              <Button onClick={handleSaveClass} loading={classSaving}>
                {editingClassId ? (classSaving ? 'Saving...' : 'Save Class') : (classSaving ? 'Saving...' : 'Add Class')}
              </Button>
              {editingClassId && (
                <Button variant="secondary" onClick={handleCancelClassEdit} disabled={classSaving}>
                  Cancel
                </Button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Class</th>
                  <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Parent Class</th>
                  <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Description</th>
                  <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {classes.map((klass) => {
                  const parentClass = classes.find((c) => c.id === klass.parentClassId)
                  return (
                    <tr key={klass.id} className="transition-colors hover:bg-slate-50/80">
                      <td className="px-5 py-3.5 text-sm font-medium text-foreground">{klass.name}</td>
                      <td className="px-5 py-3.5 text-sm text-muted-foreground">{parentClass?.name || '—'}</td>
                      <td className="px-5 py-3.5 text-sm text-muted-foreground">{klass.description || '—'}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex justify-end">
                          <div className="inline-flex items-center gap-0.5 rounded-lg border border-border/80 bg-white p-0.5 shadow-sm">
                            <button
                              type="button"
                              title="Edit class"
                              aria-label="Edit class"
                              onClick={() => handleEditClassClick(klass)}
                              className="icon-action text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                            >
                              <Pencil className="size-3.5" strokeWidth={1.75} />
                            </button>
                            <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
                            <button
                              type="button"
                              title="Delete class"
                              aria-label="Delete class"
                              onClick={() => setConfirmClass(klass)}
                              className="icon-action text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                            >
                              <Trash2 className="size-3.5" strokeWidth={1.75} />
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {classes.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-12 text-center text-sm text-muted-foreground">
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
        <div
          className={
            isFullscreen
              ? 'fixed inset-0 z-[100] flex flex-col bg-white p-4'
              : 'flex h-[calc(100vh-200px)] min-h-[600px] flex-col rounded-xl border border-border bg-white shadow-sm'
          }
        >
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border p-5">
            <div>
              <h3 className="text-xl font-semibold text-foreground">Warehouse Explorer</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Drill through zones, aisles and bins to see what each location holds.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
                {(['explorer', 'table'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setViewMode(mode)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                      viewMode === mode
                        ? 'bg-white text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setIsFullscreen(!isFullscreen)}
                title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                className="inline-flex size-9 items-center justify-center rounded-lg border border-border text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900"
              >
                {isFullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
              </button>
              <Button onClick={handleCreateClick} disabled={classes.length === 0}>New Location</Button>
              {isFullscreen && (
                <button
                  type="button"
                  onClick={() => setIsFullscreen(false)}
                  aria-label="Close fullscreen"
                  className="inline-flex size-9 items-center justify-center rounded-lg border border-border text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
          </div>

          <WarehouseLocationFormModal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            onSave={handleSave}
            initial={editing}
            defaultParentId={defaultParentId}
            classes={classes}
            locations={items}
          />

          <div className="min-h-0 flex-1 overflow-hidden">
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading data...</div>
            ) : viewMode === 'explorer' ? (
              <WarehouseExplorer
                roots={roots}
                nodeById={nodeById}
                stockLevels={stockLevels}
                onEdit={handleEditClick}
                onDelete={(location) => setConfirmLocation(location)}
                onAddChild={handleAddChildClick}
              />
            ) : (
              <div className="h-full overflow-auto">
                <table className="w-full text-left">
                  <thead className="sticky top-0 z-10 bg-muted/40 backdrop-blur">
                    <tr className="border-b border-border">
                      <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Location</th>
                      <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Class</th>
                      <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Parent</th>
                      <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Path</th>
                      <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {items.map((s) => (
                      <tr key={s.id} className="transition-colors hover:bg-slate-50/80">
                        <td className="px-5 py-3.5 text-sm font-medium text-foreground">{s.locationName ?? '—'}</td>
                        <td className="px-5 py-3.5 text-sm text-muted-foreground">{s.locationClass?.name ?? '—'}</td>
                        <td className="px-5 py-3.5 text-sm text-muted-foreground">{s.parentLocation?.locationName ?? '—'}</td>
                        <td className="px-5 py-3.5 font-mono text-xs text-muted-foreground">{s.materializedPath ?? '—'}</td>
                        <td className="px-5 py-3.5">
                          <div className="flex justify-end">
                            <div className="inline-flex items-center gap-0.5 rounded-lg border border-border/80 bg-white p-0.5 shadow-sm">
                              <button
                                type="button"
                                title="Edit location"
                                aria-label="Edit location"
                                onClick={() => handleEditClick(s)}
                                className="icon-action text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                              >
                                <Pencil className="size-3.5" strokeWidth={1.75} />
                              </button>
                              <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
                              <button
                                type="button"
                                title="Delete location"
                                aria-label="Delete location"
                                onClick={() => setConfirmLocation(s)}
                                className="icon-action text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                              >
                                <Trash2 className="size-3.5" strokeWidth={1.75} />
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {items.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-5 py-12 text-center text-sm text-muted-foreground">
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

      {dialog}
    </>
  )
}
