import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/session', () => ({
  verifySession: vi.fn().mockResolvedValue(false),
}))

import { middleware } from '../middleware'

describe('middleware', () => {
  it('does not redirect requests to /api/ingest, regardless of cookie state', async () => {
    const req = new NextRequest('http://localhost/api/ingest')
    const res = await middleware(req)

    expect(res.status).not.toBe(307)
    expect(res.status).not.toBe(308)
    expect(res.headers.get('location')).toBeNull()
  })

  it('still redirects an unauthenticated request to an unrelated protected route', async () => {
    const req = new NextRequest('http://localhost/rate')
    const res = await middleware(req)

    expect(res.status === 307 || res.status === 308).toBe(true)
    expect(res.headers.get('location')).toContain('/login')
  })

  it('returns 401 JSON for an unauthenticated API request instead of redirecting to a login HTML page', async () => {
    const req = new NextRequest('http://localhost/api/recommendations?mode=FAMILY')
    const res = await middleware(req)

    expect(res.status).toBe(401)
    expect(res.headers.get('location')).toBeNull()
    const body = await res.json()
    expect(body).toEqual({ error: 'unauthorized' })
  })
})
