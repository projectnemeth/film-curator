import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/tasteInterview', () => ({
  getNextTitleToRate: vi.fn(),
  recordTasteRating: vi.fn(),
}))

import { getNextTitleToRate, recordTasteRating } from '@/lib/tasteInterview'
import { GET, POST } from '../route'

describe('GET /api/taste', () => {
  it('returns the next title to rate', async () => {
    ;(getNextTitleToRate as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 't1', name: 'A' })
    const res = await GET()
    const body = await res.json()
    expect(body.title.id).toBe('t1')
  })
})

describe('POST /api/taste', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects an invalid rating value', async () => {
    const req = new NextRequest('http://localhost/api/taste', {
      method: 'POST',
      body: JSON.stringify({ titleId: 't1', rating: 'NOT_A_RATING' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    expect(recordTasteRating).not.toHaveBeenCalled()
  })

  it('records a valid rating', async () => {
    ;(recordTasteRating as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'r1' })
    const req = new NextRequest('http://localhost/api/taste', {
      method: 'POST',
      body: JSON.stringify({ titleId: 't1', rating: 'LOVED' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(recordTasteRating).toHaveBeenCalledWith('default', 't1', 'LOVED')
  })
})
