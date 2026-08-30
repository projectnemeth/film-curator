import { z } from 'zod'
import { createHash } from 'crypto'
import { getAnthropicClient } from './anthropic'
import { prisma } from './prisma'

// Claude is asked to rank by index, not by full title id — ids are 25-char
// cuids, so echoing one back per candidate burns output tokens fast and can
// truncate the response into invalid JSON on a large candidate list. Ranking
// is also capped to the most reasonable list size worth actually presenting
// (the catalog can now run into the hundreds after a deep sync) — this
// caps both the request's input cost and the guaranteed-to-fit output size,
// regardless of how large the catalog grows. Anything beyond the cap is
// appended afterward in its original order, unranked.
const MAX_CANDIDATES_TO_RANK = 60

const RankingResponseSchema = z.object({
  rankedIndices: z.array(z.number().int()),
})

export type TasteHistoryEntry = { titleName: string; rating: string }
export type CandidateTitle = { id: string; name: string; overview: string | null }

async function rankSubsetByIndex(toRank: CandidateTitle[], tasteHistory: TasteHistoryEntry[]): Promise<string[]> {
  const client = getAnthropicClient()
  const message = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 1000,
    thinking: { type: 'disabled' },
    messages: [
      {
        role: 'user',
        content: `Given this viewer's taste history:\n${tasteHistory.map((h) => `- ${h.titleName}: ${h.rating}`).join('\n')}\n\nRank these candidate titles from best to worst fit for this viewer:\n${toRank.map((c, i) => `${i}: "${c.name}" — ${c.overview ?? ''}`).join('\n')}\n\nRespond with ONLY JSON: { "rankedIndices": [...] } listing each index from 0 to ${toRank.length - 1} exactly once, best fit first.`,
      },
    ],
  })

  const textBlocks = message.content.filter((b) => b.type === 'text')
  const lastBlock = textBlocks[textBlocks.length - 1]
  const text = lastBlock?.type === 'text' ? lastBlock.text : ''
  const cleaned = text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  const parsed = RankingResponseSchema.parse(JSON.parse(cleaned))

  // Defensively complete the ranking ourselves: any index Claude duplicated,
  // omitted, or put out of range is dropped, then whatever's left over is
  // appended in original order — the result always covers every index in
  // toRank exactly once, regardless of response quality.
  const seen = new Set<number>()
  const orderedIds: string[] = []
  for (const index of parsed.rankedIndices) {
    if (Number.isInteger(index) && index >= 0 && index < toRank.length && !seen.has(index)) {
      seen.add(index)
      orderedIds.push(toRank[index].id)
    }
  }
  for (let i = 0; i < toRank.length; i++) {
    if (!seen.has(i)) orderedIds.push(toRank[i].id)
  }
  return orderedIds
}

export async function rankByTaste(candidates: CandidateTitle[], tasteHistory: TasteHistoryEntry[]): Promise<string[]> {
  if (candidates.length === 0) return []
  if (tasteHistory.length === 0) return candidates.map((c) => c.id)

  const toRank = candidates.slice(0, MAX_CANDIDATES_TO_RANK)
  const remainder = candidates.slice(MAX_CANDIDATES_TO_RANK)

  const rankedIds = await rankSubsetByIndex(toRank, tasteHistory)
  return [...rankedIds, ...remainder.map((c) => c.id)]
}

export function computeRankingFingerprint(candidateIds: string[], tasteHistory: TasteHistoryEntry[]): string {
  const sortedIds = [...candidateIds].sort()
  const sortedHistory = tasteHistory.map((h) => `${h.titleName}:${h.rating}`).sort()
  return createHash('sha256').update(sortedIds.join(',') + '|' + sortedHistory.join(',')).digest('hex')
}

export async function rankByTasteCached(
  familyId: string,
  mode: 'FAMILY' | 'ADULT',
  candidates: CandidateTitle[],
  tasteHistory: TasteHistoryEntry[]
): Promise<string[]> {
  if (candidates.length === 0) return []

  const fingerprint = computeRankingFingerprint(candidates.map((c) => c.id), tasteHistory)
  const cached = await prisma.rankingCache.findUnique({ where: { familyId_mode: { familyId, mode } } })
  if (cached && cached.inputFingerprint === fingerprint) {
    return cached.rankedIds
  }

  const rankedIds = await rankByTaste(candidates, tasteHistory)

  const isComplete = rankedIds.length === candidates.length && candidates.every((c) => rankedIds.includes(c.id))
  if (isComplete) {
    await prisma.rankingCache.upsert({
      where: { familyId_mode: { familyId, mode } },
      update: { inputFingerprint: fingerprint, rankedIds },
      create: { familyId, mode, inputFingerprint: fingerprint, rankedIds },
    })
  }

  return rankedIds
}
