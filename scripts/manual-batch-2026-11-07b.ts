// Manual catalog refresh, 2026-11-07 (second pass).
//
// Same day as scripts/manual-batch-2026-11-07.ts. In between, Paramount+
// (Essential tier) was added as a source and a Peacock tagging bug was
// fixed, which brought ~300 titles into the catalog. This pass scores 30
// of them and slots the strongest into both rankings.
//
// Two stages again, because 300 and Flight land on the sexNudity review
// threshold:
//
//   npx tsx scripts/manual-batch-2026-11-07b.ts scores
//   npx tsx scripts/review-exclusions.ts --apply
//   npx tsx scripts/manual-batch-2026-11-07b.ts rank
//
// Hand order first, then the previous cache order, as in the first pass.
//
// Later the same day the family kept V for Vendetta and excluded the two
// pending titles; its score and rank were added and both stages re-run
// (the scores stage skips titles already scored).

import { prisma } from '../src/lib/prisma'
import { computeRankingFingerprint, type TasteHistoryEntry } from '../src/lib/ranking'
import { isTitleVisible } from '../src/lib/filtering'

// Same gates as src/app/api/recommendations/route.ts.
const HIDDEN_AFTER_RATING = new Set(['DISLIKED', 'LIKED', 'TOO_INAPPROPRIATE', 'NOT_INTERESTED'])
const MOVED_TO_OWN_SECTION = new Set(['LOVED', 'WATCHLISTED'])

type ContentRating = {
  id: string
  name: string
  violence: number
  language: number
  sexNudity: number
  scariness: number
  sourceNotes: string
}

const gk = (title: string, body: string) => `AI assessment from general knowledge (${title}): ${body}`

