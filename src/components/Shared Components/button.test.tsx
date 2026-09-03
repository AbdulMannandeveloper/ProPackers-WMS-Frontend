/**
 * The `loading` prop on Button.
 *
 * The point of it is not the spinner, it is the blocking. Before this, a slow
 * save left the button live and a second click sent the request twice — which
 * on the check-in path books the stock twice.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { Button } from './button'

describe('a button that is working', () => {
  it('cannot be pressed again', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()

    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    )

    await user.click(screen.getByRole('button', { name: /save/i })).catch(() => {})
    expect(onClick).not.toHaveBeenCalled()
  })

  it('reports itself as busy and disabled', () => {
    render(<Button loading>Save</Button>)

    const button = screen.getByRole('button', { name: /save/i })
    expect(button).toBeDisabled()
    expect(button.getAttribute('aria-busy')).toBe('true')
  })

  it('keeps its label, so the button does not jump or go blank', () => {
    render(<Button loading>Booking in…</Button>)
    expect(screen.getByRole('button', { name: /booking in/i })).toBeTruthy()
  })

  it('shows a spinner', () => {
    const { container } = render(<Button loading>Save</Button>)
    expect(container.querySelector('svg.animate-spin')).toBeTruthy()
  })
})

describe('a button that is idle', () => {
  it('still works', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()

    render(<Button onClick={onClick}>Save</Button>)
    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('has no spinner and is not marked busy', () => {
    const { container } = render(<Button>Save</Button>)

    expect(container.querySelector('svg.animate-spin')).toBeNull()
    expect(screen.getByRole('button').getAttribute('aria-busy')).toBeNull()
  })
})

describe('loading and disabled together', () => {
  it('a button disabled for another reason stays disabled while not loading', () => {
    // The split the sweep makes: `disabled={saving || !name}` becomes
    // `loading={saving} disabled={!name}`. An invalid form must still block.
    const { container } = render(
      <Button disabled loading={false}>
        Save
      </Button>,
    )

    expect(screen.getByRole('button')).toBeDisabled()
    expect(container.querySelector('svg.animate-spin')).toBeNull()
  })
})
