import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/tmdb', () => ({
  searchTitle: vi.fn(),
  getWatchProviders: vi.fn(),
  getCertification: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: { title: { upsert: vi.fn() } },
}))

import { searchTitle, getWatchProviders, getCertification } from '@/lib/tmdb'
import { prisma } from '@/lib/prisma'
import { GET } from '../route'

describe('GET /api/search', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 400 when q is missing', async () => {
    const req = new NextRequest('http://localhost/api/search')
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('searches TMDB, upserts results, and returns them', async () => {
    ;(searchTitle as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 42, title: 'Jurassic Park', overview: '...', poster_path: '/x.jpg', release_date: '1993-06-11' },
    ])
    ;(getWatchProviders as ReturnType<typeof vi.fn>).mockResolvedValue(['netflix'])
    ;(getCertification as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    ;(prisma.title.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 't1', name: 'Jurassic Park' })

    const req = new NextRequest('http://localhost/api/search?q=jurassic')
    const res = await GET(req)
    const body = await res.json()

    expect(prisma.title.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { familyId_tmdbId: { familyId: 'default', tmdbId: 42 } },
      })
    )
    expect(body.titles).toEqual([{ id: 't1', name: 'Jurassic Park' }])
  })

  it('captures the MPAA rating alongside providers', async () => {
    ;(searchTitle as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 42, title: 'Jurassic Park', overview: '...', poster_path: '/x.jpg', release_date: '1993-06-11' },
    ])
    ;(getWatchProviders as ReturnType<typeof vi.fn>).mockResolvedValue(['netflix'])
    ;(getCertification as ReturnType<typeof vi.fn>).mockResolvedValue('PG-13')
    ;(prisma.title.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 't1', name: 'Jurassic Park' })

    const req = new NextRequest('http://localhost/api/search?q=jurassic')
    await GET(req)

    expect(prisma.title.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ mpaaRating: 'PG-13' }) })
    )
  })
})
