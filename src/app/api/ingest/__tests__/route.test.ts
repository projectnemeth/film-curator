import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/tmdb', () => ({
  discoverByProvider: vi.fn(),
  getWatchProviders: vi.fn(),
  getMovieDetails: vi.fn(),
  PROVIDER_IDS: { netflix: 8, disney_plus: 337, prime_video: 9, peacock: 386 },
}))
vi.mock('@/lib/prisma', () => ({
  prisma: { title: { upsert: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() } },
}))

import { discoverByProvider, getWatchProviders, getMovieDetails } from '@/lib/tmdb'
import { prisma } from '@/lib/prisma'
import { GET } from '../route'

const originalSecret = process.env.CRON_SECRET

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = 'test-secret'
  ;(discoverByProvider as ReturnType<typeof vi.fn>).mockResolvedValue([])
  ;(getWatchProviders as ReturnType<typeof vi.fn>).mockResolvedValue([])
  ;(getMovieDetails as ReturnType<typeof vi.fn>).mockResolvedValue({
    certification: null,
    director: null,
    writer: null,
    topCast: [],
    studio: null,
  })
  ;(prisma.title.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0 })
})

afterEach(() => {
  process.env.CRON_SECRET = originalSecret
})

describe('GET /api/ingest', () => {
  it('rejects requests without the correct bearer token', async () => {
    const req = new NextRequest('http://localhost/api/ingest')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns 500 when CRON_SECRET is not configured, rather than authenticating "Bearer undefined"', async () => {
    delete process.env.CRON_SECRET
    const req = new NextRequest('http://localhost/api/ingest', { headers: { authorization: 'Bearer undefined' } })
    const res = await GET(req)
    expect(res.status).toBe(500)
  })

  it('ingests titles for every provider and media type, counting failures', async () => {
    ;(discoverByProvider as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ id: 1, title: 'A', overview: '', poster_path: null, release_date: '2020-01-01' }])
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue([])
    ;(getWatchProviders as ReturnType<typeof vi.fn>).mockResolvedValue(['netflix'])
    ;(prisma.title.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({})

    const req = new NextRequest('http://localhost/api/ingest', { headers: { authorization: 'Bearer test-secret' } })
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ingested).toBe(1)
    expect(body.failed).toBe(1)
  })

  it('captures the MPAA rating from TMDB and stores it on the title', async () => {
    ;(discoverByProvider as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ id: 1, title: 'A', overview: '', poster_path: null, release_date: '2020-01-01' }])
      .mockResolvedValue([])
    ;(getWatchProviders as ReturnType<typeof vi.fn>).mockResolvedValue(['netflix'])
    ;(getMovieDetails as ReturnType<typeof vi.fn>).mockResolvedValue({ certification: 'PG-13', director: null, writer: null, topCast: [], studio: null })
    ;(prisma.title.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({})

    const req = new NextRequest('http://localhost/api/ingest', { headers: { authorization: 'Bearer test-secret' } })
    await GET(req)

    expect(prisma.title.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ mpaaRating: 'PG-13' }),
        create: expect.objectContaining({ mpaaRating: 'PG-13' }),
      })
    )
  })

  it('does not overwrite an existing rating when the certification comes back null', async () => {
    ;(discoverByProvider as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ id: 1, title: 'A', overview: '', poster_path: null, release_date: '2020-01-01' }])
      .mockResolvedValue([])
    ;(getWatchProviders as ReturnType<typeof vi.fn>).mockResolvedValue(['netflix'])
    ;(prisma.title.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({})

    const req = new NextRequest('http://localhost/api/ingest', { headers: { authorization: 'Bearer test-secret' } })
    await GET(req)

    expect(prisma.title.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.not.objectContaining({ mpaaRating: expect.anything() }),
      })
    )
  })

  it('captures the director, writer, top cast, and studio from TMDB and stores them on the title', async () => {
    ;(discoverByProvider as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ id: 1, title: 'A', overview: '', poster_path: null, release_date: '2020-01-01' }])
      .mockResolvedValue([])
    ;(getWatchProviders as ReturnType<typeof vi.fn>).mockResolvedValue(['netflix'])
    ;(getMovieDetails as ReturnType<typeof vi.fn>).mockResolvedValue({
      certification: null,
      director: 'Steven Spielberg',
      writer: 'David Koepp',
      topCast: ['Sam Neill', 'Laura Dern'],
      studio: 'Universal Pictures',
    })
    ;(prisma.title.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({})

    const req = new NextRequest('http://localhost/api/ingest', { headers: { authorization: 'Bearer test-secret' } })
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
    ;(discoverByProvider as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ id: 1, title: 'A', overview: '', poster_path: null, release_date: '2020-01-01' }])
      .mockResolvedValue([])
    ;(getWatchProviders as ReturnType<typeof vi.fn>).mockResolvedValue(['netflix'])
    ;(prisma.title.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({})

    const req = new NextRequest('http://localhost/api/ingest', { headers: { authorization: 'Bearer test-secret' } })
    await GET(req)

    const call = (prisma.title.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.update).not.toHaveProperty('director')
    expect(call.update).not.toHaveProperty('writer')
    expect(call.update).not.toHaveProperty('topCast')
    expect(call.update).not.toHaveProperty('studio')
  })

  it('skips re-fetching movie details for a title that already has all of them', async () => {
    ;(discoverByProvider as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ id: 1, title: 'A', overview: '', poster_path: null, release_date: '2020-01-01' }])
      .mockResolvedValue([])
    ;(getWatchProviders as ReturnType<typeof vi.fn>).mockResolvedValue(['netflix'])
    ;(prisma.title.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      mpaaRating: 'PG-13',
      director: 'Steven Spielberg',
      writer: 'David Koepp',
      topCast: ['Sam Neill', 'Laura Dern'],
      studio: 'Universal Pictures',
    })
    ;(prisma.title.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({})

    const req = new NextRequest('http://localhost/api/ingest', { headers: { authorization: 'Bearer test-secret' } })
    await GET(req)

    expect(getMovieDetails).not.toHaveBeenCalled()
    expect(getWatchProviders).toHaveBeenCalled()
    expect(prisma.title.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          mpaaRating: 'PG-13',
          director: 'Steven Spielberg',
          writer: 'David Koepp',
          topCast: ['Sam Neill', 'Laura Dern'],
          studio: 'Universal Pictures',
        }),
      })
    )
  })

  it('still fetches movie details for a new title with no existing row', async () => {
    ;(discoverByProvider as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ id: 1, title: 'A', overview: '', poster_path: null, release_date: '2020-01-01' }])
      .mockResolvedValue([])
    ;(getWatchProviders as ReturnType<typeof vi.fn>).mockResolvedValue(['netflix'])
    ;(prisma.title.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    ;(prisma.title.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({})

    const req = new NextRequest('http://localhost/api/ingest', { headers: { authorization: 'Bearer test-secret' } })
    await GET(req)

    expect(getMovieDetails).toHaveBeenCalledWith(1)
  })

  it('re-fetches movie details when an existing row is only missing writer or studio', async () => {
    ;(discoverByProvider as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ id: 1, title: 'A', overview: '', poster_path: null, release_date: '2020-01-01' }])
      .mockResolvedValue([])
    ;(getWatchProviders as ReturnType<typeof vi.fn>).mockResolvedValue(['netflix'])
    ;(prisma.title.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      mpaaRating: 'PG-13',
      director: 'Steven Spielberg',
      writer: null,
      topCast: ['Sam Neill'],
      studio: null,
    })
    ;(prisma.title.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({})

    const req = new NextRequest('http://localhost/api/ingest', { headers: { authorization: 'Bearer test-secret' } })
    await GET(req)

    expect(getMovieDetails).toHaveBeenCalledWith(1)
  })

  it('discovers from every provider', async () => {
    const req = new NextRequest('http://localhost/api/ingest', { headers: { authorization: 'Bearer test-secret' } })
    await GET(req)

    expect(discoverByProvider).toHaveBeenCalledTimes(4)
  })

  it('fetches a second page for a provider whose first page is full, and stops once a page comes back empty', async () => {
    ;(discoverByProvider as ReturnType<typeof vi.fn>).mockImplementation(async (_providerId: number, page = 1) => {
      if (page === 1) return [{ id: 1, title: 'Page One Movie', overview: '', poster_path: null, release_date: '2020-01-01' }]
      if (page === 2) return [{ id: 2, title: 'Page Two Movie', overview: '', poster_path: null, release_date: '2020-01-01' }]
      return []
    })
    ;(getWatchProviders as ReturnType<typeof vi.fn>).mockResolvedValue(['netflix'])
    ;(prisma.title.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({})

    const req = new NextRequest('http://localhost/api/ingest', { headers: { authorization: 'Bearer test-secret' } })
    const res = await GET(req)
    const body = await res.json()

    // 2 real pages + 1 empty page (the stop signal) per provider, across 4 providers.
    expect(discoverByProvider).toHaveBeenCalledTimes(12)
    expect(body.ingested).toBe(8) // 2 movies/provider x 4 providers
  })

  it('stops starting new discovery/ingestion work once the time budget is exceeded', async () => {
    ;(discoverByProvider as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 1, title: 'A', overview: '', poster_path: null, release_date: '2020-01-01' },
    ])
    ;(getWatchProviders as ReturnType<typeof vi.fn>).mockResolvedValue(['netflix'])
    ;(prisma.title.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({})

    const realNow = Date.now.bind(Date)
    let call = 0
    vi.spyOn(Date, 'now').mockImplementation(() => {
      call++
      if (call <= 2) return realNow()
      return realNow() + 999_999
    })

    const req = new NextRequest('http://localhost/api/ingest', { headers: { authorization: 'Bearer test-secret' } })
    const res = await GET(req)
    const body = await res.json()

    // The first provider's first page is discovered (within budget), but the very next
    // time check — before processing its one item — trips the deadline, so nothing
    // is ever actually ingested and no further provider/page is ever attempted.
    expect(discoverByProvider).toHaveBeenCalledTimes(1)
    expect(body.ingested).toBe(0)

    vi.restoreAllMocks()
  })

  it('prunes providers from titles untouched by a run that exhausts every provider cleanly', async () => {
    ;(discoverByProvider as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(prisma.title.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 3 })

    const req = new NextRequest('http://localhost/api/ingest', { headers: { authorization: 'Bearer test-secret' } })
    const res = await GET(req)
    const body = await res.json()

    expect(prisma.title.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          familyId: 'default',
          providers: { isEmpty: false },
          updatedAt: { lt: expect.any(Date) },
        }),
        data: { providers: [] },
      })
    )
    expect(body.pruned).toBe(3)
  })

  it('does not prune when the run is cut short by the time budget', async () => {
    ;(discoverByProvider as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 1, title: 'A', overview: '', poster_path: null, release_date: '2020-01-01' },
    ])
    ;(getWatchProviders as ReturnType<typeof vi.fn>).mockResolvedValue(['netflix'])
    ;(prisma.title.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({})

    const realNow = Date.now.bind(Date)
    let call = 0
    vi.spyOn(Date, 'now').mockImplementation(() => {
      call++
      if (call <= 2) return realNow()
      return realNow() + 999_999
    })

    const req = new NextRequest('http://localhost/api/ingest', { headers: { authorization: 'Bearer test-secret' } })
    const res = await GET(req)
    const body = await res.json()

    expect(prisma.title.updateMany).not.toHaveBeenCalled()
    expect(body.pruned).toBe(0)

    vi.restoreAllMocks()
  })

  it('does not prune when a provider discovery request fails partway through', async () => {
    ;(discoverByProvider as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ id: 1, title: 'A', overview: '', poster_path: null, release_date: '2020-01-01' }])
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue([])
    ;(getWatchProviders as ReturnType<typeof vi.fn>).mockResolvedValue(['netflix'])
    ;(prisma.title.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({})

    const req = new NextRequest('http://localhost/api/ingest', { headers: { authorization: 'Bearer test-secret' } })
    const res = await GET(req)
    const body = await res.json()

    expect(prisma.title.updateMany).not.toHaveBeenCalled()
    expect(body.pruned).toBe(0)
  })

  it('excludes titles whose ingest failed this run from pruning, even though the run otherwise completed', async () => {
    ;(discoverByProvider as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ id: 42, title: 'A', overview: '', poster_path: null, release_date: '2020-01-01' }])
      .mockResolvedValue([])
    ;(getWatchProviders as ReturnType<typeof vi.fn>).mockResolvedValue(['netflix'])
    ;(prisma.title.upsert as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('db down'))

    const req = new NextRequest('http://localhost/api/ingest', { headers: { authorization: 'Bearer test-secret' } })
    const res = await GET(req)
    const body = await res.json()

    expect(body.failed).toBe(1)
    expect(prisma.title.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tmdbId: { notIn: [42] } }),
      })
    )
  })
})

describe('maxDuration', () => {
  it('exports a maxDuration of 300 seconds — this route makes up to two TMDB calls per item across up to ~800 items (10 pages x 4 providers x 20/page)', async () => {
    const routeModule = await import('../route')
    expect(routeModule.maxDuration).toBe(300)
  })
})
