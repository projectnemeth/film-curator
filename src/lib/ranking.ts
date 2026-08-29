import { z } from 'zod'
import { createHash } from 'crypto'
import { getAnthropicClient } from './anthropic'
import { prisma } from './prisma'

const RankingResponseSchema = z.object({
  rankedTitleIds: z.array(z.string()),
})

export type TasteHistoryEntry = { titleName: string; rating: string }
export type CandidateTitle = { id: string; name: string; overview: string | null }

export async function rankByTaste(candidates: CandidateTitle[], tasteHistory: TasteHistoryEntry[]): Promise<string[]> {
  if (candidates.length === 0) return []
  if (tasteHistory.length === 0) return candidates.map((c) => c.id)

  const client = getAnthropicClient()
  const message = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 1000,
    thinking: { type: 'disabled' },
    messages: [
      {
        role: 'user',
        content: `Given this viewer's taste history:\n${tasteHistory.map((h) => `- ${h.titleName}: ${h.rating}`).join('\n')}\n\nRank these candidate titles from best to worst fit for this viewer:\n${candidates.map((c) => `- id=${c.id} name="${c.name}" overview="${c.overview ?? ''}"`).join('\n')}\n\nRespond with ONLY JSON: { "rankedTitleIds": [...] } listing every candidate id exactly once, best fit first.`,
      },
    ],
  })

  const textBlocks = message.content.filter((b) => b.type === 'text')
  const lastBlock = textBlocks[textBlocks.length - 1]
  const text = lastBlock?.type === 'text' ? lastBlock.text : ''
  const cleaned = text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  const parsed = RankingResponseSchema.parse(JSON.parse(cleaned))
  return parsed.rankedTitleIds
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

  await prisma.rankingCache.upsert({
    where: { familyId_mode: { familyId, mode } },
    update: { inputFingerprint: fingerprint, rankedIds },
    create: { familyId, mode, inputFingerprint: fingerprint, rankedIds },
  })

  return rankedIds
}
