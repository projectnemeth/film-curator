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

async function synthesizeContentScore(titleName: string, year: number | null): Promise<SynthesizedScore> {
  const client = getAnthropicClient()
  const message = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 500,
    messages: [
      {
        role: 'user',
        content: `Using publicly known parental-guide-style information (e.g. Common Sense Media, IMDb Parents Guide) about "${titleName}"${year ? ` (${year})` : ''}, respond with ONLY a JSON object with these exact keys and no other text: violence (0-10), language (0-10), sexNudity (0-10), scariness (0-10), isUnrated (boolean), isNC17 (boolean), sourceNotes (a short string citing what informed the scores).`,
      },
    ],
  })
  const block = message.content[0]
  const text = block.type === 'text' ? block.text : ''
  return SynthesizedScoreSchema.parse(JSON.parse(text))
}

export async function getOrCreateContentScore(titleId: string) {
  const existing = await prisma.contentScore.findUnique({ where: { titleId } })
  if (existing) return existing

  const title = await prisma.title.findUniqueOrThrow({ where: { id: titleId } })
  const synthesized = await synthesizeContentScore(title.name, title.year)
  return prisma.contentScore.create({ data: { titleId, ...synthesized } })
}
