import { useEffect, useMemo, useState } from 'react'

import { clientServices as apiClientServices } from '@/api'
import { Button, Input, Modal, Select, Spinner } from '@/components/Shared Components'
import { errorMessage } from '@/lib/errors'

/**
 * Charging a client for work that happened once.
 *
 * A deliberate act, from the Clients screen. It lived on the rate card before,
 * as a quantity box and a Charge button on every row, which made it far too
 * easy to fire by accident and impossible to find afterwards — you had to know
 * it had happened to go looking for the line.
 *
 * Only services the client has already agreed a rate for. Inventing a price at
 * the point of charging is how somebody gets billed something nobody agreed.
 */

type Rate = {
  id: string
  serviceId: string
  chargedPrice: number | string
  unit?: string
  service?: { description: string }
}

type Props = {
  open: boolean
  clientId: string | null
  clientName: string
  onClose: () => void
  onCharged: (message: string) => void
}

const money = (value: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(value)

export function BillServiceModal({ open, clientId, clientName, onClose, onCharged }: Props) {
  const [rates, setRates] = useState<Rate[]>([])
  const [loading, setLoading] = useState(false)
  const [rateId, setRateId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !clientId) return

    let cancelled = false
    setLoading(true)
    setError('')
    apiClientServices
      .getClientServicesByClientId(clientId)
      .then((rows) => {
        if (cancelled) return
        const list = Array.isArray(rows) ? (rows as Rate[]) : []
        setRates(list)
        setRateId(list[0]?.id ?? '')
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err, 'Could not load this client’s rates.'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, clientId])

  const rate = useMemo(() => rates.find((r) => r.id === rateId) ?? null, [rates, rateId])

  const amount = useMemo(() => {
    const q = Number(quantity)
    if (!rate || !Number.isFinite(q) || q <= 0) return null
    return Number((q * Number(rate.chargedPrice)).toFixed(2))
  }, [rate, quantity])

  const submit = async () => {
    if (!clientId || !rate || amount === null || saving) return

    setSaving(true)
    setError('')
    try {
      await apiClientServices.chargeServiceToClient({
        clientId,
        clientServiceId: rate.id,
        quantity: Number(quantity),
      })
      onCharged(
        `${clientName} charged ${money(amount)} for ${rate.service?.description ?? 'a service'}.`,
      )
      setQuantity('1')
      onClose()
    } catch (err) {
      setError(errorMessage(err, 'Could not raise the charge.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Bill ${clientName}`}
      description="Adds a line to whichever invoice period is currently open."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={() => void submit()}
            loading={saving}
            disabled={!rate || amount === null}
          >
            {amount !== null ? `Add ${money(amount)} to the invoice` : 'Add to the invoice'}
          </Button>
        </div>
      }
    >
      {loading ? (
        <p className="flex items-center gap-2 py-6 text-sm text-slate-500">
          <Spinner /> Loading their agreed rates…
        </p>
      ) : rates.length === 0 ? (
        // Not an error, and worth saying plainly: a client with no rates simply
        // has nothing that can be charged yet.
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-slate-700">
          {clientName} has no agreed rates yet. Add one from Services first — a
          price has to be agreed before it can be charged.
        </p>
      ) : (
        <div className="space-y-4">
          <div>
            <label
              htmlFor="bill-service"
              className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500"
            >
              Service
            </label>
            <Select
              id="bill-service"
              value={rateId}
              onChange={(e) => setRateId(e.target.value)}
            >
              {rates.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.service?.description ?? 'Service'} —{' '}
                  {money(Number(r.chargedPrice))} per {r.unit || 'unit'}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label
              htmlFor="bill-quantity"
              className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500"
            >
              Quantity
            </label>
            <Input
              id="bill-quantity"
              type="number"
              min="0"
              step="0.01"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>

          {/* The arithmetic, shown before it is committed. */}
          {rate && amount !== null ? (
            <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
              {quantity} × {money(Number(rate.chargedPrice))} ={' '}
              <span className="font-semibold text-slate-900">{money(amount)}</span>
            </p>
          ) : null}

          {error ? (
            <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </Modal>
  )
}

export default BillServiceModal
