// Manual catalog refresh, 2026-09-05.
//
// Content scores and rankings are produced here by Claude's own judgment
// and written straight to the database — the app has no Anthropic API
// access and cannot generate either. Picks are specific to this run; this
// is a record of what was written and why, not meant to be re-run.
//
// Usage: npx tsx scripts/manual-batch-2026-09-05.ts

import { prisma } from '../src/lib/prisma'
import { isTitleVisible } from '../src/lib/filtering'
import { computeRankingFingerprint, type TasteHistoryEntry } from '../src/lib/ranking'

const HIDDEN_AFTER_RATING = new Set(['DISLIKED', 'LIKED', 'TOO_INAPPROPRIATE', 'NOT_INTERESTED'])
const MOVED_TO_OWN_SECTION = new Set(['LOVED', 'WATCHLISTED'])

// 0-10 per dimension. sourceNotes states the basis honestly, including
// lower confidence where the title is one I'm less sure of — that field
// exists so a human reading it later knows how much to trust the numbers.
const CONTENT_RATINGS = [
  {
    id: 'cmtgukp7c00em11utal0jyrl4', // 13 Minutes (2021)
    violence: 5, language: 3, sexNudity: 2, scariness: 6,
    sourceNotes: 'AI assessment with moderate confidence (13 Minutes, 2021): tornado disaster ensemble. Storm peril, injuries and destruction; a teen-pregnancy storyline handled without explicit content. Smaller film — treat the numbers as approximate.',
  },
  {
    id: 'cmtf5kakv00jbezj8i2p865xd', // Clueless (1995)
    violence: 1, language: 4, sexNudity: 4,  scariness: 1,
    sourceNotes: 'AI assessment from general knowledge (Clueless, 1995): teen comedy. Frequent frank talk about virginity, dating and drugs with nothing explicit shown; one brief mugging. Mild language throughout.',
  },
  {
    id: 'cmtf5k6gc00iaezj8qqvf2qhz', // Promising Young Woman (2020)
    violence: 7, language: 7, sexNudity: 6, scariness: 6,
    sourceNotes: 'AI assessment from general knowledge (Promising Young Woman, 2020): revenge thriller built entirely around sexual assault and its aftermath. Predatory situations throughout, a brutal late murder, pervasive strong language. Thematically heavy well beyond what the numbers convey.',
  },
  {
    id: 'cmtf5jrci00ekezj8zu5v72w6', // Death Race (2008)
    violence: 8, language: 7, sexNudity: 4, scariness: 3,
    sourceNotes: 'AI assessment from general knowledge (Death Race, 2008): prison-set vehicular action. Frequent gory deaths, heavy profanity, brief sexualized content. Violence is spectacle rather than dread.',
  },
  {
    id: 'cmtf5jqsg00ecezj8w95mwlol', // A Man Called Otto (2022)
    violence: 2, language: 4, sexNudity: 1, scariness: 2,
    sourceNotes: 'AI assessment from general knowledge (A Man Called Otto, 2022): grief drama. Note for parents: repeated on-screen suicide attempts by the lead are central to the film — the low violence score does not capture that.',
  },
  {
    id: 'cmtf5jmwe00doezj8wx7fefug', // Another Simple Favor (2025)
    violence: 5, language: 7, sexNudity: 5, scariness: 3,
    sourceNotes: 'AI estimate with lower confidence (Another Simple Favor, 2025): comedy-thriller sequel. Scored in line with the first film — dark comedy, murder plotting, strong language and sexual content — but I could not confirm specifics of this entry. Treat cautiously.',
  },
  {
    id: 'cmtf5j3fu008sezj81o5dyglm', // Eternals (2021)
    violence: 6, language: 3, sexNudity: 3, scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (Eternals, 2021): Marvel ensemble. Sustained superhero combat, monster attacks, and a brief non-explicit sex scene — unusual for the studio but tame in absolute terms.',
  },
  {
    id: 'cmtf5iksm003tezj8okoajfnj', // Anatomy of a Fall (2023)
    violence: 3, language: 6, sexNudity: 4, scariness: 2,
    sourceNotes: 'AI assessment from general knowledge (Anatomy of a Fall, 2023): French courtroom drama. A death and its aftermath shown briefly; the frankness is verbal — an explicit recorded argument and candid testimony about the marriage — rather than visual.',
  },
  {
    id: 'cmtf5ijub003mezj81vigli8x', // Glass Onion (2022)
    violence: 4, language: 4, sexNudity: 1, scariness: 2,
    sourceNotes: 'AI assessment from general knowledge (Glass Onion, 2022): whodunit. A shooting and a poisoning played for plot rather than gore; scattered profanity; nothing sexual.',
  },
  {
    id: 'cmtf5igjo002tezj8dzdk8n8u', // The Northman (2022)
    violence: 9, language: 4, sexNudity: 6, scariness: 6,
    sourceNotes: 'AI assessment from general knowledge (The Northman, 2022): Viking revenge epic. Extremely graphic battle violence including a village massacre, full nudity, and hallucinatory ritual sequences. Among the most violent films in this catalog.',
  },
  {
    id: 'cmtf5igc4002qezj8jlujf947', // Nope (2022)
    violence: 6, language: 6, sexNudity: 1, scariness: 8,
    sourceNotes: 'AI assessment from general knowledge (Nope, 2022): Jordan Peele sci-fi horror. Much of the carnage is implied rather than shown, but the chimpanzee sequence and the abductions are genuinely frightening. High on dread, low on gore.',
  },
  {
    id: 'cmtf5ig7h002oezj8m25xim00', // A Quiet Place: Day One (2024)
    violence: 6, language: 3, sexNudity: 0, scariness: 8,
    sourceNotes: 'AI assessment from general knowledge (A Quiet Place: Day One, 2024): alien-invasion survival. Sustained tension and jump scares, on-screen deaths that are quick rather than lingering, minimal language and no sexual content.',
  },
  {
    id: 'cmtf5ieqn002bezj8ha9oxloc', // Hunger Games: Ballad of Songbirds & Snakes (2023)
    violence: 7, language: 2, sexNudity: 1, scariness: 5,
    sourceNotes: 'AI assessment from general knowledge (The Hunger Games: The Ballad of Songbirds & Snakes, 2023): dystopian prequel. Teenagers killing teenagers in an arena, plus a poisoning and hangings — bloodless by PG-13 convention but grim in substance.',
  },
  {
    id: 'cmtf5iazv001fezj8ov2qox69', // A Quiet Place Part II (2021)
    violence: 6, language: 2, sexNudity: 0, scariness: 8,
    sourceNotes: 'AI assessment from general knowledge (A Quiet Place Part II, 2021): creature survival. Opens with an extended invasion sequence; relentless tension, several character deaths, almost no language and nothing sexual.',
  },
  {
    id: 'cmtf5iafg0019ezj8ks13qt62', // Green Book (2018)
    violence: 3, language: 6, sexNudity: 2, scariness: 2,
    sourceNotes: 'AI assessment from general knowledge (Green Book, 2018): 1960s road-trip drama. Note the language score is driven by repeated racial slurs used to depict period racism, plus a beating and a bar altercation.',
  },
]

