import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/tmdb', () => ({
  searchTitle: vi.fn(),
  getWatchProviders: vi.fn(),
  getMovieDetails: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: { title: { upsert: vi.fn() } },
}))

import { searchTitle, getWatchProviders, getMovieDetails } from '@/lib/tmdb'
import { prisma } from '@/lib/prisma'
import { GET } from '../route'

describe('GET /api/search', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(getMovieDetails as ReturnType<typeof vi.fn>).mockResolvedValue({
      certification: null,
      director: null,
      writer: null,
      topCast: [],
      studio: null,
    })
  })

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
    ;(getMovieDetails as ReturnType<typeof vi.fn>).mockResolvedValue({ certification: 'PG-13', director: null, writer: null, topCast: [], studio: null })
    ;(prisma.title.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 't1', name: 'Jurassic Park' })

    const req = new NextRequest('http://localhost/api/search?q=jurassic')
    await GET(req)

    expect(prisma.title.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ mpaaRating: 'PG-13' }) })
    )
  })

  it('does not overwrite an existing rating when the certification comes back null', async () => {
    ;(searchTitle as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 42, title: 'Jurassic Park', overview: '...', poster_path: '/x.jpg', release_date: '1993-06-11' },
    ])
    ;(getWatchProviders as ReturnType<typeof vi.fn>).mockResolvedValue(['netflix'])
    ;(prisma.title.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 't1', name: 'Jurassic Park' })

    const req = new NextRequest('http://localhost/api/search?q=jurassic')
    await GET(req)

    expect(prisma.title.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.not.objectContaining({ mpaaRating: expect.anything() }) })
    )
  })

  it('captures the director, writer, top cast, and studio alongside providers', async () => {
    ;(searchTitle as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 42, title: 'Jurassic Park', overview: '...', poster_path: '/x.jpg', release_date: '1993-06-11' },
    ])
    ;(getWatchProviders as ReturnType<typeof vi.fn>).mockResolvedValue(['netflix'])
    ;(getMovieDetails as ReturnType<typeof vi.fn>).mockResolvedValue({
      certification: null,
      director: 'Steven Spielberg',
      writer: 'David Koepp',
      topCast: ['Sam Neill', 'Laura Dern'],
      studio: 'Universal Pictures',
    })
    ;(prisma.title.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 't1', name: 'Jurassic Park' })

    const req = new NextRequest('http://localhost/api/search?q=jurassic')
    await GET(req)

    expect(prisma.title.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          director: 'Steven Spielberg',
          writer: 'David Koepp',
          topCast: ['Sam Neill', 'Laura Dern'],
          studio: 'Universal Pictures',
        }),
        create: expect.objectContaining({
          director: 'Steven Spielberg',
          writer: 'David Koepp',
          topCast: ['Sam Neill', 'Laura Dern'],
          studio: 'Universal Pictures',
        }),
      })
    )
  })

  it('does not overwrite existing director/writer/cast/studio when TMDB returns none of them', async () => {
    ;(searchTitle as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 42, title: 'Jurassic Park', overview: '...', poster_path: '/x.jpg', release_date: '1993-06-11' },
    ])
    ;(getWatchProviders as ReturnType<typeof vi.fn>).mockResolvedValue(['netflix'])
    ;(prisma.title.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 't1', name: 'Jurassic Park' })

    const req = new NextRequest('http://localhost/api/search?q=jurassic')
    await GET(req)

    const call = (prisma.title.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.update).not.toHaveProperty('director')
    expect(call.update).not.toHaveProperty('writer')
    expect(call.update).not.toHaveProperty('topCast')
    expect(call.update).not.toHaveProperty('studio')
  })

  it('skips TV results, only adding movies', async () => {
    ;(searchTitle as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 66732, name: 'Stranger Things', overview: '...', poster_path: '/x.jpg', first_air_date: '2016-07-15' },
      { id: 42, title: 'Jurassic Park', overview: '...', poster_path: '/x.jpg', release_date: '1993-06-11' },
    ])
    ;(getWatchProviders as ReturnType<typeof vi.fn>).mockResolvedValue(['netflix'])
    ;(getMovieDetails as ReturnType<typeof vi.fn>).mockResolvedValue({ certification: 'PG-13', director: null, writer: null, topCast: [], studio: null })
    ;(prisma.title.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 't1', name: 'Jurassic Park' })

    const req = new NextRequest('http://localhost/api/search?q=x')
    const body = await (await GET(req)).json()

    expect(prisma.title.upsert).toHaveBeenCalledTimes(1)
    expect(prisma.title.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { familyId_tmdbId: { familyId: 'default', tmdbId: 42 } } })
    )
    expect(body.titles).toEqual([{ id: 't1', name: 'Jurassic Park' }])
  })
})
