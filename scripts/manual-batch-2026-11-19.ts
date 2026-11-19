// Manual catalog refresh, 2026-11-19: clear the scoring backlog.
//
// The family asked for every remaining unscored title to be scored — 386
// on streaming at the time. Rather than 30 at a time, the batch was split
// four ways and scored in parallel by sub-agents working from a shared
// brief and a calibration table of all 645 existing scores, so the four of
// them scored against one scale. They only wrote JSON; the merged result
// was validated, spot-checked and calibrated in the main session before
// anything was written here.
//
// The scores live alongside this script in
// manual-batch-2026-11-19.scores.json — at this size they are data, not
// code. Each entry's `confidence` is "high" or "low"; low-confidence notes
// carry an explicit caveat. `exclusionFlag` is the scorer's nomination for
// human review and is NOT applied by this script; the decisions are in
// scripts/review-exclusions.ts.
//
//   npx tsx scripts/manual-batch-2026-11-19.ts scores
//   npx tsx scripts/review-exclusions.ts --apply      # the sexNudity-6 and flagged verdicts
//   npx tsx scripts/manual-batch-2026-11-19.ts rank
//
// No taste ratings were given since 2026-11-18, so ranking keeps the
// existing order exactly: there is no new hand order, and the rank stage
// only drops titles that scoring or verdicts have hidden and appends any
// arrivals. That is the 2026-11-07 approach with an empty hand order.

import { readFileSync } from 'fs'
import { join } from 'path'
import { prisma } from '../src/lib/prisma'
import { computeRankingFingerprint, type TasteHistoryEntry } from '../src/lib/ranking'
import { isTitleVisible } from '../src/lib/filtering'

// Same gates as src/app/api/recommendations/route.ts.
const HIDDEN_AFTER_RATING = new Set(['DISLIKED', 'LIKED', 'TOO_INAPPROPRIATE', 'NOT_INTERESTED'])
const MOVED_TO_OWN_SECTION = new Set(['LOVED', 'WATCHLISTED'])

type ScoredTitle = {
  id: string
  name: string
  violence: number
  language: number
  sexNudity: number
  scariness: number
  confidence: 'high' | 'low'
  sourceNotes: string
  exclusionFlag: { category: string; reason: string } | null
}

const SCORES: ScoredTitle[] = JSON.parse(
  readFileSync(join(__dirname, 'manual-batch-2026-11-19.scores.json'), 'utf8')
)

async function writeContentScores() {
  let written = 0
  let skipped = 0
  for (const s of SCORES) {
    for (const d of ['violence', 'language', 'sexNudity', 'scariness'] as const) {
      if (!Number.isInteger(s[d]) || s[d] < 0 || s[d] > 10) throw new Error(`${s.name}: ${d}=${s[d]}`)
    }
    // Guard against a title that picked up a score since the batch was exported.
    const existing = await prisma.contentScore.findUnique({ where: { titleId: s.id } })
    if (existing) {
      skipped++
      continue
    }
    await prisma.contentScore.create({
      data: {
        titleId: s.id,
        violence: s.violence,
        language: s.language,
        sexNudity: s.sexNudity,
        scariness: s.scariness,
        isUnrated: false,
        isNC17: false,
        sourceNotes: s.sourceNotes,
      },
    })
    written++
  }
  console.log(`Wrote ${written} content score(s); skipped ${skipped} already scored.`)
}

async function writeRankingCache(mode: 'FAMILY' | 'ADULT') {
  const [titles, tasteHistory, previous] = await Promise.all([
    prisma.title.findMany({ where: { familyId: 'default' }, include: { contentScore: true } }),
    prisma.tasteRating.findMany({ where: { familyId: 'default', mode }, include: { title: true } }),
    prisma.rankingCache.findUnique({ where: { familyId_mode: { familyId: 'default', mode } } }),
  ])

  const tasteRatingByTitleId = new Map(tasteHistory.map((t) => [t.titleId, t.rating]))
  const visible = titles.filter((t) => isTitleVisible(t, mode))
  const notSeenCandidates = visible.filter((t) => {
    const rating = tasteRatingByTitleId.get(t.id) ?? ''
    return !HIDDEN_AFTER_RATING.has(rating) && !MOVED_TO_OWN_SECTION.has(rating)
  })

  const history: TasteHistoryEntry[] = tasteHistory
    .filter((t) => t.rating !== 'NOT_SEEN' && t.rating !== 'WATCHLISTED')
    .map((t) => ({
      titleName: t.title.name,
      rating: t.rating,
      director: t.title.director,
      writer: t.title.writer,
      topCast: t.title.topCast,
      studio: t.title.studio,
    }))

  // Keep the previous order exactly; drop what is no longer a candidate,
  // append any arrivals.
  const candidateIds = notSeenCandidates.map((c) => c.id)
  const candidateSet = new Set(candidateIds)
  const kept = (previous?.rankedIds ?? []).filter((id) => candidateSet.has(id))
  const keptSet = new Set(kept)
  const arrivals = candidateIds.filter((id) => !keptSet.has(id))
  const rankedIds = [...kept, ...arrivals]

  // A candidate missing from rankedIds does not sink to the bottom of the
  // dashboard — it disappears from it.
  if (rankedIds.length !== candidateIds.length || new Set(rankedIds).size !== candidateIds.length) {
    throw new Error(`${mode}: rankedIds (${rankedIds.length}) does not cover candidateIds (${candidateIds.length}) — refusing to write`)
  }

  const inputFingerprint = computeRankingFingerprint(candidateIds, history)
  await prisma.rankingCache.upsert({
    where: { familyId_mode: { familyId: 'default', mode } },
    update: { inputFingerprint, rankedIds },
    create: { familyId: 'default', mode, inputFingerprint, rankedIds },
  })

  const dropped = (previous?.rankedIds.length ?? 0) - kept.length
  console.log(`${mode}: wrote ${rankedIds.length} ranked id(s); ${dropped} dropped as no longer candidates, ${arrivals.length} arrivals appended.`)
}

async function main() {
  const stage = process.argv[2]
  if (stage === 'scores') {
    await writeContentScores()
  } else if (stage === 'rank') {
    await writeRankingCache('FAMILY')
    await writeRankingCache('ADULT')
  } else {
    throw new Error('usage: manual-batch-2026-11-19.ts <scores|rank>')
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