const CONTENT_RATINGS: ContentRating[] = [
  { id: 'cmw6q5anb001p7vo26m4i67qu', name: 'Mission: Impossible - Dead Reckoning Part One', violence: 6, language: 2, sexNudity: 0, scariness: 3,
    sourceNotes: gk('Mission: Impossible - Dead Reckoning Part One, 2023', 'train-top fights, a Venice alley knife duel and gunplay; mild language, no sexual content.') },
  { id: 'cmw6q5a8n001n7vo2ckjhddft', name: 'Mission: Impossible - Fallout', violence: 6, language: 3, sexNudity: 1, scariness: 3,
    sourceNotes: gk('Mission: Impossible - Fallout, 2018', 'the bathroom brawl, a HALO jump and a helicopter chase; bloodless for the most part, mild language.') },
  { id: 'cmw6q5bk4001u7vo2wkrovk19', name: 'Mission: Impossible - Rogue Nation', violence: 6, language: 2, sexNudity: 1, scariness: 3,
    sourceNotes: gk('Mission: Impossible - Rogue Nation, 2015', 'opera-house assassination, a motorbike chase and knife fights; nothing sexual beyond a glimpse in a swimsuit.') },
  { id: 'cmw6q5kuz003a7vo2a0guc006', name: 'Mission: Impossible - Ghost Protocol', violence: 5, language: 2, sexNudity: 1, scariness: 3,
    sourceNotes: gk('Mission: Impossible - Ghost Protocol, 2011', 'the Burj Khalifa climb, a Kremlin bombing and fistfights; light language, a brief seduction ploy.') },
  { id: 'cmw6q5jli00337vo2rmnaf4ka', name: 'Mission: Impossible', violence: 4, language: 3, sexNudity: 1, scariness: 3,
    sourceNotes: gk('Mission: Impossible, 1996', 'a team ambushed and shot in Prague, the aquarium explosion and the Channel Tunnel finale; mild language.') },
  { id: 'cmw6q5cf6001z7vo2jioots1s', name: 'Dunkirk', violence: 5, language: 2, sexNudity: 0, scariness: 6,
    sourceNotes: gk('Dunkirk, 2017', 'almost bloodless, but sustained dread — drowning in a flooded hull, strafing runs and burning oil; little language.') },
  { id: 'cmw6q58aa001c7vo27k2asiuy', name: 'Edge of Tomorrow', violence: 6, language: 5, sexNudity: 1, scariness: 4,
    sourceNotes: gk('Edge of Tomorrow, 2014', 'Cage dies on the beach again and again against the alien Mimics; war-film intensity without much gore; some language.') },
  { id: 'cmw6q5ll7003e7vo2hjtg87vf', name: 'The Hunt for Red October', violence: 3, language: 4, sexNudity: 0, scariness: 3,
    sourceNotes: gk('The Hunt for Red October, 1990', 'submarine tension and a few shootings; moderate language, no sexual content.') },
  { id: 'cmw6q5l36003b7vo2zb2ite7q', name: 'Gravity', violence: 3, language: 4, sexNudity: 0, scariness: 6,
    sourceNotes: gk('Gravity, 2013', 'space-debris catastrophe; a crewman’s ruined face and frozen bodies, near-constant peril; some strong language.') },
  { id: 'cmw6q5rvq004f7vo2947ofwvr', name: 'Argo', violence: 3, language: 8, sexNudity: 0, scariness: 4,
    sourceNotes: gk('Argo, 2012', 'embassy-siege tension, a mock execution and bodies hanging from cranes; the R is the Hollywood-insider language.') },
  { id: 'cmw6q5yv3005g7vo2o4copu25', name: '13 Hours: The Secret Soldiers of Benghazi', violence: 8, language: 9, sexNudity: 0, scariness: 5,
    sourceNotes: gk('13 Hours, 2016', 'Michael Bay compound siege: sustained firefights, mortar deaths and heavy military profanity.') },
  { id: 'cmw6q8w6g00mt7vo2gfw7p26t', name: 'Hacksaw Ridge', violence: 10, language: 4, sexNudity: 1, scariness: 7,
    sourceNotes: gk('Hacksaw Ridge, 2016', 'among the most graphic war films made — bodies torn apart, rats on corpses, a man used as a shield; little else to flag.') },
  { id: 'cmw6q5rb5004b7vo2pzzveqxm', name: 'The Patriot', violence: 8, language: 2, sexNudity: 0, scariness: 5,
    sourceNotes: gk('The Patriot, 2000', 'Revolutionary War battles with cannon decapitations, a child shot, a church burned with villagers inside.') },
  { id: 'cmw6q5mlz003k7vo2x56jfsmg', name: 'Rambo: First Blood Part II', violence: 7, language: 3, sexNudity: 1, scariness: 3,
    sourceNotes: gk('Rambo: First Blood Part II, 1985', 'high-body-count jungle action; Rambo is tortured on an electrified bed frame in the POW camp.') },
  { id: 'cmw6q5du200277vo21bqh5aao', name: 'A Quiet Place', violence: 5, language: 0, sexNudity: 0, scariness: 8,
    sourceNotes: gk('A Quiet Place, 2018', 'a young child killed by a creature in the opening, a nail through a foot, a silent birth under threat; almost no dialogue, let alone language.') },
  { id: 'cmw6q8qaj00lv7vo24waa35dc', name: 'The Count of Monte Cristo', violence: 5, language: 2, sexNudity: 2, scariness: 3,
    sourceNotes: gk('The Count of Monte Cristo, 2002', 'PG-13 swordplay, prison beatings and a duel; a kiss and implied affair.') },
  { id: 'cmw6q9kvh00r17vo26tdcy436', name: 'Unbroken', violence: 6, language: 2, sexNudity: 1, scariness: 5,
    sourceNotes: gk('Unbroken, 2014', 'air combat, sharks during 47 days adrift, and the Bird’s repeated POW-camp beatings.') },
  { id: 'cmw6q9h8c00qg7vo2o021zh5b', name: '12 Strong', violence: 8, language: 8, sexNudity: 0, scariness: 4,
    sourceNotes: gk('12 Strong, 2018', 'horseback-and-airstrike combat in Afghanistan, a Taliban execution, steady military profanity.') },
  { id: 'cmw6q9b6r00ph7vo2dhpvjcza', name: 'Air Force One', violence: 7, language: 5, sexNudity: 0, scariness: 4,
    sourceNotes: gk('Air Force One, 1997', 'hijackers execute hostages point-blank; hand-to-hand fights and a crash; moderate language.') },
  { id: 'cmw6q5xz1005b7vo2no1m961a', name: 'Enemy at the Gates', violence: 8, language: 4, sexNudity: 5, scariness: 5,
    sourceNotes: gk('Enemy at the Gates, 2001', 'Stalingrad sniper duel with a brutal Volga crossing; one depicted sex scene in a crowded barracks, partial nudity.') },
  { id: 'cmw6q5x1f00567vo2dupefuo4', name: 'The Untouchables', violence: 8, language: 6, sexNudity: 0, scariness: 4,
    sourceNotes: gk('The Untouchables, 1987', 'a baseball-bat killing at dinner, the baby-carriage shootout, a child killed by a bomb.') },
  { id: 'cmw6q6mw1009d7vo2sa4n9qzo', name: 'Looper', violence: 8, language: 7, sexNudity: 4, scariness: 5,
    sourceNotes: gk('Looper, 2012', 'a man losing body parts in real time, executions and a child in danger; a strip-club scene with brief nudity.') },
  { id: 'cmw6q64b3006c7vo27nfnn628', name: 'Fury', violence: 9, language: 9, sexNudity: 2, scariness: 6,
    sourceNotes: gk('Fury, 2014', 'WWII tank warfare: a face shot off, men burned alive, a crushed corpse in the mud; constant profanity.') },
  { id: 'cmw6q629z00607vo2ackvjl1p', name: 'Whiplash', violence: 2, language: 9, sexNudity: 1, scariness: 3,
    sourceNotes: gk('Whiplash, 2014', 'a car crash and a slap; the R is Fletcher’s relentless, abusive profanity.') },
  { id: 'cmw6q5x8r00577vo2qfax9xqv', name: 'The Terminal', violence: 0, language: 2, sexNudity: 1, scariness: 0,
    sourceNotes: gk('The Terminal, 2004', 'gentle Spielberg comedy-drama set in an airport; nothing of note.') },
  { id: 'cmw6q9fga00q47vo2r60e9le4', name: 'End of Watch', violence: 8, language: 10, sexNudity: 2, scariness: 6,
    sourceNotes: gk('End of Watch, 2012', 'found-footage LAPD patrol: cartel executions, a burning house with children, near-wall-to-wall profanity.') },
  { id: 'cmw6q9dwi00pw7vo233kqchai', name: 'Up in the Air', violence: 0, language: 7, sexNudity: 4, scariness: 0,
    sourceNotes: gk('Up in the Air, 2009', 'no violence; implied sex and brief nudity, steady language.') },
  { id: 'cmw6q5mf6003j7vo2uk7o0k78', name: 'Flight', violence: 3, language: 8, sexNudity: 6, scariness: 4,
    sourceNotes: gk('Flight, 2012', 'the crash sequence is terrifying; it opens on a lengthy sexualised full-frontal scene and heavy drug use. Excluded by verdict.') },
  { id: 'cmw6q5fcs002g7vo2jatuumlm', name: '300', violence: 9, language: 2, sexNudity: 6, scariness: 5,
    sourceNotes: gk('300, 2007', 'stylised slow-motion decapitations and dismemberment; a depicted sex scene and Xerxes’ harem. Excluded by verdict.') },
  { id: 'cmw6q5odo003u7vo29e66f5do', name: 'Gangs of New York', violence: 9, language: 6, sexNudity: 5, scariness: 6,
    sourceNotes: gk('Gangs of New York, 2002', 'cleaver and knife gang warfare, a public hanging, the Draft Riots; brief nudity and a brothel setting.') },
  // Added after the family reversed my V for Vendetta exclusion the same day.
  { id: 'cmw6q53x6000o7vo2os9owwfn', name: 'V for Vendetta', violence: 7, language: 5, sexNudity: 2, scariness: 5,
    sourceNotes: gk('V for Vendetta, 2006', 'knife-fight finale in slow motion, executions and Evey\u2019s imprisonment and torture; mild sexual content, moderate language.') },
]

