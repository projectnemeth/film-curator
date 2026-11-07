// Manual catalog refresh, 2026-11-07.
//
// The deployed app has no Anthropic API access, so these scores and this
// ordering exist only because they are written here. 30 content scores,
// plus a hand re-rank of both modes that slots in titles ingested since
// the 2026-10-17 run.
//
// Run in two stages, because three of these scores land on the sexNudity
// review threshold (6) and three at or above auto-exclude (7), which
// changes what is visible:
//
//   npx tsx scripts/manual-batch-2026-11-07.ts scores
//   npx tsx scripts/review-exclusions.ts --apply     # today's verdicts
//   npx tsx scripts/manual-batch-2026-11-07.ts rank
//
// Ranking: the hand-ordered list below goes first. After it comes the
// previous cache's order, so the earlier runs' hand ranking below the top
// is kept rather than reset to arrival order. Brand-new titles not named
// here fall to the end, same as before.

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
  { id: 'cmvywjs8400m2tlucwbadtfmd', name: 'An American Werewolf in London', violence: 8, language: 6, sexNudity: 6, scariness: 8,
    sourceNotes: gk('An American Werewolf in London, 1981', 'graphic maulings and the famous transformation; a depicted sex scene, a shower scene and extended male nudity. Excluded by verdict.') },
  { id: 'cmvywjs0r00m0tlucj7dvksna', name: 'Limitless', violence: 5, language: 5, sexNudity: 3, scariness: 3,
    sourceNotes: gk('Limitless, 2011', 'a few brutal beats (a subway fight, a bloody escape), drug-use theme, implied sex with no explicit nudity.') },
  { id: 'cmvywjqsu00lotluc1w0c2ezp', name: 'Lionheart', violence: 7, language: 6, sexNudity: 2, scariness: 2,
    sourceNotes: gk('Lionheart, 1990', 'Van Damme underground-fighting picture; repeated bare-knuckle bouts, street profanity, minimal sexual content.') },
  { id: 'cmvywj6pz00g6tluc9sxj5sfh', name: 'The Guardians of the Galaxy Holiday Special', violence: 2, language: 2, sexNudity: 0, scariness: 1,
    sourceNotes: gk('Guardians of the Galaxy Holiday Special, 2022', '45-minute Disney+ special; cartoonish slapstick and mild language.') },
  { id: 'cmvywil7q00aatluci70ilpc8', name: 'Becoming Led Zeppelin', violence: 0, language: 3, sexNudity: 1, scariness: 0,
    sourceNotes: gk('Becoming Led Zeppelin, 2025', 'music documentary built on interviews and archive footage; occasional language, no depicted content of note.') },
  { id: 'cmvywiigw009jtluc6v0qnrjj', name: "To All the Boys I've Loved Before", violence: 0, language: 3, sexNudity: 2, scariness: 0,
    sourceNotes: gk("To All the Boys I've Loved Before, 2018", 'teen romcom; kissing, a hot-tub rumour subplot and some mild language.') },
  { id: 'cmvywif2v008mtlucaszvx976', name: 'The Remarkable Life of Ibelin', violence: 1, language: 2, sexNudity: 0, scariness: 2,
    sourceNotes: gk('The Remarkable Life of Ibelin, 2024', 'documentary about a young man with Duchenne muscular dystrophy and his World of Warcraft life; emotionally heavy around his death, otherwise clean.') },
  { id: 'cmvywi3b9005etluc0bg9f096', name: 'Teeth', violence: 7, language: 5, sexNudity: 8, scariness: 6,
    sourceNotes: gk('Teeth, 2008', 'vagina-dentata horror built on sexual assault, explicit sex and genital mutilation — among the most sexually graphic titles here.') },
  { id: 'cmvowg9b300gmx6mmbb02hpy8', name: 'Automata', violence: 5, language: 5, sexNudity: 1, scariness: 3,
    sourceNotes: gk('Automata, 2014', 'dystopian robot sci-fi; shootouts and robot destruction, moderate language, nothing sexual of note.') },
  { id: 'cmvowg7nj00g6x6mmax4jjwan', name: 'Cold Pursuit', violence: 7, language: 7, sexNudity: 2, scariness: 3,
    sourceNotes: gk('Cold Pursuit, 2019', 'darkly comic Neeson revenge film with a large body count and frequent profanity; the kills are quick rather than lingering.') },
  { id: 'cmvowg6k700fvx6mmecizkt74', name: 'Surrogates', violence: 5, language: 3, sexNudity: 3, scariness: 3,
    sourceNotes: gk('Surrogates, 2009', 'PG-13 sci-fi action; android destruction and some bloody deaths, a nightclub scene with suggestive content.') },
  { id: 'cmvowg5f400fkx6mmir6s3yw1', name: 'A Serious Man', violence: 1, language: 6, sexNudity: 4, scariness: 2,
    sourceNotes: gk('A Serious Man, 2009', 'Coen brothers dark comedy; a nude sunbathing neighbour and a brief dream sequence, marijuana use, steady language.') },
  { id: 'cmvowg3xq00f5x6mm16kio9ao', name: 'Les Misérables (2019)', violence: 6, language: 8, sexNudity: 1, scariness: 4,
    sourceNotes: gk('Les Misérables, 2019 (Ladj Ly)', 'banlieue police drama; a flash-ball shooting of a child and an escalating riot, constant profanity.') },
  { id: 'cmvowg3ft00f0x6mm312rx29k', name: 'John Wick', violence: 8, language: 6, sexNudity: 1, scariness: 3,
    sourceNotes: gk('John Wick, 2014', 'stylised gun-fu with a very high body count and many headshots; the killing of the dog is the hardest scene. No sexual content.') },
  { id: 'cmvowg1eo00egx6mmrdq9sv6e', name: 'John Wick: Chapter 3 - Parabellum', violence: 9, language: 5, sexNudity: 0, scariness: 4,
    sourceNotes: gk('John Wick: Chapter 3, 2019', 'the bloodiest of the series — a knife fight, a knife through the eye, dog attacks; no sexual content.') },
  { id: 'cmvowfxe800dcx6mmooz8xh5i', name: 'John Wick: Chapter 2', violence: 9, language: 5, sexNudity: 2, scariness: 3,
    sourceNotes: gk('John Wick: Chapter 2, 2017', 'relentless gun-fu, a pencil kill and a suicide in a bath; brief partial nudity in the bath scene.') },
  { id: 'cmvowg23s00enx6mmwwvrdfqr', name: 'Wild at Heart', violence: 8, language: 9, sexNudity: 8, scariness: 6,
    sourceNotes: gk('Wild at Heart, 1990', 'Lynch at his most lurid: a head beaten to pulp in the opening, a shotgun decapitation, explicit sex scenes throughout.') },
  { id: 'cmvowg1ls00eix6mmsdf4wvle', name: 'Blow Out', violence: 6, language: 6, sexNudity: 6, scariness: 5,
    sourceNotes: gk('Blow Out, 1981', 'a strangler killing women is the engine of the plot; the opening slasher-within-a-film is shower nudity. Excluded by verdict.') },
  { id: 'cmvowg07e00e4x6mm4855oa2r', name: 'Ong-Bak', violence: 7, language: 3, sexNudity: 1, scariness: 2,
    sourceNotes: gk('Ong-Bak, 2003', 'Tony Jaa Muay Thai showcase; bone-crunching knees and elbows, underground fight clubs, mild language.') },
  { id: 'cmvowfz7000dux6mmuk6vlsnv', name: 'The Name of the Rose', violence: 5, language: 2, sexNudity: 7, scariness: 5,
    sourceNotes: gk('The Name of the Rose, 1986', 'a monastery murder mystery with grim corpses and an Inquisition burning; one explicit sex scene with full nudity.') },
  { id: 'cmvowfw9m00d1x6mmlh699x0h', name: 'Entrapment', violence: 3, language: 3, sexNudity: 3, scariness: 2,
    sourceNotes: gk('Entrapment, 1999', 'PG-13 heist caper; little violence, flirtation and the laser-grid sequence, no nudity.') },
  { id: 'cmvowfw5x00d0x6mmlbkiexln', name: 'The Godfather Part III', violence: 7, language: 5, sexNudity: 2, scariness: 3,
    sourceNotes: gk('The Godfather Part III, 1990', 'the helicopter massacre, a garrotting and the opera-steps shooting; a non-explicit romantic scene.') },
  { id: 'cmvowfsz500c5x6mm5tdsuxmm', name: 'Inglourious Basterds', violence: 9, language: 6, sexNudity: 2, scariness: 5,
    sourceNotes: gk('Inglourious Basterds, 2009', 'scalpings, a baseball-bat killing and swastikas carved into foreheads — wartime, so in-bounds under the rule, but graphic. Little sexual content.') },
  { id: 'cmvowfp5m00b3x6mmmcv5hm03', name: 'Prince of Persia: The Sands of Time', violence: 5, language: 1, sexNudity: 1, scariness: 3,
    sourceNotes: gk('Prince of Persia: The Sands of Time, 2010', 'PG-13 swashbuckler; bloodless swordplay and Hassansin assassins, very mild language.') },
  { id: 'cmvowf4pk005hx6mmv6uo71fg', name: 'Contraband', violence: 6, language: 8, sexNudity: 1, scariness: 4,
    sourceNotes: gk('Contraband, 2012', 'smuggling thriller; shootouts and a menacing home threat, heavy profanity, no sexual content of note.') },
  { id: 'cmvowf4lv005gx6mmvfkaswkw', name: 'May December', violence: 1, language: 5, sexNudity: 6, scariness: 2,
    sourceNotes: gk('May December, 2023', 'built around a grooming relationship that began when the boy was 13; one depicted sex scene with partial nudity. Excluded by verdict.') },
  { id: 'cmvowf40f005ax6mmyd2s54o5', name: 'Cleaner', violence: 5, language: 6, sexNudity: 1, scariness: 3,
    sourceNotes: gk('Cleaner, 2007', 'Samuel L. Jackson as a crime-scene cleaner; gory aftermath imagery and a couple of shootings rather than sustained violence.') },
  { id: 'cmvowewxl003cx6mmuxh9e0o6', name: 'The Fate of the Furious', violence: 6, language: 3, sexNudity: 2, scariness: 2,
    sourceNotes: gk('The Fate of the Furious, 2017', 'PG-13 vehicular mayhem and fistfights; one execution of a hostage happens just off-screen.') },
  { id: 'cmvowet0b002ax6mma1x6fp1i', name: 'Kick-Ass 2', violence: 8, language: 9, sexNudity: 4, scariness: 4,
    sourceNotes: gk('Kick-Ass 2, 2013', 'bloody vigilante violence including a lawnmower death, an attempted rape played for laughs, and very heavy profanity.') },
  { id: 'cmvowemp5000kx6mmb5dxn0gr', name: 'Gladiator', violence: 8, language: 2, sexNudity: 1, scariness: 5,
    sourceNotes: gk('Gladiator, 2000', 'Germania battle, arena combat with decapitations and the crucified family; almost no language or sexual content.') },
]