// Hand-ranked, best fit first. Signal read from the taste history:
// Pixar and Chris Sanders / Dean DeBlois land hardest; Star Wars originals
// are loved while the prequel was disliked; the princess canon and
// franchise-sequel churn (Shrek, Ice Age, Kung Fu Panda, Minions) are
// consistently rejected, as are live-action Disney remakes.
const FAMILY_TOP_ORDER: string[] = [
  'cmtf5ixr00077ezj8ko0nke0g', // Inside Out — Pete Docter, who made Up (LOVED) and Soul/Monsters Inc (LIKED)
  'cmtf5jfie00byezj8p2ngenfe', // How to Train Your Dragon (2010) — Chris Sanders, who made The Wild Robot (LOVED); the 2025 remake is also LOVED
  'cmtf5jgj000c5ezj80kf8nu7b', // HTTYD 2 — Dean DeBlois, HTTYD 2025 (LOVED) and Lilo & Stitch (LIKED)
  'cmtf5iuew006bezj8p00gym6a', // Toy Story — foundational Pixar; six Pixar titles sit in LOVED
  'cmtf5izvt007sezj8fkgy9ykb', // Ratatouille — Brad Bird, The Incredibles (LOVED)
  'cmtf5j8fl009xezj8j5u41ow3', // Finding Dory — Andrew Stanton, WALL·E (LOVED) and Finding Nemo (LIKED)
  'cmtf5iy0n007bezj8kao41w9w', // Toy Story 2
  'cmtf5iwvh006zezj81yue2bmk', // Toy Story 3 — Lee Unkrich, Coco (LIKED)
  'cmtf5iwbb006vezj8h9z29vbz', // Inside Out 2 — sequel to the top pick
  'cmtf5j6u8009hezj843mxge79', // Elio — Pixar in space, closest thing to WALL·E (LOVED)
  'cmtf5j2r3008iezj8xeygm6bl', // Elemental — Peter Sohn, The Good Dinosaur (LOVED)
  'cmtf5j3i4008tezj82dtrnc66', // The Empire Strikes Back — Star Wars 1977 is LOVED
  'cmtf5jd5e00b3ezj8vf4a4te3', // Return of the Jedi — same trilogy
  'cmtf5k5fj00hyezj8poer1eht', // Megamind — superhero comedy, matching Incredibles and Big Hero 6 (both LOVED)
  'cmtf5iezx002fezj8it8add9d', // The Bad Guys — modern DreamWorks, the studio behind two LOVED titles
  'cmtf5ibhd001iezj8ev6wk7ax', // The Bad Guys 2
  'cmtf5j4t30091ezj82rgk9gxr', // A Bug's Life — Lasseter Pixar
  'cmtf5j1220082ezj8hz9ozxyw', // Cars — Lasseter Pixar
  'cmtf5iypn007iezj8xtzwwhzz', // Cars 3 — the best-regarded of the sequels
  'cmtf5j1az0086ezj86wia40n7', // Raiders of the Lost Ark — practical adventure, sits with Star Wars 1977
  'cmtf5ja8q00adezj87281mj2q', // Treasure Planet — animated space adventure
  'cmtf5j79p009kezj8elyuunrj', // Tomorrowland — Brad Bird again, optimistic sci-fi
  'cmtguk9be00ax11ut2c2u19s2', // TRON: Legacy — sci-fi spectacle
  'cmtf5jir100cpezj8js5bi5l6', // Migration — modern animated comedy, in line with Sing (LIKED)
  'cmtf5k9xg00j6ezj83nj1q9es', // Dog Man — recent DreamWorks
  'cmtguk9ws00b211utqy6hdgsu', // Honey, I Shrunk the Kids — family sci-fi adventure
  'cmtf5ja6k00acezj8fv59xhs6', // National Treasure — adventure/puzzle
  'cmtguk97k00aw11ut1gk9b3py', // Mary Poppins — Julie Andrews, as in The Princess Diaries (LIKED)
  'cmtf5jjmb00czezj81cc8ztag', // It's a Wonderful Life — family classic
  'cmtf5k7hy00ijezj8sf1k277k', // Fantastic Mr. Fox — distinctive animation, not franchise churn
]

