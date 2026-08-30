import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    title: { findMany: vi.fn() },
    override: { findMany: vi.fn() },
    tasteRating: { findMany: vi.fn() },
  },
}))
vi.mock('@/lib/ranking', () => ({ rankByTasteCached: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { rankByTasteCached } from '@/lib/ranking'
import { GET } from '../route'

describe('GET /api/recommendations', () => {
  beforeEach(() => vi.clearAllMocks())

  it('defaults to FAMILY when mode is missing or invalid', async () => {
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(prisma.override.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(prisma.tasteRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(rankByTasteCached as ReturnType<typeof vi.fn>).mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/recommendations?mode=nonsense')
    const res = await GET(req)
    const body = await res.json()
    expect(body.mode).toBe('FAMILY')
  })

  it('shows PG-13 and R in Adult Mode but hides them in Family Mode', async () => {
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 't1', name: 'A PG Movie', overview: null, mpaaRating: 'PG', posterPath: null, providers: [], contentScore: null, year: 2020 },
      { id: 't2', name: 'An R Movie', overview: null, mpaaRating: 'R', posterPath: null, providers: [], contentScore: null, year: 2020 },
    ])
    ;(prisma.override.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(prisma.tasteRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(rankByTasteCached as ReturnType<typeof vi.fn>).mockImplementation(async (_f: string, _m: string, candidates: { id: string }[]) => candidates.map((c) => c.id))

    const family = await (await GET(new NextRequest('http://localhost/api/recommendations?mode=FAMILY'))).json()
    expect(family.titles.map((t: { id: string }) => t.id)).toEqual(['t1'])

    const adult = await (await GET(new NextRequest('http://localhost/api/recommendations?mode=ADULT'))).json()
    // Family and Adult are non-overlapping buckets (see src/lib/filtering.ts) — a PG title
    // does not carry over into Adult Mode, so only the R title shows here.
    expect(adult.titles.map((t: { id: string }) => t.id)).toEqual(['t2'])
  })

  it('excludes titles with REJECTED overrides even when the rating would otherwise show', async () => {
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 't1', name: 'Clean Title', overview: null, mpaaRating: 'G', posterPath: null, providers: [], contentScore: null, year: 2020 },
      { id: 't3', name: 'Rejected Title', overview: null, mpaaRating: 'G', posterPath: null, providers: [], contentScore: null, year: 2020 },
    ])
    ;(prisma.override.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ titleId: 't3', decision: 'REJECTED' }])
    ;(prisma.tasteRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(rankByTasteCached as ReturnType<typeof vi.fn>).mockImplementation(async (_f: string, _m: string, candidates: { id: string }[]) => candidates.map((c) => c.id))

    const req = new NextRequest('http://localhost/api/recommendations?mode=FAMILY')
    const body = await (await GET(req)).json()

    expect(body.titles.map((t: { id: string }) => t.id)).toEqual(['t1'])
  })

  it('falls back to visible titles in original order when ranking fails', async () => {
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 't1', name: 'A', overview: null, mpaaRating: 'G', posterPath: null, providers: [], contentScore: null, year: 2020 },
      { id: 't2', name: 'B', overview: null, mpaaRating: 'G', posterPath: null, providers: [], contentScore: null, year: 2020 },
    ])
    ;(prisma.override.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(prisma.tasteRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(rankByTasteCached as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('anthropic rate limited'))

    const req = new NextRequest('http://localhost/api/recommendations?mode=FAMILY')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.titles.map((t: { id: string }) => t.id)).toEqual(['t1', 't2'])
  })

  it('only reads taste ratings recorded in the active mode — family and adult ratings never cross-influence each other', async () => {
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 't1', name: 'A', overview: null, mpaaRating: 'R', posterPath: null, providers: [], contentScore: null, year: 2020 },
    ])
    ;(prisma.override.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(prisma.tasteRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(rankByTasteCached as ReturnType<typeof vi.fn>).mockResolvedValue(['t1'])

    const req = new NextRequest('http://localhost/api/recommendations?mode=ADULT')
    await GET(req)

    expect(prisma.tasteRating.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { familyId: 'default', mode: 'ADULT' } })
    )
  })

  it('includes mpaaRating and contentScore in each returned title for the frontend to render', async () => {
    const score = { violence: 3, language: 1, sexNudity: 0, scariness: 2, sourceNotes: 'test' }
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 't1', name: 'A', overview: null, mpaaRating: 'R', posterPath: null, providers: [], contentScore: score, year: 2020, director: null, topCast: [] },
    ])
    ;(prisma.override.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(prisma.tasteRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(rankByTasteCached as ReturnType<typeof vi.fn>).mockResolvedValue(['t1'])

    const req = new NextRequest('http://localhost/api/recommendations?mode=ADULT')
    const body = await (await GET(req)).json()

    expect(body.titles[0].mpaaRating).toBe('R')
    expect(body.titles[0].contentScore).toEqual(score)
  })

  it('includes overview, director, and topCast in each returned title', async () => {
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 't1',
        name: 'Jurassic Park',
        overview: 'Dinosaurs run amok.',
        mpaaRating: 'PG-13',
        posterPath: null,
        providers: [],
        contentScore: null,
        year: 1993,
        director: 'Steven Spielberg',
        topCast: ['Sam Neill', 'Laura Dern'],
      },
    ])
    ;(prisma.override.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(prisma.tasteRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(rankByTasteCached as ReturnType<typeof vi.fn>).mockResolvedValue(['t1'])

    const req = new NextRequest('http://localhost/api/recommendations?mode=ADULT')
    const body = await (await GET(req)).json()

    expect(body.titles[0].overview).toBe('Dinosaurs run amok.')
    expect(body.titles[0].director).toBe('Steven Spielberg')
    expect(body.titles[0].topCast).toEqual(['Sam Neill', 'Laura Dern'])
  })

  it("includes the family's own taste rating for the active mode, so it survives a page refresh", async () => {
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 't1', name: 'Rated Title', overview: null, mpaaRating: 'PG-13', posterPath: null, providers: [], contentScore: null, year: 2020, director: null, topCast: [] },
      { id: 't2', name: 'Unrated Title', overview: null, mpaaRating: 'PG-13', posterPath: null, providers: [], contentScore: null, year: 2020, director: null, topCast: [] },
    ])
    ;(prisma.override.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(prisma.tasteRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { titleId: 't1', rating: 'LOVED', title: { name: 'Rated Title' } },
    ])
    ;(rankByTasteCached as ReturnType<typeof vi.fn>).mockResolvedValue(['t1', 't2'])

    const req = new NextRequest('http://localhost/api/recommendations?mode=ADULT')
    const body = await (await GET(req)).json()

    expect(body.titles.find((t: { id: string }) => t.id === 't1').tasteRating).toBe('LOVED')
    expect(body.titles.find((t: { id: string }) => t.id === 't2').tasteRating).toBeNull()
  })
})

describe('maxDuration', () => {
  it('exports a maxDuration of 60 seconds — this route still calls rankByTasteCached live', async () => {
    const routeModule = await import('../route')
    expect(routeModule.maxDuration).toBe(60)
  })
})
