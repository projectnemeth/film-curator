import { prisma } from './prisma'
import type { TasteRatingValue } from '@prisma/client'
import { isTitleVisible } from './filtering'

export async function getNextTitleToRate(familyId: string, mode: 'FAMILY' | 'ADULT') {
  const rated = await prisma.tasteRating.findMany({ where: { familyId, mode }, select: { titleId: true } })
  const ratedIds = rated.map((r) => r.titleId)

  // contentScore is included because isTitleVisible consults it — without
  // it every title would look unscored and slip past the sexual-content rule.
  const candidates = await prisma.title.findMany({
    where: { familyId, id: { notIn: ratedIds } },
    include: { contentScore: true },
    orderBy: { createdAt: 'desc' },
  })

  for (const candidate of candidates) {
    if (isTitleVisible(candidate, mode)) {
      return candidate
    }
  }

  return null
}

export async function recordTasteRating(familyId: string, titleId: string, mode: 'FAMILY' | 'ADULT', rating: TasteRatingValue) {
  return prisma.tasteRating.upsert({
    where: { familyId_titleId_mode: { familyId, titleId, mode } },
    update: { rating, ratedAt: new Date() },
    create: { familyId, titleId, mode, rating },
  })
}
