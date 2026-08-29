import { z } from 'zod'
import { prisma } from './prisma'
import { getAnthropicClient } from './anthropic'

const SynthesizedScoreSchema = z.object({
  violence: z.number().min(0).max(10),
  language: z.number().min(0).max(10),
  sexNudity: z.number().min(0).max(10),
  scariness: z.number().min(0).max(10),
  isUnrated: z.boolean(),
  isNC17: z.boolean(),
  sourceNotes: z.string(),
})

export type SynthesizedScore = z.infer<typeof SynthesizedScoreSchema>

async function synthesizeContentScore(titleName: string, year: number | null, signal?: AbortSignal): Promise<SynthesizedScore> {
  const client = getAnthropicClient()
  const message = await client.messages.create(
    {
      model: 'claude-sonnet-5',
      max_tokens: 2048,
      thinking: { type: 'adaptive' },
      tools: [
        {
          type: 'web_search_20260209',
          name: 'web_search',
          max_uses: 3,
          allowed_domains: ['commonsensemedia.org', 'imdb.com'],
        },
        {
          type: 'web_fetch_20260209',
          name: 'web_fetch',
          max_uses: 3,
          allowed_domains: ['commonsensemedia.org', 'imdb.com'],
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Search for and read the Common Sense Media review or IMDb Parents Guide for "${titleName}"${year ? ` (${year})` : ''}. Base your answer on what you actually find on those pages. If you cannot find a page for this title, say so in sourceNotes and give your best estimate instead.\n\nRespond with ONLY a JSON object as your final message, with no explanatory text before or after it and no narration of your search process. Use these exact keys and no other text: violence (0-10), language (0-10), sexNudity (0-10), scariness (0-10), isUnrated (boolean), isNC17 (boolean), sourceNotes (a short string citing what you found or explaining that no page was found).`,
        },
      ],
    },
    { signal }
  )
  const textBlocks = message.content.filter((b) => b.type === 'text')
  const lastBlock = textBlocks[textBlocks.length - 1]
  const text = lastBlock?.type === 'text' ? lastBlock.text : ''
  const cleaned = text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  return SynthesizedScoreSchema.parse(JSON.parse(cleaned))
}

export async function getOrCreateContentScore(titleId: string, signal?: AbortSignal) {
  const existing = await prisma.contentScore.findUnique({ where: { titleId } })
  if (existing) return existing

  const title = await prisma.title.findUniqueOrThrow({ where: { id: titleId } })
  const synthesized = await synthesizeContentScore(title.name, title.year, signal)
  return prisma.contentScore.create({ data: { titleId, ...synthesized } })
}
