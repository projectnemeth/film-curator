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
    ;(rankByTaste as ReturnType<typeof vi.fn>).mockResolvedValue(['t1'])

    const req = new NextRequest('http://localhost/api/recommendations?mode=FAMILY')
    const res = await GET(req)
    const body = await res.json()

    expect(body.titles.map((t: { id: string }) => t.id)).toEqual(['t1'])
    expect(body.titles).toHaveLength(1)
  })
})
