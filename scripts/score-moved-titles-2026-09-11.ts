// Scores the PG films that were moved into Adult Mode, 2026-09-11.
//
// These were unreachable until the content-rating query in the
// manual-catalog-refresh skill learned about Title.modeOverride: they are
// PG, so `mpaaRating: { in: ['PG-13','R'] }` never matched them, and their
// cards would have read "Content details are added during the catalog
// refresh" forever.
//
// Also splices Raiders of the Lost Ark into the Adult ranking. The family
// moved it themselves after the second refresh, so it arrived unranked at
// the bottom; it belongs beside The Last Crusade.
//
// Usage: npx tsx scripts/score-moved-titles-2026-09-11.ts

import { prisma } from '../src/lib/prisma'

const CONTENT_RATINGS = [
  { id: 'cmtqvus3a009qcox7hg3jqtbi', violence: 5, language: 1, sexNudity: 2, scariness: 3,
    sourceNotes: 'AI assessment from general knowledge (Lawrence of Arabia, 1962): desert-war epic. Battles, a massacre of a retreating column, and a train ambush, all shot at a distance rather than for gore. The one adult note is Lawrence’s capture and beating by the Turkish Bey, where sexual assault is strongly implied but never shown.' },
  { id: 'cmtf5jx0000fxezj8or625wuv', violence: 4, language: 3, sexNudity: 3, scariness: 2,
    sourceNotes: 'AI assessment from general knowledge (Monty Python and the Holy Grail, 1975): absurdist comedy. Dismemberment and decapitation played entirely for laughs with bright fake blood; the Castle Anthrax sequence is an extended joke about sex without showing any.' },
  { id: 'cmtf5ifqp002mezj8go2hcwuc', violence: 5, language: 5, sexNudity: 3, scariness: 1,
    sourceNotes: 'AI assessment from general knowledge (Rocky, 1976): boxing drama. The fight is bloody and punishing but brief; a restrained love scene, and period-strong language throughout a working-class Philadelphia setting.' },
  { id: 'cmtf5iq660055ezj8qz0cmqgi', violence: 5, language: 4, sexNudity: 1, scariness: 1,
    sourceNotes: 'AI assessment from general knowledge (Rocky II, 1979): same register as the first. Ring violence and a hospital subplot; less sexual content than its predecessor.' },
  { id: 'cmtqvuslj009vcox74lor26a1', violence: 5, language: 4, sexNudity: 1, scariness: 1,
    sourceNotes: 'AI assessment from general knowledge (Rocky III, 1982): boxing and a trainer’s death from a heart attack, which is the emotional weight rather than anything graphic.' },
  { id: 'cmtf5ioi7004pezj8iicyy7yp', violence: 6, language: 3, sexNudity: 1, scariness: 2,
    sourceNotes: 'AI assessment from general knowledge (Rocky IV, 1985): the most brutal of the series — a fighter is beaten to death in the ring on screen, which lands hard for younger viewers despite the PG.' },
  { id: 'cmtf5j1az0086ezj86wia40n7', violence: 6, language: 2, sexNudity: 1, scariness: 7,
    sourceNotes: 'AI assessment from general knowledge (Raiders of the Lost Ark, 1981): adventure. Shootings, a propeller death and a snake pit, but the reason scariness is high is the finale — melting and exploding faces, famously frightening at this rating.' },
]

// Insert Raiders directly after Indiana Jones and the Last Crusade.
const RAIDERS = 'cmtf5j1az0086ezj86wia40n7'
const LAST_CRUSADE = 'cmtf5j9h700a7ezj8m329zqgc'

async function main() {
  for (const rating of CONTENT_RATINGS) {
    const { id, ...score } = rating
    await prisma.contentScore.create({ data: { titleId: id, ...score } })
  }
  console.log(`content scores written: ${CONTENT_RATINGS.length}`)

  const cache = await prisma.rankingCache.findUnique({
    where: { familyId_mode: { familyId: 'default', mode: 'ADULT' } },
  })
  if (!cache) throw new Error('no Adult ranking cache')

  const without = cache.rankedIds.filter((id) => id !== RAIDERS)
  const at = without.indexOf(LAST_CRUSADE)
  if (at === -1) throw new Error('Last Crusade is not in the Adult ranking')
  const rankedIds = [...without.slice(0, at + 1), RAIDERS, ...without.slice(at + 1)]

  if (rankedIds.length !== cache.rankedIds.length) {
    throw new Error(`length changed: ${cache.rankedIds.length} -> ${rankedIds.length}`)
  }

  // The fingerprint is unchanged: the candidate SET and the taste history
  // are the same, only the order within it moved.
  await prisma.rankingCache.update({
    where: { familyId_mode: { familyId: 'default', mode: 'ADULT' } },
    data: { rankedIds },
  })
  console.log(`Raiders moved to Adult position ${rankedIds.indexOf(RAIDERS) + 1} of ${rankedIds.length}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
