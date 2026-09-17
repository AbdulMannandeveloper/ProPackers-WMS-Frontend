import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { createPortal } from 'react-dom'

import { Button } from './button'

import { cn } from '@/lib/utils'

type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: ModalSize
  className?: string
  overlayClassName?: string
  contentClassName?: string
  closeOnBackdropClick?: boolean
  closeOnEsc?: boolean
  showCloseButton?: boolean
}

const sizeClasses: Record<ModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-[95vw]',
}

/**
 * Reference-counted body-scroll lock, shared across every open Modal.
 *
 * A per-instance capture-then-restore of document.body.style.overflow breaks
 * as soon as two Modals are open at once (Details behind Edit behind a
 * confirmation, say): each instance's effect re-runs on every render where its
 * `onClose` prop is a fresh closure — which an inline `onClose={() => ...}` is,
 * on every parent render — and a re-run captures whatever the overflow happens
 * to be at that instant, which may already be 'hidden' because a sibling modal
 * locked it first, or momentarily '' from a sibling's own cleanup racing in the
 * same commit. Either way, some instance's cleanup can restore the wrong value,
 * and the page is left permanently unscrollable once every modal has closed —
 * only a reload clears it, since nothing else resets body.style.overflow.
 *
 * A shared counter sidesteps this: the original value is captured only on the
 * 0→1 transition and restored only on the 1→0 transition, so any number of
 * effect re-runs from any number of stacked modals stay balanced.
 */
let scrollLockCount = 0
let previousBodyOverflow: string | null = null

const lockBodyScroll = () => {
  if (scrollLockCount === 0) {
    previousBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  scrollLockCount += 1
}

const unlockBodyScroll = () => {
  scrollLockCount = Math.max(0, scrollLockCount - 1)
  if (scrollLockCount === 0) {
    document.body.style.overflow = previousBodyOverflow ?? ''
    previousBodyOverflow = null
  }
}

function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  className,
  overlayClassName,
  contentClassName,
  closeOnBackdropClick = true,
  closeOnEsc = true,
  showCloseButton = true,
}: ModalProps) {
  useEffect(() => {
    if (!open) {
      return undefined
    }

    lockBodyScroll()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (closeOnEsc && event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      unlockBodyScroll()
    }
  }, [closeOnEsc, onClose, open])

  if (!open || typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <div className={cn('fixed inset-0 z-50 flex items-center justify-center p-4', overlayClassName)}>
      <button
        type='button'
        aria-label='Close modal'
        className='absolute inset-0 bg-slate-950/70 backdrop-blur-sm'
        onClick={closeOnBackdropClick ? onClose : undefined}
      />

      <div
        role='dialog'
        aria-modal='true'
        className={cn(
          'relative z-10 flex w-full flex-col overflow-hidden rounded-3xl border border-border bg-card text-card-foreground shadow-2xl',
          sizeClasses[size],
          className,
        )}
      >
        {(title || showCloseButton) && (
          <div className='flex items-start justify-between gap-4 border-b border-border px-6 py-4'>
            <div className='min-w-0'>
              {title ? <h2 className='text-lg font-semibold leading-tight'>{title}</h2> : null}
              {description ? <p className='mt-1 text-sm text-muted-foreground'>{description}</p> : null}
            </div>

            {showCloseButton ? (
              <Button variant='ghost' size='icon' onClick={onClose} aria-label='Close modal'>
                <span aria-hidden='true' className='text-lg leading-none'>×</span>
              </Button>
            ) : null}
          </div>
        )}

        <div className={cn('max-h-[80vh] overflow-y-auto px-6 py-5', contentClassName)}>{children}</div>

        {footer ? <div className='border-t border-border px-6 py-4'>{footer}</div> : null}
      </div>
    </div>,
    document.body,
  )
}

export { Modal }