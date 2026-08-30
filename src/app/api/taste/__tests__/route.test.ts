import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/tasteInterview', () => ({
  getNextTitleToRate: vi.fn(),
  recordTasteRating: vi.fn(),
}))

import { getNextTitleToRate, recordTasteRating } from '@/lib/tasteInterview'
import { GET, POST } from '../route'

describe('GET /api/taste', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the next title to rate', async () => {
    ;(getNextTitleToRate as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 't1', name: 'A' })
    const req = new NextRequest('http://localhost/api/taste?mode=FAMILY')
    const res = await GET(req)
    const body = await res.json()
    expect(body.title.id).toBe('t1')
  })

  it('defaults to FAMILY when mode is missing', async () => {
    ;(getNextTitleToRate as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    const req = new NextRequest('http://localhost/api/taste')
    await GET(req)
    expect(getNextTitleToRate).toHaveBeenCalledWith('default', 'FAMILY')
  })

  it('passes through ADULT when requested', async () => {
    ;(getNextTitleToRate as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    const req = new NextRequest('http://localhost/api/taste?mode=ADULT')
    await GET(req)
    expect(getNextTitleToRate).toHaveBeenCalledWith('default', 'ADULT')
  })

  it('defaults to FAMILY for an invalid mode value', async () => {
    ;(getNextTitleToRate as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    const req = new NextRequest('http://localhost/api/taste?mode=nonsense')
    await GET(req)
    expect(getNextTitleToRate).toHaveBeenCalledWith('default', 'FAMILY')
  })
})

describe('POST /api/taste', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects an invalid rating value', async () => {
    const req = new NextRequest('http://localhost/api/taste', {
      method: 'POST',
      body: JSON.stringify({ titleId: 't1', rating: 'NOT_A_RATING', mode: 'FAMILY' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    expect(recordTasteRating).not.toHaveBeenCalled()
  })

  it('records a valid rating scoped to the given mode', async () => {
    ;(recordTasteRating as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'r1' })
    const req = new NextRequest('http://localhost/api/taste', {
      method: 'POST',
      body: JSON.stringify({ titleId: 't1', rating: 'LOVED', mode: 'ADULT' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(recordTasteRating).toHaveBeenCalledWith('default', 't1', 'ADULT', 'LOVED')
  })

  it('defaults to FAMILY when mode is missing from the body', async () => {
    ;(recordTasteRating as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'r1' })
    const req = new NextRequest('http://localhost/api/taste', {
      method: 'POST',
      body: JSON.stringify({ titleId: 't1', rating: 'LIKED' }),
    })
    await POST(req)
    expect(recordTasteRating).toHaveBeenCalledWith('default', 't1', 'FAMILY', 'LIKED')
  })

  it('accepts NOT_INTERESTED as a valid rating', async () => {
    ;(recordTasteRating as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'r1' })
    const req = new NextRequest('http://localhost/api/taste', {
      method: 'POST',
      body: JSON.stringify({ titleId: 't1', rating: 'NOT_INTERESTED', mode: 'FAMILY' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
  })

  it('accepts WATCHLISTED as a valid rating', async () => {
    ;(recordTasteRating as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'r1' })
    const req = new NextRequest('http://localhost/api/taste', {
      method: 'POST',
      body: JSON.stringify({ titleId: 't1', rating: 'WATCHLISTED', mode: 'FAMILY' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(recordTasteRating).toHaveBeenCalledWith('default', 't1', 'FAMILY', 'WATCHLISTED')
  })
})
