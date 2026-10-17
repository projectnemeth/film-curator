// Taste ratings recorded by hand, 2026-10-17.
//
// Two ratings the family gave in conversation rather than through the
// dashboard, plus the one ingest needed to make the second possible.
//
//   Extraction          -> LOVED   (was an unrated candidate, #13 in Adult)
//   In the Grey (2026)  -> LIKED   (not in the catalog at all until now)
//
// "In the Grey" arrived as "Into the Grey", which matches nothing on TMDB.
// It is tmdbId 1122573: the Guy Ritchie heist thriller released 2026-05-13
// with Henry Cavill and Jake Gyllenhaal — the only 2026 release with Grey
// in the title, and a close fit for the taste history either way.
//
// The upsert below mirrors src/app/api/ingest/route.ts rather than the
// lighter one in src/app/api/search/route.ts, because only the ingest path
// writes `genres` and `keywords`. Keywords are what nominate a title for
// the family's exclusion review, so a title ingested without them can
// never be flagged. (This one trips nothing: mission, heist, agent.)
//
// TMDB currently reports no watch providers for it, which is expected for
// a recent release and harmless here — a LIKED title is off the Not Seen
// list regardless, and its only remaining job is to feed taste history.

import { prisma } from '../src/lib/prisma'
import { getMovieDetails, getWatchProviders, searchTitle } from '../src/lib/tmdb'

const EXTRACTION_ID = 'cmuaw24h300ku132gqap06vkb'
const IN_THE_GREY_TMDB_ID = 1122573

async function rateExtraction() {
  const r = await prisma.tasteRating.upsert({
    where: { familyId_titleId_mode: { familyId: 'default', titleId: EXTRACTION_ID, mode: 'ADULT' } },
    update: { rating: 'LOVED', ratedAt: new Date() },
    create: { familyId: 'default', titleId: EXTRACTION_ID, mode: 'ADULT', rating: 'LOVED' },
    include: { title: { select: { name: true } } },
  })
  console.log(`${r.title.name} -> ${r.rating}`)
}

async function ingestAndRateInTheGrey() {
  const results = await searchTitle('In the Grey')
  const hit = results.find((r) => r.id === IN_THE_GREY_TMDB_ID)
  if (!hit || !hit.title) throw new Error(`tmdbId ${IN_THE_GREY_TMDB_ID} not found as a movie on TMDB`)

  const [providers, details] = await Promise.all([
    getWatchProviders(IN_THE_GREY_TMDB_ID),
    getMovieDetails(IN_THE_GREY_TMDB_ID),
  ])
  const { certification: mpaaRating, director, writer, topCast, studio, genres, keywords } = details
  const year = hit.release_date ? Number(hit.release_date.slice(0, 4)) : null

  const title = await prisma.title.upsert({
    where: { familyId_tmdbId: { familyId: 'default', tmdbId: IN_THE_GREY_TMDB_ID } },
    update: { providers, mpaaRating, director, writer, topCast, studio, genres, keywords },
    create: {
      familyId: 'default',
      tmdbId: IN_THE_GREY_TMDB_ID,
      name: hit.title,
      year,
      posterPath: hit.poster_path,
      overview: hit.overview,
      providers,
      mpaaRating,
      director,
      writer,
      topCast,
      studio,
      genres,
      keywords,
    },
  })
  console.log(`Ingested ${title.name} (${title.year}) ${title.mpaaRating} — keywords: ${title.keywords.join(', ')}`)

  // R-rated, so it belongs to Adult mode under src/lib/filtering.ts.
  const mode = title.mpaaRating === 'G' || title.mpaaRating === 'PG' ? 'FAMILY' : 'ADULT'
  const rating = await prisma.tasteRating.upsert({
    where: { familyId_titleId_mode: { familyId: 'default', titleId: title.id, mode } },
    update: { rating: 'LIKED', ratedAt: new Date() },
    create: { familyId: 'default', titleId: title.id, mode, rating: 'LIKED' },
  })
  console.log(`${title.name} -> ${rating.rating} (${mode})`)
}

async function main() {
  await rateExtraction()
  await ingestAndRateInTheGrey()
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
