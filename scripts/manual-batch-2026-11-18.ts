// Manual catalog refresh, 2026-11-18.
//
// Eleven days after the two 2026-11-07 passes. No taste ratings were given
// in between, so the 2026-11-07b hand order still stands and is the base
// here; this pass is about the 277 titles ingested since.
//
// Scoring covers every Adult arrival since the last refresh (40 titles)
// rather than the newest 30, for two reasons:
//
//   - Explicit titles were live on the Adult dashboard. An unscored title
//     is never nominated for exclusion, so 365 Days, Borat, Lifeforce and
//     Gail Daughtry and the Celebrity Sex Pass were showing to the family
//     until scored. All four score 7+ below and auto-hide.
//   - The strongest new fits (Mission: Impossible III, Midway, Jack Ryan:
//     Shadow Recruit, The Uprising) are worth ranking high, and a ranked
//     title should not show "Content details are added during the catalog
//     refresh".
//
// Four titles were excluded by verdict before this ran (Bagman, The Mexican,
// Street Fighter II, Melancholia), and three more while picking the batch
// (Scary Movie 3, Heathers, Stardust) — see scripts/review-exclusions.ts.
// Street Fighter II and Melancholia are scored anyway, because their
// sexNudity 6 is the reason for the verdict.
//
//   npx tsx scripts/manual-batch-2026-11-18.ts scores
//   npx tsx scripts/manual-batch-2026-11-18.ts rank
//
// Hand order first, then the previous cache order, then arrivals — the
// 2026-11-07 approach, which keeps the ordering below the hand-ranked top
// rather than falling back to ingest order.

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
const low = (body: string) =>
  `AI estimate with lower confidence — a 2026 release I could not verify in detail; ${body} Treat cautiously.`

