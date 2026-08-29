import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getOrCreateContentScore } from '@/lib/contentScoring'
import { evaluateTitle, isVisibleInMode, type ContentScoreInput } from '@/lib/filtering'
import { rankByTaste } from '@/lib/ranking'

export async function GET(req: NextRequest) {
  const modeParam = req.nextUrl.searchParams.get('mode')
  const mode: 'FAMILY' | 'ADULT' = modeParam === 'ADULT' ? 'ADULT' : 'FAMILY'
  const familyId = 'default'

  const [titles, thresholds, overrides, tasteHistory] = await Promise.all([
    prisma.title.findMany({ where: { familyId }, include: { contentScore: true } }),
    prisma.modeSettings.findUniqueOrThrow({ where: { familyId_mode: { familyId, mode } } }),
    prisma.override.findMany({ where: { familyId } }),
    prisma.tasteRating.findMany({ where: { familyId }, include: { title: true } }),
  ])

  const overrideByTitleId = new Map(overrides.map((o) => [o.titleId, o]))

  const visible: Array<{ id: string; name: string; overview: string | null; contentScore: ContentScoreInput | null; filterReason: string }> = []

  for (const title of titles) {
    let score: ContentScoreInput | null = title.contentScore
    if (!score) {
      try {
        score = await getOrCreateContentScore(title.id)
      } catch (error) {
        console.error(`Failed to score title ${title.id}:`, error)
        score = null
      }
    }
    const override = overrideByTitleId.get(title.id) ?? null
    const reason = evaluateTitle(score, thresholds, override)
    if (isVisibleInMode(reason, mode)) {
      visible.push({ ...title, contentScore: score, filterReason: reason })
    }
  }

  const history = tasteHistory
    .filter((t) => t.rating !== 'NOT_SEEN')
    .map((t) => ({ titleName: t.title.name, rating: t.rating }))

  let ranked = visible
  try {
    const rankedIds = await rankByTaste(
      visible.map((v) => ({ id: v.id, name: v.name, overview: v.overview })),
      history
    )
    const byId = new Map(visible.map((v) => [v.id, v]))
    ranked = rankedIds.map((id) => byId.get(id)).filter((v): v is typeof visible[number] => Boolean(v))
  } catch (error) {
    console.error('Failed to rank titles by taste, falling back to unranked order:', error)
  }

  return NextResponse.json({ mode, titles: ranked })
}
