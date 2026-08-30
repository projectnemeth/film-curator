import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    title: { findMany: vi.fn() },
    tasteRating: { findMany: vi.fn() },
  },
}))
vi.mock('@/lib/ranking', () => ({ rankByTasteCached: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { rankByTasteCached } from '@/lib/ranking'
import { GET } from '../route'

function title(overrides: Record<string, unknown> = {}) {
  return {
    id: 't1',
    name: 'A Title',
    overview: null,
    mpaaRating: 'PG-13',
    posterPath: null,
    providers: [],
    contentScore: null,
    year: 2020,
    director: null,
    writer: null,
    topCast: [],
    studio: null,
    ...overrides,
  }
}

describe('GET /api/recommendations', () => {
  beforeEach(() => vi.clearAllMocks())

  it('defaults to FAMILY when mode is missing or invalid', async () => {
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(prisma.tasteRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(rankByTasteCached as ReturnType<typeof vi.fn>).mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/recommendations?mode=nonsense')
    const res = await GET(req)
    const body = await res.json()
    expect(body.mode).toBe('FAMILY')
  })

  it('shows PG-13 and R in Adult Mode but hides them in Family Mode', async () => {
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      title({ id: 't1', name: 'A PG Movie', mpaaRating: 'PG' }),
      title({ id: 't2', name: 'An R Movie', mpaaRating: 'R' }),
    ])
    ;(prisma.tasteRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(rankByTasteCached as ReturnType<typeof vi.fn>).mockImplementation(async (_f: string, _m: string, candidates: { id: string }[]) => candidates.map((c) => c.id))

    const family = await (await GET(new NextRequest('http://localhost/api/recommendations?mode=FAMILY'))).json()
    expect(family.notSeen.map((t: { id: string }) => t.id)).toEqual(['t1'])

    const adult = await (await GET(new NextRequest('http://localhost/api/recommendations?mode=ADULT'))).json()
    // Family and Adult are non-overlapping buckets (see src/lib/filtering.ts) — a PG title
    // does not carry over into Adult Mode, so only the R title shows here.
    expect(adult.notSeen.map((t: { id: string }) => t.id)).toEqual(['t2'])
  })

  it('falls back to visible titles in original order when ranking fails', async () => {
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      title({ id: 't1', name: 'A', mpaaRating: 'G' }),
      title({ id: 't2', name: 'B', mpaaRating: 'G' }),
    ])
    ;(prisma.tasteRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(rankByTasteCached as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('anthropic rate limited'))

    const req = new NextRequest('http://localhost/api/recommendations?mode=FAMILY')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.notSeen.map((t: { id: string }) => t.id)).toEqual(['t1', 't2'])
  })

  it('only reads taste ratings recorded in the active mode — family and adult ratings never cross-influence each other', async () => {
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([title({ id: 't1', mpaaRating: 'R' })])
    ;(prisma.tasteRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(rankByTasteCached as ReturnType<typeof vi.fn>).mockResolvedValue(['t1'])

    const req = new NextRequest('http://localhost/api/recommendations?mode=ADULT')
    await GET(req)

    expect(prisma.tasteRating.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { familyId: 'default', mode: 'ADULT' } })
    )
  })

  it('includes mpaaRating, contentScore, overview, director, writer, topCast, and studio in each returned title', async () => {
    const score = { violence: 3, language: 1, sexNudity: 0, scariness: 2, sourceNotes: 'test' }
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      title({
        id: 't1',
        name: 'Jurassic Park',
        overview: 'Dinosaurs run amok.',
        mpaaRating: 'R',
        contentScore: score,
        director: 'Steven Spielberg',
        writer: 'David Koepp',
        topCast: ['Sam Neill', 'Laura Dern'],
        studio: 'Universal Pictures',
      }),
    ])
    ;(prisma.tasteRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(rankByTasteCached as ReturnType<typeof vi.fn>).mockResolvedValue(['t1'])

    const req = new NextRequest('http://localhost/api/recommendations?mode=ADULT')
    const body = await (await GET(req)).json()

    expect(body.notSeen[0].mpaaRating).toBe('R')
    expect(body.notSeen[0].contentScore).toEqual(score)
    expect(body.notSeen[0].overview).toBe('Dinosaurs run amok.')
    expect(body.notSeen[0].director).toBe('Steven Spielberg')
    expect(body.notSeen[0].writer).toBe('David Koepp')
    expect(body.notSeen[0].topCast).toEqual(['Sam Neill', 'Laura Dern'])
    expect(body.notSeen[0].studio).toBe('Universal Pictures')
  })

  it('passes director, writer, topCast, and studio through to the ranking candidates', async () => {
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      title({ id: 't1', director: 'Christopher Nolan', writer: 'Christopher Nolan', topCast: ['Cillian Murphy'], studio: 'Universal Pictures' }),
    ])
    ;(prisma.tasteRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(rankByTasteCached as ReturnType<typeof vi.fn>).mockResolvedValue(['t1'])

    const req = new NextRequest('http://localhost/api/recommendations?mode=ADULT')
    await GET(req)

    expect(rankByTasteCached).toHaveBeenCalledWith(
      'default',
      'ADULT',
      [expect.objectContaining({ id: 't1', director: 'Christopher Nolan', writer: 'Christopher Nolan', topCast: ['Cillian Murphy'], studio: 'Universal Pictures' })],
      []
    )
  })

  it('includes director, writer, topCast, and studio in the taste-history entries sent to ranking', async () => {
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([title({ id: 't2' })])
    ;(prisma.tasteRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        titleId: 't1',
        rating: 'LOVED',
        ratedAt: new Date(),
        title: { name: 'Oppenheimer', director: 'Christopher Nolan', writer: 'Christopher Nolan', topCast: ['Cillian Murphy'], studio: 'Universal Pictures' },
      },
    ])
    ;(rankByTasteCached as ReturnType<typeof vi.fn>).mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/recommendations?mode=ADULT')
    await GET(req)

    expect(rankByTasteCached).toHaveBeenCalledWith(
      'default',
      'ADULT',
      expect.anything(),
      [
        expect.objectContaining({
          titleName: 'Oppenheimer',
          rating: 'LOVED',
          director: 'Christopher Nolan',
          writer: 'Christopher Nolan',
          topCast: ['Cillian Murphy'],
          studio: 'Universal Pictures',
        }),
      ]
    )
  })

  it('puts unrated and explicitly-not-seen titles in notSeen, ranked by taste', async () => {
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      title({ id: 't1', name: 'Never Rated' }),
      title({ id: 't2', name: 'Marked Not Seen' }),
    ])
    ;(prisma.tasteRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { titleId: 't2', rating: 'NOT_SEEN', ratedAt: new Date('2026-01-01'), title: { name: 'Marked Not Seen' } },
    ])
    ;(rankByTasteCached as ReturnType<typeof vi.fn>).mockImplementation(async (_f: string, _m: string, candidates: { id: string }[]) => candidates.map((c) => c.id))

    const req = new NextRequest('http://localhost/api/recommendations?mode=ADULT')
    const body = await (await GET(req)).json()

    expect(body.notSeen.map((t: { id: string }) => t.id).sort()).toEqual(['t1', 't2'])
    expect(body.loved).toEqual([])
  })

  it('puts LOVED titles in loved, most-recently-rated first, and excludes them from notSeen', async () => {
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      title({ id: 't1', name: 'Loved Earlier' }),
      title({ id: 't2', name: 'Loved Later' }),
    ])
    ;(prisma.tasteRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { titleId: 't1', rating: 'LOVED', ratedAt: new Date('2026-01-01'), title: { name: 'Loved Earlier' } },
      { titleId: 't2', rating: 'LOVED', ratedAt: new Date('2026-06-01'), title: { name: 'Loved Later' } },
    ])
    ;(rankByTasteCached as ReturnType<typeof vi.fn>).mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/recommendations?mode=ADULT')
    const body = await (await GET(req)).json()

    expect(body.notSeen).toEqual([])
    expect(body.loved.map((t: { id: string }) => t.id)).toEqual(['t2', 't1'])
    expect(body.loved[0].tasteRating).toBe('LOVED')
  })

  it('excludes titles rated DISLIKED, LIKED, TOO_INAPPROPRIATE, or NOT_INTERESTED from both sections', async () => {
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      title({ id: 't1', name: 'Disliked' }),
      title({ id: 't2', name: 'Liked' }),
      title({ id: 't3', name: 'Too Inappropriate' }),
      title({ id: 't4', name: 'Not Interested' }),
    ])
    ;(prisma.tasteRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { titleId: 't1', rating: 'DISLIKED', ratedAt: new Date(), title: { name: 'Disliked' } },
      { titleId: 't2', rating: 'LIKED', ratedAt: new Date(), title: { name: 'Liked' } },
      { titleId: 't3', rating: 'TOO_INAPPROPRIATE', ratedAt: new Date(), title: { name: 'Too Inappropriate' } },
      { titleId: 't4', rating: 'NOT_INTERESTED', ratedAt: new Date(), title: { name: 'Not Interested' } },
    ])
    ;(rankByTasteCached as ReturnType<typeof vi.fn>).mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/recommendations?mode=ADULT')
    const body = await (await GET(req)).json()

    expect(body.notSeen).toEqual([])
    expect(body.loved).toEqual([])
  })
})

describe('maxDuration', () => {
  it('exports a maxDuration of 60 seconds — this route still calls rankByTasteCached live', async () => {
    const routeModule = await import('../route')
    expect(routeModule.maxDuration).toBe(60)
  })
})
