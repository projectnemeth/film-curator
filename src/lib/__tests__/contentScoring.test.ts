// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../prisma', () => ({
  prisma: { contentScore: { findUnique: vi.fn(), create: vi.fn() }, title: { findUniqueOrThrow: vi.fn() } },
}))

import { prisma } from '../prisma'
import { getContentScore } from '../contentScoring'

describe('getContentScore', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the stored score for a title that has one', async () => {
    const score = { titleId: 't1', violence: 4, language: 2, sexNudity: 1, scariness: 3 }
    ;(prisma.contentScore.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(score)

    expect(await getContentScore('t1')).toEqual(score)
  })

  it('returns null for a title with no score rather than generating one', async () => {
    ;(prisma.contentScore.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)

    expect(await getContentScore('t1')).toBeNull()
  })

  it('never writes — scores come from the manual catalog refresh, not the app', async () => {
    ;(prisma.contentScore.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)

    await getContentScore('t1')

    expect(prisma.contentScore.create).not.toHaveBeenCalled()
    expect(prisma.title.findUniqueOrThrow).not.toHaveBeenCalled()
  })

  it('works with ANTHROPIC_API_KEY unset — the app must never need it', async () => {
    const saved = process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    try {
      ;(prisma.contentScore.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)
      expect(await getContentScore('t1')).toBeNull()
    } finally {
      if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved
    }
  })
})
