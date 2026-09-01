import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/session', async () => {
  const actual = await vi.importActual<typeof import('@/lib/session')>('@/lib/session')
  return {
    ...actual,
    signSession: vi.fn().mockResolvedValue('signed-session-value'),
  }
})

import { signSession } from '@/lib/session'
import { POST } from '../route'

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  vi.clearAllMocks()
  process.env.FAMILY_PASSCODE = 'correct-horse'
  process.env.SESSION_SECRET = 'test-secret'
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

function jsonRequest(body: unknown) {
  return new NextRequest('http://localhost/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('POST /api/auth/login', () => {
  it('returns 500 when FAMILY_PASSCODE is unset', async () => {
    delete process.env.FAMILY_PASSCODE
    const res = await POST(jsonRequest({ passcode: 'anything' }))
    expect(res.status).toBe(500)
  })

  it('returns 500 when SESSION_SECRET is unset', async () => {
    delete process.env.SESSION_SECRET
    const res = await POST(jsonRequest({ passcode: 'anything' }))
    expect(res.status).toBe(500)
  })

  it('returns 401 on an incorrect passcode', async () => {
    const res = await POST(jsonRequest({ passcode: 'wrong' }))
    expect(res.status).toBe(401)
    expect(signSession).not.toHaveBeenCalled()
  })

  it('sets a session cookie and returns 200 on the correct passcode', async () => {
    const res = await POST(jsonRequest({ passcode: 'correct-horse' }))
    expect(res.status).toBe(200)
    expect(signSession).toHaveBeenCalledWith('test-secret')
    const cookie = res.cookies.get('familyAuth')
    expect(cookie?.value).toBe('signed-session-value')
    expect(cookie?.httpOnly).toBe(true)
  })
})
