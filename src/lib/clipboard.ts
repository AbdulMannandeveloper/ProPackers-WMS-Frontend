/**
 * Copying a tracking number, on every browser the warehouse actually uses.
 *
 * navigator.clipboard is unavailable in more situations than it looks:
 * it is undefined on any non-HTTPS origin except localhost, which includes the
 * plain-http staging box, and Safari rejects the write unless it happens
 * synchronously inside the user gesture. So there are three tiers, and the
 * caller is told which one ran — a silent no-op here would leave an operator
 * pasting the previous parcel's number onto the wrong label.
 */

export type CopyOutcome = 'clipboard-api' | 'exec-command' | 'failed'

export const copyText = async (text: string): Promise<CopyOutcome> => {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return 'clipboard-api'
    } catch {
      // Permission denied, or a non-secure context that still exposes the API.
      // Fall through rather than reporting success.
    }
  }

  // Deprecated, but it is what works without HTTPS.
  try {
    const el = document.createElement('textarea')
    el.value = text
    // Off-screen rather than hidden: a display:none element cannot be selected.
    el.setAttribute('readonly', '')
    el.style.position = 'fixed'
    el.style.top = '-1000px'
    el.style.opacity = '0'
    document.body.appendChild(el)
    el.select()
    el.setSelectionRange(0, text.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(el)
    if (ok) return 'exec-command'
  } catch {
    // Fall through.
  }

  return 'failed'
}
