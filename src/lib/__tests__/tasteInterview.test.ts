import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../prisma', () => ({
  prisma: {
    tasteRating: { findMany: vi.fn(), upsert: vi.fn() },
    title: { findMany: vi.fn() },
    override: { findMany: vi.fn() },
  },
}))

import { prisma } from '../prisma'
import { getNextTitleToRate, recordTasteRating } from '../tasteInterview'

describe('getNextTitleToRate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('excludes already-rated titles, scoped to the active mode', async () => {
    ;(prisma.tasteRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ titleId: 't1' }])
    ;(prisma.override.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 't2', name: 'A PG Movie', mpaaRating: 'PG' },
    ])

    const next = await getNextTitleToRate('default', 'FAMILY')

    expect(prisma.tasteRating.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { familyId: 'default', mode: 'FAMILY' } })
    )
    expect(prisma.title.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { familyId: 'default', id: { notIn: ['t1'] } } })
    )
    expect(next?.id).toBe('t2')
  })

  it('never returns a title whose rating is hidden in the active mode, even if most recently created', async () => {
    ;(prisma.tasteRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(prisma.override.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'pg13-newest', name: 'PG-13 Newest', createdAt: new Date('2026-08-28'), mpaaRating: 'PG-13' },
      { id: 'pg-older', name: 'PG Older', createdAt: new Date('2020-01-01'), mpaaRating: 'PG' },
    ])

    const next = await getNextTitleToRate('default', 'FAMILY')

    expect(next?.id).toBe('pg-older')
  })

  it('excludes a title with a REJECTED override even when its rating would otherwise show', async () => {
    ;(prisma.tasteRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(prisma.override.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { titleId: 'rejected-but-pg', decision: 'REJECTED' },
    ])
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'rejected-but-pg', name: 'Rejected But PG', mpaaRating: 'PG' },
      { id: 'pg-fallback', name: 'PG Fallback', mpaaRating: 'PG' },
    ])

    const next = await getNextTitleToRate('default', 'FAMILY')

    expect(next?.id).toBe('pg-fallback')
  })

  it('returns null when every candidate is hidden in the active mode', async () => {
    ;(prisma.tasteRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(prisma.override.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'r-1', name: 'An R Movie', mpaaRating: 'R' },
      { id: 'unrated-1', name: 'Unrated 1', mpaaRating: null },
    ])

    const next = await getNextTitleToRate('default', 'FAMILY')

    expect(next).toBeNull()
  })
})

describe('recordTasteRating', () => {
  it('upserts a rating keyed by family, title, and mode', async () => {
    const mockUpsert = vi.fn().mockResolvedValue({ id: 'r1' })
    ;(prisma.tasteRating.upsert as ReturnType<typeof vi.fn>) = mockUpsert

    await recordTasteRating('default', 't1', 'ADULT', 'LOVED')

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { familyId_titleId_mode: { familyId: 'default', titleId: 't1', mode: 'ADULT' } } })
    )
  })
})
