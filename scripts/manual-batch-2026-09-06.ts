// Manual catalog refresh, 2026-09-06.
//
// Second pass after ~114 new Adult ratings landed. Family had no new
// ratings and its candidate set is unchanged at 98, so its stored order
// still reflects the latest signal and is deliberately not rewritten here.
//
// Usage: npx tsx scripts/manual-batch-2026-09-06.ts

import { prisma } from '../src/lib/prisma'
import { isTitleVisible } from '../src/lib/filtering'
import { computeRankingFingerprint, type TasteHistoryEntry } from '../src/lib/ranking'

const HIDDEN_AFTER_RATING = new Set(['DISLIKED', 'LIKED', 'TOO_INAPPROPRIATE', 'NOT_INTERESTED'])
const MOVED_TO_OWN_SECTION = new Set(['LOVED', 'WATCHLISTED'])

// Scored against the ranked picks below rather than by recency, so the
// titles at the top of the Not Seen list are the ones carrying content
// detail. sourceNotes states its own basis; several here are explicitly
// low confidence and say so.
const CONTENT_RATINGS = [
  { id: 'cmtf5j3zw008xezj8yxhohjtl', violence: 2, language: 5, sexNudity: 4, scariness: 1,
    sourceNotes: 'AI assessment from general knowledge (10 Things I Hate About You, 1999): teen romantic comedy. Crude sexual banter and teen drinking; a brief fight. Nothing explicit shown.' },
  { id: 'cmtf5iid10039ezj8ab1hd0yd', violence: 3, language: 6, sexNudity: 4, scariness: 3,
    sourceNotes: 'AI estimate with lower confidence (Ballad of a Small Player, 2025): Edward Berger gambling-addiction drama. Scored for self-destruction, debt menace and strong language rather than action violence; I could not confirm specifics of this release.' },
  { id: 'cmtf5jynk00g5ezj8ro6bprct', violence: 8, language: 8, sexNudity: 5, scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (Bound by Honor / Blood In Blood Out, 1993): prison and gang epic. Sustained brutal violence including prison killings, pervasive profanity and slurs, drug use, and sexual content.' },
  { id: 'cmtf5khp300l0ezj8kyckvs8c', violence: 5, language: 3, sexNudity: 0, scariness: 6,
    sourceNotes: 'AI assessment from general knowledge (K-19: The Widowmaker, 2002): Soviet submarine drama. The distressing content is radiation sickness — visible burns and deaths — rather than combat. Tense and claustrophobic throughout.' },
  { id: 'cmtf5j9h700a7ezj8m329zqgc', violence: 5, language: 2, sexNudity: 1, scariness: 5,
    sourceNotes: 'AI assessment from general knowledge (Indiana Jones and the Last Crusade, 1989): adventure. Nazi villains, gunfights, a rat-filled catacomb, and the rapid-aging death at the end, which is the scariest moment for younger viewers.' },
  { id: 'cmtf5j0ka007yezj86i29fr0s', violence: 9, language: 8, sexNudity: 2, scariness: 5,
    sourceNotes: 'AI assessment from general knowledge (Logan, 2017): among the most violent superhero films made. Constant graphic stabbings and decapitations, including by a child, plus pervasive profanity. Far removed from the rest of the genre.' },
  { id: 'cmtf5k7au00igezj817j3j1mc', violence: 6, language: 6, sexNudity: 4, scariness: 3,
    sourceNotes: 'AI assessment from general knowledge (Point Break, 1991): action thriller. Shootouts, a brutal beating, skydiving peril, strong language, and brief nudity.' },
  { id: 'cmtf5k91d00izezj88wggka32', violence: 6, language: 2, sexNudity: 2, scariness: 3,
    sourceNotes: 'AI assessment from general knowledge (Robin Hood, 2010): Ridley Scott medieval epic. Large-scale battle violence with arrows and blades, bloody but not lingering; little profanity.' },
  { id: 'cmtf5kd2r00k3ezj8qrnej8mk', violence: 7, language: 7, sexNudity: 4, scariness: 3,
    sourceNotes: 'AI assessment from general knowledge (Payback, 1999): hard-boiled crime. Shootings, a prolonged torture scene involving the hero, heavy profanity, and prostitution as a plot element.' },
  { id: 'cmtf5ichp001rezj8hqe6narb', violence: 7, language: 8, sexNudity: 5, scariness: 4,
    sourceNotes: 'AI estimate with lower confidence (Peaky Blinders: The Immortal Man, 2026): scored in line with the series — gang violence, pervasive profanity, sex and drug use — but I could not confirm this film specifically. Treat cautiously.' },
  { id: 'cmtf5jab000aeezj848nc96pu', violence: 6, language: 1, sexNudity: 1, scariness: 5,
    sourceNotes: 'AI assessment from general knowledge (Revenge of the Sith, 2005): the darkest Star Wars entry. Limb severing, the immolation on Mustafar, and the off-screen killing of children — grim by the standards of the series.' },
  { id: 'cmtf5ihah002xezj8utjyeoel', violence: 7, language: 9, sexNudity: 3, scariness: 3,
    sourceNotes: 'AI assessment from general knowledge (The Hitman\'s Bodyguard, 2017): action comedy. Near-constant profanity is the defining content feature, alongside comic-toned but bloody shootouts.' },
  { id: 'cmtf5iikj003cezj8pawk8gb9', violence: 9, language: 3, sexNudity: 1, scariness: 4,
    sourceNotes: 'AI estimate with moderate confidence (Sisu: Road to Revenge, 2025): sequel to a deliberately extreme Finnish action film. Scored for the original\'s register — inventive, gory, near-wordless violence — as I could not confirm this entry\'s specifics.' },
  { id: 'cmtf5k8fv00itezj857fw607j', violence: 2, language: 4, sexNudity: 2, scariness: 1,
    sourceNotes: 'AI assessment from general knowledge (The Fabelmans, 2022): Spielberg coming-of-age drama. Antisemitic bullying and family breakdown carry the weight; almost no violence.' },
  { id: 'cmtf5jvsp00fmezj8l4ag7fez', violence: 3, language: 3, sexNudity: 8, scariness: 3,
    sourceNotes: 'AI assessment from general knowledge (The Reader, 2008): extended, frank nudity and sex throughout the first act, between an adult woman and a 15-year-old boy — the highest sexNudity score in this catalog, and the age dynamic is the point rather than incidental. Also Holocaust testimony.' },
  { id: 'cmtf5jhfh00cdezj8esgqxejr', violence: 8, language: 4, sexNudity: 1, scariness: 7,
    sourceNotes: 'AI assessment from general knowledge (The Pianist, 2002): Holocaust drama. Summary executions, ghetto liquidation and starvation shown unflinchingly. Distressing rather than action-violent.' },
  { id: 'cmtf5jnrr00duezj8zg628p1l', violence: 7, language: 5, sexNudity: 1, scariness: 5,
    sourceNotes: 'AI estimate with low confidence (The Tank, 2025): I could not confirm details of this title and may be thinking of a different film. Generic war-action estimate — treat cautiously and re-check before relying on it.' },
  { id: 'cmtgujget003w11utxspiunhi', violence: 3, language: 5, sexNudity: 4, scariness: 2,
    sourceNotes: 'AI assessment from general knowledge (Purple Hearts, 2022): military romance. A combat injury and its aftermath, some profanity, and non-explicit sexual content.' },
  { id: 'cmtf5iodq004nezj8vjle5pvz', violence: 5, language: 4, sexNudity: 2, scariness: 2,
    sourceNotes: 'AI assessment from general knowledge (Creed, 2015): boxing drama. Bruising in-ring violence shown realistically; moderate profanity; a restrained romance.' },
  { id: 'cmtf5ioko004qezj8qxeo9t3a', violence: 4, language: 7, sexNudity: 6, scariness: 2,
    sourceNotes: 'AI assessment from general knowledge (Hit Man, 2024): Linklater comedy-thriller. Strong language and substantial sexual content; violence is sparse but a killing is central to the plot.' },
  { id: 'cmtf5ir82005dezj80bl5yr3n', violence: 6, language: 6, sexNudity: 2, scariness: 5,
    sourceNotes: 'AI estimate with lower confidence (Dead Man\'s Wire, 2026): Gus Van Sant hostage-siege drama. Scored for sustained gun-to-head tension and profanity; specifics of this release unconfirmed.' },
  { id: 'cmtf5jhol00chezj8n20yv175', violence: 8, language: 4, sexNudity: 2, scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (Gladiator II, 2024): arena epic. Graphic combat including dismemberment, animal attacks and a naval battle; bloodier than the 2000 original.' },
  { id: 'cmtf5jqnz00eaezj85gkw4ps6', violence: 7, language: 2, sexNudity: 2, scariness: 5,
    sourceNotes: 'AI assessment from general knowledge (The Last of the Mohicans, 1992): frontier war. Tomahawk and musket combat, scalping, and a ritual killing; intense but not gratuitous.' },
  { id: 'cmtf5k31700hlezj8jdhns4s3', violence: 3, language: 4, sexNudity: 1, scariness: 4,
    sourceNotes: 'AI estimate with moderate confidence (Pressure, 2026): D-Day weather-decision thriller. Tension is procedural rather than combat-based; scored accordingly, but I could not confirm this release.' },
  { id: 'cmtf5jo1e00dyezj87kp8hi0c', violence: 7, language: 2, sexNudity: 1, scariness: 3,
    sourceNotes: 'AI assessment with moderate confidence (Sakra, 2023): Donnie Yen wuxia. Stylised martial-arts violence with blood, closer to Ip Man in register than to a modern action film.' },
  { id: 'cmtgujg6p003u11uth68zxlj7', violence: 1, language: 6, sexNudity: 3, scariness: 1,
    sourceNotes: 'AI assessment from general knowledge (The Breakfast Club, 1985): the R rating is entirely language and drug use — frank teen profanity, marijuana, and candid talk about virginity. No violence.' },
]

// Re-ranked against the taste history as it now stands: 6 LOVED, 60
// LIKED, 30 DISLIKED in Adult, up from 5/17/11.
//
// What the new ratings changed. Nine of last pass's picks came back
// LIKED — Memento, Winter Soldier, The Hurt Locker, American Sniper,
// Gone Girl, Extraction 2, Guardians Vol. 3, Black Panther and Bugonia.
// Four came back DISLIKED, and they share a shape: The Matrix Reloaded,
// The Matrix Revolutions, Captain America: Civil War and Guardians
// Vol. 2 were all ranked on "sequel to something they loved." That
// heuristic is now demoted — Pirates and Ant-Man sequels are disliked
// too, while Guardians Vol. 3 was liked, so franchise position predicts
// far less here than director, subject and register do.
//
// New signal this pass: Ip Man is LOVED and Ip Man 3 LIKED (martial
// arts), the entire Hunger Games series is LIKED, five Star Wars films
// are LIKED, three Adam McKay comedies are LIKED, and a romance vein
// appeared that had no prior evidence — The Notebook, The Fault in Our
// Stars, How to Lose a Guy in 10 Days and Good Will Hunting.
const ADULT_TOP_ORDER: string[] = [
  'cmtdn29q2000hrvj4tnze88bz', // Schindler's List — WWII; 1917 (LOVED), All Quiet and Troy (LIKED)
  'cmtf5jhfh00cdezj8esgqxejr', // The Pianist — the same register as 1917: survival, not combat spectacle
  'cmtf5kifn00lbezj8fkf4jnpa', // Master Z: Ip Man Legacy — direct Ip Man spinoff; Ip Man is LOVED, Ip Man 3 LIKED
  'cmtf5ieqn002bezj8ha9oxloc', // Hunger Games: Songbirds & Snakes — Francis Lawrence directed three of the four LIKED entries
  'cmtf5khp300l0ezj8kyckvs8c', // K-19 — Bigelow, who made The Hurt Locker and A House of Dynamite (both LIKED)
  'cmtf5iid10039ezj8ab1hd0yd', // Ballad of a Small Player — Edward Berger, who made All Quiet (LIKED)
  'cmtf5jo1e00dyezj87kp8hi0c', // Sakra — Donnie Yen, the star of the LOVED Ip Man
  'cmtf5jqnz00eaezj85gkw4ps6', // The Last of the Mohicans — Michael Mann historical combat, closest to Troy (LIKED)
  'cmtf5j9h700a7ezj8m329zqgc', // Indiana Jones: Last Crusade — Dial of Destiny (LIKED); practical adventure
  'cmtf5iodq004nezj8vjle5pvz', // Creed — Ryan Coogler, both Black Panthers LIKED
  'cmtf5k31700hlezj8jdhns4s3', // Pressure — WWII decision-room thriller, adjacent to A House of Dynamite (LIKED)
  'cmtf5jhol00chezj8n20yv175', // Gladiator II — Ridley Scott (The Martian, LIKED) in Troy's register
  'cmtf5j0ka007yezj86i29fr0s', // Logan — Mangold (Dial of Destiny, LIKED); a western, not a superhero ensemble
  'cmtf5jab000aeezj848nc96pu', // Revenge of the Sith — five Star Wars films sit in LIKED
  'cmtgujg6p003u11uth68zxlj7', // The Breakfast Club — John Hughes; Ferris Bueller's Day Off (LIKED)
  'cmtf5k8fv00itezj857fw607j', // The Fabelmans — earnest Spielberg drama, in line with Good Will Hunting (LIKED)
  'cmtf5ioko004qezj8qxeo9t3a', // Hit Man — Linklater, who made The School of Rock (LIKED)
  'cmtf5k7au00igezj817j3j1mc', // Point Break — Bigelow again, plus the Die Hard/Speed classic-action vein (both LIKED)
  'cmtf5iikj003cezj8pawk8gb9', // Sisu: Road to Revenge — lean wartime action
  'cmtf5k91d00izezj88wggka32', // Robin Hood — Ridley Scott epic, Troy-adjacent
  'cmtf5ihah002xezj8utjyeoel', // The Hitman's Bodyguard — action comedy, matching Deep Cover and The Other Guys (LIKED)
  'cmtgujget003w11utxspiunhi', // Purple Hearts — military romance, joining the war and romance veins
  'cmtf5jvsp00fmezj8l4ag7fez', // The Reader — prestige romance drama; see its content note before watching
  'cmtf5j3zw008xezj8yxhohjtl', // 10 Things I Hate About You — How to Lose a Guy in 10 Days (LIKED)
  'cmtf5klph00lvezj83gy3hwut', // Pretty in Pink — Hughes romance, both veins at once
  'cmtf5ir82005dezj80bl5yr3n', // Dead Man's Wire — Gus Van Sant, who made Good Will Hunting (LIKED)
  'cmtf5jynk00g5ezj8ro6bprct', // Bound by Honor — crime epic, in line with The Irishman (LIKED)
  'cmtf5kd2r00k3ezj8qrnej8mk', // Payback — hard-boiled crime thriller
  'cmtf5ichp001rezj8hqe6narb', // Peaky Blinders: The Immortal Man — crime drama; unconfirmed title, ranked cautiously
  'cmtf5jnrr00duezj8zg628p1l', // The Tank — war action; lowest confidence of the batch, ranked last deliberately
]

async function writeContentScores() {
  for (const r of CONTENT_RATINGS) {
    const { id, ...score } = r
    await prisma.contentScore.create({ data: { titleId: id, ...score, isUnrated: false, isNC17: false } })
  }
  console.log(`content scores written: ${CONTENT_RATINGS.length}`)
}

async function writeRankingCache(mode: 'FAMILY' | 'ADULT', topOrder: string[]) {
  const familyId = 'default'

  const [titles, tasteHistory] = await Promise.all([
    prisma.title.findMany({ where: { familyId }, include: { contentScore: true } }),
    prisma.tasteRating.findMany({ where: { familyId, mode }, include: { title: true } }),
  ])

  const ratingByTitleId = new Map(tasteHistory.map((t) => [t.titleId, t.rating]))

  const notSeenCandidates = titles
    .filter((t) => isTitleVisible(t, mode))
    .filter((t) => {
      const rating = ratingByTitleId.get(t.id) ?? ''
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

  const candidateIds = notSeenCandidates.map((c) => c.id)
  const validTop = topOrder.filter((id) => candidateIds.includes(id))
  const remainder = candidateIds.filter((id) => !validTop.includes(id))
  const rankedIds = [...validTop, ...remainder]

  if (rankedIds.length !== candidateIds.length || !candidateIds.every((id) => rankedIds.includes(id))) {
    throw new Error(`${mode}: rankedIds (${rankedIds.length}) does not cover candidateIds (${candidateIds.length})`)
  }

  const fingerprint = computeRankingFingerprint(candidateIds, history)
  await prisma.rankingCache.upsert({
    where: { familyId_mode: { familyId, mode } },
    update: { inputFingerprint: fingerprint, rankedIds },
    create: { familyId, mode, inputFingerprint: fingerprint, rankedIds },
  })

  console.log(`${mode}: ranked=${rankedIds.length} handPicked=${validTop.length} of ${topOrder.length}`)
}

async function main() {
  await writeContentScores()
  // Family intentionally untouched — no new Family ratings this pass, so
  // the order written on 2026-09-05 still reflects the latest signal.
  await writeRankingCache('ADULT', ADULT_TOP_ORDER)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
