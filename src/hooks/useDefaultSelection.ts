import { useEffect } from 'react'

/**
 * Keeps a `<select>`'s state honest about what it is showing.
 *
 * A select whose value matches none of its options still *renders* the first
 * one, so the operator sees a choice already made. If the state behind it is
 * empty, the form's own "you must choose" guard then refuses a save that looks,
 * on screen, entirely filled in.
 *
 * That is not hypothetical. The inventory page fires five fetches in parallel
 * and seeds its dropdown defaults when a modal opens — so opening the modal
 * before the locations request came back left the location empty while the
 * dropdown filled in behind it. Registering a product with opening stock was
 * rejected with no product created, which is what "the quantity doesn't get
 * added" looks like from the outside.
 *
 * Seeding on arrival rather than at open time fixes the whole class: it also
 * covers a list that reloads, and a value whose option has since disappeared.
 *
 * @param value    current selection
 * @param setValue setter for it
 * @param options  what the select is currently offering
 * @param enabled  pass false to leave the selection alone (e.g. editing an
 *                 existing record, where an empty value is deliberate)
 */
export const useDefaultSelection = (
  value: string,
  setValue: (next: string) => void,
  options: ReadonlyArray<{ id: string }>,
  enabled = true,
) => {
  useEffect(() => {
    if (!enabled || options.length === 0) return

    const stillThere = value !== '' && options.some((o) => o.id === value)
    if (!stillThere) setValue(options[0].id)
    // setValue comes from useState and is stable; listing it would only add noise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, options, enabled])
}

export default useDefaultSelection
