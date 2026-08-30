import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isRatingVisibleInMode } from '@/lib/filtering'
import { rankByTasteCached } from '@/lib/ranking'

export const maxDuration = 60

// Once a title has been rated anything other than LOVED or WATCHLISTED, it
// drops off the dashboard entirely — the family has already told us what
// they think. A missing rating or an explicit NOT_SEEN both mean "haven't
// watched yet." LOVED and WATCHLISTED each get their own section instead
// of disappearing or staying in the general pool.
const HIDDEN_AFTER_RATING = new Set(['DISLIKED', 'LIKED', 'TOO_INAPPROPRIATE', 'NOT_INTERESTED'])
const MOVED_TO_OWN_SECTION = new Set(['LOVED', 'WATCHLISTED'])

function mapTitle(
  t: {
    id: string
    name: string
    year: number | null
    posterPath: string | null
    providers: string[]
    mpaaRating: string | null
    contentScore: unknown
    overview: string | null
    director: string | null
    writer: string | null
    topCast: string[]
    studio: string | null
  },
  tasteRating: string | null
) {
  return {
    id: t.id,
    name: t.name,
    year: t.year,
    posterPath: t.posterPath,
    providers: t.providers,
    mpaaRating: t.mpaaRating,
    contentScore: t.contentScore,
    overview: t.overview,
    director: t.director,
    writer: t.writer,
    topCast: t.topCast,
    studio: t.studio,
    tasteRating,
  }
}

export async function GET(req: NextRequest) {
  const modeParam = req.nextUrl.searchParams.get('mode')
  const mode: 'FAMILY' | 'ADULT' = modeParam === 'ADULT' ? 'ADULT' : 'FAMILY'
  const familyId = 'default'

  const [titles, tasteHistory] = await Promise.all([
    prisma.title.findMany({ where: { familyId }, include: { contentScore: true } }),
    prisma.tasteRating.findMany({ where: { familyId, mode }, include: { title: true } }),
  ])

  const tasteRatingByTitleId = new Map(tasteHistory.map((t) => [t.titleId, t.rating]))
  const ratedAtByTitleId = new Map(tasteHistory.map((t) => [t.titleId, t.ratedAt]))

  const visible = titles.filter((title) => isRatingVisibleInMode(title.mpaaRating, mode))

  const notSeenCandidates = visible.filter((t) => {
    const rating = tasteRatingByTitleId.get(t.id) ?? ''
    return !HIDDEN_AFTER_RATING.has(rating) && !MOVED_TO_OWN_SECTION.has(rating)
  })
  const loved = visible.filter((t) => tasteRatingByTitleId.get(t.id) === 'LOVED')
  const watchlist = visible.filter((t) => tasteRatingByTitleId.get(t.id) === 'WATCHLISTED')

  const history = tasteHistory
    .filter((t) => t.rating !== 'NOT_SEEN' && t.rating !== 'WATCHLISTED')
    .map((t) => ({
      titleName: t.title.name,
      rating: t.rating,
      director: t.title.director,
      writer: t.title.writer,
      topCast: t.title.topCast,
      studio: t.title.studio,
    }))

  let rankedIds: string[]
  try {
    rankedIds = await rankByTasteCached(
      familyId,
      mode,
      notSeenCandidates.map((v) => ({
        id: v.id,
        name: v.name,
        overview: v.overview,
        director: v.director,
        writer: v.writer,
        topCast: v.topCast,
        studio: v.studio,
      })),
      history
    )
  } catch (err) {
    console.error('Failed to rank titles by taste, falling back to unranked order:', err)
    rankedIds = notSeenCandidates.map((v) => v.id)
  }
  const notSeenById = new Map(notSeenCandidates.map((v) => [v.id, v]))
  const notSeenRanked = rankedIds.map((id) => notSeenById.get(id)).filter((v): v is typeof notSeenCandidates[number] => Boolean(v))

  function sortByRatedAtDesc(list: typeof visible) {
    return [...list].sort((a, b) => {
      const aTime = ratedAtByTitleId.get(a.id)?.getTime() ?? 0
      const bTime = ratedAtByTitleId.get(b.id)?.getTime() ?? 0
      return bTime - aTime
    })
  }

  return NextResponse.json({
    mode,
    notSeen: notSeenRanked.map((t) => mapTitle(t, tasteRatingByTitleId.get(t.id) ?? null)),
    watchlist: sortByRatedAtDesc(watchlist).map((t) => mapTitle(t, 'WATCHLISTED')),
    loved: sortByRatedAtDesc(loved).map((t) => mapTitle(t, 'LOVED')),
  })
}
