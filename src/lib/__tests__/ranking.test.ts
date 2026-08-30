// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../anthropic', () => ({ getAnthropicClient: vi.fn() }))
vi.mock('../prisma', () => ({
  prisma: { rankingCache: { findUnique: vi.fn(), upsert: vi.fn() } },
}))

import { getAnthropicClient } from '../anthropic'
import { prisma } from '../prisma'
import { rankByTaste, rankByTasteCached, computeRankingFingerprint } from '../ranking'

function mockClaudeReturns(rankedIndices: number[]) {
  ;(getAnthropicClient as ReturnType<typeof vi.fn>).mockReturnValue({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({ rankedIndices }) }],
      }),
    },
  })
}

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

  it('parses and returns the ranked id order from Claude, by index', async () => {
    const candidates = [{ id: 'a', name: 'A', overview: null }, { id: 'b', name: 'B', overview: null }]
    mockClaudeReturns([1, 0])

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
            { type: 'text', text: JSON.stringify({ rankedIndices: [1, 0] }) },
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
            { type: 'text', text: JSON.stringify({ rankedIndices: [1, 0] }) },
          ],
        }),
      },
    })

    const result = await rankByTaste(candidates, [{ titleName: 'Jurassic Park', rating: 'LOVED' }])
    expect(result).toEqual(['b', 'a'])
  })

  it('fills in any index Claude omitted, appended in original order, so the result always covers every candidate', async () => {
    const candidates = [
      { id: 'a', name: 'A', overview: null },
      { id: 'b', name: 'B', overview: null },
      { id: 'c', name: 'C', overview: null },
    ]
    mockClaudeReturns([2]) // only ranked index 2, omitting 0 and 1

    const result = await rankByTaste(candidates, [{ titleName: 'X', rating: 'LOVED' }])
    expect(result).toEqual(['c', 'a', 'b'])
  })

  it('drops a duplicate or out-of-range index instead of losing or repeating a candidate', async () => {
    const candidates = [
      { id: 'a', name: 'A', overview: null },
      { id: 'b', name: 'B', overview: null },
    ]
    mockClaudeReturns([0, 0, 99]) // duplicate of 0, plus an out-of-range index

    const result = await rankByTaste(candidates, [{ titleName: 'X', rating: 'LOVED' }])
    expect(result).toEqual(['a', 'b'])
  })

  it('caps the ranked subset well below a size that could truncate the response, appending the rest unranked', async () => {
    // Simulates the real production scenario that broke this: hundreds of
    // candidates, each with a name and overview, sent to Claude in one call.
    const bigCandidateList = Array.from({ length: 400 }, (_, i) => ({
      id: `title-${i}`,
      name: `Movie Number ${i}`,
      overview: 'A reasonably long plot summary that takes up real space in the prompt. '.repeat(3),
    }))
    // Claude only ever sees indices 0..59 (the capped subset) — respond with all of them reversed.
    mockClaudeReturns(Array.from({ length: 60 }, (_, i) => 59 - i))

    const result = await rankByTaste(bigCandidateList, [{ titleName: 'X', rating: 'LOVED' }])

    // Every one of the 400 candidates is present exactly once.
    expect(result).toHaveLength(400)
    expect(new Set(result).size).toBe(400)
    // The first 60 are the ranked (reversed) subset; the remaining 340 are appended, untouched, in original order.
    expect(result[0]).toBe('title-59')
    expect(result[59]).toBe('title-0')
    expect(result[60]).toBe('title-60')
    expect(result[399]).toBe('title-399')

    // Only the capped subset's names/overviews were ever sent to Claude — confirms the request
    // itself stays small regardless of how large the real candidate list grows.
    const createMock = (getAnthropicClient as ReturnType<typeof vi.fn>).mock.results[0].value.messages.create
    const promptText = createMock.mock.calls[0][0].messages[0].content as string
    expect(promptText).not.toContain('Movie Number 60')
    expect(promptText).not.toContain('Movie Number 399')
    expect(promptText).toContain('Movie Number 0')
    expect(promptText).toContain('Movie Number 59')
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
    mockClaudeReturns([0])
    ;(prisma.rankingCache.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({})

    const result = await rankByTasteCached('default', 'FAMILY', candidates, history)

    expect(result).toEqual(['t1'])
    expect(prisma.rankingCache.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { familyId_mode: { familyId: 'default', mode: 'FAMILY' } } })
    )
  })

  it('recomputes when no cache row exists yet', async () => {
    ;(prisma.rankingCache.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    mockClaudeReturns([0])
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

  it('caches a ranking that rankByTaste self-repaired from a partial Claude response, since the result is still complete', async () => {
    const twoCandidates = [
      { id: 't1', name: 'A', overview: null },
      { id: 't2', name: 'B', overview: null },
    ]
    ;(prisma.rankingCache.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    mockClaudeReturns([0]) // omits index 1 — rankByTaste fills it in itself
    ;(prisma.rankingCache.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({})

    const result = await rankByTasteCached('default', 'FAMILY', twoCandidates, history)

    expect(result).toEqual(['t1', 't2'])
    expect(prisma.rankingCache.upsert).toHaveBeenCalled()
  })
})
