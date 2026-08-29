import { prisma } from './prisma'
import type { TasteRatingValue } from '@prisma/client'
import { evaluateTitle, isVisibleInMode } from './filtering'

export async function getNextTitleToRate(familyId: string, mode: 'FAMILY' | 'ADULT') {
  const [rated, thresholds, overrides] = await Promise.all([
    prisma.tasteRating.findMany({ where: { familyId }, select: { titleId: true } }),
    prisma.modeSettings.findUniqueOrThrow({ where: { familyId_mode: { familyId, mode } } }),
    prisma.override.findMany({ where: { familyId } }),
  ])
  const ratedIds = rated.map((r) => r.titleId)
  const overrideByTitleId = new Map(overrides.map((o) => [o.titleId, o]))

  const candidates = await prisma.title.findMany({
    where: { familyId, id: { notIn: ratedIds } },
    orderBy: { createdAt: 'desc' },
    include: { contentScore: true },
  })

  for (const candidate of candidates) {
    const override = overrideByTitleId.get(candidate.id) ?? null
    const reason = evaluateTitle(candidate.contentScore, thresholds, override)
    if (isVisibleInMode(reason, mode)) {
      return candidate
    }
  }

  return null
}

export async function recordTasteRating(familyId: string, titleId: string, rating: TasteRatingValue) {
  return prisma.tasteRating.upsert({
    where: { familyId_titleId: { familyId, titleId } },
    update: { rating, ratedAt: new Date() },
    create: { familyId, titleId, rating },
  })
}
