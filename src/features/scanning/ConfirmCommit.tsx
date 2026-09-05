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
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            className="h-10 px-4 text-sm [@media(pointer:coarse)]:h-12"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            className="h-10 px-5 text-sm [@media(pointer:coarse)]:h-12"
            onClick={onConfirm}
            loading={busy}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      {/* A docket, not a stack of coloured pills: label left, value right,
          hairline between. Emphasis is the value going amber, nothing more. */}
      <dl className="divide-y divide-slate-100 border-y border-slate-200">
        {facts.map((fact) => (
          <div key={fact.label} className="flex items-baseline justify-between gap-6 py-2.5">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.09em] text-slate-500">
              {fact.label}
            </dt>
            <dd
              className={`text-right text-sm font-semibold ${
                fact.emphasis ? 'text-amber-700' : 'text-slate-900'
              }`}
            >
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>

      {warning ? (
        <p className="mt-3 border-l-2 border-amber-500 bg-amber-50/70 px-3 py-2 text-xs leading-relaxed text-amber-900">
          {warning}
        </p>
      ) : null}
    </Modal>
  )
}

export default ConfirmCommit
