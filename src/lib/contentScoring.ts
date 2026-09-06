import { z } from 'zod'
import { prisma } from './prisma'

// Content scores are produced by hand during a catalog refresh (see
// .claude/skills/manual-catalog-refresh/SKILL.md), not generated on
// demand. The app only ever reads them — a title without a score shows a
// note rather than triggering work, which is what keeps the deployed app
// free of any Anthropic API dependency.
//
// The schema stays because the refresh batch scripts construct values
// against it.
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

export async function getContentScore(titleId: string) {
  return prisma.contentScore.findUnique({ where: { titleId } })
}
