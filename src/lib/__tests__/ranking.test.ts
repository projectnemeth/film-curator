// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../prisma', () => ({
  prisma: { rankingCache: { findUnique: vi.fn(), upsert: vi.fn() } },
}))

import { prisma } from '../prisma'
import { reconcileRanking, rankByTasteCached, computeRankingFingerprint } from '../ranking'

const history = [{ titleName: 'Heat', rating: 'LOVED' }]

describe('computeRankingFingerprint', () => {
  it('is stable regardless of input order', () => {
    expect(computeRankingFingerprint(['a', 'b'], history)).toBe(computeRankingFingerprint(['b', 'a'], history))
  })

  it('changes when the taste history changes', () => {
    const before = computeRankingFingerprint(['a'], history)
    const after = computeRankingFingerprint(['a'], [{ titleName: 'Heat', rating: 'DISLIKED' }])
    expect(before).not.toBe(after)
  })
})

describe('reconcileRanking', () => {
  it('preserves the cached order for candidates that are still present', () => {
    expect(reconcileRanking(['c', 'a', 'b'], ['a', 'b', 'c'])).toEqual(['c', 'a', 'b'])
  })

  it('drops ids that are no longer candidates', () => {
    // 'x' was excluded or rated since the ranking was computed.
    expect(reconcileRanking(['c', 'x', 'a'], ['a', 'c'])).toEqual(['c', 'a'])
  })

  it('appends new candidates after the ranked ones, in their given order', () => {
    expect(reconcileRanking(['b', 'a'], ['a', 'b', 'new1', 'new2'])).toEqual(['b', 'a', 'new1', 'new2'])
  })

  it('returns candidates unchanged when there is no cached order', () => {
    expect(reconcileRanking([], ['a', 'b'])).toEqual(['a', 'b'])
  })

  it('returns candidates unchanged when the cache is entirely disjoint', () => {
    expect(reconcileRanking(['x', 'y'], ['a', 'b'])).toEqual(['a', 'b'])
  })

  it('always covers every candidate exactly once — the invariant the dashboard depends on', () => {
    // recommendations/route.ts does rankedIds.map(id => byId.get(id)).filter(Boolean),
    // so any candidate missing here vanishes from the dashboard entirely.
    const cached = ['b', 'gone', 'd']
    const candidates = ['a', 'b', 'c', 'd', 'e']
    const result = reconcileRanking(cached, candidates)
    expect([...result].sort()).toEqual([...candidates].sort())
    expect(result).toHaveLength(candidates.length)
  })
})

describe('rankByTasteCached', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the cached ranking when the fingerprint matches, without writing', async () => {
    const fingerprint = computeRankingFingerprint(['a', 'b'], history)
    ;(prisma.rankingCache.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      inputFingerprint: fingerprint,
      rankedIds: ['b', 'a'],
    })

    expect(await rankByTasteCached('default', 'ADULT', ['a', 'b'], history)).toEqual(['b', 'a'])
    expect(prisma.rankingCache.upsert).not.toHaveBeenCalled()
  })

  it('reconciles a stale cache and writes the result back under the new fingerprint', async () => {
    ;(prisma.rankingCache.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      inputFingerprint: 'stale',
      rankedIds: ['c', 'gone', 'a'],
    })
    ;(prisma.rankingCache.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({})

    const result = await rankByTasteCached('default', 'ADULT', ['a', 'c', 'new'], history)

    expect(result).toEqual(['c', 'a', 'new'])
    // Written back so the next load is a clean hit rather than reconciling again.
    expect(prisma.rankingCache.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: {
          inputFingerprint: computeRankingFingerprint(['a', 'c', 'new'], history),
          rankedIds: ['c', 'a', 'new'],
        },
      })
    )
  })

  it('returns candidates in their given order when no cache row exists', async () => {
    ;(prisma.rankingCache.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    ;(prisma.rankingCache.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({})

    expect(await rankByTasteCached('default', 'FAMILY', ['a', 'b'], history)).toEqual(['a', 'b'])
  })

  it('returns an empty array for no candidates without touching the database', async () => {
    expect(await rankByTasteCached('default', 'FAMILY', [], history)).toEqual([])
    expect(prisma.rankingCache.findUnique).not.toHaveBeenCalled()
  })

  it('works with ANTHROPIC_API_KEY unset — the app must never need it', async () => {
    const saved = process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    try {
      ;(prisma.rankingCache.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)
      ;(prisma.rankingCache.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({})
      expect(await rankByTasteCached('default', 'ADULT', ['a'], history)).toEqual(['a'])
    } finally {
      if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved
    }
  })
})
