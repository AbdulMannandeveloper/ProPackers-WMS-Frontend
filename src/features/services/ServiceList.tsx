import { useEffect, useMemo, useState } from 'react'
import { services as apiServices } from '@/api'
import { Button, Modal, Spinner } from '@/components/Shared Components'
import ServiceFormModal from './ServiceFormModal'
import { Search, Pencil, Trash2 } from 'lucide-react'
import { useFeedback } from '@/hooks/useFeedback'

type Service = {
  id: string
  description?: string
  ideaPrice?: number
  unit?: string
}

export default function ServiceList() {
  const { dialog, showError } = useFeedback()

  const [items, setItems] = useState<Service[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Service | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const [confirmDelete, setConfirmDelete] = useState<Service | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const data = await apiServices.getAllServices()
      setItems(Array.isArray(data) ? data : [])
    } catch (_) {
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  const handleCreateClick = () => {
    setEditing(null)
    setModalOpen(true)
  }

  const handleEditClick = (s: Service) => {
    setEditing(s)
    setModalOpen(true)
  }

  const handleSave = async (payload: { description: string; ideaPrice: number; unit: string }, id?: string) => {
    if (id) {
      await apiServices.updateService(id, payload)
    } else {
      await apiServices.createService(payload)
    }
    await load()
  }

  useEffect(() => {
    void load()
  }, [])

  const closeDeleteConfirm = () => {
    if (actionLoading) return
    setConfirmDelete(null)
  }

  const handleDeleteClick = (s: Service) => {
    setConfirmDelete(s)
  }

  const executeDelete = async () => {
    if (!confirmDelete) return
    setActionLoading(true)
    try {
      await apiServices.deleteService(confirmDelete.id)
      setConfirmDelete(null)
      await load()
    } catch (e) {
      showError(e, 'Could not delete this service')
    } finally {
      setActionLoading(false)
    }
  }

  const filteredItems = useMemo(() => {
    if (!searchQuery) return items
    const q = searchQuery.toLowerCase()
    return items.filter(
      (s) =>
        (s.description || '').toLowerCase().includes(q) ||
        (s.unit || '').toLowerCase().includes(q) ||
        String(s.ideaPrice ?? '').includes(q),
    )
  }, [items, searchQuery])

  const deleteLabel = confirmDelete?.description || 'this service'

  return (
    <>
    <div className="bg-white rounded-xl shadow-sm border border-border">
      <div className="p-5 border-b border-border space-y-4">
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
          <h2 className="text-xl font-semibold text-foreground">Services</h2>
          <Button onClick={handleCreateClick} className="w-full sm:w-auto">New Service</Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-center">
          <div className="relative w-full sm:w-auto flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search services..."
              className="pl-9 h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {loading && (
              <span className="pointer-events-none absolute right-2.5 top-2.5 text-muted-foreground">
                <Spinner label="Loading results" />
              </span>
            )}
          </div>
        </div>
      </div>

      <ServiceFormModal open={modalOpen} onClose={() => setModalOpen(false)} onSave={handleSave} initial={editing} />

      <Modal
        open={Boolean(confirmDelete)}
        onClose={closeDeleteConfirm}
        title="Delete Service"
        description="This action cannot be undone."
        size="sm"
        closeOnBackdropClick={!actionLoading}
        closeOnEsc={!actionLoading}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeDeleteConfirm} disabled={actionLoading}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void executeDelete()} loading={actionLoading}>
              {actionLoading ? 'Deleting…' : 'Delete'}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">
          Are you sure you want to delete service {deleteLabel}?
        </p>
      </Modal>

      <div className="p-0 overflow-x-auto">
        {loading ? (
          <div className="py-12 text-center text-muted-foreground">Loading services...</div>
        ) : filteredItems.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-muted-foreground">No services found matching your search.</p>
            {searchQuery && (
              <Button
                variant="link"
                onClick={() => setSearchQuery('')}
                className="mt-2 text-primary"
              >
                Clear search
              </Button>
            )}
          </div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border">
                <th className="py-3 px-5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Description</th>
                <th className="py-3 px-5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Price</th>
                <th className="py-3 px-5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Unit</th>
                <th className="py-3 px-5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground text-right w-[1%] whitespace-nowrap">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredItems.map((s) => (
                <tr key={s.id} className="group transition-colors hover:bg-slate-50/80">
                  <td className="py-3.5 px-5 font-medium text-foreground">{s.description ?? '—'}</td>
                  <td className="py-3.5 px-5 text-sm text-muted-foreground tabular-nums">
                    {s.ideaPrice != null ? `£${Number(s.ideaPrice).toFixed(2)}` : '—'}
                  </td>
                  <td className="py-3.5 px-5 text-sm text-muted-foreground">{s.unit ?? '—'}</td>
                  <td className="py-3.5 px-5">
                    <div className="flex justify-end">
                      <div className="inline-flex items-center gap-0.5 rounded-lg border border-border/80 bg-white p-0.5 shadow-sm">
                        <button
                          type="button"
                          title="Edit service"
                          aria-label="Edit service"
                          onClick={() => handleEditClick(s)}
                          className="icon-action text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                        >
                          <Pencil className="size-3.5" strokeWidth={1.75} />
                        </button>
                        <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
                        <button
                          type="button"
                          title="Delete service"
                          aria-label="Delete service"
                          onClick={() => handleDeleteClick(s)}
                          className="icon-action text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 className="size-3.5" strokeWidth={1.75} />
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>

      {dialog}
    </>
  )
}
