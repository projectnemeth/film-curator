import { NextRequest, NextResponse } from 'next/server'
import { discoverByProvider, getWatchProviders, PROVIDER_IDS } from '@/lib/tmdb'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
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
      } catch {
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
        } catch {
          results.failed++
        }
      }
    }
  }

  return NextResponse.json(results)
}
