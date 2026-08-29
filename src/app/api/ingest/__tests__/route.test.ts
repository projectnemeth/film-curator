import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/tmdb', () => ({
  discoverByProvider: vi.fn(),
  getWatchProviders: vi.fn(),
  getCertification: vi.fn(),
  PROVIDER_IDS: { netflix: 8, disney_plus: 337, prime_video: 9, peacock: 386 },
}))
vi.mock('@/lib/prisma', () => ({
  prisma: { title: { upsert: vi.fn() } },
}))

import { discoverByProvider, getWatchProviders, getCertification } from '@/lib/tmdb'
import { prisma } from '@/lib/prisma'
import { GET } from '../route'

const originalSecret = process.env.CRON_SECRET

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = 'test-secret'
  ;(discoverByProvider as ReturnType<typeof vi.fn>).mockResolvedValue([])
  ;(getWatchProviders as ReturnType<typeof vi.fn>).mockResolvedValue([])
  ;(getCertification as ReturnType<typeof vi.fn>).mockResolvedValue(null)
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
})