const CONTENT_RATINGS: ContentRating[] = [
  // ---- Hidden by their scores (7+) ----
  { id: 'cmwiwp3zq00fsoddwvk23csr4', name: '365 Days', violence: 4, language: 5, sexNudity: 10, scariness: 3,
    sourceNotes: gk('365 Days, 2020', 'erotic drama built on a kidnapping premise, with extended explicit sex scenes; both sequels already score 9 here.') },
  { id: 'cmwiwp2x300fioddwriy6f2ke', name: 'Gail Daughtry and the Celebrity Sex Pass', violence: 1, language: 8, sexNudity: 7, scariness: 0,
    sourceNotes: low('a David Wain sex comedy, scored on its premise rather than on scenes I can confirm.') },
  { id: 'cmw8wlocd00aw663sdify7hg8', name: 'Lifeforce', violence: 7, language: 5, sexNudity: 8, scariness: 7,
    sourceNotes: gk('Lifeforce, 1985', 'Tobe Hooper space-vampire horror; the lead is nude through much of the film, alongside body-horror deaths.') },
  { id: 'cmw8wlp3g00b3663srcswkost', name: 'Borat', violence: 3, language: 8, sexNudity: 8, scariness: 1,
    sourceNotes: gk('Borat, 2006', 'the extended nude hotel wrestling scene and wall-to-wall crude sexual humour; the sequel already scores 8 here.') },

  // ---- Scored and excluded by verdict on the sexNudity-6 rule ----
  { id: 'cmwiwqdbd00rjoddw1oodnn48', name: 'Street Fighter II: The Animated Movie', violence: 7, language: 4, sexNudity: 6, scariness: 3,
    sourceNotes: gk('Street Fighter II: The Animated Movie, 1994', 'anime martial-arts brawls with real injuries; a gratuitous shower scene with nudity, staged voyeuristically. Excluded by verdict.') },
  { id: 'cmw8wm8he00g3663sb2rgxdab', name: 'Melancholia', violence: 1, language: 5, sexNudity: 6, scariness: 5,
    sourceNotes: gk('Melancholia, 2011', 'no real violence but crushing dread; full nudity while moonbathing and a depicted sex scene on a golf course. Excluded by verdict.') },

  // ---- Strong taste fits ----
  { id: 'cmw8wmp7v00kf663svls3kuwv', name: 'Mission: Impossible III', violence: 7, language: 4, sexNudity: 1, scariness: 5,
    sourceNotes: gk('Mission: Impossible III, 2006', 'the brain-charge execution and Hoffman’s interrogation menace make it the darkest of the early entries.') },
  { id: 'cmw8wmun000lt663sud4caj4x', name: 'Mission: Impossible II', violence: 6, language: 3, sexNudity: 3, scariness: 3,
    sourceNotes: gk('Mission: Impossible II, 2000', 'John Woo gunplay and motorbike combat; a seductive subplot without nudity.') },
  { id: 'cmw8wmt1d00le663sgb7i9px8', name: 'Jack Ryan: Shadow Recruit', violence: 6, language: 4, sexNudity: 1, scariness: 3,
    sourceNotes: gk('Jack Ryan: Shadow Recruit, 2014', 'a hotel-bathroom fight and car-bomb finale; mild otherwise.') },
  { id: 'cmw8wlo8f00av663snfq3cypl', name: 'Midway', violence: 6, language: 4, sexNudity: 1, scariness: 4,
    sourceNotes: gk('Midway, 2019', 'Pearl Harbor and carrier-battle sequences with deaths but little gore.') },
  { id: 'cmw8wlpxx00bb663s3mgk5ja5', name: 'The Uprising', violence: 7, language: 6, sexNudity: 2, scariness: 4,
    sourceNotes: low('a Paul Greengrass film about the 1381 Peasants’ Revolt; scored as a medieval battle epic.') },
  { id: 'cmw8wm1p700ec663s6ynfsbp0', name: 'Tai-Chi Master', violence: 6, language: 2, sexNudity: 1, scariness: 2,
    sourceNotes: gk('Tai-Chi Master, 1993', 'Yuen Woo-ping wuxia choreography; frequent but stylised fighting.') },
  { id: 'cmw8wmvd800m0663s01p8fhhu', name: 'The Italian Job', violence: 4, language: 5, sexNudity: 1, scariness: 2,
    sourceNotes: gk('The Italian Job, 2003', 'heist caper with one betrayal shooting and a car chase.') },
  { id: 'cmwiwnut50047oddwdfo1aayg', name: 'The Contractor', violence: 7, language: 8, sexNudity: 1, scariness: 3,
    sourceNotes: gk('The Contractor, 2022', 'private-military-contractor thriller; close-range gunfights, heavy profanity.') },
  { id: 'cmw8wm5ax00f9663sqdl7jc91', name: 'Panda Plan', violence: 4, language: 2, sexNudity: 0, scariness: 2,
    sourceNotes: gk('Panda Plan, 2024', 'Jackie Chan action-comedy; slapstick fights, very mild.') },

  // ---- The rest of the arrivals ----
  { id: 'cmwiwqdjc00rloddwwcn6qyc0', name: 'Legends of the Fall', violence: 7, language: 5, sexNudity: 5, scariness: 4,
    sourceNotes: gk('Legends of the Fall, 1994', 'WWI trench deaths, a scalping and a bear attack; a brief love scene with nudity.') },
  { id: 'cmwiwq21000oloddwnzq5powd', name: 'Borderline', violence: 5, language: 6, sexNudity: 3, scariness: 4,
    sourceNotes: low('scored as a generic R-rated thriller; I could not place the film.') },
  { id: 'cmwiwpzlf00nyoddwm9s12vrj', name: 'A Guy Thing', violence: 1, language: 4, sexNudity: 4, scariness: 0,
    sourceNotes: gk('A Guy Thing, 2003', 'a comedy of errors after a one-night stand; innuendo and a little partial nudity.') },
  { id: 'cmwiwptow00mfoddwm9m0r1el', name: 'Premonition', violence: 3, language: 3, sexNudity: 2, scariness: 5,
    sourceNotes: gk('Premonition, 2007', 'a fatal car crash and a funeral seen out of order; grief and dread rather than violence.') },
  { id: 'cmwiwp4f400fwoddwg9r0zmy3', name: 'Carolina Caroline', violence: 6, language: 8, sexNudity: 5, scariness: 3,
    sourceNotes: low('scored as an R-rated crime-romance road movie.') },
  { id: 'cmwiwoqah00c9oddw1bydolzv', name: 'Misty Green', violence: 2, language: 8, sexNudity: 4, scariness: 1,
    sourceNotes: low('a Chris Rock-directed comedy-drama; scored on the R resting on language.') },
  { id: 'cmwiwomze00bfoddwkgsd58ic', name: 'The Christmas Switch', violence: 1, language: 6, sexNudity: 4, scariness: 1,
    sourceNotes: low('an R-rated Scandinavian Christmas comedy.') },
  { id: 'cmwiwomnr00bcoddwhi7ydna8', name: 'The Good Lawyer', violence: 3, language: 5, sexNudity: 3, scariness: 2,
    sourceNotes: low('a French legal drama.') },
  { id: 'cmwiwom8e00b8oddw4et41ryo', name: 'Allen', violence: 2, language: 4, sexNudity: 1, scariness: 2,
    sourceNotes: low('an Australian PG-13 comedy-drama.') },
  { id: 'cmwiwom0o00b6oddwx28okupw', name: 'Heartland', violence: 2, language: 6, sexNudity: 3, scariness: 2,
    sourceNotes: low('a Shana Feste drama with Jessica Chastain.') },
  { id: 'cmwiwolsy00b4oddw2dzjjb60', name: 'Never Surrender', violence: 9, language: 5, sexNudity: 1, scariness: 5,
    sourceNotes: low('an Indonesian action film; scored to the genre’s very graphic norm (The Raid).') },
  { id: 'cmwiwold600b0oddwlwkn6d6u', name: 'Rambo III', violence: 8, language: 4, sexNudity: 0, scariness: 3,
    sourceNotes: gk('Rambo III, 1988', 'Soviet-Afghan war combat with a very high body count.') },
  { id: 'cmwiwol9b00azoddwf0p4ln2k', name: 'Revolutionary Road', violence: 2, language: 7, sexNudity: 5, scariness: 3,
    sourceNotes: gk('Revolutionary Road, 2008', 'brief, mostly clothed sex scenes and a fatal self-induced abortion; heavy marital rows.') },
  { id: 'cmwiwoi6c00a7oddwypbpoc7g', name: 'Paycheck', violence: 6, language: 4, sexNudity: 1, scariness: 2,
    sourceNotes: gk('Paycheck, 2003', 'John Woo sci-fi chases and shootouts.') },
  { id: 'cmwiwo8bu007ooddwo53bvie3', name: 'What Women Want', violence: 1, language: 5, sexNudity: 4, scariness: 1,
    sourceNotes: gk('What Women Want, 2000', 'romantic comedy built on innuendo, with one comic sex scene and no nudity.') },
  { id: 'cmwiwnvvx004hoddwiap0u0x3', name: "The Killer's Game", violence: 8, language: 7, sexNudity: 2, scariness: 3,
    sourceNotes: gk("The Killer's Game, 2024", 'Bautista assassin action-comedy; gory kills played for laughs.') },
  { id: 'cmwiwnule0045oddwuw0tyf53', name: '57 Seconds', violence: 5, language: 6, sexNudity: 2, scariness: 3,
    sourceNotes: gk('57 Seconds, 2023', 'time-rewind thriller with a few shootings.') },
  { id: 'cmwiwnsce003koddwiof0hv0d', name: 'London Has Fallen', violence: 8, language: 8, sexNudity: 0, scariness: 4,
    sourceNotes: gk('London Has Fallen, 2016', 'a mass terror attack and close-quarters killing; constant profanity.') },
  { id: 'cmwiwnrv6003goddwgdiphn0t', name: 'The Old Way', violence: 7, language: 5, sexNudity: 0, scariness: 3,
    sourceNotes: gk('The Old Way, 2023', 'Nicolas Cage revenge western; shootings, including a mother killed.') },
  { id: 'cmw8wnh9g00rq663stka6xn88', name: 'Cowboys & Aliens', violence: 6, language: 3, sexNudity: 2, scariness: 5,
    sourceNotes: gk('Cowboys & Aliens, 2011', 'alien abductions and creature attacks; a brief non-sexual rear-nudity shot.') },
  { id: 'cmw8wmsm600la663s2nheb5m9', name: 'True Grit', violence: 6, language: 3, sexNudity: 0, scariness: 5,
    sourceNotes: gk('True Grit, 2010', 'sudden, shocking violence — fingers cut off, a hanging, a snakebite — in an otherwise measured western.') },
  { id: 'cmw8wmrr600l2663snmak0wgn', name: "A Knight's Tale", violence: 4, language: 4, sexNudity: 2, scariness: 1,
    sourceNotes: gk("A Knight's Tale, 2001", 'jousting injuries and brief comic rear nudity; cleared from the review queue today.') },
  { id: 'cmw8wmldz00jf663s5g6o120l', name: 'Men in Black II', violence: 4, language: 4, sexNudity: 2, scariness: 3,
    sourceNotes: gk('Men in Black II, 2002', 'alien slime-violence and crude jokes.') },
  { id: 'cmw8wmnn400k0663sbgehakcg', name: 'Men in Black 3', violence: 5, language: 4, sexNudity: 1, scariness: 4,
    sourceNotes: gk('Men in Black 3, 2012', 'Boris the Animal is grotesque, with more menace than the first two.') },
  { id: 'cmw8wminh00ip663s8i2vnhwf', name: 'G.I. Joe: Retaliation', violence: 6, language: 3, sexNudity: 1, scariness: 2,
    sourceNotes: gk('G.I. Joe: Retaliation, 2013', 'bloodless large-scale action.') },
]