// ---- Hand ranking ----

const FAMILY_HAND_ORDER: string[] = [
  'cmtf5jfie00byezj8p2ngenfe', // How to Train Your Dragon (2010)
  'cmtf5jgj000c5ezj80kf8nu7b', // How to Train Your Dragon 2
  'cmw6q5go1002o7vo2hmeed05p', // The Lego Movie — NEW; Lord Miller, who made three of your LOVED titles (Mitchells, Spider-Verse, Project Hail Mary)
  'cmtf5iy0n007bezj8kao41w9w', // Toy Story 2
  'cmtf5iwvh006zezj81yue2bmk', // Toy Story 3
  'cmvywikb700a1tlucu8el8sxq', // Klaus
  'cmw6q8v9x00mo7vo2vd2a5eno', // Despicable Me — NEW; Despicable Me 2 LOVED, 3 LIKED, and this is the one that started it
  'cmtf5j082007tezj89mkjtka5', // Toy Story 4
  'cmv4wadxa00gom9frs9i5adys', // Toy Story 5
  'cmtf5j3i4008tezj82dtrnc66', // The Empire Strikes Back
  'cmtf5ixr00077ezj8ko0nke0g', // Inside Out
  'cmw6q6g1100887vo2kqa1kis6', // The Croods — NEW; Chris Sanders (Wild Robot, LOVED); The Croods: A New Age LIKED
  'cmvewbx6w002q10urnq1izwf0', // Carl's Date
  'cmw6q7yhz00h37vo2vywg474j', // Contact — NEW; earnest first-contact sci-fi, closest live-action match to Project Hail Mary (LOVED)
  'cmtf5jd5e00b3ezj8vf4a4te3', // Return of the Jedi
  'cmtf5iwbb006vezj8h9z29vbz', // Inside Out 2
  'cmvewdwfw00k510ur4n0v6v1k', // That Christmas
  'cmw6q5pk900417vo2rgx36fxp', // The Ten Commandments — NEW; the live-action telling of The Prince of Egypt (LOVED)
  'cmtf5j8fl009xezj8j5u41ow3', // Finding Dory
  'cmu0vysio00g7h0gu4sokqvpu', // Wish Dragon
  'cmu0vylov00eoh0gu7t43e0y6', // The Sea Beast
  'cmtf5j2r3008iezj8xeygm6bl', // Elemental
  'cmw6q94nm00oc7vo2f34ft9ar', // Rise of the Guardians — NEW; DreamWorks at its most earnest, nearer HTTYD than Shrek
  'cmvywhjns0004tluccohq6h0q', // Minions & Monsters
  'cmw6q58z0001g7vo2be96cs2z', // Top Gun (1986) — NEW; PG, and the setup for Maverick
  'cmw6q9e4m00px7vo2v38xub08', // Babe — NEW; gentle talking-animal classic
  'cmw6q5ntp003r7vo2cgl9vmia', // The Little Prince — NEW; Mark Osborne (Kung Fu Panda, LIKED)
]

