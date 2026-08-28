import { prisma } from './prisma'
import type { TasteRatingValue } from '@prisma/client'

export async function getNextTitleToRate(familyId: string) {
  const rated = await prisma.tasteRating.findMany({ where: { familyId }, select: { titleId: true } })
  const ratedIds = rated.map((r) => r.titleId)
  return prisma.title.findFirst({
    where: { familyId, id: { notIn: ratedIds } },
    orderBy: { createdAt: 'desc' },
  })
}

export async function recordTasteRating(familyId: string, titleId: string, rating: TasteRatingValue) {
  return prisma.tasteRating.upsert({
    where: { familyId_titleId: { familyId, titleId } },
    update: { rating, ratedAt: new Date() },
    create: { familyId, titleId, rating },
  })
}