// ---- Hand ranking ----
//
// The 2026-11-07b order, unchanged except where marked NEW (2026-11-18).
// Nothing was rated in between, so the reasoning recorded there still holds.

const FAMILY_HAND_ORDER: string[] = [
  'cmtf5jfie00byezj8p2ngenfe', // How to Train Your Dragon (2010)
  'cmtf5jgj000c5ezj80kf8nu7b', // How to Train Your Dragon 2
  'cmw6q5go1002o7vo2hmeed05p', // The Lego Movie
  'cmtf5iy0n007bezj8kao41w9w', // Toy Story 2
  'cmtf5iwvh006zezj81yue2bmk', // Toy Story 3
  'cmvywikb700a1tlucu8el8sxq', // Klaus
  'cmwiwp6oa00ghoddwsrbrp9gx', // The Christmas Chronicles — NEW; it is mid-November, and it sits naturally next to Klaus
  'cmw6q8v9x00mo7vo2vd2a5eno', // Despicable Me
  'cmtf5j082007tezj89mkjtka5', // Toy Story 4
  'cmv4wadxa00gom9frs9i5adys', // Toy Story 5
  'cmtf5j3i4008tezj82dtrnc66', // The Empire Strikes Back
  'cmtf5ixr00077ezj8ko0nke0g', // Inside Out
  'cmw6q6g1100887vo2kqa1kis6', // The Croods
  'cmvewbx6w002q10urnq1izwf0', // Carl's Date
  'cmw6q7yhz00h37vo2vywg474j', // Contact
  'cmw8wm9dr00gb663sahd42zpz', // A Beautiful Day in the Neighborhood — NEW; Tom Hanks, as in Apollo 13 and Toy Story (both LOVED)
  'cmtf5jd5e00b3ezj8vf4a4te3', // Return of the Jedi
  'cmtf5iwbb006vezj8h9z29vbz', // Inside Out 2
  'cmvewdwfw00k510ur4n0v6v1k', // That Christmas
  'cmw6q5pk900417vo2rgx36fxp', // The Ten Commandments
  'cmtf5j8fl009xezj8j5u41ow3', // Finding Dory
  'cmu0vysio00g7h0gu4sokqvpu', // Wish Dragon
  'cmu0vylov00eoh0gu7t43e0y6', // The Sea Beast
  'cmtf5j2r3008iezj8xeygm6bl', // Elemental
  'cmw6q94nm00oc7vo2f34ft9ar', // Rise of the Guardians
  'cmvywhjns0004tluccohq6h0q', // Minions & Monsters
  'cmw6q58z0001g7vo2be96cs2z', // Top Gun (1986)
  'cmw8wlnlh00ap663s5ttavvyo', // Goldfinger — NEW; PG live-action adventure in the Top Gun / Star Wars slot
  'cmw6q9e4m00px7vo2v38xub08', // Babe
  'cmw6q5ntp003r7vo2cgl9vmia', // The Little Prince
]

