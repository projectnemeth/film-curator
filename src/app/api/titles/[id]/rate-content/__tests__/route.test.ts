import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/contentScoring', () => ({
  getOrCreateContentScore: vi.fn(),
}))

import { getOrCreateContentScore } from '@/lib/contentScoring'
import { POST } from '../route'

describe('POST /api/titles/[id]/rate-content', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the synthesized score on success', async () => {
    const score = { id: 'cs1', titleId: 't1', violence: 3, language: 1, sexNudity: 0, scariness: 5, isUnrated: false, isNC17: false, sourceNotes: 'test' }
    ;(getOrCreateContentScore as ReturnType<typeof vi.fn>).mockResolvedValue(score)

    const req = new NextRequest('http://localhost/api/titles/t1/rate-content', { method: 'POST' })
    const res = await POST(req, { params: Promise.resolve({ id: 't1' }) })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.score).toEqual(score)
    expect(getOrCreateContentScore).toHaveBeenCalledWith('t1', expect.any(AbortSignal))
  })

  it('returns a 504 when scoring fails or times out', async () => {
    ;(getOrCreateContentScore as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('timed out'))

    const req = new NextRequest('http://localhost/api/titles/t1/rate-content', { method: 'POST' })
    const res = await POST(req, { params: Promise.resolve({ id: 't1' }) })

    expect(res.status).toBe(504)
  })
})
