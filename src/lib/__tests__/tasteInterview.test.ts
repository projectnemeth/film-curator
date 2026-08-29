import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../prisma', () => ({
  prisma: {
    tasteRating: { findMany: vi.fn(), upsert: vi.fn() },
    title: { findMany: vi.fn() },
    modeSettings: { findUniqueOrThrow: vi.fn() },
    override: { findMany: vi.fn() },
  },
}))

import { prisma } from '../prisma'
import { getNextTitleToRate, recordTasteRating } from '../tasteInterview'

const cleanScore = { violence: 1, language: 1, sexNudity: 0, scariness: 1, isUnrated: false, isNC17: false }
const violentScore = { violence: 9, language: 9, sexNudity: 9, scariness: 9, isUnrated: false, isNC17: false }
const familyThresholds = { maxViolence: 4, maxLanguage: 2, maxSexNudity: 1, maxScariness: 5, allowUnrated: false, allowNC17: false }

describe('getNextTitleToRate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('excludes already-rated titles', async () => {
    ;(prisma.tasteRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ titleId: 't1' }])
    ;(prisma.modeSettings.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue(familyThresholds)
    ;(prisma.override.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 't2', name: 'Unrated Title', contentScore: cleanScore },
    ])

    const next = await getNextTitleToRate('default', 'FAMILY')

    expect(prisma.title.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { familyId: 'default', id: { notIn: ['t1'] } } })
    )
    expect(next?.id).toBe('t2')
  })

  it('never returns a title whose content score fails the active mode thresholds, even if most recently created', async () => {
    ;(prisma.tasteRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(prisma.modeSettings.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue(familyThresholds)
    ;(prisma.override.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'violent-newest', name: 'Violent Newest', createdAt: new Date('2026-08-28'), contentScore: violentScore },
      { id: 'clean-older', name: 'Clean Older', createdAt: new Date('2020-01-01'), contentScore: cleanScore },
    ])

    const next = await getNextTitleToRate('default', 'FAMILY')

    expect(next?.id).toBe('clean-older')
  })

  it('excludes a title with a REJECTED override even when its score would otherwise pass', async () => {
    ;(prisma.tasteRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(prisma.modeSettings.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue(familyThresholds)
    ;(prisma.override.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { titleId: 'rejected-but-clean', decision: 'REJECTED' },
    ])
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'rejected-but-clean', name: 'Rejected But Clean', contentScore: cleanScore },
      { id: 'clean-fallback', name: 'Clean Fallback', contentScore: cleanScore },
    ])

    const next = await getNextTitleToRate('default', 'FAMILY')

    expect(next?.id).toBe('clean-fallback')
  })

  it('returns null when every candidate fails the active mode', async () => {
    ;(prisma.tasteRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(prisma.modeSettings.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue(familyThresholds)
    ;(prisma.override.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'violent-1', name: 'Violent 1', contentScore: violentScore },
      { id: 'unscored-1', name: 'Unscored 1', contentScore: null },
    ])

    const next = await getNextTitleToRate('default', 'FAMILY')

    expect(next).toBeNull()
  })
})

describe('recordTasteRating', () => {
  it('upserts a rating keyed by family and title', async () => {
    const mockUpsert = vi.fn().mockResolvedValue({ id: 'r1' })
    ;(prisma.tasteRating.upsert as ReturnType<typeof vi.fn>) = mockUpsert

    await recordTasteRating('default', 't1', 'LOVED')

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { familyId_titleId: { familyId: 'default', titleId: 't1' } },
      })
    )
  })
})
