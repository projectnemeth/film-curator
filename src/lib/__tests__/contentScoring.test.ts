// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../anthropic', () => ({
  getAnthropicClient: vi.fn(),
}))
vi.mock('../prisma', () => ({
  prisma: {
    contentScore: { findUnique: vi.fn(), create: vi.fn() },
    title: { findUniqueOrThrow: vi.fn() },
  },
}))

import { getAnthropicClient } from '../anthropic'
import { prisma } from '../prisma'
import { getOrCreateContentScore } from '../contentScoring'

describe('getOrCreateContentScore', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the existing score without calling Claude', async () => {
    const existing = { id: 'cs1', titleId: 't1', violence: 1, language: 1, sexNudity: 0, scariness: 1, isUnrated: false, isNC17: false, sourceNotes: '', computedAt: new Date() }
    ;(prisma.contentScore.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existing)

    const result = await getOrCreateContentScore('t1')

    expect(result).toBe(existing)
    expect(getAnthropicClient).not.toHaveBeenCalled()
  })

  it('synthesizes and persists a new score when none exists', async () => {
    ;(prisma.contentScore.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    ;(prisma.title.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 't1', name: 'Jurassic Park', year: 1993 })

    const synthesized = { violence: 3, language: 1, sexNudity: 0, scariness: 5, isUnrated: false, isNC17: false, sourceNotes: 'Peril from dinosaurs, no gore shown on screen.' }
    const mockCreate = vi.fn().mockResolvedValue({ id: 'cs1', titleId: 't1', ...synthesized, computedAt: new Date() })
    ;(prisma.contentScore.create as ReturnType<typeof vi.fn>) = mockCreate

    ;(getAnthropicClient as ReturnType<typeof vi.fn>).mockReturnValue({
      messages: {
        create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: JSON.stringify(synthesized) }] }),
      },
    })

    const result = await getOrCreateContentScore('t1')

    expect(mockCreate).toHaveBeenCalledWith({ data: { titleId: 't1', ...synthesized } })
    expect(result.violence).toBe(3)
  })
})
