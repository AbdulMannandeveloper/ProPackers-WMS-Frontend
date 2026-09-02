import { useCallback, useRef, useState } from 'react'

import { Button, Modal } from '@/components/Shared Components'
import { errorMessage } from '@/lib/errors'

/**
 * Telling the user what happened, in the app's own chrome.
 *
 * Replaces `window.alert`, which was used in thirty-six places: unstyled,
 * blocking, and stuck at the top of the screen looking like a browser fault
 * rather than part of the product. `window.confirm` goes the same way — a
 * destructive action deserves a dialog that names what is about to be deleted.
 *
 * Built on the existing Modal, which already handles Escape, focus and the
 * backdrop, so this is arrangement rather than new machinery.
 *
 * A hook rather than a global provider because each screen already owns its own
 * loading and error state; one more line per page is a smaller change than
 * threading a context through the tree.
 */

type Tone = 'error' | 'success' | 'confirm'

type DialogState = {
  open: boolean
  tone: Tone
  title: string
  message: string
  confirmLabel: string
  destructive: boolean
  onConfirm?: () => void
}

const CLOSED: DialogState = {
  open: false,
  tone: 'error',
  title: '',
  message: '',
  confirmLabel: 'OK',
  destructive: false,
}

const TONE_STYLES: Record<Tone, { ring: string; text: string; icon: string }> = {
  error: {
    ring: 'bg-rose-100 dark:bg-rose-950',
    text: 'text-rose-700 dark:text-rose-300',
    icon: '!',
  },
  success: {
    ring: 'bg-emerald-100 dark:bg-emerald-950',
    text: 'text-emerald-700 dark:text-emerald-300',
    icon: '✓',
  },
  confirm: {
    ring: 'bg-amber-100 dark:bg-amber-950',
    text: 'text-amber-700 dark:text-amber-300',
    icon: '?',
  },
}

export const useFeedback = () => {
  const [state, setState] = useState<DialogState>(CLOSED)

  // Held in a ref so the callback identity does not change with each render and
  // force every consumer to re-memoise.
  const resolveRef = useRef<((confirmed: boolean) => void) | null>(null)

  const close = useCallback(() => {
    setState((s) => ({ ...s, open: false }))
    // A confirm dismissed by Escape or the backdrop is a "no", not a hang.
    resolveRef.current?.(false)
    resolveRef.current = null
  }, [])

  /**
   * Shows why something failed.
   *
   * Takes the raw error, not a string, so the server's own message is used
   * rather than whatever axios put on `.message` — that is the difference
   * between a useful sentence and "Request failed with status code 400".
   */
  const showError = useCallback(
    (err: unknown, fallback = 'Something went wrong.', title = 'That did not work') => {
      setState({
        ...CLOSED,
        open: true,
        tone: 'error',
        title,
        message: errorMessage(err, fallback),
      })
    },
    [],
  )

  /** For a message written here rather than one coming back from the API. */
  const showMessage = useCallback((message: string, title = 'Check this') => {
    setState({ ...CLOSED, open: true, tone: 'error', title, message })
  }, [])

  const showSuccess = useCallback((message: string, title = 'Done') => {
    setState({ ...CLOSED, open: true, tone: 'success', title, message })
  }, [])

  /** Resolves true only when the confirm button is actually pressed. */
  const confirm = useCallback(
    (
      message: string,
      { title = 'Are you sure?', confirmLabel = 'Confirm', destructive = true } = {},
    ) =>
      new Promise<boolean>((resolve) => {
        resolveRef.current = resolve
        setState({
          open: true,
          tone: 'confirm',
          title,
          message,
          confirmLabel,
          destructive,
        })
      }),
    [],
  )

  const accept = useCallback(() => {
    setState((s) => ({ ...s, open: false }))
    resolveRef.current?.(true)
    resolveRef.current = null
  }, [])

  const tone = TONE_STYLES[state.tone]

  const dialog = (
    <Modal
      open={state.open}
      onClose={close}
      title={state.title}
      footer={
        state.tone === 'confirm' ? (
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button variant={state.destructive ? 'destructive' : 'default'} onClick={accept}>
              {state.confirmLabel}
            </Button>
          </div>
        ) : (
          <div className="flex justify-end">
            <Button onClick={close}>Close</Button>
          </div>
        )
      }
    >
      <div className="flex gap-4">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-bold ${tone.ring} ${tone.text}`}
          aria-hidden="true"
        >
          {tone.icon}
        </div>
        {/* The message can be a whole sentence from the API, so it wraps rather
            than truncating — the detail is the point. */}
        <p className="self-center text-sm leading-6 text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
          {state.message}
        </p>
      </div>
    </Modal>
  )

  return { dialog, showError, showMessage, showSuccess, confirm }
}

export default useFeedback
