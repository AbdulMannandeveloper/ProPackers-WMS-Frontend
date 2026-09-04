import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'

import { clients as clientsApi } from '@/api'
import { Spinner } from '@/components/Shared Components'
import { DispatchSession } from '@/features/shipments/DispatchSession'
import { errorMessage } from '@/lib/errors'
import { useAuthStore } from '@/stores/auth'

/**
 * Outbound, on its own screen.
 *
 * Deliberately outside the dashboard layout, for the same reason receiving is:
 * someone sending a parcel is doing one job with their hands full, and every
 * other thing on the shipments page is a distraction from it.
 */
export default function DispatchPage() {
  const navigate = useNavigate()
  const role = useAuthStore((s) => s.role)
  const isAdmin = role === 'admin'

  const [clients, setClients] = useState<Array<{ id: string; companyName: string }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      try {
        // Only to put a name to the client the goods settle on. Employees get
        // the slim lookup: enough to name them, without contact details.
        const list = isAdmin
          ? await clientsApi.getAllClients()
          : await clientsApi.getClientLookup()
        if (!cancelled) setClients(Array.isArray(list) ? list : [])
      } catch (err) {
        // Not swallowed into an empty list: without it the header would say
        // "set by the first item" forever and look broken.
        if (!cancelled) setError(errorMessage(err, 'Could not load the client list.'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [isAdmin])

  const close = () => navigate('/app/shipments')

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 text-slate-500">
        <Spinner />
        Getting ready…
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md space-y-4 text-center">
          <p className="text-lg font-semibold text-slate-900">Dispatch is not available</p>
          <p className="text-slate-600" role="alert">
            {error}
          </p>
          <button
            type="button"
            onClick={close}
            className="rounded-2xl bg-slate-900 px-6 py-3 text-white"
          >
            Back to Shipments
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

      <DispatchSession
        clients={clients}
        onDone={close}
        onDispatched={({ reference, units }) =>
          setNotice(
            `Shipment ${reference} dispatched — ${units} ${units === 1 ? 'unit' : 'units'}. Scan the next label to carry on.`,
          )
        }
      />
    </div>
  )
}
