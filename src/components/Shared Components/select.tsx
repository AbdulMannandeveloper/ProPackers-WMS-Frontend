import type { ComponentPropsWithoutRef, ReactNode } from 'react'

import { cn } from '@/lib/utils'

export interface SelectOption {
  label: ReactNode
  value: string
  disabled?: boolean
}

export interface SelectProps extends ComponentPropsWithoutRef<'select'> {
  options?: SelectOption[]
  placeholder?: string
}

function Select({ className, options, placeholder, children, ...props }: SelectProps) {
  return (
    <select
      data-slot='select'
      className={cn(
        'flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {placeholder ? <option value=''>{placeholder}</option> : null}
      {options?.length ? options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      )) : children}
    </select>
  )
}

export { Select }