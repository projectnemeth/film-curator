// One-time backfill: Title.genres and Title.keywords were added after the
// catalog was already populated, so every pre-existing row has empty lists.
// Keywords drive the exclusion rule (src/lib/exclusion.ts), and an empty
// keyword list reads as "nothing to flag" — so until this has run, the
// exclusion filter is inert for the existing catalog.
//
// TV rows are skipped: the /movie/{id} endpoint 404s on TV ids, and every
// TV title is already hidden by the movies-only rating rule.
//
// Usage:
//   npx tsx scripts/backfill-genres-keywords.ts           # report only, no writes
//   npx tsx scripts/backfill-genres-keywords.ts --apply   # write genres + keywords

import { PrismaClient } from '@prisma/client'
import { getMovieDetails } from '../src/lib/tmdb'
import { findExclusionTriggers } from '../src/lib/exclusion'

const prisma = new PrismaClient()
const CONCURRENCY = 10

async function main() {
  const apply = process.argv.includes('--apply')

  const titles = await prisma.title.findMany({
    where: { genres: { isEmpty: true } },
    select: { id: true, tmdbId: true, name: true },
    orderBy: { name: 'asc' },
  })

  console.log(`${titles.length} titles need genres/keywords.`)
  if (titles.length === 0) return

  let written = 0
  let failed = 0
  let flagged = 0

  for (let i = 0; i < titles.length; i += CONCURRENCY) {
    const batch = titles.slice(i, i + CONCURRENCY)
    await Promise.all(
      batch.map(async (t) => {
        let details
        try {
          details = await getMovieDetails(t.tmdbId)
        } catch {
          // Almost always a TV id hitting the movie endpoint.
          failed++
          return
        }
        if (findExclusionTriggers(details.keywords).length > 0) flagged++
        if (apply) {
          await prisma.title.update({
            where: { id: t.id },
            data: { genres: details.genres, keywords: details.keywords },
          })
        }
        written++
      })
    )
    if ((i + CONCURRENCY) % 200 < CONCURRENCY) console.log(`  ${Math.min(i + CONCURRENCY, titles.length)}/${titles.length}`)
  }

  console.log(`\n${apply ? 'wrote' : 'would write'}=${written}  skipped(non-movie)=${failed}  keyword-flagged=${flagged}`)
  if (!apply) console.log('Dry run — re-run with --apply to write.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
