import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isTitleVisible } from '@/lib/filtering'
import { rankByTasteCached } from '@/lib/ranking'

export const maxDuration = 60

export async function GET(req: NextRequest) {
  const modeParam = req.nextUrl.searchParams.get('mode')
  const mode: 'FAMILY' | 'ADULT' = modeParam === 'ADULT' ? 'ADULT' : 'FAMILY'
  const familyId = 'default'

  const [titles, overrides, tasteHistory] = await Promise.all([
    prisma.title.findMany({ where: { familyId }, include: { contentScore: true } }),
    prisma.override.findMany({ where: { familyId } }),
    prisma.tasteRating.findMany({ where: { familyId, mode }, include: { title: true } }),
  ])

  const overrideByTitleId = new Map(overrides.map((o) => [o.titleId, o]))
  const tasteRatingByTitleId = new Map(tasteHistory.map((t) => [t.titleId, t.rating]))

  const visible = titles.filter((title) => {
    const override = overrideByTitleId.get(title.id) ?? null
    return isTitleVisible(title.mpaaRating, override, mode)
  })

  const history = tasteHistory
    .filter((t) => t.rating !== 'NOT_SEEN')
    .map((t) => ({ titleName: t.title.name, rating: t.rating }))

  let rankedIds: string[]
  try {
    rankedIds = await rankByTasteCached(
      familyId,
      mode,
      visible.map((v) => ({ id: v.id, name: v.name, overview: v.overview })),
      history
    )
  } catch (err) {
    console.error('Failed to rank titles by taste, falling back to unranked order:', err)
    rankedIds = visible.map((v) => v.id)
  }
  const byId = new Map(visible.map((v) => [v.id, v]))
  const ranked = rankedIds.map((id) => byId.get(id)).filter((v): v is typeof visible[number] => Boolean(v))

  return NextResponse.json({
    mode,
    titles: ranked.map((t) => ({
      id: t.id,
      name: t.name,
      year: t.year,
      posterPath: t.posterPath,
      providers: t.providers,
      mpaaRating: t.mpaaRating,
      contentScore: t.contentScore,
      overview: t.overview,
      director: t.director,
      topCast: t.topCast,
      tasteRating: tasteRatingByTitleId.get(t.id) ?? null,
    })),
  })
}
