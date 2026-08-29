import { NextRequest, NextResponse } from 'next/server'
import { discoverByProvider, getWatchProviders, getCertification, getCredits, PROVIDER_IDS } from '@/lib/tmdb'
import { prisma } from '@/lib/prisma'

export const maxDuration = 300

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'server misconfigured: CRON_SECRET is not set' }, { status: 500 })
  }

  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const familyId = 'default'
  const results = { ingested: 0, failed: 0 }

  for (const providerId of Object.values(PROVIDER_IDS)) {
    for (const mediaType of ['movie', 'tv'] as const) {
      let items
      try {
        items = await discoverByProvider(providerId, mediaType)
      } catch (error) {
        console.error(`Failed to discover titles for provider ${providerId} (${mediaType}):`, error)
        results.failed++
        continue
      }

      for (const item of items) {
        try {
          const [providers, mpaaRating, credits] = await Promise.all([
            getWatchProviders(item.id, mediaType),
            getCertification(item.id, mediaType),
            getCredits(item.id, mediaType),
          ])
          const { director, topCast } = credits
          const dateStr = item.release_date ?? item.first_air_date
          const year = dateStr ? Number(dateStr.slice(0, 4)) : null
          const mpaaRatingUpdate = mpaaRating ? { mpaaRating } : {}
          const directorUpdate = director ? { director } : {}
          const topCastUpdate = topCast.length > 0 ? { topCast } : {}

          await prisma.title.upsert({
            where: { familyId_tmdbId: { familyId, tmdbId: item.id } },
            update: { providers, ...mpaaRatingUpdate, ...directorUpdate, ...topCastUpdate },
            create: {
              familyId,
              tmdbId: item.id,
              name: item.title ?? item.name ?? 'Unknown',
              year,
              posterPath: item.poster_path,
              overview: item.overview,
              providers,
              mpaaRating,
              director,
              topCast,
            },
          })
          results.ingested++
        } catch (error) {
          console.error(`Failed to ingest title tmdbId=${item.id} name=${item.title ?? item.name ?? 'Unknown'}:`, error)
          results.failed++
        }
      }
    }
  }

  return NextResponse.json(results)
}