const ADULT_HAND_ORDER: string[] = [
  'cmw6q5anb001p7vo26m4i67qu', // MI: Dead Reckoning Part One — NEW; the first half of Final Reckoning, which you LOVED
  'cmw6q5a8n001n7vo2ckjhddft', // MI: Fallout — NEW; McQuarrie/Cruise, widely the best of the series
  'cmuuw6h82006df3295i4bm2fh', // The Prestige — Nolan
  'cmw6q5cf6001z7vo2jioots1s', // Dunkirk — NEW; Nolan (Interstellar LOVED) doing WWII (1917 LOVED)
  'cmw6q5bk4001u7vo2wkrovk19', // MI: Rogue Nation — NEW; McQuarrie/Cruise
  'cmw6q58aa001c7vo27k2asiuy', // Edge of Tomorrow — NEW; Cruise sci-fi, Doug Liman (Mr. & Mrs. Smith LIKED)
  'cmuuw5rr3000pf3296vwlvtrr', // Arrival
  'cmvewcs8f00a810urj9r99qo6', // Thirteen Lives
  'cmw6q5kuz003a7vo2a0guc006', // MI: Ghost Protocol — NEW
  'cmuuw5rw1000qf329yw0e9oel', // Saving Private Ryan
  'cmw6q5ll7003e7vo2hjtg87vf', // The Hunt for Red October — NEW; Tom Clancy (Jack Ryan: Ghost War LIKED)
  'cmuaw28ua00lw132gqlutjphp', // Zero Dark Thirty
  'cmw6q5l36003b7vo2zb2ite7q', // Gravity — NEW; survival-in-space, between Interstellar and The Martian (LIKED)
  'cmvywhtid002qtluc1thwt45u', // Jurassic Park
  'cmw6q5rvq004f7vo2947ofwvr', // Argo — NEW; Affleck (Air LIKED), true-story extraction
  'cmw6q8w6g00mt7vo2gfw7p26t', // Hacksaw Ridge — NEW; WWII true story; violence 10, so below the less graphic war picks
  'cmw6q5yv3005g7vo2o4copu25', // 13 Hours — NEW; American Sniper / Lone Survivor register
  'cmuuw810d00ixf329ez1ujs3t', // Casino Royale
  'cmukw2qy80006uz1wqsmqy88m', // Top Gun: Maverick
  'cmvowemp5000kx6mmb5dxn0gr', // Gladiator
  'cmw6q53x6000o7vo2os9owwfn', // V for Vendetta — written and produced by the Wachowskis (The Matrix, LOVED); kept by family decision
  'cmw6q5jli00337vo2rmnaf4ka', // Mission: Impossible (1996) — NEW; dated next to the McQuarrie films, so lower
  'cmuuw86rf00k8f3295rucodjq', // Skyfall
  'cmuuw6jjq006wf329a2zhndfd', // The Bourne Identity
  'cmvewcpd4009n10ur74fga9oi', // The Monuments Men
  'cmw6q51ae00097vo2zitay3r6', // Forrest Gump — NEW; Hanks/Zemeckis crowd-pleaser
  'cmw6q64b3006c7vo27nfnn628', // Fury — NEW; WWII tank film; Fury’s violence 9 keeps it out of the top
  'cmw6q6mw1009d7vo2sa4n9qzo', // Looper — NEW; Rian Johnson (Last Jedi LIKED), In Time-style concept sci-fi
  'cmw6q9kvh00r17vo26tdcy436', // Unbroken — NEW; WWII survival true story
  'cmw6q9h8c00qg7vo2o021zh5b', // 12 Strong — NEW; Hemsworth (Extraction LOVED)
  'cmw6q9b6r00ph7vo2dhpvjcza', // Air Force One — NEW; Wolfgang Petersen (Troy LIKED)
]

