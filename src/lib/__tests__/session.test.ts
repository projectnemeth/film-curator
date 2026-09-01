// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { signSession, verifySession } from '../session'

const SECRET = 'test-session-secret'
const DAY_MS = 24 * 60 * 60 * 1000

describe('signSession / verifySession', () => {
  it('a freshly signed session verifies true', async () => {
    const cookie = await signSession(SECRET)
    expect(await verifySession(cookie, SECRET, 90 * DAY_MS)).toBe(true)
  })

  it('rejects a session signed with a different secret', async () => {
    const cookie = await signSession(SECRET)
    expect(await verifySession(cookie, 'wrong-secret', 90 * DAY_MS)).toBe(false)
  })

  it('rejects a tampered payload', async () => {
    const cookie = await signSession(SECRET)
    const [payload, signature] = cookie.split('.')
    const tampered = `${payload}x.${signature}`
    expect(await verifySession(tampered, SECRET, 90 * DAY_MS)).toBe(false)
  })

  it('rejects a tampered signature', async () => {
    const cookie = await signSession(SECRET)
    const [payload, signature] = cookie.split('.')
    const tampered = `${payload}.${signature}x`
    expect(await verifySession(tampered, SECRET, 90 * DAY_MS)).toBe(false)
  })

  it('rejects an expired session', async () => {
    const oldIssuedAt = Date.now() - 100 * DAY_MS
    const cookie = await signSession(SECRET, oldIssuedAt)
    expect(await verifySession(cookie, SECRET, 90 * DAY_MS)).toBe(false)
  })

  it('rejects a session issued in the future', async () => {
    const futureIssuedAt = Date.now() + DAY_MS
    const cookie = await signSession(SECRET, futureIssuedAt)
    expect(await verifySession(cookie, SECRET, 90 * DAY_MS)).toBe(false)
  })

  it('rejects a malformed cookie value without throwing', async () => {
    expect(await verifySession('not-a-valid-cookie', SECRET, 90 * DAY_MS)).toBe(false)
    expect(await verifySession('', SECRET, 90 * DAY_MS)).toBe(false)
    expect(await verifySession('a.b.c', SECRET, 90 * DAY_MS)).toBe(false)
  })
})
