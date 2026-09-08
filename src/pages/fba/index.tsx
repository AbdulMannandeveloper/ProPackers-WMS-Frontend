import { useEffect, useState, type ReactNode } from 'react'

import { fba as fbaApi, clients as clientsApi } from '@/api'
import type { FbaCategory, FbaShipment } from '@/api/fba'
import { useAuthStore } from '@/stores/auth'
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Modal,
  Select,
} from '@/components/Shared Components'

type ClientOption = { id: string; companyName: string }

/**
 * FBA consignments.
 *
 * Deliberately the plainest screen in the app. These goods pass through rather
 * than being stored, so there is nothing to scan, no location to choose and no
 * stock to reserve — an operator types what arrived, and later marks it gone.
 * Marking it gone is what bills the client, per item, so that button says what
 * it will cost before it is pressed.
 */
export default function FbaPage() {
  const role = useAuthStore((s) => s.role)
  const isAdmin = role === 'admin'

  const [categories, setCategories] = useState<FbaCategory[]>([])
  const [shipments, setShipments] = useState<FbaShipment[]>([])
  const [clients, setClients] = useState<ClientOption[]>([])
  const [loading, setLoading] = useState(false)

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const showToast = (message: string, type: 'success' | 'error' = 'success') =>
    setToast({ message, type })

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(timer)
  }, [toast])

  const [categoryModalOpen, setCategoryModalOpen] = useState(false)
  const [newCategory, setNewCategory] = useState('')

  // Which action is waiting on a yes, and whether it is in flight.
  const [pending, setPending] = useState<{
    action: 'dispatch' | 'void' | 'delete'
    shipment: FbaShipment
  } | null>(null)
  const [acting, setActing] = useState(false)

  const [createOpen, setCreateOpen] = useState(false)
  const [formCategoryId, setFormCategoryId] = useState('')
  const [formClientId, setFormClientId] = useState('')
  const [formBarcode, setFormBarcode] = useState('')
  const [formSize, setFormSize] = useState('')
  const [formCount, setFormCount] = useState('')
  const [saving, setSaving] = useState(false)

  const errorFrom = (err: unknown, fallback: string) =>
    (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
    (err as Error)?.message ??
    fallback

  const loadData = async () => {
    setLoading(true)
    try {
      const [cats, ships, clientList] = await Promise.all([
        fbaApi.getCategories(),
        fbaApi.getShipments(),
        clientsApi.getClientLookup(),
      ])
      setCategories(cats || [])
      setShipments(ships || [])
      setClients(clientList || [])
    } catch (err) {
      showToast(errorFrom(err, 'Failed to load FBA consignments.'), 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleAddCategory = async () => {
    const name = newCategory.trim()
    if (!name) return
    try {
      await fbaApi.createCategory(name)
      setNewCategory('')
      showToast(`Category "${name}" added.`)
      await loadData()
    } catch (err) {
      showToast(errorFrom(err, 'Could not add the category.'), 'error')
    }
  }

  const handleDeleteCategory = async (category: FbaCategory) => {
    try {
      await fbaApi.deleteCategory(category.id)
      showToast(`Category "${category.name}" removed.`)
      await loadData()
    } catch (err) {
      // The server refuses while consignments reference it, and says so.
      showToast(errorFrom(err, 'Could not remove the category.'), 'error')
    }
  }

  const openCreate = () => {
    if (categories.length === 0) {
      showToast('Add an FBA category first — every consignment belongs to one.', 'error')
      return
    }
    if (clients.length === 0) {
      showToast('No clients available to record a consignment against.', 'error')
      return
    }
    setFormCategoryId(categories[0].id)
    setFormClientId(clients[0].id)
    setFormBarcode('')
    setFormSize('')
    setFormCount('')
    setCreateOpen(true)
  }

  const handleRecordArrival = async (e: React.FormEvent) => {
    e.preventDefault()
    const count = Number(formCount)
    if (!Number.isInteger(count) || count <= 0) {
      showToast('Count must be a whole number above zero.', 'error')
      return
    }

    setSaving(true)
    try {
      await fbaApi.recordArrival({
        categoryId: formCategoryId,
        clientId: formClientId,
        barcode: formBarcode,
        size: formSize,
        count,
      })
      showToast('Consignment recorded.')
      setCreateOpen(false)
      await loadData()
    } catch (err) {
      showToast(errorFrom(err, 'Could not record the consignment.'), 'error')
    } finally {
      setSaving(false)
    }
  }

  /**
   * Every action on this table is a one-way door, so every one of them asks
   * first.
   *
   * Marking gone raises a charge against the client. Voiding is final — a
   * cancelled consignment cannot go back to received. Deleting takes the row
   * away for good. None of the three can be undone from this screen, and the
   * buttons sit next to each other on a narrow row, so a slip lands on the
   * wrong one easily.
   *
   * One dialog rather than three: the shape is identical and the difference is
   * only what it says, which is what CONFIRMATIONS holds.
   */
  type FbaAction = 'dispatch' | 'void' | 'delete'

  const CONFIRMATIONS: Record<
    FbaAction,
    {
      title: string
      confirmLabel: string
      body: (s: FbaShipment) => ReactNode
      run: (s: FbaShipment) => Promise<unknown>
      done: (s: FbaShipment) => string
      failed: string
    }
  > = {
    dispatch: {
      title: 'Mark this consignment gone?',
      confirmLabel: 'Mark it gone',
      body: (s) => (
        <>
          This bills <strong>{s.client?.companyName ?? 'the client'}</strong> for{' '}
          <strong>{s.count} item(s)</strong> at their agreed rate.
          <br />
          Once it has gone it can no longer be voided or deleted — only credited.
        </>
      ),
      run: (s) => fbaApi.dispatchShipment(s.id),
      done: (s) => `Consignment marked gone. ${s.count} item(s) billed.`,
      failed: 'Could not mark it gone.',
    },
    void: {
      title: 'Void this consignment?',
      confirmLabel: 'Void it',
      body: (s) => (
        <>
          <strong className="font-mono">{s.barcode}</strong> stays on file as cancelled
          and nothing is billed. It cannot be brought back to received afterwards.
        </>
      ),
      run: (s) => fbaApi.cancelShipment(s.id),
      done: () => 'Consignment voided.',
      failed: 'Could not void it.',
    },
    delete: {
      title: 'Delete this consignment?',
      confirmLabel: 'Delete it',
      body: (s) => (
        <>
          The record of <strong className="font-mono">{s.barcode}</strong> — {s.count}{' '}
          item(s) for {s.client?.companyName ?? 'this client'} — is removed for good.
          Use <strong>Void</strong> instead to keep it on file as cancelled.
        </>
      ),
      run: (s) => fbaApi.deleteShipment(s.id),
      done: (s) => `Consignment ${s.barcode} deleted.`,
      failed: 'Could not delete it.',
    },
  }

  const runPending = async () => {
    if (!pending || acting) return
    const { action, shipment } = pending
    const spec = CONFIRMATIONS[action]

    setActing(true)
    try {
      await spec.run(shipment)
      showToast(spec.done(shipment))
      setPending(null)
      await loadData()
    } catch (err) {
      // The server's refusal is the useful sentence — it names the client and
      // says what to do instead. The fallback is only for a dead connection.
      showToast(errorFrom(err, spec.failed), 'error')
    } finally {
      setActing(false)
    }
  }

  const statusStyle = (status: FbaShipment['status']) =>
    status === 'DISPATCHED'
      ? 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200'
      : status === 'CANCELLED'
        ? 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-300'
        : 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-200'

  return (
    <div className="space-y-6 max-w-7xl mx-auto relative">
      {toast && (
        <div
          role="status"
          className={`fixed top-4 right-4 z-[100] rounded-2xl border p-4 shadow-xl text-sm ${
            toast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100'
              : 'bg-rose-50 border-rose-200 text-rose-900 dark:bg-rose-950 dark:text-rose-100'
          }`}
        >
          {toast.message}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            FBA Consignments
          </h1>
          <p className="text-sm text-slate-500">
            Goods that pass through rather than being stored. Recorded by hand;
            billed per item when they leave.
          </p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <Button variant="outline" onClick={() => setCategoryModalOpen(true)}>
              Categories
            </Button>
          )}
          <Button onClick={openCreate}>Record Arrival</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full min-w-[60rem] text-left text-sm">
            <thead className="border-b border-slate-100 dark:border-slate-800 text-slate-500">
              <tr>
                <th className="p-4 font-semibold">Barcode</th>
                <th className="p-4 font-semibold">Client</th>
                <th className="p-4 font-semibold">Category</th>
                <th className="p-4 font-semibold">Size</th>
                <th className="p-4 font-semibold text-center">Count</th>
                <th className="p-4 font-semibold">Arrived</th>
                <th className="p-4 font-semibold text-center">Status</th>
                <th className="p-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-900">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    Loading…
                  </td>
                </tr>
              ) : shipments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No consignments recorded yet.
                  </td>
                </tr>
              ) : (
                shipments.map((s) => (
                  <tr key={s.id}>
                    <td className="p-4 font-mono font-semibold text-slate-800 dark:text-slate-200">
                      {s.barcode}
                    </td>
                    <td className="p-4">{s.client?.companyName ?? '—'}</td>
                    <td className="p-4">{s.category?.name ?? '—'}</td>
                    <td className="p-4">{s.size}</td>
                    <td className="p-4 text-center font-bold">{s.count}</td>
                    <td className="p-4 text-xs font-mono text-slate-500">
                      {new Date(s.receivedAt).toLocaleDateString()}
                    </td>
                    <td className="p-4 text-center">
                      <Badge variant="secondary" className={statusStyle(s.status)}>
                        {s.status}
                      </Badge>
                    </td>
                    <td className="p-4 text-right space-x-2 whitespace-nowrap">
                      {s.status === 'RECEIVED' && (
                        <Button
                          size="sm"
                          onClick={() => setPending({ action: 'dispatch', shipment: s })}
                          title={`Marks it gone and bills ${s.count} item(s)`}
                        >
                          Mark Gone
                        </Button>
                      )}
                      {isAdmin && s.status === 'RECEIVED' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPending({ action: 'void', shipment: s })}
                        >
                          Void
                        </Button>
                      )}
                      {/* Offered only where it can succeed. A dispatched
                          consignment has been billed, and the server refuses —
                          showing the button anyway would be a promise the
                          system does not keep. */}
                      {isAdmin && s.status !== 'DISPATCHED' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPending({ action: 'delete', shipment: s })}
                          title="Removes the record entirely"
                        >
                          Delete
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* ── Record an arrival ─────────────────────────────────────────────── */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Record FBA Arrival"
      >
        <form onSubmit={handleRecordArrival} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Client *
              </label>
              <Select
                value={formClientId}
                onChange={(e) => setFormClientId(e.target.value)}
                required
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.companyName}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Category *
              </label>
              <Select
                value={formCategoryId}
                onChange={(e) => setFormCategoryId(e.target.value)}
                required
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Barcode *
              </label>
              <Input
                value={formBarcode}
                onChange={(e) => setFormBarcode(e.target.value)}
                placeholder="Read off the label"
                className="font-mono"
                autoComplete="off"
                spellCheck={false}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Size *
              </label>
              <Input
                value={formSize}
                onChange={(e) => setFormSize(e.target.value)}
                placeholder="e.g. Large, 40ft, Pallet"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Count *
              </label>
              <Input
                type="number"
                min="1"
                value={formCount}
                onChange={(e) => setFormCount(e.target.value)}
                placeholder="Number of items"
                required
              />
            </div>
          </div>

          <p className="text-xs text-slate-400">
            Nothing is stored against a warehouse location — these goods pass
            through. The charge is raised when you mark it gone.
          </p>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {saving ? 'Saving…' : 'Record Arrival'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── Confirming an action ──────────────────────────────────────────── */}
      <Modal
        open={Boolean(pending)}
        onClose={() => !acting && setPending(null)}
        title={pending ? CONFIRMATIONS[pending.action].title : ''}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPending(null)} disabled={acting}>
              Cancel
            </Button>
            <Button onClick={() => void runPending()} loading={acting}>
              {pending ? CONFIRMATIONS[pending.action].confirmLabel : ''}
            </Button>
          </div>
        }
      >
        {pending && (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {CONFIRMATIONS[pending.action].body(pending.shipment)}
          </p>
        )}
      </Modal>

      {/* ── Categories ────────────────────────────────────────────────────── */}
      <Modal
        open={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        title="FBA Categories"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-400">
            Every consignment belongs to a category, so these are set up first. A
            category in use cannot be removed — that would lose the record of what
            was handled.
          </p>

          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                New category
              </label>
              <Input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddCategory()
                  }
                }}
                placeholder="e.g. Chilled"
              />
            </div>
            <Button type="button" onClick={handleAddCategory} disabled={!newCategory.trim()}>
              Add
            </Button>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {categories.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">
                No categories yet.
              </p>
            ) : (
              categories.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 dark:border-slate-800 p-2"
                >
                  <span className="text-sm font-medium">{c.name}</span>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDeleteCategory(c)}
                  >
                    Remove
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </Modal>
    </div>
  )
}
