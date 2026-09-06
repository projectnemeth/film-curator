// Review queue for the family's standing exclusion rule (src/lib/exclusion.ts).
//
// TMDB keywords NOMINATE a title for review; they never decide. A flagged
// title with contentFlag = null is hidden from the dashboard but undecided,
// and it stays that way until a human (or Claude, acting on the family's
// stated rule) makes a call and records it here.
//
// This script deliberately REFUSES to stamp a verdict on a title it has no
// explicit decision for. An earlier version defaulted every flagged title to
// EXCLUDED, which meant running it could permanently bury a false positive —
// a future Nope or Ip Man — with nobody ever seeing the decision get made.
// Silence is not a verdict.
//
// Usage:
//   npx tsx scripts/review-exclusions.ts           # list what needs a decision
//   npx tsx scripts/review-exclusions.ts --apply   # write the verdicts below
//
// To review: run it with no args, decide each pending title against the rule
// (see "The rule" below), add it to VERDICTS with a one-line reason, re-run
// with --apply, and commit — the map is the audit trail.
//
// The rule, as the family stated it:
//   OUT — sadistic predation (torture as spectacle, serial killers preying on
//         the helpless) and occult/spiritually dark material (demonic,
//         satanic, exorcism). Fantasy magic and horror-adjacent comedy are
//         also out, by explicit choice.
//   IN  — war and combat violence, however graphic, including torture in a
//         wartime setting; crime and cartel violence between armed
//         professionals; monster/creature and dystopian-contest threat.

import { PrismaClient } from '@prisma/client'
import { findExclusionTriggers, findScoreNomination, SEX_NUDITY_AUTO_EXCLUDE, SEX_NUDITY_REVIEW } from '../src/lib/exclusion'

const prisma = new PrismaClient()

