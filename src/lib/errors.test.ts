/**
 * Turning a failed request into something a person can act on.
 *
 * This is the half of the problem that a nicer dialog does not solve. The API
 * writes failure messages to be read, and axios overwrites the useful one with
 * "Request failed with status code 400" on `err.message` — so a handler reaching
 * for that shows the status code and discards the sentence explaining what to do.
 */

import { describe, it, expect } from 'vitest'

import { errorMessage, isAuthFailure } from './errors'

/** An axios-shaped failure: server body plus axios's own generic message. */
const apiError = (status: number, data: unknown) => ({
  response: { status, data },
  message: `Request failed with status code ${status}`,
})

describe('the server message wins', () => {
  it('is preferred over the axios string', () => {
    // The whole point.
    const err = apiError(400, {
      error: 'That service is not set up for this client.',
    })

    expect(errorMessage(err)).toBe('That service is not set up for this client.')
  })

  it('never shows the axios boilerplate, even with no body', () => {
    expect(errorMessage(apiError(400, undefined))).not.toMatch(/status code/i)
  })

  it('reads `message` when there is no `error`', () => {
    expect(errorMessage(apiError(400, { message: 'Quantity must be above zero.' })))
      .toBe('Quantity must be above zero.')
  })

  it('prefers `error` over `message` when both are present', () => {
    const err = apiError(400, { error: 'The specific one', message: 'The vague one' })
    expect(errorMessage(err)).toBe('The specific one')
  })

  it('accepts a plain-text body', () => {
    expect(errorMessage(apiError(400, 'Plain text refusal'))).toBe('Plain text refusal')
  })

  it('ignores an HTML error page', () => {
    // A proxy or gateway returning its own page is noise, not a message.
    const err = apiError(502, '<!DOCTYPE html><html><body>Bad Gateway</body></html>')
    expect(errorMessage(err)).not.toMatch(/DOCTYPE/)
    expect(errorMessage(err)).toMatch(/try again/i)
  })

  it('ignores an empty or whitespace body', () => {
    expect(errorMessage(apiError(403, { error: '   ' }))).toMatch(/permission/i)
  })
})

describe('statuses that arrive with no useful body', () => {
  it('explains an expired session', () => {
    expect(errorMessage(apiError(401, {}))).toMatch(/session has expired/i)
  })

  it('explains a permission refusal', () => {
    expect(errorMessage(apiError(403, {}))).toMatch(/permission/i)
  })

  it('explains a missing record', () => {
    expect(errorMessage(apiError(404, {}))).toMatch(/no longer exists/i)
  })

  it('explains rate limiting', () => {
    expect(errorMessage(apiError(429, {}))).toMatch(/too many/i)
  })

  it('explains a server fault without blaming the user', () => {
    expect(errorMessage(apiError(500, {}))).toMatch(/server had a problem/i)
  })
})

describe('when the request never arrived', () => {
  it('says so rather than guessing', () => {
    const err = { code: 'ERR_NETWORK', message: 'Network Error' }
    expect(errorMessage(err)).toMatch(/could not reach the server/i)
  })

  it('treats a timeout the same way', () => {
    const err = { code: 'ECONNABORTED', message: 'timeout of 5000ms exceeded' }
    expect(errorMessage(err)).toMatch(/could not reach the server/i)
  })
})

describe('things that are not axios errors', () => {
  it('passes through an ordinary Error', () => {
    expect(errorMessage(new Error('Something local broke'))).toBe('Something local broke')
  })

  it('falls back for null and undefined', () => {
    expect(errorMessage(null, 'Could not save the client.')).toBe('Could not save the client.')
    expect(errorMessage(undefined, 'Could not save the client.')).toBe('Could not save the client.')
  })

  it('falls back for a string thrown on its own', () => {
    expect(errorMessage('oops', 'Could not save.')).toBe('Could not save.')
  })

  it('never returns undefined or an empty string', () => {
    // A dialog with no text is worse than a vague one.
    for (const err of [null, undefined, {}, { response: {} }, 42, [], 'x']) {
      const message = errorMessage(err)
      expect(typeof message).toBe('string')
      expect(message.length).toBeGreaterThan(0)
    }
  })
})

describe('spotting a lost session', () => {
  it('recognises a 401', () => {
    expect(isAuthFailure(apiError(401, {}))).toBe(true)
  })

  it('does not confuse a 403 for one', () => {
    // Being signed out and being refused are different problems with different
    // fixes; telling someone to sign in again when they simply lack permission
    // sends them round in circles.
    expect(isAuthFailure(apiError(403, {}))).toBe(false)
  })
})
