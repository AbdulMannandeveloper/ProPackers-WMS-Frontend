/**
 * What the browser tab says.
 *
 * Every route already declared a `title` in routes/app.ts, routes/client.ts and
 * routes/auth.ts, and nothing ever read them — `document.title` appeared nowhere
 * in the app, so every tab said "Vite + React + TS".
 *
 * A landing page names the business; anywhere else names where you are, because
 * that is what tells two open tabs apart. Kept as a plain function so the rule
 * can be tested without mounting a router.
 */

/**
 * Two words, as the business writes it — and as its invoices already did
 * (utils/invoiceIdentity.js on the server). The app was the odd one out.
 */
export const BRAND = 'Pro Packers UK'

const SEPARATOR = ' · '

/**
 * The roots that show the brand on its own.
 *
 * One per audience: admins and employees land on /app, clients on /client, and
 * signed-out visitors on /. Trailing slashes vary depending on how the user
 * arrived, so both spellings are listed rather than normalised at every call.
 */
const HOME_PATHS = new Set(['/', '/app', '/app/', '/client', '/client/'])

export const isHomePath = (pathname: string) => HOME_PATHS.has(pathname)

/**
 * @param title the route's declared title, if it has one
 * @param pathname the current location, used only to spot a landing page
 */
export const resolveTitle = (title: string | undefined, pathname: string): string => {
  if (isHomePath(pathname)) return BRAND

  const name = title?.trim()
  // A route with no title of its own is better off showing the brand than an
  // empty separator or the literal word "undefined".
  if (!name) return BRAND

  return `${name}${SEPARATOR}${BRAND}`
}
