import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    title: { findMany: vi.fn() },
    modeSettings: { findUniqueOrThrow: vi.fn() },
    override: { findMany: vi.fn() },
    tasteRating: { findMany: vi.fn() },
  },
}))
vi.mock('@/lib/contentScoring', () => ({ getOrCreateContentScore: vi.fn() }))
vi.mock('@/lib/ranking', () => ({ rankByTaste: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { getOrCreateContentScore } from '@/lib/contentScoring'
import { rankByTaste } from '@/lib/ranking'
import { GET } from '../route'

const cleanScore = { violence: 1, language: 1, sexNudity: 0, scariness: 1, isUnrated: false, isNC17: false }
const familyThresholds = { maxViolence: 4, maxLanguage: 2, maxSexNudity: 1, maxScariness: 5, allowUnrated: false, allowNC17: false }

describe('GET /api/recommendations', () => {
  beforeEach(() => vi.clearAllMocks())

  it('filters by mode, lazily scores unscored titles, and ranks the result', async () => {
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 't1', name: 'Clean Title', overview: null, contentScore: cleanScore },
      { id: 't2', name: 'Needs Scoring', overview: null, contentScore: null },
    ])
    ;(prisma.modeSettings.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue(familyThresholds)
    ;(prisma.override.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(prisma.tasteRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(getOrCreateContentScore as ReturnType<typeof vi.fn>).mockResolvedValue(cleanScore)
    ;(rankByTaste as ReturnType<typeof vi.fn>).mockResolvedValue(['t2', 't1'])

    const req = new NextRequest('http://localhost/api/recommendations?mode=FAMILY')
    const res = await GET(req)
    const body = await res.json()

    expect(getOrCreateContentScore).toHaveBeenCalledWith('t2')
    expect(body.titles.map((t: { id: string }) => t.id)).toEqual(['t2', 't1'])
    expect(body.mode).toBe('FAMILY')
  })

  it('defaults to FAMILY when mode is missing or invalid', async () => {
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(prisma.modeSettings.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue(familyThresholds)
    ;(prisma.override.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(prisma.tasteRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(rankByTaste as ReturnType<typeof vi.fn>).mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/recommendations?mode=nonsense')
    const res = await GET(req)
    const body = await res.json()
    expect(body.mode).toBe('FAMILY')
  })

  it('excludes titles with REJECTED overrides even when content score passes', async () => {
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 't1', name: 'Clean Title', overview: null, contentScore: cleanScore },
      { id: 't3', name: 'Rejected Title', overview: null, contentScore: cleanScore },
    ])
    ;(prisma.modeSettings.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue(familyThresholds)
    ;(prisma.override.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { titleId: 't3', decision: 'REJECTED' },
    ])
    ;(prisma.tasteRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(rankByTaste as ReturnType<typeof vi.fn>).mockImplementation(async (candidates: { id: string }[]) => candidates.map((c) => c.id))

    const req = new NextRequest('http://localhost/api/recommendations?mode=FAMILY')
    const res = await GET(req)
    const body = await res.json()

    expect(body.titles.map((t: { id: string }) => t.id)).toEqual(['t1'])
    expect(body.titles).toHaveLength(1)
  })

  it('excludes an unscored title in FAMILY mode when getOrCreateContentScore rejects, without affecting other titles', async () => {
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 't1', name: 'Clean Title', overview: null, contentScore: cleanScore },
      { id: 't2', name: 'Fails To Score', overview: null, contentScore: null },
    ])
    ;(prisma.modeSettings.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue(familyThresholds)
    ;(prisma.override.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(prisma.tasteRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(getOrCreateContentScore as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('anthropic rate limited'))
    ;(rankByTaste as ReturnType<typeof vi.fn>).mockImplementation(async (candidates: { id: string }[]) => candidates.map((c) => c.id))

    const req = new NextRequest('http://localhost/api/recommendations?mode=FAMILY')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.titles.map((t: { id: string }) => t.id)).toEqual(['t1'])
  })

  it('flags an unscored title as visible in ADULT mode when getOrCreateContentScore rejects', async () => {
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 't1', name: 'Clean Title', overview: null, contentScore: cleanScore },
      { id: 't2', name: 'Fails To Score', overview: null, contentScore: null },
    ])
    const adultThresholds = { maxViolence: 10, maxLanguage: 10, maxSexNudity: 10, maxScariness: 10, allowUnrated: true, allowNC17: true }
    ;(prisma.modeSettings.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue(adultThresholds)
    ;(prisma.override.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(prisma.tasteRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(getOrCreateContentScore as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('anthropic rate limited'))
    ;(rankByTaste as ReturnType<typeof vi.fn>).mockImplementation(async (candidates: { id: string }[]) => candidates.map((c) => c.id))

    const req = new NextRequest('http://localhost/api/recommendations?mode=ADULT')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.titles.map((t: { id: string }) => t.id).sort()).toEqual(['t1', 't2'])
  })

  it('scores a large batch of unscored titles (batched-parallel) and returns them all correctly filtered', async () => {
    const unscoredTitles = Array.from({ length: 7 }, (_, i) => ({
      id: `u${i}`,
      name: `Unscored ${i}`,
      overview: null,
      contentScore: null,
    }))
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(unscoredTitles)
    ;(prisma.modeSettings.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue(familyThresholds)
    ;(prisma.override.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(prisma.tasteRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(getOrCreateContentScore as ReturnType<typeof vi.fn>).mockResolvedValue(cleanScore)
    ;(rankByTaste as ReturnType<typeof vi.fn>).mockImplementation(async (candidates: { id: string }[]) => candidates.map((c) => c.id))

    const req = new NextRequest('http://localhost/api/recommendations?mode=FAMILY')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(getOrCreateContentScore).toHaveBeenCalledTimes(7)
    expect(body.titles.map((t: { id: string }) => t.id).sort()).toEqual(
      unscoredTitles.map((t) => t.id).sort()
    )
  })

  it('falls back to visible titles in original order when rankByTaste rejects', async () => {
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 't1', name: 'Clean Title', overview: null, contentScore: cleanScore },
      { id: 't2', name: 'Also Clean', overview: null, contentScore: cleanScore },
    ])
    ;(prisma.modeSettings.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue(familyThresholds)
    ;(prisma.override.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(prisma.tasteRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(rankByTaste as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('anthropic rate limited'))

    const req = new NextRequest('http://localhost/api/recommendations?mode=FAMILY')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.titles.map((t: { id: string }) => t.id)).toEqual(['t1', 't2'])
  })
})
