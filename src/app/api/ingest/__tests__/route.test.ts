import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/tmdb', () => ({
  discoverByProvider: vi.fn(),
  getWatchProviders: vi.fn(),
  getCertification: vi.fn(),
  getCredits: vi.fn(),
  PROVIDER_IDS: { netflix: 8, disney_plus: 337, prime_video: 9, peacock: 386 },
}))
vi.mock('@/lib/prisma', () => ({
  prisma: { title: { upsert: vi.fn() } },
}))

import { discoverByProvider, getWatchProviders, getCertification, getCredits } from '@/lib/tmdb'
import { prisma } from '@/lib/prisma'
import { GET } from '../route'

const originalSecret = process.env.CRON_SECRET

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = 'test-secret'
  ;(discoverByProvider as ReturnType<typeof vi.fn>).mockResolvedValue([])
  ;(getWatchProviders as ReturnType<typeof vi.fn>).mockResolvedValue([])
  ;(getCertification as ReturnType<typeof vi.fn>).mockResolvedValue(null)
  ;(getCredits as ReturnType<typeof vi.fn>).mockResolvedValue({ director: null, topCast: [] })
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

  it('captures the MPAA/TV rating from TMDB and stores it on the title', async () => {
    ;(discoverByProvider as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ id: 1, title: 'A', overview: '', poster_path: null, release_date: '2020-01-01' }])
      .mockResolvedValue([])
    ;(getWatchProviders as ReturnType<typeof vi.fn>).mockResolvedValue(['netflix'])
    ;(getCertification as ReturnType<typeof vi.fn>).mockResolvedValue('PG-13')
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

  it('does not overwrite an existing rating when getCertification returns null', async () => {
    ;(discoverByProvider as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ id: 1, title: 'A', overview: '', poster_path: null, release_date: '2020-01-01' }])
      .mockResolvedValue([])
    ;(getWatchProviders as ReturnType<typeof vi.fn>).mockResolvedValue(['netflix'])
    ;(getCertification as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    ;(prisma.title.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({})

    const req = new NextRequest('http://localhost/api/ingest', { headers: { authorization: 'Bearer test-secret' } })
    await GET(req)

    expect(prisma.title.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.not.objectContaining({ mpaaRating: expect.anything() }),
      })
    )
  })

  it('captures the director and top cast from TMDB and stores them on the title', async () => {
    ;(discoverByProvider as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ id: 1, title: 'A', overview: '', poster_path: null, release_date: '2020-01-01' }])
      .mockResolvedValue([])
    ;(getWatchProviders as ReturnType<typeof vi.fn>).mockResolvedValue(['netflix'])
    ;(getCredits as ReturnType<typeof vi.fn>).mockResolvedValue({ director: 'Steven Spielberg', topCast: ['Sam Neill', 'Laura Dern'] })
    ;(prisma.title.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({})

    const req = new NextRequest('http://localhost/api/ingest', { headers: { authorization: 'Bearer test-secret' } })
    await GET(req)

    expect(prisma.title.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ director: 'Steven Spielberg', topCast: ['Sam Neill', 'Laura Dern'] }),
        create: expect.objectContaining({ director: 'Steven Spielberg', topCast: ['Sam Neill', 'Laura Dern'] }),
      })
    )
  })

  it('does not overwrite an existing director/cast when getCredits returns none', async () => {
    ;(discoverByProvider as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ id: 1, title: 'A', overview: '', poster_path: null, release_date: '2020-01-01' }])
      .mockResolvedValue([])
    ;(getWatchProviders as ReturnType<typeof vi.fn>).mockResolvedValue(['netflix'])
    ;(getCredits as ReturnType<typeof vi.fn>).mockResolvedValue({ director: null, topCast: [] })
    ;(prisma.title.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({})

    const req = new NextRequest('http://localhost/api/ingest', { headers: { authorization: 'Bearer test-secret' } })
    await GET(req)

    const call = (prisma.title.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.update).not.toHaveProperty('director')
    expect(call.update).not.toHaveProperty('topCast')
  })

  it('only discovers movies, never TV shows', async () => {
    const req = new NextRequest('http://localhost/api/ingest', { headers: { authorization: 'Bearer test-secret' } })
    await GET(req)

    expect(discoverByProvider).toHaveBeenCalledTimes(4)
    for (const call of (discoverByProvider as ReturnType<typeof vi.fn>).mock.calls) {
      expect(call[1]).toBe('movie')
    }
  })

  it('fetches a second page for a provider whose first page is full, and stops once a page comes back empty', async () => {
    ;(discoverByProvider as ReturnType<typeof vi.fn>).mockImplementation(async (_providerId: number, _mediaType: string, page = 1) => {
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
})

describe('maxDuration', () => {
  it('exports a maxDuration of 300 seconds — this route makes three TMDB calls per item across up to ~800 items (10 pages x 4 providers x 20/page)', async () => {
    const routeModule = await import('../route')
    expect(routeModule.maxDuration).toBe(300)
  })
})
