import { Button, Modal } from '@/components/Shared Components'

/**
 * The last look before anything is written.
 *
 * Both of these buttons do something that cannot be quietly undone: goods-in
 * moves stock and can create products, dispatch takes stock off the shelf and
 * raises a charge on a client's invoice. Neither said what was about to happen
 * — you pressed a button and found out afterwards.
 *
 * It states the consequences in the operator's words, money included, because
 * a charge nobody saw coming is the expensive kind of mistake.
 */

export type CommitFact = {
  label: string
  value: string
  /** Draws the eye — used for anything involving a client's money. */
  emphasis?: boolean
}

type Props = {
  open: boolean
  title: string
  facts: CommitFact[]
  confirmLabel: string
  /** Shown under the facts when something here is irreversible. */
  warning?: string | null
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmCommit({
  open,
  title,
  facts,
  confirmLabel,
  warning,
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onCancel}
      title={title}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="outline" className="h-12 px-6" onClick={onCancel} disabled={busy}>
            Go back
          </Button>
          <Button className="h-12 px-6 text-base" onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <dl className="space-y-3">
        {facts.map((fact) => (
          <div
            key={fact.label}
            className={`flex items-baseline justify-between gap-4 rounded-xl px-4 py-3 ${
              fact.emphasis ? 'bg-amber-50' : 'bg-slate-50'
            }`}
          >
            <dt className="text-sm text-slate-600">{fact.label}</dt>
            <dd
              className={`text-right font-semibold ${
                fact.emphasis ? 'text-lg text-amber-900' : 'text-slate-900'
              }`}
            >
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>

      {warning ? (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {warning}
        </p>
      ) : null}
    </Modal>
  )
}

export default ConfirmCommit
