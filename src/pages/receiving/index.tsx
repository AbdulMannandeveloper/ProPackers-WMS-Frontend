import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'

import {
  clients as clientsApi,
  products as productsApi,
  warehouseLocations as locationsApi,
} from '@/api'
import type { Product } from '@/api/products'
import { Spinner } from '@/components/Shared Components'
import { ReceivingSession } from '@/features/inventory/ReceivingSession'
import { errorMessage } from '@/lib/errors'
import { useAuthStore } from '@/stores/auth'

/**
 * Receiving, on its own screen.
 *
 * Deliberately outside the dashboard layout: no sidebar, no KPI cards, no tabs.
 * Someone booking in a pallet is doing one job with their hands full, and every
 * other thing on the inventory page is a distraction from it.
 *
 * A real route rather than an overlay, so the browser back button works, the
 * tab is named, and a bench machine can be left parked here all day.
 */
export default function ReceivingPage() {
  const navigate = useNavigate()
  const role = useAuthStore((s) => s.role)
  const isAdmin = role === 'admin'

  const [locations, setLocations] = useState<
    Array<{ id: string; locationName: string; materializedPath?: string | null }>
  >([])
  const [clients, setClients] = useState<Array<{ id: string; companyName: string }>>([])
  const [catalogue, setCatalogue] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      try {
        const [locs, cls, prods] = await Promise.all([
          locationsApi.getAllWarehouseLocations(),
          // Employees get the slim lookup: enough to attribute a new product to
          // a client, without exposing client contact details.
          isAdmin ? clientsApi.getAllClients() : clientsApi.getClientLookup(),
          productsApi.getAllProducts(),
        ])
        if (cancelled) return
        setLocations(Array.isArray(locs) ? locs : [])
        setClients(Array.isArray(cls) ? cls : [])
        setCatalogue(Array.isArray(prods) ? prods : [])
      } catch (err) {
        if (!cancelled) {
          // Not swallowed into an empty list: without locations there is
          // nowhere to receive into, and a silently empty dropdown looks like
          // the warehouse has no bins.
          setError(errorMessage(err, 'Could not load the warehouse data.'))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [isAdmin])

  const close = () => navigate('/app/inventory')

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 text-slate-500">
        <Spinner />
        Getting the warehouse ready…
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md space-y-4 text-center">
          <p className="text-lg font-semibold text-slate-900">Receiving is not available</p>
          <p className="text-slate-600" role="alert">
            {error}
          </p>
          <button
            type="button"
            onClick={close}
            className="rounded-2xl bg-slate-900 px-6 py-3 text-white"
          >
            Back to Inventory
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {notice ? (
        <div
          className="border-b border-emerald-200 bg-emerald-50 px-5 py-3 text-base font-medium text-emerald-800"
          role="status"
        >
          {notice}
        </div>
      ) : null}

      <ReceivingSession
        locations={locations}
        clients={clients}
        catalogue={catalogue}
        onDone={close}
        onReceived={(summary) => {
          setNotice(
            `Checked in ${summary.linesReceived} ${summary.linesReceived === 1 ? 'line' : 'lines'}` +
              (summary.productsCreated
                ? `, ${summary.productsCreated} new ${summary.productsCreated === 1 ? 'product' : 'products'} registered.`
                : '.'),
          )
          // The catalogue grew, so a newly created product is now findable by
          // scan for the rest of the shift.
          void productsApi
            .getAllProducts()
            .then((p) => setCatalogue(Array.isArray(p) ? p : []))
            .catch(() => {})
        }}
      />
    </div>
  )
}
