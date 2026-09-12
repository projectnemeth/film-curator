// Manual catalog refresh, 2026-09-11 (second pass).
//
// Prompted by two things: the family rated 22 Family titles in the three
// minutes after the morning pass, consuming a fifth of that hand-ranked
// order, and six PG-but-adult films (Lawrence of Arabia, Monty Python,
// Rocky I-IV) were moved into Adult Mode with the new mode override and
// arrived unranked at the bottom.
//
// Usage: npx tsx scripts/manual-batch-2026-09-11b.ts

import { prisma } from '../src/lib/prisma'
import { isTitleVisible } from '../src/lib/filtering'
import { computeRankingFingerprint, type TasteHistoryEntry } from '../src/lib/ranking'

const HIDDEN_AFTER_RATING = new Set(['DISLIKED', 'LIKED', 'TOO_INAPPROPRIATE', 'NOT_INTERESTED'])
const MOVED_TO_OWN_SECTION = new Set(['LOVED', 'WATCHLISTED'])

// Weighted towards titles ranked highly below, so the top of the Not Seen
// list carries content detail. sourceNotes states its own basis.
const CONTENT_RATINGS = [
  { id: 'cmtqvvl8z00hkcox7oti3horc', violence: 6, language: 4, sexNudity: 2, scariness: 2,
    sourceNotes: 'AI assessment from general knowledge (Jack Reacher, 2012): a sniper kills five civilians in the opening, shown coldly; bare-handed fights and a car chase after that. Little profanity, no real sexual content.' },
  { id: 'cmtqvvhiw00gkcox7uerz5nlg', violence: 4, language: 6, sexNudity: 2, scariness: 6,
    sourceNotes: 'AI assessment from general knowledge (The Abyss, 1989): underwater sci-fi. Drowning, decompression panic and a near-death resuscitation carry the fear; strong profanity throughout.' },
  { id: 'cmtqvvhqc00gmcox7xvm6j6y1', violence: 1, language: 4, sexNudity: 3, scariness: 1,
    sourceNotes: 'AI assessment from general knowledge (27 Dresses, 2008): romantic comedy. Drinking, innuendo and a bedroom scene that stops short of explicit.' },
  { id: 'cmtqvvfot00g2cox71hvs1q40', violence: 4, language: 3, sexNudity: 1, scariness: 3,
    sourceNotes: 'AI assessment from general knowledge (Madame Web, 2024): superhero thriller. Chases, a stalking villain and teenagers in peril; bloodless.' },
  { id: 'cmtqvvfks00g1cox7a9e2jsos', violence: 1, language: 4, sexNudity: 3, scariness: 1,
    sourceNotes: 'AI assessment from general knowledge (Mrs. Doubtfire, 1993): family comedy carrying a PG-13 for crude humour and sexual references rather than anything shown; divorce is the emotional weight.' },
  { id: 'cmtqvvdhm00fhcox7g8i4atf8', violence: 4, language: 2, sexNudity: 1, scariness: 3,
    sourceNotes: 'AI assessment from general knowledge (Isle of Dogs, 2018): stop-motion. Dog fights with cartoon dust-clouds, but also surgery, a severed ear and sick animals — bleaker than its animation suggests.' },
  { id: 'cmtqvux2k00b1cox737veegy5', violence: 8, language: 7, sexNudity: 3, scariness: 5,
    sourceNotes: 'AI assessment from general knowledge (Tears of the Sun, 2003): Nigerian civil-war rescue. Massacre aftermath including mutilation and depicted sexual violence against villagers; sustained combat.' },
  { id: 'cmtqvuwyv00b0cox7bs35q4c8', violence: 6, language: 3, sexNudity: 1, scariness: 3,
    sourceNotes: 'AI assessment from general knowledge (Snake Eyes: G.I. Joe Origins, 2021): sword-and-gun action, frequent but bloodless; a python pit is the one unsettling sequence.' },
  { id: 'cmtqvuwv100azcox7jlrbj92v', violence: 8, language: 8, sexNudity: 4, scariness: 8,
    sourceNotes: 'AI assessment from general knowledge (The Deer Hunter, 1978): Vietnam epic. The Russian-roulette sequences are among the most harrowing in American film, and the POW captivity is brutal. Wartime, which is the category the family keeps, but exceptionally heavy.' },
  { id: 'cmtqvuwmf00axcox7sbd7tcy5', violence: 5, language: 4, sexNudity: 1, scariness: 2,
    sourceNotes: 'AI assessment from general knowledge (Creed III, 2023): boxing drama. Heavy in-ring punishment and one prison flashback; clean otherwise.' },
  { id: 'cmtqvuwf000avcox7bsvmjlv9', violence: 6, language: 9, sexNudity: 7, scariness: 3,
    sourceNotes: 'AI assessment from general knowledge (Straight Outta Compton, 2015): N.W.A biopic. Relentless profanity, gang and police violence, and explicit party scenes with extended nudity.' },
  { id: 'cmtqvuvw700aqcox7l19qhmpw', violence: 3, language: 3, sexNudity: 5, scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (Passengers, 2016): space romance. A sex scene and a nude shower sequence, both brief; the dread comes from isolation and a failing ship.' },
  { id: 'cmtqvuvgy00amcox7uvgchjjg', violence: 4, language: 5, sexNudity: 2, scariness: 1,
    sourceNotes: 'AI assessment from general knowledge (The Blues Brothers, 1980): musical comedy. Enormous car-wreck slapstick with no consequences; mild profanity for an R.' },
  { id: 'cmtqvuuya00ahcox7ghakzfof', violence: 6, language: 2, sexNudity: 2, scariness: 5,
    sourceNotes: 'AI assessment from general knowledge (47 Ronin, 2013): samurai fantasy. Sword combat, a witch, monstrous creatures, and a mass ritual suicide ending.' },
  { id: 'cmtqvuumn00aecox7q2b3za31', violence: 3, language: 3, sexNudity: 1, scariness: 4,
    sourceNotes: "AI assessment from general knowledge (I'm Still Here, 2024): Brazilian dictatorship drama. A father disappears into state custody; the menace is offscreen interrogation and grief, not shown violence." },
  { id: 'cmtqvutra00a6cox75bgcenty', violence: 8, language: 7, sexNudity: 2, scariness: 6,
    sourceNotes: 'AI assessment from general knowledge (Upgrade, 2018): body-horror action. Sudden extreme gore — a face split, a throat opened — delivered in short shocking bursts.' },
  { id: 'cmtqvutjl00a4cox7grmki304', violence: 7, language: 8, sexNudity: 2, scariness: 5,
    sourceNotes: 'AI assessment from general knowledge (El Camino, 2019): Breaking Bad coda. Executions, a body disposal, and captivity flashbacks; pervasive profanity and meth culture.' },
  { id: 'cmtqvusp8009wcox7g0enyxec', violence: 9, language: 7, sexNudity: 5, scariness: 8,
    sourceNotes: 'AI assessment from general knowledge (The Platform, 2019): Spanish dystopia in which prisoners eat each other. Cannibalism, suicide and self-mutilation, and it is the point rather than an incident. Scored high across the board deliberately.' },
  { id: 'cmtqvurl4009lcox78nre3r57', violence: 7, language: 7, sexNudity: 2, scariness: 3,
    sourceNotes: 'AI assessment from general knowledge (The Harder They Fall, 2021): revisionist western. Stylised shootouts with visible blood, a hanging, and a child witnessing murder in the opening.' },
  { id: 'cmtqvup9p0090cox763ymsevw', violence: 6, language: 6, sexNudity: 2, scariness: 7,
    sourceNotes: 'AI assessment from general knowledge (Bird Box, 2018): unseen entities drive people to suicide, several shown abruptly. Sustained dread; cleared by review as creature survival rather than sadism.' },
  { id: 'cmtqvune2008icox7u449fcfl', violence: 6, language: 3, sexNudity: 3, scariness: 7,
    sourceNotes: 'AI assessment from general knowledge (The Impossible, 2012): the 2004 tsunami. A prolonged, extremely graphic wound and a terrifying wave sequence; brief non-sexual nudity as the family is swept away.' },
  { id: 'cmtqvul2f007wcox7z8vhdszj', violence: 6, language: 2, sexNudity: 1, scariness: 6,
    sourceNotes: 'AI assessment from general knowledge (King Kong, 2005): creature adventure. The insect-pit sequence is genuinely upsetting, and crew are eaten throughout; the ending is bleak rather than gory.' },
  { id: 'cmtqvukqv007tcox750nkqq0q', violence: 7, language: 6, sexNudity: 3, scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (The Killer, 2023): Fincher. Methodical assassinations and one extended brutal fight, filmed coldly rather than luridly.' },
  { id: 'cmtqvujww007lcox7v6bfqcau', violence: 5, language: 5, sexNudity: 4, scariness: 2,
    sourceNotes: 'AI assessment from general knowledge (xXx, 2002): extreme-sports action. Stunt spectacle, an avalanche, and a persistent leering treatment of its women.' },
  { id: 'cmtqvuiqx007acox7fm677y1c', violence: 1, language: 5, sexNudity: 4, scariness: 1,
    sourceNotes: 'AI assessment from general knowledge (About Time, 2013): time-travel romance. Sex scenes handled with comic discretion; the weight is a father dying, not content.' },
  { id: 'cmtqvugso006rcox7mgxd48cg', violence: 7, language: 6, sexNudity: 1, scariness: 8,
    sourceNotes: 'AI assessment from general knowledge (Aliens, 1986): combat sci-fi. Chest-bursting, colonists cocooned alive, and relentless tension; a child in constant danger sharpens it.' },
  { id: 'cmtqvudwz005zcox79yqnsmsu', violence: 7, language: 5, sexNudity: 2, scariness: 9,
    sourceNotes: 'AI assessment from general knowledge (Alien, 1979): the chest-burster remains one of cinema’s most frightening scenes. Slow, claustrophobic terror more than volume of violence.' },
  { id: 'cmtqvubme005dcox7i4uxe84n', violence: 7, language: 8, sexNudity: 4, scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (Destroyer, 2018): grim crime drama. A bank-robbery shootout, a beating, heavy profanity, and addiction throughout.' },
  { id: 'cmtqvu82a004fcox7hhyzrx3f', violence: 6, language: 7, sexNudity: 4, scariness: 3,
    sourceNotes: 'AI assessment from general knowledge (Righteous Kill, 2008): De Niro and Pacino as detectives chasing a vigilante killer. Crime-scene corpses, rough sexual content, and constant profanity.' },
  { id: 'cmtqvu4w1003lcox7s6yxti2r', violence: 8, language: 9, sexNudity: 2, scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (Mile 22, 2018): Peter Berg action. Rapid brutal hand-to-hand kills and shootings, with wall-to-wall profanity.' },
]

// Family taste is now very well evidenced: Pixar is close to automatic,
// Disney Animation and DreamWorks land reliably, and Illumination has
// moved up — Despicable Me 2 is LOVED with Minions and DM3 LIKED. What it
// rejects is equally clear: the Shrek and Ice Age sequel lines, and the
// princess/fairy-tale catalogue, which is almost uniformly NOT_INTERESTED.
const FAMILY_TOP_ORDER = [
  'cmtf5ixr00077ezj8ko0nke0g', // Inside Out — Pete Docter, 2-for-2 with the LOVED Up and LIKED Soul/Monsters Inc
  'cmtf5iy0n007bezj8kao41w9w', // Toy Story 2 — Toy Story was rated LOVED today
  'cmtf5iwvh006zezj81yue2bmk', // Toy Story 3 — the best-regarded of the series
  'cmtf5jfie00byezj8p2ngenfe', // How to Train Your Dragon (2010) — the LOVED 2025 remake is DeBlois's own
  'cmtf5iwbb006vezj8h9z29vbz', // Inside Out 2
  'cmtf5j3i4008tezj82dtrnc66', // The Empire Strikes Back — Star Wars (1977) is LOVED
  'cmtf5jgj000c5ezj80kf8nu7b', // How to Train Your Dragon 2
  'cmtf5j4t30091ezj82rgk9gxr', // A Bug's Life — Lasseter, who made the LOVED Toy Story and Cars
  'cmtf5j082007tezj89mkjtka5', // Toy Story 4
  'cmtf5jd5e00b3ezj8vf4a4te3', // Return of the Jedi
  'cmtf5j8fl009xezj8j5u41ow3', // Finding Dory — Andrew Stanton: WALL·E LOVED, Finding Nemo LIKED
  'cmtf5jfpi00c1ezj8n5pwj007', // Despicable Me 4 — DM2 LOVED, DM3 and Minions LIKED; the franchise is working
  'cmtf5j6u8009hezj843mxge79', // Elio — Pixar sci-fi, the WALL·E / Good Dinosaur lane
  'cmtf5j2r3008iezj8xeygm6bl', // Elemental — Peter Sohn, who directed the LOVED Good Dinosaur
  'cmtf5j1az0086ezj86wia40n7', // Raiders of the Lost Ark — Spielberg adventure; Star Wars and Apollo 13 both LOVED
  'cmtf5iezx002fezj8it8add9d', // The Bad Guys — the stylised heist register of the LOVED Mitchells and Spider-Verse
  'cmtf5ibhd001iezj8ev6wk7ax', // The Bad Guys 2
  'cmtf5k5fj00hyezj8poer1eht', // Megamind — superhero comedy; Incredibles and Big Hero 6 are LOVED
  'cmtf5jir100cpezj8js5bi5l6', // Migration — Illumination, now a strong signal
  'cmtf5i8f1000tezj8e007sxql', // Minions: The Rise of Gru — Minions LIKED
  'cmtf5j2xt008lezj8ieycrebc', // Ralph Breaks the Internet — Wreck-It Ralph LIKED
  'cmtf5iy53007dezj8hdvp7x73', // Moana 2 — Disney Animation, alongside the LIKED Encanto/Frozen/Zootopia
  'cmtf5k33h00hmezj89x5al7f4', // The Secret Life of Pets 2 — the first is LIKED
  'cmtf5ja8q00adezj87281mj2q', // Treasure Planet — Disney sci-fi adventure; Big Hero 6 LOVED
  'cmtf5j79p009kezj8elyuunrj', // Tomorrowland — Brad Bird; Incredibles LOVED, Ratatouille LIKED
  'cmtqvttwb000rcox7dzy8b6ne', // Over the Hedge — DreamWorks ensemble comedy
  'cmtf5j0zv0081ezj8n16xc43a', // The Emperor's New Groove — Disney comedy, not a princess film
  'cmtf5k9xg00j6ezj83nj1q9es', // Dog Man — DreamWorks 2025, the Bad Guys register for younger viewers
  'cmtgujje8004n11utj6lz8lnf', // Suzume — no direct signal, but a crafted adventure rather than a franchise sequel
  'cmtguk9ws00b211utqy6hdgsu', // Honey, I Shrunk the Kids — live-action family sci-fi
]

// Adult taste is unchanged since the morning pass, so this is largely that
// order with the six newly moved titles placed into it. Rocky and Monty
// Python were moved here deliberately by the family, which is itself a
// mild signal of intent to watch, so they are ranked rather than left to
// settle at the bottom.
const ADULT_TOP_ORDER = [
  'cmtdn29q2000hrvj4tnze88bz', // Schindler's List — 1917 LOVED; All Quiet and Oppenheimer LIKED
  'cmtf5jhfh00cdezj8esgqxejr', // The Pianist — WWII survival, same shelf
  'cmtf5kifn00lbezj8fkf4jnpa', // Master Z: Ip Man Legacy — Ip Man LOVED, Ip Man 3 LIKED
  'cmtf5ieqn002bezj8ha9oxloc', // Ballad of Songbirds & Snakes — all four Hunger Games films are LIKED
  'cmtqvvz2h00l5cox7y3mybamm', // Crimson Tide — Denzel submarine standoff; Inside Man LIKED
  'cmtf5khp300l0ezj8kyckvs8c', // K-19 — Bigelow, who made the LIKED Hurt Locker and A House of Dynamite
  'cmtqvvl8z00hkcox7oti3horc', // Jack Reacher — McQuarrie, director of the LOVED Final Reckoning
  'cmtf5jo1e00dyezj87kp8hi0c', // Sakra — Donnie Yen directing and starring
  'cmtf5j9h700a7ezj8m329zqgc', // Indiana Jones and the Last Crusade — Dial of Destiny is LIKED
  'cmtqvu8wd004ncox7v8i19ldf', // United 93 — real-time crisis procedural
  'cmtqvw0h600licox7n7ibzjs0', // Valkyrie — WWII thriller with Tom Cruise, two signals at once
  'cmtf5ifqp002mezj8go2hcwuc', // Rocky — moved here by the family. Underdog sports drama, nearer the LOVED Ip Man than the DISLIKED Warrior
  'cmtf5jqnz00eaezj85gkw4ps6', // The Last of the Mohicans — Michael Mann historical combat; Troy LIKED
  'cmtf5khrm00l1ezj8qrxsynam', // Fist of Legend — Jet Li; the lineage Ip Man belongs to
  'cmtqvvqoj00izcox7ok16fwui', // Collateral — Mann and Cruise, professionals at work
  'cmtf5k7d300ihezj8ia4ker92', // Source Code — sci-fi puzzle box; Memento and In Time LIKED
  'cmtf5ipv10050ezj8z9lf7uzw', // Elysium — Matt Damon sci-fi; The Martian and Air LIKED
  'cmtf5im4f0045ezj84i9cvhtd', // Den of Thieves — heist between armed professionals
  'cmtf5id5k001yezj8aqhkh5yo', // Nuremberg — WWII aftermath, the Oppenheimer lane
  'cmtf5jx0000fxezj8or625wuv', // Monty Python and the Holy Grail — moved here by the family; comedy signal is thin but this is the canonical one
  'cmtqvtxju001pcox7kjlslwhw', // Star Trek (2009) — J.J. Abrams, who made the LIKED Force Awakens
  'cmtf5iq660055ezj8qz0cmqgi', // Rocky II
  'cmtf5j0ka007yezj86i29fr0s', // Logan — the grounded western of the superhero films, unlike the DISLIKED MCU entries
  'cmtf5ilxp0042ezj8214346um', // Wind River — Taylor Sheridan, the Sicario register the rule keeps
  'cmtqvukqv007tcox750nkqq0q', // The Killer (2023) — Fincher, who made the LIKED Gone Girl
  'cmtf5jhx000ckezj81tykxjwy', // The Usual Suspects — twist-structure crime; Memento LIKED
  'cmtqvuslj009vcox74lor26a1', // Rocky III
  'cmtf5iazv001fezj8ov2qox69', // A Quiet Place Part II — creature survival; World War Z LIKED
  'cmtf5ig7h002oezj8m25xim00', // A Quiet Place: Day One
  'cmtqvugso006rcox7mgxd48cg', // Aliens — sci-fi combat, the Matrix shelf
  'cmtf5ioi7004pezj8iicyy7yp', // Rocky IV
  'cmtf5jvcp00fkezj8hcoqfui7', // L.A. Confidential — Russell Crowe crime ensemble; The Next Three Days LIKED
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
