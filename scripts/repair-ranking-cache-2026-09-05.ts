// Repair pass after the exclusion rule landed (2026-09-05).
//
// The ranking cache is keyed by a fingerprint over the not-seen candidate
// id set (see computeRankingFingerprint in src/lib/ranking.ts). Excluding
// 83 titles changed that set, so both modes' caches went stale — and a
// stale cache means the dashboard re-ranks through the app's own paid
// Anthropic key on the next load, which is exactly what the manual
// refresh workflow exists to avoid.
//
// The previously hand-ranked order is still good judgment; it just has
// excluded titles in it. So: keep the existing order, drop what's now
// excluded, append anything not already ranked, re-fingerprint.
//
// Usage:
//   npx tsx scripts/repair-ranking-cache-2026-09-05.ts           # report only
//   npx tsx scripts/repair-ranking-cache-2026-09-05.ts --apply   # rewrite caches

import { prisma } from '../src/lib/prisma'
import { isTitleVisible } from '../src/lib/filtering'
import { computeRankingFingerprint, type TasteHistoryEntry } from '../src/lib/ranking'

const HIDDEN_AFTER_RATING = new Set(['DISLIKED', 'LIKED', 'TOO_INAPPROPRIATE', 'NOT_INTERESTED'])
const MOVED_TO_OWN_SECTION = new Set(['LOVED', 'WATCHLISTED'])

async function repair(mode: 'FAMILY' | 'ADULT', apply: boolean) {
  const familyId = 'default'

  const [titles, tasteHistory] = await Promise.all([
    prisma.title.findMany({ where: { familyId }, include: { contentScore: true } }),
    prisma.tasteRating.findMany({ where: { familyId, mode }, include: { title: true } }),
  ])

  const ratingByTitleId = new Map(tasteHistory.map((t) => [t.titleId, t.rating]))

  // Mirrors src/app/api/recommendations/route.ts exactly — a drift here is
  // how titles silently vanish from the dashboard.
  const visible = titles.filter((t) => isTitleVisible(t, mode))
  const candidateIds = visible
    .filter((t) => {
      const rating = ratingByTitleId.get(t.id) ?? ''
      return !HIDDEN_AFTER_RATING.has(rating) && !MOVED_TO_OWN_SECTION.has(rating)
    })
    .map((t) => t.id)

  const history: TasteHistoryEntry[] = tasteHistory
    .filter((t) => t.rating !== 'NOT_SEEN' && t.rating !== 'WATCHLISTED')
    .map((t) => ({
      titleName: t.title.name,
      rating: t.rating,
      director: t.title.director,
      writer: t.title.writer,
      topCast: t.title.topCast,
      studio: t.title.studio,
    })) as TasteHistoryEntry[]

  const cached = await prisma.rankingCache.findUnique({ where: { familyId_mode: { familyId, mode } } })
  const candidateSet = new Set(candidateIds)

  const keptOrder = (cached?.rankedIds ?? []).filter((id) => candidateSet.has(id))
  const appended = candidateIds.filter((id) => !keptOrder.includes(id))
  const rankedIds = [...keptOrder, ...appended]

  // Same completeness guarantee the manual-refresh workflow insists on:
  // any candidate missing from rankedIds disappears from the dashboard.
  if (rankedIds.length !== candidateIds.length || !candidateIds.every((id) => rankedIds.includes(id))) {
    throw new Error(`${mode}: rankedIds (${rankedIds.length}) does not cover candidateIds (${candidateIds.length})`)
  }

  const fingerprint = computeRankingFingerprint(candidateIds, history)
  const dropped = (cached?.rankedIds ?? []).length - keptOrder.length

  console.log(
    `${mode}: candidates=${candidateIds.length} kept=${keptOrder.length} dropped=${dropped} appended=${appended.length}` +
      (cached?.inputFingerprint === fingerprint ? ' (already fresh)' : ' (was stale)')
  )

  if (apply) {
    await prisma.rankingCache.upsert({
      where: { familyId_mode: { familyId, mode } },
      update: { inputFingerprint: fingerprint, rankedIds },
      create: { familyId, mode, inputFingerprint: fingerprint, rankedIds },
    })
  }
}

async function main() {
  const apply = process.argv.includes('--apply')
  for (const mode of ['FAMILY', 'ADULT'] as const) await repair(mode, apply)
  console.log(apply ? '\nCaches rewritten.' : '\nDry run — re-run with --apply to write.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
