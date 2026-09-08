// Step 1 of the manual catalog refresh: dump everything the refresh needs
// to reason about — taste history, not-seen candidates in stored order, and
// the unscored content-rating queue — for both modes.
//
// The skill describes this as a throwaway `scripts/tmp-*.ts`, which is right
// when the refresh runs end-to-end in one place. It is kept here because it
// often cannot: a Claude Code web/remote session has no Vercel auth to
// `vercel env pull` with, and its egress proxy refuses Neon outright (TCP
// 5432 refused, HTTPS 403 — the same wall documented for the scheduled
// routine in docs/superpowers/specs/2026-09-05-zero-api-cost-architecture-design.md).
// So the refresh splits: run this locally where DATABASE_URL resolves, and
// paste the output into the session doing the judgment.
//
//   set -a; source .env.production.local; set +a
//   npx tsx scripts/dump-refresh-inputs.ts > /tmp/refresh-inputs.txt

import { prisma } from '../src/lib/prisma'
import { isTitleVisible } from '../src/lib/filtering'

const HIDDEN_AFTER_RATING = new Set(['DISLIKED', 'LIKED', 'TOO_INAPPROPRIATE', 'NOT_INTERESTED'])
const MOVED_TO_OWN_SECTION = new Set(['LOVED', 'WATCHLISTED'])

// How many content-rating candidates to list. The user asked for 20 this
// run; a few extra are printed so there is slack if any turn out to be
// unrecognisable.
const CONTENT_CANDIDATE_LIMIT = 40

async function dumpMode(mode: 'FAMILY' | 'ADULT') {
  console.log(`\n${'='.repeat(72)}\n${mode} MODE\n${'='.repeat(72)}`)

  const [titles, tasteHistory] = await Promise.all([
    prisma.title.findMany({ where: { familyId: 'default' }, include: { contentScore: true } }),
    prisma.tasteRating.findMany({ where: { familyId: 'default', mode }, include: { title: true } }),
  ])

  // --- Taste history: the actual signal for hand-ranking ---
  const rated = tasteHistory.filter((t) => t.rating !== 'NOT_SEEN')
  const buckets = ['LOVED', 'LIKED', 'WATCHLISTED', 'DISLIKED', 'NOT_INTERESTED', 'TOO_INAPPROPRIATE']
  console.log(`\n--- TASTE HISTORY (${rated.length} rated) ---`)
  for (const bucket of buckets) {
    const inBucket = rated.filter((t) => t.rating === bucket)
    if (inBucket.length === 0) continue
    console.log(`\n[${bucket}] (${inBucket.length})`)
    for (const t of inBucket) {
      console.log(
        `  ${t.title.name} (${t.title.year ?? '?'}) | dir: ${t.title.director ?? '-'} | wri: ${t.title.writer ?? '-'} | cast: ${t.title.topCast.slice(0, 3).join(', ') || '-'} | studio: ${t.title.studio ?? '-'}`
      )
    }
  }

  // --- Not-seen candidates: same logic as the recommendations route ---
  const ratingByTitleId = new Map(tasteHistory.map((t) => [t.titleId, t.rating]))
  const visible = titles.filter((t) => isTitleVisible(t, mode))
  const notSeen = visible.filter((t) => {
    const rating = ratingByTitleId.get(t.id) ?? ''
    return !HIDDEN_AFTER_RATING.has(rating) && !MOVED_TO_OWN_SECTION.has(rating)
  })

  const cache = await prisma.rankingCache.findUnique({
    where: { familyId_mode: { familyId: 'default', mode } },
  })
  const cachedOrder = cache?.rankedIds ?? []
  const rank = new Map(cachedOrder.map((id, i) => [id, i]))

  console.log(`\n--- NOT-SEEN CANDIDATES (${notSeen.length}) — current stored order ---`)
  const ordered = [...notSeen].sort(
    (a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER)
  )
  ordered.forEach((t, i) => {
    const pos = rank.has(t.id) ? `#${(rank.get(t.id)! + 1).toString().padStart(3)}` : ' NEW'
    console.log(
      `  ${(i + 1).toString().padStart(3)}. ${pos} ${t.id} | ${t.name} (${t.year ?? '?'}) [${t.mpaaRating ?? '?'}] | dir: ${t.director ?? '-'} | wri: ${t.writer ?? '-'} | cast: ${t.topCast.slice(0, 3).join(', ') || '-'} | studio: ${t.studio ?? '-'} | score: ${t.contentScore ? 'yes' : 'NONE'}`
    )
  })
}

async function dumpContentCandidates() {
  console.log(`\n${'='.repeat(72)}\nCONTENT-RATING CANDIDATES\n${'='.repeat(72)}`)

  // NOTE the `OR` on contentFlag: `contentFlag: { not: 'EXCLUDED' }` alone
  // silently drops every unreviewed title, because SQL `!= 'EXCLUDED'` is
  // NULL (not true) for a null column. Most of the catalog is null here.
  const candidates = await prisma.title.findMany({
    where: {
      mpaaRating: { in: ['PG-13', 'R'] },
      contentScore: null,
      providers: { isEmpty: false },
      OR: [{ contentFlag: null }, { contentFlag: { not: 'EXCLUDED' } }],
    },
    orderBy: { createdAt: 'desc' },
    take: CONTENT_CANDIDATE_LIMIT,
  })

  const total = await prisma.title.count({
    where: {
      mpaaRating: { in: ['PG-13', 'R'] },
      contentScore: null,
      providers: { isEmpty: false },
      OR: [{ contentFlag: null }, { contentFlag: { not: 'EXCLUDED' } }],
    },
  })

  console.log(`\n${total} unscored candidates in total; showing the newest ${candidates.length}:`)
  candidates.forEach((t, i) => {
    console.log(
      `  ${(i + 1).toString().padStart(3)}. ${t.id} | ${t.name} (${t.year ?? '?'}) [${t.mpaaRating}] | tmdbId ${t.tmdbId} | dir: ${t.director ?? '-'} | cast: ${t.topCast.slice(0, 3).join(', ') || '-'} | flag: ${t.contentFlag ?? 'null'}`
    )
  })
}

async function main() {
  const catalog = await prisma.title.count()
  const scored = await prisma.contentScore.count()
  console.log(`catalog=${catalog}  contentScores=${scored}`)

  await dumpContentCandidates()
  await dumpMode('FAMILY')
  await dumpMode('ADULT')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
