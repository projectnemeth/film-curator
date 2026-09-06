import { createHash } from 'crypto'
import { prisma } from './prisma'

// The app does not rank titles itself. Ordering is produced by hand during
// a catalog refresh (see .claude/skills/manual-catalog-refresh/SKILL.md)
// and stored in RankingCache; everything here just serves and maintains
// that stored order. Nothing in this file — or anywhere under src/ — calls
// the Anthropic API, which is what makes the deployed app structurally
// incapable of spending against ANTHROPIC_API_KEY.

type TitleAffinityMetadata = { director: string | null; writer: string | null; topCast: string[]; studio: string | null }

export type TasteHistoryEntry = { titleName: string; rating: string } & Partial<TitleAffinityMetadata>

// Reconciles a stored order against the candidate set as it is right now:
// keep the ranked order for everything still present, drop what has left
// (excluded, or rated and moved to another section), and append arrivals
// in the order given.
//
// The result ALWAYS covers every candidate exactly once. The
// recommendations route resolves ids through
// `rankedIds.map(id => byId.get(id)).filter(Boolean)`, so a candidate
// missing from this array does not appear unranked — it vanishes from the
// dashboard entirely.
export function reconcileRanking(cachedIds: string[], candidateIds: string[]): string[] {
  const candidateSet = new Set(candidateIds)
  const kept = cachedIds.filter((id) => candidateSet.has(id))
  const keptSet = new Set(kept)
  const appended = candidateIds.filter((id) => !keptSet.has(id))
  return [...kept, ...appended]
}

export function computeRankingFingerprint(candidateIds: string[], tasteHistory: TasteHistoryEntry[]): string {
  const sortedIds = [...candidateIds].sort()
  const sortedHistory = tasteHistory.map((h) => `${h.titleName}:${h.rating}`).sort()
  return createHash('sha256').update(sortedIds.join(',') + '|' + sortedHistory.join(',')).digest('hex')
}

// A fingerprint miss means the candidate set or the taste history moved
// since the order was last computed — a new rating, an ingest, an
// exclusion verdict. Rather than recompute an order (which would require a
// model call), reconcile the one we have and store it under the new
// fingerprint so the next load is a clean hit.
//
// The ordering is therefore as good as the last manual refresh, and newly
// arrived titles sit at the bottom until the next one.
export async function rankByTasteCached(
  familyId: string,
  mode: 'FAMILY' | 'ADULT',
  candidateIds: string[],
  tasteHistory: TasteHistoryEntry[]
): Promise<string[]> {
  if (candidateIds.length === 0) return []

  const fingerprint = computeRankingFingerprint(candidateIds, tasteHistory)
  const cached = await prisma.rankingCache.findUnique({ where: { familyId_mode: { familyId, mode } } })
  if (cached && cached.inputFingerprint === fingerprint) {
    return cached.rankedIds
  }

  const rankedIds = reconcileRanking(cached?.rankedIds ?? [], candidateIds)

  await prisma.rankingCache.upsert({
    where: { familyId_mode: { familyId, mode } },
    update: { inputFingerprint: fingerprint, rankedIds },
    create: { familyId, mode, inputFingerprint: fingerprint, rankedIds },
  })

  return rankedIds
}
