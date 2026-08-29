// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../anthropic', () => ({ getAnthropicClient: vi.fn() }))
vi.mock('../prisma', () => ({
  prisma: { rankingCache: { findUnique: vi.fn(), upsert: vi.fn() } },
}))

import { getAnthropicClient } from '../anthropic'
import { prisma } from '../prisma'
import { rankByTaste, rankByTasteCached, computeRankingFingerprint } from '../ranking'

describe('rankByTaste', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns candidates unchanged when there is no taste history yet', async () => {
    const candidates = [{ id: 'a', name: 'A', overview: null }, { id: 'b', name: 'B', overview: null }]
    const result = await rankByTaste(candidates, [])
    expect(result).toEqual(['a', 'b'])
    expect(getAnthropicClient).not.toHaveBeenCalled()
  })

  it('returns an empty array for no candidates without calling Claude', async () => {
    const result = await rankByTaste([], [{ titleName: 'X', rating: 'LOVED' }])
    expect(result).toEqual([])
    expect(getAnthropicClient).not.toHaveBeenCalled()
  })

  it('parses and returns the ranked id order from Claude', async () => {
    const candidates = [{ id: 'a', name: 'A', overview: null }, { id: 'b', name: 'B', overview: null }]
    ;(getAnthropicClient as ReturnType<typeof vi.fn>).mockReturnValue({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: JSON.stringify({ rankedTitleIds: ['b', 'a'] }) }],
        }),
      },
    })

    const result = await rankByTaste(candidates, [{ titleName: 'Jurassic Park', rating: 'LOVED' }])
    expect(result).toEqual(['b', 'a'])
  })

  it('finds the text block even when a thinking block precedes it', async () => {
    const candidates = [{ id: 'a', name: 'A', overview: null }, { id: 'b', name: 'B', overview: null }]
    ;(getAnthropicClient as ReturnType<typeof vi.fn>).mockReturnValue({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            { type: 'thinking', thinking: 'some reasoning...' },
            { type: 'text', text: JSON.stringify({ rankedTitleIds: ['b', 'a'] }) },
          ],
        }),
      },
    })

    const result = await rankByTaste(candidates, [{ titleName: 'Jurassic Park', rating: 'LOVED' }])
    expect(result).toEqual(['b', 'a'])
  })

  it('uses the last text block, not the first, when Claude narrates before its final JSON answer', async () => {
    const candidates = [{ id: 'a', name: 'A', overview: null }, { id: 'b', name: 'B', overview: null }]
    ;(getAnthropicClient as ReturnType<typeof vi.fn>).mockReturnValue({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            { type: 'text', text: 'Let me think through this ranking before giving my final answer...' },
            { type: 'text', text: JSON.stringify({ rankedTitleIds: ['b', 'a'] }) },
          ],
        }),
      },
    })

    const result = await rankByTaste(candidates, [{ titleName: 'Jurassic Park', rating: 'LOVED' }])
    expect(result).toEqual(['b', 'a'])
  })
})

const candidates = [{ id: 't1', name: 'A', overview: null }]
const history = [{ titleName: 'B', rating: 'LIKED' }]

describe('computeRankingFingerprint', () => {
  it('is stable regardless of input order', () => {
    const fp1 = computeRankingFingerprint(['t1', 't2'], [{ titleName: 'A', rating: 'LIKED' }, { titleName: 'B', rating: 'LOVED' }])
    const fp2 = computeRankingFingerprint(['t2', 't1'], [{ titleName: 'B', rating: 'LOVED' }, { titleName: 'A', rating: 'LIKED' }])
    expect(fp1).toBe(fp2)
  })

  it('changes when the taste history changes', () => {
    const fp1 = computeRankingFingerprint(['t1'], [{ titleName: 'A', rating: 'LIKED' }])
    const fp2 = computeRankingFingerprint(['t1'], [{ titleName: 'A', rating: 'DISLIKED' }])
    expect(fp1).not.toBe(fp2)
  })
})

describe('rankByTasteCached', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reuses the cached ranking when the fingerprint matches, without calling Claude', async () => {
    const fingerprint = computeRankingFingerprint(['t1'], history)
    ;(prisma.rankingCache.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ inputFingerprint: fingerprint, rankedIds: ['t1'] })

    const result = await rankByTasteCached('default', 'FAMILY', candidates, history)

    expect(result).toEqual(['t1'])
    expect(getAnthropicClient).not.toHaveBeenCalled()
    expect(prisma.rankingCache.upsert).not.toHaveBeenCalled()
  })

  it('recomputes and saves a new cache row when the fingerprint does not match', async () => {
    ;(prisma.rankingCache.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ inputFingerprint: 'stale', rankedIds: ['old'] })
    ;(getAnthropicClient as ReturnType<typeof vi.fn>).mockReturnValue({
      messages: { create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: JSON.stringify({ rankedTitleIds: ['t1'] }) }] }) },
    })
    ;(prisma.rankingCache.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({})

    const result = await rankByTasteCached('default', 'FAMILY', candidates, history)

    expect(result).toEqual(['t1'])
    expect(prisma.rankingCache.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { familyId_mode: { familyId: 'default', mode: 'FAMILY' } } })
    )
  })

  it('recomputes when no cache row exists yet', async () => {
    ;(prisma.rankingCache.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    ;(getAnthropicClient as ReturnType<typeof vi.fn>).mockReturnValue({
      messages: { create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: JSON.stringify({ rankedTitleIds: ['t1'] }) }] }) },
    })
    ;(prisma.rankingCache.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({})

    const result = await rankByTasteCached('default', 'FAMILY', candidates, history)

    expect(result).toEqual(['t1'])
  })

  it('does not cache a failed ranking', async () => {
    ;(prisma.rankingCache.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    ;(getAnthropicClient as ReturnType<typeof vi.fn>).mockReturnValue({
      messages: { create: vi.fn().mockRejectedValue(new Error('rate limited')) },
    })

    await expect(rankByTasteCached('default', 'FAMILY', candidates, history)).rejects.toThrow()
    expect(prisma.rankingCache.upsert).not.toHaveBeenCalled()
  })

  it('does not cache an incomplete ranking (missing a candidate id), but still returns it', async () => {
    const twoCandidates = [
      { id: 't1', name: 'A', overview: null },
      { id: 't2', name: 'B', overview: null },
    ]
    ;(prisma.rankingCache.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    ;(getAnthropicClient as ReturnType<typeof vi.fn>).mockReturnValue({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: JSON.stringify({ rankedTitleIds: ['t1'] }) }],
        }),
      },
    })

    const result = await rankByTasteCached('default', 'FAMILY', twoCandidates, history)

    expect(result).toEqual(['t1'])
    expect(prisma.rankingCache.upsert).not.toHaveBeenCalled()
  })
})
