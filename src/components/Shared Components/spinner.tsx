import { cn } from '@/lib/utils'

/**
 * The app had no loading indicator of any kind — `animate-spin` appeared zero
 * times — so buttons said "Saving…" and everything else said nothing at all.
 *
 * `currentColor` so it inherits from whatever it sits in: white on a primary
 * button, slate in an input, without a variant for each.
 */

type Props = {
  className?: string
  /** Announce to screen readers. Off inside a button that already says "Saving…". */
  label?: string
}

export function Spinner({ className, label }: Props) {
  return (
    <svg
      className={cn('h-4 w-4 shrink-0 animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {/* The faint ring gives the moving arc something to travel around;
          without it a lone arc reads as a stray mark at small sizes. */}
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}

export default Spinner
