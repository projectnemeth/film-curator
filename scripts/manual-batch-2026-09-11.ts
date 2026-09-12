// Manual catalog refresh, 2026-09-11.
//
// First pass since 2026-09-08. The catalog has grown to 1070 titles and
// 40 keyword/score nominations had piled up unreviewed, so this run
// cleared the whole exclusion queue first (see scripts/review-exclusions.ts)
// and both modes are re-ranked here, since those verdicts changed which
// titles are visible in each.
//
// Usage: npx tsx scripts/manual-batch-2026-09-11.ts

import { prisma } from '../src/lib/prisma'
import { isTitleVisible } from '../src/lib/filtering'
import { computeRankingFingerprint, type TasteHistoryEntry } from '../src/lib/ranking'

const HIDDEN_AFTER_RATING = new Set(['DISLIKED', 'LIKED', 'TOO_INAPPROPRIATE', 'NOT_INTERESTED'])
const MOVED_TO_OWN_SECTION = new Set(['LOVED', 'WATCHLISTED'])

// The 30 most recently ingested unscored PG-13/R titles. sourceNotes states
// its own basis; the two I could not place confidently say so outright.
const CONTENT_RATINGS = [
  { id: 'cmtqvw2kx00m2cox79g2ocio0', violence: 4, language: 3, sexNudity: 1, scariness: 6,
    sourceNotes: "AI assessment from general knowledge (Dante's Peak, 1997): volcano disaster film. Deaths by lava, ash and an acidified lake, including a grandmother dissolving as she wades through it — the peril is the distressing part, not gore or language." },
  { id: 'cmtqvw29a00lzcox7djxwc9tz', violence: 5, language: 3, sexNudity: 1, scariness: 3,
    sourceNotes: 'AI estimate with lower confidence (Survivor, 2015): I know the premise — an embassy officer framed, hunted by a contract assassin — but not the scene detail. Scored as a generic PG-13 chase thriller: shootings and a bombing, little else. Treat cautiously.' },
  { id: 'cmtqvw25900lycox7xh0g6oh7', violence: 6, language: 6, sexNudity: 7, scariness: 6,
    sourceNotes: 'AI assessment from general knowledge (Fear, 1996): an obsessive boyfriend turns violent against a family. Sexual obsession drives the plot, with an explicit sex scene and coerced sexual contact, plus a brutal home-invasion climax.' },
  { id: 'cmtqvw1qd00lucox77954gs43', violence: 2, language: 9, sexNudity: 8, scariness: 1,
    sourceNotes: 'AI assessment from general knowledge (Borat Subsequent Moviefilm, 2020): shock comedy built on sexual humiliation, including extended full-frontal nudity and a notorious hotel-room sequence. Relentless crude language.' },
  { id: 'cmtqvw17w00lpcox7j156g5ik', violence: 5, language: 4, sexNudity: 1, scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (Eagle Eye, 2008): techno-thriller. Vehicle carnage, shootings and several bystander deaths orchestrated by an AI; tense but bloodless.' },
  { id: 'cmtqvw0sd00llcox7ssjx8acz', violence: 6, language: 4, sexNudity: 4, scariness: 2,
    sourceNotes: 'AI assessment from general knowledge (Transporter 3, 2008): car-chase action. Hand-to-hand fights and crashes, plus a drugged seduction scene played as titillation but kept PG-13.' },
  { id: 'cmtqvw0h600licox7n7ibzjs0', violence: 5, language: 2, sexNudity: 1, scariness: 3,
    sourceNotes: 'AI assessment from general knowledge (Valkyrie, 2008): the July 1944 plot to kill Hitler. A bomb blast, a maimed hand, and the firing-squad executions that close the film; restrained for its subject.' },
  { id: 'cmtqvvzp700lbcox7ruvupzm6', violence: 3, language: 8, sexNudity: 6, scariness: 2,
    sourceNotes: 'AI assessment from general knowledge (Better Man, 2024): Robbie Williams biopic. Pervasive profanity, heavy drug use, and drug-fuelled sex including a group scene — the nudity here is sexual, not incidental.' },
  { id: 'cmtqvvzle00lacox7k5kmsocn', violence: 8, language: 6, sexNudity: 2, scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (Hard Target, 1993): John Woo action. Near-continuous gunfights with squib-heavy bloodshed; the premise is homeless veterans hunted for sport, though it plays as action rather than as torment.' },
  { id: 'cmtqvvz9v00l7cox7skppr00o', violence: 6, language: 6, sexNudity: 2, scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (They Live, 1988): satirical sci-fi. Shootouts, skull-faced aliens, and the famously long back-alley brawl.' },
  { id: 'cmtqvvz2h00l5cox7y3mybamm', violence: 4, language: 7, sexNudity: 0, scariness: 3,
    sourceNotes: 'AI assessment from general knowledge (Crimson Tide, 1995): submarine standoff. Very little bloodshed — the tension is a command dispute — but sustained strong military profanity.' },
  { id: 'cmtqvvyd300l1cox7ykqg4og9', violence: 1, language: 6, sexNudity: 2, scariness: 1,
    sourceNotes: 'AI assessment from general knowledge (Rain Man, 1988): road drama. No real violence; the R comes from profanity, a brief casino-era sexual reference and an unsuccessful encounter with a call girl.' },
  { id: 'cmtqvvy8600l0cox716qbt86t', violence: 2, language: 3, sexNudity: 4, scariness: 1,
    sourceNotes: 'AI assessment from general knowledge (Shoplifters, 2018): Kore-eda family drama. Quiet throughout; the adult content is a sex-worker subplot with partial nudity and an implied child-neglect backdrop.' },
  { id: 'cmtqvvy4f00kzcox7rf6ylhzt', violence: 1, language: 8, sexNudity: 6, scariness: 1,
    sourceNotes: 'AI assessment from general knowledge (Bridesmaids, 2011): comedy opening on an explicit sex scene and sustaining crude sexual humour, plus an extended gross-out set piece. The nudity here is sexual.' },
  { id: 'cmtqvvy0m00kycox7cqzh1sab', violence: 8, language: 9, sexNudity: 5, scariness: 3,
    sourceNotes: 'AI assessment from general knowledge (Raging Bull, 1980): boxing biopic. Bloody, deliberately brutal fight scenes and severe domestic violence, with relentless profanity and slurs throughout.' },
  { id: 'cmtqvvxwc00kxcox7woua3eck', violence: 7, language: 8, sexNudity: 1, scariness: 6,
    sourceNotes: 'AI assessment from general knowledge (Patriots Day, 2016): the Boston Marathon bombing. Graphic blast injuries and amputations, a point-blank killing, and a chaotic shootout; heavy profanity.' },
  { id: 'cmtqvvxo900kvcox7zh4hkssy', violence: 5, language: 4, sexNudity: 1, scariness: 7,
    sourceNotes: 'AI assessment from general knowledge (The Visit, 2015): found-footage horror about grandparents behaving menacingly. Jump scares and a genuinely disturbing final act aimed squarely at dread rather than gore.' },
  { id: 'cmtqvvx9100krcox7gaw9lldq', violence: 6, language: 4, sexNudity: 1, scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (Army of Darkness, 1992): slapstick horror-comedy. Skeleton armies and cartoonish dismemberment played for laughs rather than fright.' },
  { id: 'cmtqvvwu200kncox737kkcox0', violence: 5, language: 2, sexNudity: 0, scariness: 3,
    sourceNotes: "AI assessment from general knowledge (Ender's Game, 2013): military sci-fi with child soldiers. Brutal schoolyard beatings and an offscreen genocide; clean language, no sexual content." },
  { id: 'cmtqvvw7200khcox7tkpswoan', violence: 5, language: 3, sexNudity: 2, scariness: 5,
    sourceNotes: 'AI assessment from general knowledge (The Mummy, 2017): action-horror reboot. Undead corpses, a plane crash, and a sequence with a naked-but-obscured resurrected body; more startling than gory.' },
  { id: 'cmtqvvv9t00k8cox7btnw93c4', violence: 5, language: 4, sexNudity: 0, scariness: 2,
    sourceNotes: 'AI assessment from general knowledge (The Marksman, 2021): Liam Neeson border thriller. Cartel shootings of both adults and, by implication, a child in peril; otherwise restrained.' },
  { id: 'cmtqvvubo00jzcox7acxug7yb', violence: 1, language: 5, sexNudity: 3, scariness: 1,
    sourceNotes: 'AI assessment from general knowledge (The Hustle, 2019): con-artist comedy. Sexual innuendo and seduction as the con, but nothing explicit shown.' },
  { id: 'cmtqvvtil00jrcox7f0jctmr4', violence: 3, language: 4, sexNudity: 3, scariness: 1,
    sourceNotes: "AI estimate with lower confidence (My Mom's New Boyfriend, 2008): I recall the setup — an FBI agent's mother dating a suspected thief — but not the specifics. Scored as a generic PG-13 caper comedy with mild innuendo. Treat cautiously." },
  { id: 'cmtqvvsii00jhcox7ezphdn27', violence: 6, language: 2, sexNudity: 3, scariness: 5,
    sourceNotes: 'AI assessment from general knowledge (Van Helsing, 2004): monster action. Continuous CGI creature combat — Dracula, werewolves, Frankenstein — and a corseted vampire-bride register; scary imagery rather than bloodshed.' },
  { id: 'cmtqvvqoj00izcox7ok16fwui', violence: 7, language: 8, sexNudity: 1, scariness: 5,
    sourceNotes: 'AI assessment from general knowledge (Collateral, 2004): Michael Mann thriller. Repeated cold point-blank executions across one night, a nightclub shootout, and pervasive profanity.' },
  { id: 'cmtqvvp8j00ilcox7asjiow5q', violence: 3, language: 3, sexNudity: 1, scariness: 1,
    sourceNotes: 'AI assessment from general knowledge (Now You See Me 2, 2016): heist caper. Bloodless action and chases; very mild for its rating.' },
  { id: 'cmtqvvoq400igcox78k13pfwd', violence: 3, language: 4, sexNudity: 1, scariness: 2,
    sourceNotes: 'AI assessment from general knowledge (Now You See Me, 2013): heist caper. A car crash, a drowning-escape set piece and mild profanity; no blood to speak of.' },
  { id: 'cmtqvvom900ifcox793vqb15w', violence: 5, language: 4, sexNudity: 1, scariness: 2,
    sourceNotes: 'AI assessment from general knowledge (Jack Reacher: Never Go Back, 2016): action thriller. Bone-breaking hand-to-hand fights and shootings, with a teenager in jeopardy; bloodless by PG-13 convention.' },
  { id: 'cmtqvvo2700iacox7dm2gnria', violence: 8, language: 6, sexNudity: 0, scariness: 9,
    sourceNotes: "AI assessment from general knowledge (The Thing, 1982): Carpenter's creature paranoia. Landmark practical body-horror — a chest cavity biting off hands, a head splitting away and walking — which is why scariness is near the top. No sexual content at all." },
  { id: 'cmtqvvntp00i8cox7cy2j4lei', violence: 3, language: 3, sexNudity: 3, scariness: 3,
    sourceNotes: 'AI assessment from general knowledge (Meet Joe Black, 1998): fantasy romance. A sudden, jarring traffic-collision death early on, a tasteful love scene, and an otherwise contemplative three hours about dying.' },
]

// Hand-ranked from the taste history, best fit first. Family taste is
// clear: original animated features from Pixar / Disney Animation /
// DreamWorks / Sony, plus space and adventure. What it rejects is just as
// clear — the Shrek and Ice Age sequel lines are DISLIKED, and the Disney
// princess and fairy-tale catalogue is almost uniformly NOT_INTERESTED —
// so none of that is ranked up here.
const FAMILY_TOP_ORDER = [
  'cmtf5ixr00077ezj8ko0nke0g', // Inside Out — Pete Docter, who made the LOVED Up and the LIKED Soul
  'cmtf5jfie00byezj8p2ngenfe', // How to Train Your Dragon (2010) — they LOVED the 2025 DeBlois remake; this is his original
  'cmtf5iuew006bezj8p00gym6a', // Toy Story — Pixar cornerstone; Pixar is the single strongest studio signal in Family
  'cmtf5jgj000c5ezj80kf8nu7b', // How to Train Your Dragon 2 — same series, same director
  'cmtf5j3i4008tezj82dtrnc66', // The Empire Strikes Back — Star Wars (1977) is LOVED
  'cmtf5iwvh006zezj81yue2bmk', // Toy Story 3 — the best-regarded entry in a series they have not started
  'cmtf5izvt007sezj8fkgy9ykb', // Ratatouille — Brad Bird, who made the LOVED Incredibles and LIKED Incredibles 2
  'cmtqvurgb009kcox7qddr8fdg', // The Prince of Egypt — they LOVED David (2025), an animated biblical adventure; closest match in the pool
  'cmtf5iwbb006vezj8h9z29vbz', // Inside Out 2 — sequel to the top pick
  'cmtf5jd5e00b3ezj8vf4a4te3', // Return of the Jedi — Star Wars again
  'cmtf5iy0n007bezj8kao41w9w', // Toy Story 2
  'cmtf5j1az0086ezj86wia40n7', // Raiders of the Lost Ark — Spielberg adventure, pairing with LOVED Star Wars and Apollo 13
  'cmtf5iezx002fezj8it8add9d', // The Bad Guys — DreamWorks heist comedy in the stylised register of the LOVED Mitchells and Spider-Verse
  'cmtf5j6u8009hezj843mxge79', // Elio — Pixar sci-fi, the WALL·E / Good Dinosaur lane
  'cmtf5j8fl009xezj8j5u41ow3', // Finding Dory — Andrew Stanton, who made the LOVED WALL·E and LIKED Finding Nemo
  'cmtf5j4t30091ezj82rgk9gxr', // A Bug's Life — early Pixar
  'cmtf5ibhd001iezj8ev6wk7ax', // The Bad Guys 2 — same series
  'cmtf5j2r3008iezj8xeygm6bl', // Elemental — Peter Sohn, who directed the LOVED Good Dinosaur
  'cmtf5j1220082ezj8hz9ozxyw', // Cars — Pixar, though the weakest-regarded of its lines
  'cmtf5k5fj00hyezj8poer1eht', // Megamind — DreamWorks superhero comedy; LOVED Incredibles and Big Hero 6
  'cmtf5j082007tezj89mkjtka5', // Toy Story 4
  'cmtf5ja8q00adezj87281mj2q', // Treasure Planet — Disney sci-fi adventure; Big Hero 6 and Star Wars are both LOVED
  'cmtf5ipl3004wezj8ycsosb62', // The Road to El Dorado — DreamWorks buddy adventure
  'cmtf5jir100cpezj8js5bi5l6', // Migration — Illumination, whose Sing and Secret Life of Pets are LIKED
  'cmtf5j1ua008aezj8it6zoch0', // Raya and the Last Dragon — Disney Animation, alongside the LIKED Encanto and Zootopia
  'cmtgujje8004n11utj6lz8lnf', // Suzume — no direct signal, but a well-made animated adventure rather than a franchise sequel
  'cmtf5iypn007iezj8xtzwwhzz', // Cars 3
  'cmtf5j9nv00aaezj8loljz3pd', // Night at the Museum — live-action family comedy, the Home Alone 2 / Freakier Friday register
  'cmtguk9ws00b211utqy6hdgsu', // Honey, I Shrunk the Kids — family sci-fi adventure from the same shelf
  'cmtf5j9ll00a9ezj8h5gt5ugu', // The Jungle Book (2016) — Favreau remake; ranked below the originals because the Aladdin and Lion King remakes went DISLIKED / unrated
]

// Adult taste splits cleanly: war and historical combat, grounded
// procedural thrillers, martial arts, and sci-fi with an idea in it are
// LOVED or LIKED. Horror, raunchy comedy, erotic romance, Dwayne Johnson
// vehicles and the later MCU are NOT_INTERESTED or DISLIKED, and the
// TOO_INAPPROPRIATE bucket (Pulp Fiction, The Wolf of Wall Street, One
// Battle After Another) is a content line rather than a genre one — so
// the profanity-and-excess prestige films in the pool stay unranked.
const ADULT_TOP_ORDER = [
  'cmtdn29q2000hrvj4tnze88bz', // Schindler's List — 1917 is LOVED, All Quiet and Oppenheimer LIKED; the definitive film of that shelf
  'cmtf5jhfh00cdezj8esgqxejr', // The Pianist — WWII survival drama, same lane
  'cmtf5kifn00lbezj8fkf4jnpa', // Master Z: Ip Man Legacy — Ip Man is LOVED and Ip Man 3 LIKED; this is the direct spin-off
  'cmtf5ieqn002bezj8ha9oxloc', // Ballad of Songbirds & Snakes — all four Hunger Games films are LIKED
  'cmtqvvz2h00l5cox7y3mybamm', // Crimson Tide — Denzel submarine standoff; Inside Man is LIKED
  'cmtf5khp300l0ezj8kyckvs8c', // K-19: The Widowmaker — Kathryn Bigelow, who made the LIKED Hurt Locker and A House of Dynamite
  'cmtqvvl8z00hkcox7oti3horc', // Jack Reacher — Christopher McQuarrie, director of the LOVED Mission: Impossible – The Final Reckoning
  'cmtf5jo1e00dyezj87kp8hi0c', // Sakra — Donnie Yen directing and starring; the Ip Man connection again
  'cmtf5j9h700a7ezj8m329zqgc', // Indiana Jones and the Last Crusade — Dial of Destiny is LIKED, and the originals are better
  'cmtqvu8wd004ncox7v8i19ldf', // United 93 — real-time crisis procedural, the A House of Dynamite register
  'cmtqvw0h600licox7n7ibzjs0', // Valkyrie — WWII thriller with Tom Cruise, two strong signals at once
  'cmtf5jqnz00eaezj85gkw4ps6', // The Last of the Mohicans — Michael Mann historical combat; Troy is LIKED
  'cmtf5khrm00l1ezj8qrxsynam', // Fist of Legend — Jet Li; the martial-arts lineage Ip Man belongs to
  'cmtqvvqoj00izcox7ok16fwui', // Collateral — Michael Mann and Tom Cruise, professionals-at-work thriller
  'cmtf5k7d300ihezj8ia4ker92', // Source Code — a sci-fi puzzle box; Memento and In Time are both LIKED
  'cmtf5ipv10050ezj8z9lf7uzw', // Elysium — Matt Damon sci-fi; The Martian, Air and Good Will Hunting are LIKED
  'cmtf5im4f0045ezj84i9cvhtd', // Den of Thieves — heist between armed professionals, the Inside Man / The Gentlemen shelf
  'cmtf5id5k001yezj8aqhkh5yo', // Nuremberg — WWII aftermath courtroom drama, straight out of the Oppenheimer lane
  'cmtqvtxju001pcox7kjlslwhw', // Star Trek (2009) — J.J. Abrams, who made the LIKED The Force Awakens
  'cmtf5j0ka007yezj86i29fr0s', // Logan — the one late-era superhero film that plays as a grounded western, unlike the DISLIKED MCU entries
  'cmtf5ilxp0042ezj8214346um', // Wind River — Taylor Sheridan; the Sicario register the exclusion rule explicitly keeps in
  'cmtqvukqv007tcox750nkqq0q', // The Killer (2023) — David Fincher, who made the LIKED Gone Girl
  'cmtf5jhx000ckezj81tykxjwy', // The Usual Suspects — twist-structure crime; Memento is LIKED
  'cmtf5iazv001fezj8ov2qox69', // A Quiet Place Part II — creature survival, cleared by review; World War Z is LIKED
  'cmtf5ig7h002oezj8m25xim00', // A Quiet Place: Day One — same series
  'cmtf5jvcp00fkezj8hcoqfui7', // L.A. Confidential — Russell Crowe crime ensemble; The Next Three Days is LIKED
  'cmtf5kiv400ldezj8sen66lqg', // News of the World — Greengrass and Tom Hanks, a quieter historical drama
  'cmtf5jhz900clezj83irw8lq6', // Kingdom of the Planet of the Apes — large-scale sci-fi with a premise
  'cmtqvugso006rcox7mgxd48cg', // Aliens — sci-fi combat; the Matrix / World War Z shelf
  'cmtf5iad40018ezj8rrkinu4c', // The Fifth Element — sci-fi adventure from the era of the LOVED Matrix
]

async function writeContentScores() {
  let written = 0
  for (const rating of CONTENT_RATINGS) {
    const { id, ...score } = rating
    await prisma.contentScore.create({ data: { titleId: id, ...score } })
    written += 1
  }
  console.log(`content scores written: ${written}`)
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
  await writeRankingCache('FAMILY', FAMILY_TOP_ORDER)
  await writeRankingCache('ADULT', ADULT_TOP_ORDER)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