// ---- Hand ranking ----

const FAMILY_HAND_ORDER: string[] = [
  'cmtf5jfie00byezj8p2ngenfe', // How to Train Your Dragon (2010) — they LOVED the 2025 remake
  'cmtf5jgj000c5ezj80kf8nu7b', // How to Train Your Dragon 2 — same
  'cmtf5iy0n007bezj8kao41w9w', // Toy Story 2 — Toy Story LOVED
  'cmtf5iwvh006zezj81yue2bmk', // Toy Story 3 — same
  'cmvywikb700a1tlucu8el8sxq', // Klaus — NEW; heartfelt original animation, the register of Wild Robot / Mitchells (both LOVED)
  'cmtf5j082007tezj89mkjtka5', // Toy Story 4
  'cmv4wadxa00gom9frs9i5adys', // Toy Story 5 — Andrew Stanton (WALL·E, LOVED)
  'cmtf5j3i4008tezj82dtrnc66', // The Empire Strikes Back — Star Wars LOVED
  'cmtf5ixr00077ezj8ko0nke0g', // Inside Out — Pete Docter (Up, LOVED)
  'cmvewbx6w002q10urnq1izwf0', // Carl's Date — NEW; Pixar short continuing Up (LOVED)
  'cmtf5jd5e00b3ezj8vf4a4te3', // Return of the Jedi
  'cmtf5iwbb006vezj8h9z29vbz', // Inside Out 2
  'cmvewdwfw00k510ur4n0v6v1k', // That Christmas — NEW; Locksmith Animation, who made Ron's Gone Wrong (LOVED)
  'cmtf5j8fl009xezj8j5u41ow3', // Finding Dory — Finding Nemo LIKED
  'cmu0vysio00g7h0gu4sokqvpu', // Wish Dragon — Chris Appelhans (KPop Demon Hunters, LOVED)
  'cmu0vylov00eoh0gu7t43e0y6', // The Sea Beast — Chris Williams (Big Hero 6, LOVED)
  'cmtf5j2r3008iezj8xeygm6bl', // Elemental — Peter Sohn (Good Dinosaur, LOVED)
  'cmvywhjns0004tluccohq6h0q', // Minions & Monsters — NEW; Despicable Me 2 LOVED, Minions/DM3 LIKED
  'cmtf5j6u8009hezj843mxge79', // Elio — Pixar space story
  'cmtf5j4t30091ezj82rgk9gxr', // A Bug's Life — Pixar
  'cmtf5iezx002fezj8it8add9d', // The Bad Guys
  'cmtf5j2xt008lezj8ieycrebc', // Ralph Breaks the Internet — Wreck-It Ralph LIKED
  'cmtf5jir100cpezj8js5bi5l6', // Migration
  'cmtdn2glm003drvj4621nxyc6', // The Super Mario Galaxy Movie — Super Mario Bros. LIKED
  'cmukw3z5000apuz1wc3c08moa', // Meet the Robinsons
  'cmvewc303004510ur9vgz9zao', // Out of My Mind — NEW; earnest true-to-life kid drama, near David / Wild Robot
  'cmtf5ibhd001iezj8ev6wk7ax', // The Bad Guys 2
  'cmtf5iy53007dezj8hdvp7x73', // Moana 2
  'cmuuw6423003ff329z4kj7l7p', // The Adventures of Tintin
  'cmuuw61xl002yf329bt807tu3', // Close Encounters — Apollo 13 / Star Wars era wonder
  'cmvywj4le00fmtluc8iuc914d', // The Muppets (2011) — NEW; warm, joke-dense, no magic
  'cmvowfhen008zx6mm6stvhrov', // Dinosaur (2000) — NEW; The Good Dinosaur LOVED
]