// Adult signal: Nolan and the Russos recur across LOVED/LIKED, war films
// land well (1917 LOVED, All Quiet and Troy LIKED), and procedural
// thrillers do too. Solo superhero origin films, horror, teen romance and
// the Spider-Man/Avatar franchises are consistently rejected.
const ADULT_TOP_ORDER: string[] = [
  'cmtf5iaat0017ezj8tvmqnx17', // Memento — Nolan; Interstellar (LOVED) and Oppenheimer (LIKED)
  'cmtf5k40l00hoezj80z4mjm8e', // The Matrix Reloaded — direct sequel to The Matrix (LOVED)
  'cmtf5k5m600i1ezj8ho4wwllm', // The Matrix Revolutions — same trilogy
  'cmtf5j3x7008wezj8q44i0gwk', // Captain America: The Winter Soldier — Joe Russo, four Russo titles in LIKED
  'cmtdn2cnr001mrvj4mh2r2ek3', // Captain America: Civil War — Russo ensemble, the format that works here
  'cmtdn29q2000hrvj4tnze88bz', // Schindler's List — WWII; 1917 (LOVED), All Quiet (LIKED)
  'cmtf5jr3a00egezj8nevz9q7g', // The Hurt Locker — Kathryn Bigelow, A House of Dynamite (LIKED)
  'cmtf5khp300l0ezj8kyckvs8c', // K-19 — Bigelow again, submarine procedural
  'cmtf5jhfh00cdezj8esgqxejr', // The Pianist — WWII survival
  'cmtf5ig9v002pezj889zc8imc', // American Sniper — modern war
  'cmtf5ijub003mezj81vigli8x', // Glass Onion — Rian Johnson, The Last Jedi (LIKED)
  'cmtf5ie990029ezj8us38466u', // Wake Up Dead Man — newest Rian Johnson mystery
  'cmtf5i8ah000rezj8d4lpuee1', // Gone Girl — Fincher procedural, in line with Inside Man (LIKED)
  'cmtf5jhx000ckezj81tykxjwy', // The Usual Suspects — structural twist thriller, pairs with Memento
  'cmtf5j9h700a7ezj8m329zqgc', // Indiana Jones and the Last Crusade — Spielberg adventure
  'cmtf5jhol00chezj8n20yv175', // Gladiator II — Ridley Scott (The Martian, LIKED); Troy (LIKED) is the same register
  'cmtf5iyjz007gezj8djtbiqn9', // Guardians of the Galaxy Vol. 2 — the first is LIKED
  'cmtf5itfv0066ezj87ipra41c', // Guardians of the Galaxy Vol. 3
  'cmtf5ipv10050ezj8z9lf7uzw', // Elysium — Matt Damon sci-fi; The Martian (LIKED)
  'cmtf5jo3k00dzezj83hir884i', // The Amateur — spy procedural, like Jack Ryan (LIKED)
  'cmtf5ijpn003kezj86gkm2ic9', // Extraction 2 — AGBO, who made The Gray Man and The Electric State (both LIKED)
  'cmtf5k7au00igezj817j3j1mc', // Point Break — Bigelow, and Keanu from The Matrix (LOVED)
  'cmtf5jqnz00eaezj85gkw4ps6', // The Last of the Mohicans — Michael Mann historical combat
  'cmtf5k8fv00itezj857fw607j', // The Fabelmans — Spielberg
  'cmtf5k91d00izezj88wggka32', // Robin Hood (2010) — Ridley Scott epic, Troy-adjacent
  'cmtf5k31700hlezj8jdhns4s3', // Pressure — WWII decision-room thriller
  'cmtf5jvv600fnezj8k0gn2ga9', // Brothers — war aftermath drama
  'cmtf5jrq600elezj8v66mhzpi', // Dredd — tight, contained sci-fi action
  'cmtf5iavf001dezj8fwk76js7', // Bugonia — Lanthimos sci-fi thriller; a stretch, ranked accordingly
  'cmtf5izqz007qezj863kucfhb', // Black Panther — well-regarded Marvel, though solo origins have underperformed here
]

