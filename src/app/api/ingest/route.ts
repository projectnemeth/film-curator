import { NextRequest, NextResponse } from 'next/server'
import { discoverByProvider, getWatchProviders, PROVIDER_IDS } from '@/lib/tmdb'
import { prisma } from '@/lib/prisma'
import { getOrCreateContentScore } from '@/lib/contentScoring'

export const maxDuration = 300

const SCORING_TIME_BUDGET_MS = 240_000
const PER_TITLE_TIMEOUT_MS = 50_000

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'server misconfigured: CRON_SECRET is not set' }, { status: 500 })
  }

  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const familyId = 'default'
  const results = { ingested: 0, failed: 0, scored: 0, skipped: 0 }

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
          const providers = await getWatchProviders(item.id, mediaType)
          const dateStr = item.release_date ?? item.first_air_date
          const year = dateStr ? Number(dateStr.slice(0, 4)) : null

          await prisma.title.upsert({
            where: { familyId_tmdbId: { familyId, tmdbId: item.id } },
            update: { providers },
            create: {
              familyId,
              tmdbId: item.id,
              name: item.title ?? item.name ?? 'Unknown',
              year,
              posterPath: item.poster_path,
              overview: item.overview,
              providers,
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

  const unscoredTitles = await prisma.title.findMany({
    where: { familyId, contentScore: null },
    orderBy: { createdAt: 'desc' },
  })

  const scoringStart = Date.now()
  for (const title of unscoredTitles) {
    if (Date.now() - scoringStart > SCORING_TIME_BUDGET_MS) break

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), PER_TITLE_TIMEOUT_MS)
    try {
      await getOrCreateContentScore(title.id, controller.signal)
      results.scored++
    } catch (err) {
      console.error(`Failed to score title ${title.id} (${title.name}):`, err)
      results.skipped++
    } finally {
      clearTimeout(timer)
    }
  }

  return NextResponse.json(results)
}