async function writeContentScores() {
  // Several of these arrived in the same ingest; guard against a title
  // that picked up a score in between rather than failing on the unique key.
  const existing = new Set((await prisma.contentScore.findMany({ where: { titleId: { in: CONTENT_RATINGS.map((r) => r.id) } }, select: { titleId: true } })).map((s) => s.titleId))
  if (existing.size > 0) console.warn(`Skipping ${existing.size} already-scored title(s).`)
  for (const r of CONTENT_RATINGS) {
    if (existing.has(r.id)) continue
    await prisma.contentScore.create({
      data: {
        titleId: r.id,
        violence: r.violence,
        language: r.language,
        sexNudity: r.sexNudity,
        scariness: r.scariness,
        isUnrated: false,
        isNC17: false,
        sourceNotes: r.sourceNotes,
      },
    })
  }
  console.log(`Wrote ${CONTENT_RATINGS.length - existing.size} content score(s).`)
}

async function writeRankingCache(mode: 'FAMILY' | 'ADULT', handOrder: string[]) {
  // Re-fetch rather than trusting anything cached in this process.
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

  const missingFromCandidates = handOrder.filter((id) => !notSeenCandidates.some((c) => c.id === id))
  if (missingFromCandidates.length > 0) {
    console.warn(`${mode}: ${missingFromCandidates.length} hand-ranked id(s) are no longer candidates: ${missingFromCandidates.join(', ')}`)
  }

  // Hand order first, then the previous cache's order (deduped).
  const topOrder = [...new Set([...handOrder, ...(previous?.rankedIds ?? [])])]

  const candidateIds = notSeenCandidates.map((c) => c.id)
  const candidateSet = new Set(candidateIds)
  const validTop = topOrder.filter((id) => candidateSet.has(id))
  const validTopSet = new Set(validTop)
  const remainder = candidateIds.filter((id) => !validTopSet.has(id))
  const rankedIds = [...validTop, ...remainder]

  // A candidate missing from rankedIds does not sink to the bottom of the
  // dashboard — it disappears from it.
  if (rankedIds.length !== candidateIds.length || new Set(rankedIds).size !== candidateIds.length) {
    throw new Error(
      `${mode}: rankedIds (${rankedIds.length}) does not cover candidateIds (${candidateIds.length}) — refusing to write`
    )
  }

  const inputFingerprint = computeRankingFingerprint(candidateIds, history)
  await prisma.rankingCache.upsert({
    where: { familyId_mode: { familyId: 'default', mode } },
    update: { inputFingerprint, rankedIds },
    create: { familyId: 'default', mode, inputFingerprint, rankedIds },
  })

  console.log(`${mode}: wrote ${rankedIds.length} ranked id(s); ${handOrder.length - missingFromCandidates.length} hand-ranked today, ${remainder.length} unranked new arrivals at the end.`)
}

async function main() {
  const stage = process.argv[2]
  if (stage === 'scores') {
    await writeContentScores()
  } else if (stage === 'rank') {
    await writeRankingCache('FAMILY', FAMILY_HAND_ORDER)
    await writeRankingCache('ADULT', ADULT_HAND_ORDER)
  } else {
    throw new Error('usage: manual-batch-2026-11-07b.ts <scores|rank>')
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