const ADULT_HAND_ORDER: string[] = [
  'cmuuw6h82006df3295i4bm2fh', // The Prestige — Nolan (Interstellar LOVED, Oppenheimer/Memento LIKED)
  'cmuuw5rr3000pf3296vwlvtrr', // Arrival — cerebral sci-fi, Interstellar / Project Hail Mary LOVED
  'cmvewcs8f00a810urj9r99qo6', // Thirteen Lives — NEW; Ron Howard true-story rescue (Apollo 13 LOVED in Family, 127 Hours LIKED)
  'cmuuw5rw1000qf329yw0e9oel', // Saving Private Ryan — 1917 LOVED
  'cmuaw28ua00lw132gqlutjphp', // Zero Dark Thirty — Bigelow (Hurt Locker, House of Dynamite LIKED)
  'cmvywhtid002qtluc1thwt45u', // Jurassic Park — NEW; Spielberg original; Dominion LIKED (Rebirth DISLIKED is the weak sequel, not the premise)
  'cmuuw810d00ixf329ez1ujs3t', // Casino Royale
  'cmukw2qy80006uz1wqsmqy88m', // Top Gun: Maverick — Cruise (MI Final Reckoning LOVED)
  'cmvowemp5000kx6mmb5dxn0gr', // Gladiator — NEW; Troy LIKED. Gladiator II DISLIKED, but the original is the reason the sequel exists
  'cmuuw86rf00k8f3295rucodjq', // Skyfall — Mendes (1917 LOVED)
  'cmuuw6jjq006wf329a2zhndfd', // The Bourne Identity — Gray Man / Extraction LOVED
  'cmvewcpd4009n10ur74fga9oi', // The Monuments Men — NEW; WWII mission ensemble; Ministry of Ungentlemanly Warfare LIKED, Damon LIKED x3
  'cmuuw6tzh0099f3295f2tlzam', // The Bourne Supremacy
  'cmuuw6se1008wf3296v89785u', // The Bourne Ultimatum
  'cmuuw84jc00jqf329t5hpo657', // Minority Report — Spielberg/Cruise sci-fi
  'cmvowg3ft00f0x6mm312rx29k', // John Wick — NEW; Keanu (Matrix LOVED, Speed LIKED), choreographed action like Extraction (LOVED)
  'cmuuw8cg600lif3291zesys7h', // Lone Survivor — American Sniper LIKED
  'cmvywjs0r00m0tlucj7dvksna', // Limitless — NEW; high-concept thriller like In Time / Source Code; Bradley Cooper (American Sniper LIKED)
  'cmuuw7v9d00hnf329etm0lgc4', // Wrath of Man — Guy Ritchie (3 LIKED last run)
  'cmuuw80r300ivf329210wn8lv', // Snatch — Guy Ritchie; The Gentlemen LIKED
  'cmtgukwvv00gh11ut7bdk39zw', // Enemy of the State
  'cmuuw7rtp00gvf329hrucwhwn', // Blade Runner 2049 — Gosling (Gray Man, PHM LOVED)
  'cmv4w8vgi0026m9fr1ae5jhdy', // Heat — Michael Mann (Collateral LIKED)
  'cmvowg07e00e4x6mm4855oa2r', // Ong-Bak — NEW; martial-arts showcase, Ip Man LOVED / Ip Man 3 LIKED
  'cmtf5k7d300ihezj8ia4ker92', // Source Code
  'cmuuw5rmf000of329l4qrhwjp', // Catch Me If You Can
  'cmukw3ds2005iuz1wz5xtael2', // Society of the Snow
  'cmvowfsz500c5x6mm5tdsuxmm', // Inglourious Basterds — NEW; WWII mission (Ministry LIKED), OUATIH LIKED — but Pulp Fiction was TOO_INAPPROPRIATE, so not higher
  'cmvewco3n009c10urrf22clc2', // Unstoppable (2024) — NEW; inspirational sports true story, Air LIKED
  'cmuuw67ac0045f3297341tbri', // Cloverfield
  'cmvowfxe800dcx6mmooz8xh5i', // John Wick: Chapter 2 — NEW; behind the first
  'cmvewcrmy00a310url9urm72d', // The November Man — NEW; Brosnan spy thriller, Bourne/Bond adjacent
]

async function writeContentScores() {
  for (const r of CONTENT_RATINGS) {
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
  console.log(`Wrote ${CONTENT_RATINGS.length} content score(s).`)
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
    throw new Error('usage: manual-batch-2026-11-07.ts <scores|rank>')
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