async function writeContentScores() {
  let written = 0
  for (const r of CONTENT_RATINGS) {
    const { id, ...score } = r
    await prisma.contentScore.create({ data: { titleId: id, ...score, isUnrated: false, isNC17: false } })
    written++
  }
  console.log(`content scores written: ${written}`)
}

async function writeRankingCache(mode: 'FAMILY' | 'ADULT', topOrder: string[]) {
  const familyId = 'default'

  // Re-fetch rather than reusing the inspection dump — ratings may have moved.
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

  // Not optional: the recommendations route resolves ids through
  // rankedIds.map(...).filter(Boolean), so any candidate missing here
  // vanishes from the dashboard rather than appearing unranked.
  if (rankedIds.length !== candidateIds.length || !candidateIds.every((id) => rankedIds.includes(id))) {
    throw new Error(`${mode}: rankedIds (${rankedIds.length}) does not cover candidateIds (${candidateIds.length})`)
  }

  const fingerprint = computeRankingFingerprint(candidateIds, history)
  await prisma.rankingCache.upsert({
    where: { familyId_mode: { familyId, mode } },
    update: { inputFingerprint: fingerprint, rankedIds },
    create: { familyId, mode, inputFingerprint: fingerprint, rankedIds },
  })

  const dropped = topOrder.length - validTop.length
  console.log(`${mode}: ranked=${rankedIds.length} handPicked=${validTop.length}${dropped > 0 ? ` (${dropped} of my picks are no longer candidates)` : ''}`)
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
