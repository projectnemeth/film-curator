import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../prisma', () => ({
  prisma: {
    tasteRating: { findMany: vi.fn(), upsert: vi.fn() },
    title: { findFirst: vi.fn() },
  },
}))

import { prisma } from '../prisma'
import { getNextTitleToRate, recordTasteRating } from '../tasteInterview'

describe('getNextTitleToRate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('excludes already-rated titles', async () => {
    ;(prisma.tasteRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ titleId: 't1' }])
    ;(prisma.title.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 't2', name: 'Unrated Title' })

    const next = await getNextTitleToRate('default')

    expect(prisma.title.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { familyId: 'default', id: { notIn: ['t1'] } } })
    )
    expect(next?.id).toBe('t2')
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
