import type { ComponentPropsWithoutRef } from 'react'

import { cn } from '@/lib/utils'

import { Spinner } from './spinner'

export interface InputProps extends ComponentPropsWithoutRef<'input'> {
  /**
   * Shows a spinner inside the right edge of the field.
   *
   * Meant for a search box whose results are not there yet. Deliberately not
   * driven by keystrokes: these searches filter a list already in memory and
   * return instantly, so a per-character spinner would be a flicker that means
   * nothing. Pass the page's own list-loading flag instead.
   */
  loading?: boolean
}

function Input({ className, type = 'text', loading = false, ...props }: InputProps) {
  const field = (
    <input
      data-slot='input'
      type={type}
      className={cn(
        'flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        // Keep the caret and any long value clear of the spinner.
        loading && 'pr-10',
        className,
      )}
      {...props}
    />
  )

  // Only wrap when there is something to position, so every existing caller
  // keeps the exact DOM it had.
  if (!loading) return field

  return (
    <div className="relative w-full">
      {field}
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground">
        <Spinner label="Loading results" />
      </span>
    </div>
  )
}

export { Input }
