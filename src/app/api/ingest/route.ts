import { NextRequest, NextResponse } from 'next/server'
import { discoverByProvider, getWatchProviders, getCertification, getCredits, PROVIDER_IDS } from '@/lib/tmdb'
import { prisma } from '@/lib/prisma'
import { hasTimeRemaining, rotateProviderOrder } from '@/lib/ingestSchedule'

export const maxDuration = 300

// Generous ceiling — hasTimeRemaining is the real safety net, this just
// caps how deep we'd ever try to paginate a single provider's catalog.
const MAX_PAGES_PER_PROVIDER = 10

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'server misconfigured: CRON_SECRET is not set' }, { status: 500 })
  }

  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const functionStart = Date.now()
  const familyId = 'default'
  const results = { ingested: 0, failed: 0 }
  const mediaType = 'movie' as const

  providerLoop: for (const providerId of rotateProviderOrder(Object.values(PROVIDER_IDS), functionStart)) {
    for (let page = 1; page <= MAX_PAGES_PER_PROVIDER; page++) {
      if (!hasTimeRemaining(functionStart, Date.now())) break providerLoop

      let items
      try {
        items = await discoverByProvider(providerId, mediaType, page)
      } catch (error) {
        console.error(`Failed to discover titles for provider ${providerId} (${mediaType}, page ${page}):`, error)
        results.failed++
        break
      }
      if (items.length === 0) break // this provider's catalog is exhausted

      for (const item of items) {
        if (!hasTimeRemaining(functionStart, Date.now())) break providerLoop

        try {
          // Certification and credits are immutable once a title is
          // released — skip re-fetching them from TMDB on every weekly
          // sync once we already have them. Availability always changes,
          // so getWatchProviders always runs.
          const existing = await prisma.title.findUnique({
            where: { familyId_tmdbId: { familyId, tmdbId: item.id } },
            select: { mpaaRating: true, director: true, topCast: true },
          })
          const existingRating = existing?.mpaaRating ?? null
          const existingDirector = existing?.director ?? null
          const existingTopCast = existing?.topCast ?? []
          const needsCertification = !existingRating
          const needsCredits = !existingDirector || existingTopCast.length === 0

          const [providers, mpaaRating, credits] = await Promise.all([
            getWatchProviders(item.id, mediaType),
            needsCertification ? getCertification(item.id, mediaType) : Promise.resolve(existingRating),
            needsCredits
              ? getCredits(item.id, mediaType)
              : Promise.resolve({ director: existingDirector, topCast: existingTopCast }),
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
