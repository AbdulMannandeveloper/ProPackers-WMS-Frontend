/**
 * What a scan that matched nothing offers.
 *
 * This panel used to refuse outright — "Add the product from the catalogue
 * first, then scan it" — on the grounds that a mis-scan would create a
 * duplicate SKU. The refusal is gone because an operator holding a new carton
 * needs a way through, but the reasoning behind it was sound, so attaching to
 * an existing product stays the first thing offered and creating sits below it.
 */

import type { ComponentProps } from 'react'

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// vi.mock is hoisted above every import, so the spy has to be hoisted with it.
const { attachBarcode } = vi.hoisted(() => ({ attachBarcode: vi.fn() }))

vi.mock('@/api', () => ({
  products: { attachBarcode },
}))

import { ScanResultPanel } from './ScanResultPanel'

const PRODUCTS = [
  { id: 'p1', skuCode: 'SKU-100', productName: 'Blue Tape', isDeactivated: false },
  { id: 'p2', skuCode: 'SKU-200', productName: 'Bubble Wrap', isDeactivated: false },
] as unknown as PanelProps['allProducts']

type PanelProps = ComponentProps<typeof ScanResultPanel>

const setup = (overrides: Partial<PanelProps> = {}) => {
  const props: PanelProps = {
    code: '5012345678900',
    matches: [],
    notFound: true,
    allProducts: PRODUCTS,
    onPick: vi.fn(),
    onAttached: vi.fn(),
    onError: vi.fn(),
    onCreateNew: vi.fn(),
    ...overrides,
  }
  render(<ScanResultPanel {...props} />)
  return props
}

beforeEach(() => {
  vi.clearAllMocks()
  attachBarcode.mockResolvedValue({})
})

describe('a code that matched nothing', () => {
  it('offers to register it as a new product', () => {
    setup()
    expect(screen.getByRole('button', { name: /register this as a new product/i })).toBeTruthy()
  })

  it('hands the scanned code back so the form can prefill the barcode', async () => {
    // Without the code, the operator would have to retype the digits they
    // scanned precisely to avoid retyping.
    const user = userEvent.setup()
    const props = setup({ code: '5012345678900' })

    await user.click(screen.getByRole('button', { name: /register this as a new product/i }))

    expect(props.onCreateNew).toHaveBeenCalledWith('5012345678900')
  })

  it('still offers attaching to an existing product, and lists it first', () => {
    // The ordering is the guard: a label that was simply never registered is
    // the common case, and creating is the fallback.
    setup()

    const attach = screen.getAllByRole('button', { name: /attach code/i })[0]
    const create = screen.getByRole('button', { name: /register this as a new product/i })

    expect(attach).toBeTruthy()
    // Node.compareDocumentPosition: 4 means `create` follows `attach`.
    expect(attach.compareDocumentPosition(create) & 4).toBeTruthy()
  })

  it('attaches to the product the operator chose', async () => {
    const user = userEvent.setup()
    const props = setup()

    await user.click(screen.getAllByRole('button', { name: /attach code/i })[0])

    expect(attachBarcode).toHaveBeenCalledWith('p1', '5012345678900')
    expect(props.onAttached).toHaveBeenCalled()
  })
})

describe('a code that did match', () => {
  it('does not offer to create anything', () => {
    // Creating here would make a duplicate of the product already on screen.
    setup({
      notFound: false,
      matches: [
        {
          id: 'p1',
          clientId: 'c1',
          skuCode: 'SKU-100',
          productName: 'Blue Tape',
          thresholdLimit: 5,
          isDeactivated: false,
          client: { id: 'c1', companyName: 'Acme Ltd' },
          stockLevels: [],
        },
      ],
    })

    expect(screen.queryByRole('button', { name: /register this as a new product/i })).toBeNull()
    expect(screen.getByRole('button', { name: /open this product/i })).toBeTruthy()
  })
})
