import { NextRequest, NextResponse } from 'next/server'
import { searchTitle, getWatchProviders, getCertification } from '@/lib/tmdb'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q')
  if (!query) return NextResponse.json({ error: 'q is required' }, { status: 400 })

  const results = await searchTitle(query)
  const titles = []

  for (const result of results.slice(0, 10)) {
    const mediaType = result.title ? 'movie' : 'tv'
    const [providers, mpaaRating] = await Promise.all([
      getWatchProviders(result.id, mediaType),
      getCertification(result.id, mediaType),
    ])
    const dateStr = result.release_date ?? result.first_air_date
    const year = dateStr ? Number(dateStr.slice(0, 4)) : null
    const mpaaRatingUpdate = mpaaRating ? { mpaaRating } : {}

    const title = await prisma.title.upsert({
      where: { familyId_tmdbId: { familyId: 'default', tmdbId: result.id } },
      update: { providers, ...mpaaRatingUpdate },
      create: {
        familyId: 'default',
        tmdbId: result.id,
        name: result.title ?? result.name ?? 'Unknown',
        year,
        posterPath: result.poster_path,
        overview: result.overview,
        providers,
        mpaaRating,
      },
    })
    titles.push(title)
  }

  return NextResponse.json({ titles })
}
