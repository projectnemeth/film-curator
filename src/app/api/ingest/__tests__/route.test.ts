import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/tmdb', () => ({
  discoverByProvider: vi.fn(),
  getWatchProviders: vi.fn(),
  PROVIDER_IDS: { netflix: 8, disney_plus: 337, prime_video: 9, peacock: 386 },
}))
vi.mock('@/lib/prisma', () => ({
  prisma: { title: { upsert: vi.fn(), findMany: vi.fn() } },
}))
vi.mock('@/lib/contentScoring', () => ({
  getOrCreateContentScore: vi.fn(),
}))

import { discoverByProvider, getWatchProviders } from '@/lib/tmdb'
import { prisma } from '@/lib/prisma'
import { getOrCreateContentScore } from '@/lib/contentScoring'
import { GET } from '../route'

const originalSecret = process.env.CRON_SECRET

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = 'test-secret'
  ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
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

    const req = new NextRequest('http://localhost/api/ingest', {
      headers: { authorization: 'Bearer undefined' },
    })
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

    const req = new NextRequest('http://localhost/api/ingest', {
      headers: { authorization: 'Bearer test-secret' },
    })
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ingested).toBe(1)
    expect(body.failed).toBe(1)
  })
})

describe('scoring phase', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'test-secret'
    ;(discoverByProvider as ReturnType<typeof vi.fn>).mockResolvedValue([])
  })

  it('scores every unscored title after ingestion completes', async () => {
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 't1', name: 'Title One' },
      { id: 't2', name: 'Title Two' },
    ])
    ;(getOrCreateContentScore as ReturnType<typeof vi.fn>).mockResolvedValue({})

    const req = new NextRequest('http://localhost/api/ingest', { headers: { authorization: 'Bearer test-secret' } })
    const res = await GET(req)
    const body = await res.json()

    expect(getOrCreateContentScore).toHaveBeenCalledTimes(2)
    expect(body.scored).toBe(2)
    expect(body.skipped).toBe(0)
  })

  it('passes a real AbortSignal to getOrCreateContentScore, so the per-title timeout can actually cancel it', async () => {
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 't1', name: 'Title One' }])
    ;(getOrCreateContentScore as ReturnType<typeof vi.fn>).mockResolvedValue({})

    const req = new NextRequest('http://localhost/api/ingest', { headers: { authorization: 'Bearer test-secret' } })
    await GET(req)

    expect(getOrCreateContentScore).toHaveBeenCalledWith('t1', expect.any(AbortSignal))
  })

  it('counts a scoring failure as skipped and continues to the next title', async () => {
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 't1', name: 'Fails' },
      { id: 't2', name: 'Succeeds' },
    ])
    ;(getOrCreateContentScore as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('timed out'))
      .mockResolvedValueOnce({})

    const req = new NextRequest('http://localhost/api/ingest', { headers: { authorization: 'Bearer test-secret' } })
    const res = await GET(req)
    const body = await res.json()

    expect(body.scored).toBe(1)
    expect(body.skipped).toBe(1)
  })

  it('returns 200 with scored/skipped at 0 and ingestion counts intact when the unscored-titles query fails', async () => {
    ;(discoverByProvider as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ id: 1, title: 'A', overview: '', poster_path: null, release_date: '2020-01-01' }])
      .mockResolvedValue([])
    ;(getWatchProviders as ReturnType<typeof vi.fn>).mockResolvedValue(['netflix'])
    ;(prisma.title.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({})
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('db unavailable'))

    const req = new NextRequest('http://localhost/api/ingest', { headers: { authorization: 'Bearer test-secret' } })
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ingested).toBe(1)
    expect(body.failed).toBe(0)
    expect(body.scored).toBe(0)
    expect(body.skipped).toBe(0)
    expect(getOrCreateContentScore).not.toHaveBeenCalled()
  })

  it('stops starting new scoring attempts once the time budget is exceeded', async () => {
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 't1', name: 'First' },
      { id: 't2', name: 'Second' },
    ])
    ;(getOrCreateContentScore as ReturnType<typeof vi.fn>).mockResolvedValue({})

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

    expect(getOrCreateContentScore).toHaveBeenCalledTimes(1)
    expect(body.scored).toBe(1)

    vi.restoreAllMocks()
  })
})

describe('maxDuration', () => {
  it('exports a maxDuration of 300 seconds for the Vercel Hobby Fluid Compute ceiling', async () => {
    const routeModule = await import('../route')
    expect(routeModule.maxDuration).toBe(300)
  })
})
