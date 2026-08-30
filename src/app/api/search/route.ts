import { NextRequest, NextResponse } from 'next/server'
import { searchTitle, getWatchProviders, getCertification, getCredits } from '@/lib/tmdb'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q')
  if (!query) return NextResponse.json({ error: 'q is required' }, { status: 400 })

  const results = await searchTitle(query)
  const titles = []

  for (const result of results.slice(0, 10)) {
    if (!result.title) continue // movies only — skip TV and other result types

    const [providers, mpaaRating, credits] = await Promise.all([
      getWatchProviders(result.id),
      getCertification(result.id),
      getCredits(result.id),
    ])
    const { director, topCast } = credits
    const dateStr = result.release_date ?? result.first_air_date
    const year = dateStr ? Number(dateStr.slice(0, 4)) : null
    const mpaaRatingUpdate = mpaaRating ? { mpaaRating } : {}
    const directorUpdate = director ? { director } : {}
    const topCastUpdate = topCast.length > 0 ? { topCast } : {}

    const title = await prisma.title.upsert({
      where: { familyId_tmdbId: { familyId: 'default', tmdbId: result.id } },
      update: { providers, ...mpaaRatingUpdate, ...directorUpdate, ...topCastUpdate },
      create: {
        familyId: 'default',
        tmdbId: result.id,
        name: result.title ?? result.name ?? 'Unknown',
        year,
        posterPath: result.poster_path,
        overview: result.overview,
        providers,
        mpaaRating,
        director,
        topCast,
      },
    })
    titles.push(title)
  }

  return NextResponse.json({ titles })
}