// Explicit decisions, keyed by tmdbId. Reviewed 2026-09-05.
//
// Only the KEEP decisions are listed here. The 83 titles excluded in the
// 2026-09-05 batch are recorded in the database (Title.contentFlag) and
// need no entry — re-stating them would just be noise. Add new decisions,
// either flag, as they come up.
const VERDICTS: Record<number, { flag: 'CLEAR' | 'EXCLUDED'; why: string }> = {
  520763: { flag: 'CLEAR', why: 'A Quiet Place Part II — alien-invasion survival, not sadism' },
  762441: { flag: 'CLEAR', why: 'A Quiet Place: Day One — same' },
  762504: { flag: 'CLEAR', why: 'Nope — Jordan Peele, same register as the well-liked Get Out' },
  639933: { flag: 'CLEAR', why: 'The Northman — Viking revenge epic; combat violence, which is fine' },
  695721: { flag: 'CLEAR', why: 'The Hunger Games: Songbirds & Snakes — dystopian contest, not a torture film' },
  10483: { flag: 'CLEAR', why: 'Death Race — vehicular action; `death game` overstates it' },
  14756: { flag: 'CLEAR', why: 'Ip Man — martial-arts biopic in occupied China; wartime, not sadism' },

  // LGBTQ watchlist, reviewed 2026-09-05. The family's call: exclude films
  // the theme is actually ABOUT, keep films where a tag reflects only a
  // supporting character or a single plot beat.
  17903: { flag: 'EXCLUDED', why: 'A Frozen Flower — the relationship is the plot' },
  937287: { flag: 'EXCLUDED', why: 'Challengers — the trio dynamic is the film' },
  1397485: { flag: 'EXCLUDED', why: 'Girls Like Girls — central romance' },
  1468683: { flag: 'EXCLUDED', why: 'Heartstopper Forever — central romance' },
  1418582: { flag: 'EXCLUDED', why: 'Here the Whole Time — central romance; named by the family' },
  631842: { flag: 'EXCLUDED', why: 'Knock at the Cabin — the couple are the protagonists' },
  930094: { flag: 'EXCLUDED', why: 'Red, White & Royal Blue — central romance' },
  930564: { flag: 'EXCLUDED', why: 'Saltburn — the obsession driving the plot' },
  290098: { flag: 'EXCLUDED', why: 'The Handmaiden — central romance' },
  // Borderline: carries a single `gay marriage` tag, so it may well be
  // incidental. Excluded to match the batch; easy to flip.
  993708: { flag: 'EXCLUDED', why: 'The Threesome — single tag, treated as central pending a closer look' },
  // Excluded on the earlier fantasy-magic decision, not on this watchlist.
  338953: { flag: 'EXCLUDED', why: 'Fantastic Beasts: Secrets of Dumbledore — fantasy magic cluster' },

  // Reversal, 2026-09-05. Flagged on `demon` and excluded with the
  // fantasy-magic cluster, but the family had already rated it LOVED in
  // Family mode — so the rule was hiding a film they'd watched and liked.
  // Their own rating outranks the keyword. It's an animated K-pop musical
  // whose demons are the villains being fought, not the subject matter
  // the rule is aimed at.
  803796: { flag: 'CLEAR', why: 'KPop Demon Hunters — rated LOVED by the family; demons are the antagonists in an animated musical' },

  // Sexual-content review of the top-50 scoring batch, 2026-09-06.
  // All three scored exactly 6, and they split on what the nudity is
  // doing rather than how much of it there is.
  455236: { flag: 'EXCLUDED', why: 'Accident Man — brief but real sex scenes, plus non-stop sadistic gore (violence 9, language 9)' },
  8469: { flag: 'EXCLUDED', why: 'Animal House — the nudity is voyeuristic and leering, not incidental; also crude statutory-age and unconscious-woman gags' },
  1084577: { flag: 'CLEAR', why: 'Balls Up — comedic rear nudity and prop gags with no sex scenes depicted; the carve-out case exactly' },

  // Sexual-content review, 2026-09-06. The family's line: filter out sex
  // scenes, not non-sexual nudity. A score of 6 cannot tell those apart,
  // so each of these was judged on what the nudity is doing in the film.
  424: { flag: 'CLEAR', why: "Schindler's List — the nudity is the camps, not a love scene; exactly the case the rule must not catch" },
  974635: { flag: 'EXCLUDED', why: 'Hit Man — substantial actual sex scenes; this is what the rule is for (was my own #17 Adult pick)' },
  241251: { flag: 'EXCLUDED', why: 'The Boy Next Door — erotic thriller built on an affair with a teenager' },
  73586: { flag: 'EXCLUDED', why: 'Yellowstone — recurring sex scenes (TV, so hidden by the movies-only rule regardless)' },
  4239: { flag: 'CLEAR', why: 'Married... with Children — sitcom innuendo, no explicit scenes (TV, hidden regardless)' },
  2691: { flag: 'CLEAR', why: 'Two and a Half Men — same: innuendo rather than depiction (TV, hidden regardless)' },

  // Not keyword-flagged — excluded on the family's direct instruction
  // after seeing its content score. An explicit EXCLUDED verdict hides a
  // title regardless of whether any watchlist nominated it.
  8055: { flag: 'EXCLUDED', why: 'The Reader — sexNudity 8, the highest in the catalog; family asked for it gone' },

  787723: { flag: 'CLEAR', why: '13 Minutes — tornado disaster drama; subplot only' },
  937278: { flag: 'CLEAR', why: 'A Man Called Otto — supporting character; film is about an elderly widower' },
  915935: { flag: 'CLEAR', why: 'Anatomy of a Fall — courtroom drama; one element of the case' },
  974573: { flag: 'CLEAR', why: 'Another Simple Favor — subplot in a comedy thriller' },
  58841: { flag: 'CLEAR', why: 'Chicago P.D. — incidental (TV; hidden by the movies-only rule regardless)' },
  9603: { flag: 'CLEAR', why: 'Clueless — single reveal about a side character' },
  524434: { flag: 'CLEAR', why: 'Eternals — one supporting character in an ensemble' },
  661374: { flag: 'CLEAR', why: 'Glass Onion — a plot detail about one suspect' },
  490132: { flag: 'CLEAR', why: 'Green Book — road-trip drama about race; one scene' },
  84958: { flag: 'CLEAR', why: 'Loki — incidental (TV; hidden by the movies-only rule regardless)' },
  582014: { flag: 'CLEAR', why: 'Promising Young Woman — the `transgender` tag looks simply wrong' },
  18165: { flag: 'CLEAR', why: 'The Vampire Diaries — incidental (TV; hidden regardless)' },
}

