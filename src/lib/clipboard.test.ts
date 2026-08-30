/**
 * Copying, across the browsers the warehouse actually uses.
 *
 * The tiers exist because navigator.clipboard is undefined on any non-HTTPS
 * origin except localhost — which includes a plain-http staging box — and
 * because Safari rejects the write outside a user gesture. What matters most
 * here is the last test: a copy that did not happen must never be reported as
 * one, or an operator pastes the previous parcel's number onto this label.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'

import { copyText } from './clipboard'

/** A DOM stub with just enough surface for the execCommand path. */
const fakeDocument = (execResult: boolean | (() => boolean)) => {
  const removed: unknown[] = []
  return {
    doc: {
      createElement: () => ({
        value: '',
        style: {} as Record<string, string>,
        setAttribute: () => {},
        select: () => {},
        setSelectionRange: () => {},
      }),
      body: {
        appendChild: (el: unknown) => el,
        removeChild: (el: unknown) => {
          removed.push(el)
          return el
        },
      },
      execCommand: () =>
        typeof execResult === 'function' ? execResult() : execResult,
    },
    removed,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the clipboard API tier', () => {
  it('is used when it is available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    vi.stubGlobal('document', fakeDocument(false).doc)

    await expect(copyText('H01AA0123456789')).resolves.toBe('clipboard-api')
    expect(writeText).toHaveBeenCalledWith('H01AA0123456789')
  })
})

describe('the execCommand tier', () => {
  it('takes over when the clipboard API rejects', async () => {
    // Safari outside a gesture, or a denied permission.
    const writeText = vi.fn().mockRejectedValue(new Error('NotAllowedError'))
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    vi.stubGlobal('document', fakeDocument(true).doc)

    await expect(copyText('ABC123')).resolves.toBe('exec-command')
    expect(writeText).toHaveBeenCalled()
  })

  it('takes over when there is no clipboard API at all', async () => {
    // Plain http, which is how the staging box serves.
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('document', fakeDocument(true).doc)

    await expect(copyText('ABC123')).resolves.toBe('exec-command')
  })

  it('cleans up the textarea it borrowed', async () => {
    vi.stubGlobal('navigator', {})
    const { doc, removed } = fakeDocument(true)
    vi.stubGlobal('document', doc)

    await copyText('ABC123')

    expect(removed).toHaveLength(1)
  })
})

describe('when nothing works', () => {
  it('reports failure rather than a silent success', async () => {
    // The one that matters: the caller shows an error and the operator copies
    // by hand, instead of pasting whatever was on the clipboard before.
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('document', fakeDocument(false).doc)

    await expect(copyText('ABC123')).resolves.toBe('failed')
  })

  it('reports failure when the fallback itself throws', async () => {
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('document', {
      createElement: () => {
        throw new Error('no DOM')
      },
    })

    await expect(copyText('ABC123')).resolves.toBe('failed')
  })

  it('never claims success when the clipboard API rejects and there is no DOM', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    })
    vi.stubGlobal('document', {
      createElement: () => {
        throw new Error('no DOM')
      },
    })

    await expect(copyText('ABC123')).resolves.not.toBe('clipboard-api')
    await expect(copyText('ABC123')).resolves.toBe('failed')
  })
})
