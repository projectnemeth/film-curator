import { prisma } from './prisma'
import type { TasteRatingValue } from '@prisma/client'
import { isRatingVisibleInMode } from './filtering'

export async function getNextTitleToRate(familyId: string, mode: 'FAMILY' | 'ADULT') {
  const rated = await prisma.tasteRating.findMany({ where: { familyId, mode }, select: { titleId: true } })
  const ratedIds = rated.map((r) => r.titleId)

  const candidates = await prisma.title.findMany({
    where: { familyId, id: { notIn: ratedIds } },
    orderBy: { createdAt: 'desc' },
  })

  for (const candidate of candidates) {
    if (isRatingVisibleInMode(candidate.mpaaRating, mode)) {
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
