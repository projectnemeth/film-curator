import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../prisma', () => ({
  prisma: {
    title: { findUnique: vi.fn(), update: vi.fn() },
    tasteRating: { findUnique: vi.fn(), upsert: vi.fn(), delete: vi.fn() },
  },
}))

import { prisma } from '../prisma'
import { moveTitleToMode } from '../titleMode'

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>

function givenTitle(overrides: Record<string, unknown> = {}) {
  asMock(prisma.title.findUnique).mockResolvedValue({
    id: 't1',
    mpaaRating: 'PG',
    modeOverride: null,
    ...overrides,
  })
}

describe('moveTitleToMode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    asMock(prisma.tasteRating.findUnique).mockResolvedValue(null)
  })

  it('stores the override when the target differs from the MPAA bucket', async () => {
    givenTitle({ mpaaRating: 'PG' })

    await moveTitleToMode('default', 't1', 'ADULT')

    expect(prisma.title.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { modeOverride: 'ADULT' },
    })
  })

  it('clears the override when the target is the title’s natural bucket', async () => {
    // Moving a PG film back to Family restores default behaviour rather than
    // pinning it there, so later rule changes still reach it.
    givenTitle({ mpaaRating: 'PG', modeOverride: 'ADULT' })

    await moveTitleToMode('default', 't1', 'FAMILY')

    expect(prisma.title.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { modeOverride: null },
    })
  })

  it('carries an existing rating across to the new mode', async () => {
    givenTitle()
    asMock(prisma.tasteRating.findUnique).mockImplementation(({ where }: any) =>
      Promise.resolve(where.familyId_titleId_mode.mode === 'FAMILY' ? { rating: 'LOVED' } : null)
    )

    await moveTitleToMode('default', 't1', 'ADULT')

    expect(prisma.tasteRating.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { familyId_titleId_mode: { familyId: 'default', titleId: 't1', mode: 'ADULT' } },
        create: expect.objectContaining({ mode: 'ADULT', rating: 'LOVED' }),
      })
    )
    expect(prisma.tasteRating.delete).toHaveBeenCalledWith({
      where: { familyId_titleId_mode: { familyId: 'default', titleId: 't1', mode: 'FAMILY' } },
    })
  })

  it('leaves ratings alone when the title was never rated in the old mode', async () => {
    givenTitle()

    await moveTitleToMode('default', 't1', 'ADULT')

    expect(prisma.tasteRating.upsert).not.toHaveBeenCalled()
    expect(prisma.tasteRating.delete).not.toHaveBeenCalled()
  })

  it('lets the carried rating win over a stale one in the destination', async () => {
    // Only reachable by moving a title back and forth; must not blow up on
    // the (familyId, titleId, mode) unique constraint.
    givenTitle()
    asMock(prisma.tasteRating.findUnique).mockResolvedValue({ rating: 'LIKED' })

    await moveTitleToMode('default', 't1', 'ADULT')

    expect(prisma.tasteRating.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { rating: 'LIKED' } })
    )
    expect(prisma.tasteRating.delete).toHaveBeenCalled()
  })

  it('throws when the title does not exist', async () => {
    asMock(prisma.title.findUnique).mockResolvedValue(null)

    await expect(moveTitleToMode('default', 'nope', 'ADULT')).rejects.toThrow(/not found/i)
    expect(prisma.title.update).not.toHaveBeenCalled()
  })
})
