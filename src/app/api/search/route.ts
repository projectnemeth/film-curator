import { NextRequest, NextResponse } from 'next/server'
import { searchTitle, getWatchProviders, getMovieDetails } from '@/lib/tmdb'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q')
  if (!query) return NextResponse.json({ error: 'q is required' }, { status: 400 })

  const results = await searchTitle(query)
  const titles = []

  for (const result of results.slice(0, 10)) {
    if (!result.title) continue // movies only — skip TV and other result types

    const [providers, details] = await Promise.all([getWatchProviders(result.id), getMovieDetails(result.id)])
    const { certification: mpaaRating, director, writer, topCast, studio } = details
    const dateStr = result.release_date ?? result.first_air_date
    const year = dateStr ? Number(dateStr.slice(0, 4)) : null
    const mpaaRatingUpdate = mpaaRating ? { mpaaRating } : {}
    const directorUpdate = director ? { director } : {}
    const writerUpdate = writer ? { writer } : {}
    const topCastUpdate = topCast.length > 0 ? { topCast } : {}
    const studioUpdate = studio ? { studio } : {}

    const title = await prisma.title.upsert({
      where: { familyId_tmdbId: { familyId: 'default', tmdbId: result.id } },
      update: { providers, ...mpaaRatingUpdate, ...directorUpdate, ...writerUpdate, ...topCastUpdate, ...studioUpdate },
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
        writer,
        topCast,
        studio,
      },
    })
    titles.push(title)
  }

  return NextResponse.json({ titles })
}
