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

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event: KeyboardEvent) => {
      if (closeOnEsc && event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = originalOverflow
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