async function main() {
  const apply = process.argv.includes('--apply')

  const titles = await prisma.title.findMany({
    select: { id: true, tmdbId: true, name: true, year: true, mpaaRating: true, keywords: true, contentFlag: true, providers: true, contentScore: { select: { sexNudity: true } } },
    orderBy: { name: 'asc' },
  })

  const annotated = titles.map((t) => ({
    ...t,
    triggers: findExclusionTriggers(t.keywords),
    nomination: findScoreNomination(t.contentScore),
  }))

  const undecided = annotated.filter((t) => t.contentFlag === null && !VERDICTS[t.tmdbId])

  // Nominated for a human decision: keyword hits, plus scores at the
  // review threshold, where the number cannot tell sexual content apart
  // from non-sexual nudity.
  const pending = undecided.filter((t) => t.triggers.length > 0 || t.nomination?.kind === 'REVIEW')

  // Hidden by the score rule alone. These need no decision to take
  // effect — they are listed so a wrong one can be overridden with an
  // explicit CLEAR rather than staying invisible.
  const autoExcluded = undecided.filter((t) => t.nomination?.kind === 'AUTO_EXCLUDE' && t.triggers.length === 0)

  const flaggedCount = annotated.filter((t) => t.triggers.length > 0 || t.nomination !== null).length
  console.log(`catalog=${titles.length}  flagged=${flaggedCount}  pending=${pending.length}  auto-excluded=${autoExcluded.length}`)

  const describe = (t: (typeof annotated)[number]) => {
    const parts = t.triggers.map((x) => x.keyword)
    if (t.nomination) parts.push(`sexNudity ${t.nomination.value}`)
    return parts.join(', ')
  }

  if (autoExcluded.length > 0) {
    console.log(`\nAUTO-EXCLUDED by score (>= ${SEX_NUDITY_AUTO_EXCLUDE}) — hidden already, no decision needed:`)
    for (const t of autoExcluded) {
      console.log(`  [${t.providers.length > 0 ? 'streaming' : 'dormant  '}] ${t.name} (${t.year ?? '?'}) — sexNudity ${t.nomination!.value}  tmdbId ${t.tmdbId}`)
    }
    console.log('  Override any of these with an explicit CLEAR verdict if the score is wrong.')
  }

  if (pending.length === 0) {
    console.log('\nNothing pending review.')
  } else {
    console.log(`\nPENDING REVIEW (${pending.length}) — hidden from the dashboard, awaiting a decision:`)
    console.log(`  (a sexNudity score of ${SEX_NUDITY_REVIEW} lands here because the number cannot`)
    console.log(`   distinguish a sex scene from non-sexual nudity — judge the film, not the score)`)
    for (const t of pending) {
      const shown = t.providers.length > 0 ? 'streaming' : 'dormant  '
      console.log(`  [${shown}] ${t.name} (${t.year ?? '?'}) [${t.mpaaRating ?? 'unrated'}] — ${describe(t)}`)
      console.log(`             tmdbId ${t.tmdbId}`)
    }
    console.log('\nAdd each to VERDICTS with a reason, then re-run with --apply.')
  }

  const toWrite = titles.filter((t) => VERDICTS[t.tmdbId] && t.contentFlag !== VERDICTS[t.tmdbId].flag)
  if (toWrite.length > 0) {
    console.log(`\nVERDICTS to write (${toWrite.length}):`)
    for (const t of toWrite) console.log(`  ${VERDICTS[t.tmdbId].flag.padEnd(8)} ${t.name} — ${VERDICTS[t.tmdbId].why}`)
  }

  const missing = Object.keys(VERDICTS).filter((id) => !titles.some((t) => t.tmdbId === Number(id)))
  if (missing.length > 0) console.log(`\nNote: VERDICTS ids not in catalog (dropped by the weekly prune?): ${missing.join(', ')}`)

  if (!apply) {
    console.log('\nDry run — re-run with --apply to write verdicts.')
    return
  }

  for (const t of toWrite) {
    await prisma.title.update({ where: { id: t.id }, data: { contentFlag: VERDICTS[t.tmdbId].flag } })
  }
  console.log(`\nWrote ${toWrite.length} verdict(s). ${pending.length} still pending.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