const ADULT_HAND_ORDER: string[] = [
  'cmw6q5anb001p7vo26m4i67qu', // MI: Dead Reckoning Part One
  'cmw6q5a8n001n7vo2ckjhddft', // MI: Fallout
  'cmuuw6h82006df3295i4bm2fh', // The Prestige
  'cmw6q5cf6001z7vo2jioots1s', // Dunkirk
  'cmw6q5bk4001u7vo2wkrovk19', // MI: Rogue Nation
  'cmw6q58aa001c7vo27k2asiuy', // Edge of Tomorrow
  'cmuuw5rr3000pf3296vwlvtrr', // Arrival
  'cmvewcs8f00a810urj9r99qo6', // Thirteen Lives
  'cmw6q5kuz003a7vo2a0guc006', // MI: Ghost Protocol
  'cmw8wmp7v00kf663svls3kuwv', // Mission: Impossible III — NEW; the last unranked strong entry in a series you LOVED (Final Reckoning)
  'cmuuw5rw1000qf329yw0e9oel', // Saving Private Ryan
  'cmw6q5ll7003e7vo2hjtg87vf', // The Hunt for Red October
  'cmw8wmt1d00le663sgb7i9px8', // Jack Ryan: Shadow Recruit — NEW; Jack Ryan: Ghost War LIKED, right behind Red October
  'cmuaw28ua00lw132gqlutjphp', // Zero Dark Thirty
  'cmw6q5l36003b7vo2zb2ite7q', // Gravity
  'cmw8wm1p700ec663s6ynfsbp0', // Tai-Chi Master — NEW; Jet Li wuxia; Ip Man is LOVED and Ip Man 3 LIKED
  'cmvywhtid002qtluc1thwt45u', // Jurassic Park
  'cmw6q5rvq004f7vo2947ofwvr', // Argo
  'cmw8wlo8f00av663snfq3cypl', // Midway — NEW; WWII naval combat at PG-13, so above the more graphic war picks
  'cmw6q8w6g00mt7vo2gfw7p26t', // Hacksaw Ridge
  'cmw6q5yv3005g7vo2o4copu25', // 13 Hours
  'cmuuw810d00ixf329ez1ujs3t', // Casino Royale
  'cmukw2qy80006uz1wqsmqy88m', // Top Gun: Maverick
  'cmvowemp5000kx6mmb5dxn0gr', // Gladiator
  'cmw8wlpxx00bb663s3mgk5ja5', // The Uprising — NEW; Paul Greengrass (the Bourne films) on a medieval revolt, in the Troy/Gladiator lane; content score is low-confidence
  'cmw6q53x6000o7vo2os9owwfn', // V for Vendetta
  'cmw6q5jli00337vo2rmnaf4ka', // Mission: Impossible (1996)
  'cmw8wmun000lt663sud4caj4x', // Mission: Impossible II — NEW; the weakest of the series, so last of them
  'cmuuw86rf00k8f3295rucodjq', // Skyfall
  'cmuuw6jjq006wf329a2zhndfd', // The Bourne Identity
  'cmvewcpd4009n10ur74fga9oi', // The Monuments Men
  'cmw8wmvd800m0663s01p8fhhu', // The Italian Job — NEW; ensemble heist, as with In the Grey (LIKED) and Inside Man (LIKED)
  'cmw6q51ae00097vo2zitay3r6', // Forrest Gump
  'cmw6q64b3006c7vo27nfnn628', // Fury
  'cmw6q6mw1009d7vo2sa4n9qzo', // Looper
  'cmw6q9kvh00r17vo26tdcy436', // Unbroken
  'cmw6q9h8c00qg7vo2o021zh5b', // 12 Strong
  'cmwiwnut50047oddwdfo1aayg', // The Contractor — NEW; Chris Pine contractor thriller, the Extraction / Gray Man vein (both LOVED)
  'cmw6q9b6r00ph7vo2dhpvjcza', // Air Force One
]

async function writeContentScores() {
  let written = 0
  for (const r of CONTENT_RATINGS) {
    // Guard against a title that picked up a score since the batch was picked.
    const existing = await prisma.contentScore.findUnique({ where: { titleId: r.id } })
    if (existing) {
      console.warn(`skipping ${r.name}: already scored`)
      continue
    }
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
    written++
  }
  console.log(`Wrote ${written} content score(s).`)
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

  console.log(`${mode}: wrote ${rankedIds.length} ranked id(s); ${handOrder.length - missingFromCandidates.length} hand-ranked, ${remainder.length} unranked arrivals at the end.`)
}

async function main() {
  const stage = process.argv[2]
  if (stage === 'scores') {
    await writeContentScores()
  } else if (stage === 'rank') {
    await writeRankingCache('FAMILY', FAMILY_HAND_ORDER)
    await writeRankingCache('ADULT', ADULT_HAND_ORDER)
  } else {
    throw new Error('usage: manual-batch-2026-11-18.ts <scores|rank>')
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
