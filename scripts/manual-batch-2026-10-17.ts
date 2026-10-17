// Manual catalog refresh, 2026-10-17.
//
// Written by Claude in a Claude Code session, per
// .claude/skills/manual-catalog-refresh/SKILL.md. The deployed app has no
// Anthropic API access, so content scores and ranking order only exist
// because they are written here. Kept in the repo as a record of what was
// written and why; not meant to be re-run.
//
// This run also cleared a 68-title exclusion review queue — those verdicts
// live in scripts/review-exclusions.ts and were applied before this script,
// so the candidate sets below already reflect them.

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

const AI = 'AI assessment from general knowledge'
const LOWCONF =
  'AI estimate with lower confidence — could not confirm details on this specific title; treat cautiously.'

const CONTENT_RATINGS: ContentRating[] = [
  {
    id: 'cmv4wanry00jdm9fr6vxf63xc',
    name: "Oasis: Don't Look Back in Anger",
    violence: 1,
    language: 8,
    sexNudity: 1,
    scariness: 0,
    sourceNotes: `${LOWCONF} Treated as a 2026 Oasis music documentary: the R almost certainly rides on constant Gallagher-brothers profanity rather than on anything depicted.`,
  },
  {
    id: 'cmv4wacwe00gem9frihng3cdq',
    name: 'Murder Mystery 2',
    violence: 5,
    language: 4,
    sexNudity: 2,
    scariness: 2,
    sourceNotes: `${AI} (Murder Mystery 2, 2023): Sandler/Aniston caper comedy — shootouts, a kidnapping and bloodless bodies played for laughs, plus mild innuendo.`,
  },
  {
    id: 'cmv4wabka00g1m9fr9lkakfua',
    name: 'The Ice Road',
    violence: 5,
    language: 4,
    sexNudity: 0,
    scariness: 3,
    sourceNotes: `${AI} (The Ice Road, 2021): Liam Neeson disaster-thriller — mine collapse, drownings through ice and a few shootings; tense rather than gory.`,
  },
  {
    id: 'cmv4waayh00fvm9fru5ue1u4y',
    name: 'Donnie Brasco',
    violence: 8,
    language: 9,
    sexNudity: 4,
    scariness: 4,
    sourceNotes: `${AI} (Donnie Brasco, 1997): mob drama with a graphic dismemberment scene and several executions; profanity is close to wall-to-wall. Strip-club nudity, no real sex scenes.`,
  },
  {
    id: 'cmv4wa8ke00f8m9frt7ltlnod',
    name: 'Murder Mystery',
    violence: 4,
    language: 4,
    sexNudity: 2,
    scariness: 2,
    sourceNotes: `${AI} (Murder Mystery, 2019): comic whodunnit violence — stabbings and a car chase, none of it dwelt on.`,
  },
  {
    id: 'cmv4wa3x200dzm9frpmb4g6nd',
    name: 'Less of a Stranger',
    violence: 3,
    language: 6,
    sexNudity: 3,
    scariness: 2,
    sourceNotes: `${LOWCONF} A 2026 title I cannot place; scored as a generic R-rated contemporary drama, where the rating usually rests on language and theme rather than depiction.`,
  },
  {
    id: 'cmv4w9ter00b4m9fraychx8tm',
    name: 'Animals',
    violence: 5,
    language: 6,
    sexNudity: 3,
    scariness: 4,
    sourceNotes: `${LOWCONF} A 2026 Ben Affleck title I cannot confirm details on; generic R-rated-drama estimate.`,
  },
  {
    id: 'cmv4w96g40053m9frh8zyfw19',
    name: 'Total Recall',
    violence: 7,
    language: 4,
    sexNudity: 3,
    scariness: 3,
    sourceNotes: `${AI} (Total Recall, 2012): near-continuous gunfights and android destruction, largely bloodless. Brief non-sexual nudity carried over from the original's three-breasted gag.`,
  },
  {
    id: 'cmv4w967f0051m9frbt8jndvy',
    name: 'Reign of Fire',
    violence: 6,
    language: 3,
    sexNudity: 0,
    scariness: 6,
    sourceNotes: `${AI} (Reign of Fire, 2002): dragons incinerate people on screen; grim post-apocalyptic dread drives the scariness above the violence.`,
  },
  {
    id: 'cmv4w963d0050m9fr8v8ufki5',
    name: 'Bird on a Wire',
    violence: 5,
    language: 5,
    sexNudity: 3,
    scariness: 2,
    sourceNotes: `${AI} (Bird on a Wire, 1990): action-comedy shootouts and a zoo-set climax; brief rear nudity and innuendo.`,
  },
  {
    id: 'cmv4w95nu004wm9frojleon3v',
    name: 'My Spy',
    violence: 4,
    language: 4,
    sexNudity: 1,
    scariness: 1,
    sourceNotes: `${AI} (My Spy, 2020): Bautista family action-comedy — an opening arms-deal shootout, then mostly slapstick.`,
  },
  {
    id: 'cmv4w94y0004pm9fr7nw6as47',
    name: 'My Spy The Eternal City',
    violence: 4,
    language: 4,
    sexNudity: 1,
    scariness: 1,
    sourceNotes: `${AI} (My Spy The Eternal City, 2024): same register as the first — a nuclear-device plot played broadly for kids.`,
  },
  {
    id: 'cmv4w93wp004fm9fra3yuwbg6',
    name: 'Lord of War',
    violence: 7,
    language: 7,
    sexNudity: 5,
    scariness: 3,
    sourceNotes: `${AI} (Lord of War, 2005): arms-dealing drama with massacre aftermaths and an execution; sustained drug use, and a sex scene plus nudity in the Ukraine and Liberia sections.`,
  },
  {
    id: 'cmv4w93sx004em9frzbwrkgk5',
    name: 'Crouching Tiger, Hidden Dragon',
    violence: 5,
    language: 1,
    sexNudity: 2,
    scariness: 2,
    sourceNotes: `${AI} (Crouching Tiger Hidden Dragon, 2000): wuxia swordplay — frequent but stylised and nearly bloodless; one restrained love scene.`,
  },
  {
    id: 'cmv4w93p5004dm9frnhuy2rhn',
    name: 'GoldenEye',
    violence: 6,
    language: 3,
    sexNudity: 3,
    scariness: 2,
    sourceNotes: `${AI} (GoldenEye, 1995): Bond gunplay and a tank chase; Xenia Onatopp's killings have a sexualised edge, and there is implied sex without nudity.`,
  },
  {
    id: 'cmv4w93c6004am9fr1s8gyo7g',
    name: 'Die Another Day',
    violence: 6,
    language: 3,
    sexNudity: 3,
    scariness: 3,
    sourceNotes: `${AI} (Die Another Day, 2002): Bond action throughout; the title sequence depicts a prolonged torture, which is the one genuinely unpleasant stretch.`,
  },
  {
    id: 'cmv4w93180047m9fr45c2nr42',
    name: 'Oh. What. Fun.',
    violence: 1,
    language: 4,
    sexNudity: 1,
    scariness: 1,
    sourceNotes: `${LOWCONF} Read as a 2025 Christmas family comedy; scored as a PG-13 holiday comedy where the rating rests on language and adult humour.`,
  },
  {
    id: 'cmv4w92tr0045m9frsqnj2elg',
    name: 'Six Days Seven Nights',
    violence: 4,
    language: 4,
    sexNudity: 3,
    scariness: 2,
    sourceNotes: `${AI} (Six Days Seven Nights, 1998): island adventure-comedy — a pirate shootout and a plane crash; innuendo and a brief towel scene.`,
  },
  {
    id: 'cmv4w92m80043m9frfjvw5hp3',
    name: 'Tomorrow Never Dies',
    violence: 6,
    language: 3,
    sexNudity: 3,
    scariness: 2,
    sourceNotes: `${AI} (Tomorrow Never Dies, 1997): heavy Bond gunplay and a motorcycle chase; implied sex, no nudity.`,
  },
  {
    id: 'cmv4w8w6j002dm9fr9gt9ayec',
    name: 'Godzilla x Kong: The New Empire',
    violence: 6,
    language: 2,
    sexNudity: 0,
    scariness: 4,
    sourceNotes: `${AI} (Godzilla x Kong, 2024): sustained monster brawling and city destruction; the peril is spectacle, with little human harm shown.`,
  },
  {
    id: 'cmv4w8vgi0026m9fr1ae5jhdy',
    name: 'Heat',
    violence: 8,
    language: 8,
    sexNudity: 4,
    scariness: 4,
    sourceNotes: `${AI} (Heat, 1995): the downtown shootout and the heists are prolonged and bloody, and a serial-killer subplot turns grim; constant profanity, brief nudity.`,
  },
  {
    id: 'cmv4w8niy0002m9fr6yh9np89',
    name: 'The Whistler',
    violence: 6,
    language: 7,
    sexNudity: 3,
    scariness: 5,
    sourceNotes: `${LOWCONF} A 2026 title I cannot place; scored as a generic R-rated thriller.`,
  },
  {
    id: 'cmuuw8f8k00m5f329jlf2avrr',
    name: 'O Brother, Where Art Thou?',
    violence: 4,
    language: 4,
    sexNudity: 2,
    scariness: 3,
    sourceNotes: `${AI} (O Brother Where Art Thou?, 2000): comic-register violence with a few real deaths; a Klan rally and a lynching threat are the dark beats, and the sirens scene is suggestive rather than explicit.`,
  },
  {
    id: 'cmuuw8dwj00luf329mhriyvdd',
    name: 'The World Is Not Enough',
    violence: 6,
    language: 3,
    sexNudity: 4,
    scariness: 2,
    sourceNotes: `${AI} (The World Is Not Enough, 1999): Bond action plus a garrote-chair torture scene; more sexual content than the surrounding entries, still without explicit nudity.`,
  },
  {
    id: 'cmuuw8cg600lif3291zesys7h',
    name: 'Lone Survivor',
    violence: 9,
    language: 8,
    sexNudity: 0,
    scariness: 6,
    sourceNotes: `${AI} (Lone Survivor, 2013): relentless and graphic combat — gunshot wounds, falls down a mountainside, an execution; realistic military profanity throughout.`,
  },
  {
    id: 'cmuuw8bpr00lcf329coqbdjso',
    name: "Winter's Bone",
    violence: 5,
    language: 6,
    sexNudity: 1,
    scariness: 5,
    sourceNotes: `${AI} (Winter's Bone, 2010): one severe off-hand beating and a grim corpse-retrieval scene; the dread of the meth-country setting does more than the violence count suggests.`,
  },
  {
    id: 'cmuuw8b3v00l7f329zzxcm13m',
    name: 'Idiocracy',
    violence: 3,
    language: 7,
    sexNudity: 5,
    scariness: 1,
    sourceNotes: `${AI} (Idiocracy, 2006): crude throughout — a monster-truck arena sequence, constant profanity, and wall-to-wall sexual jokes and signage, but no explicit scenes.`,
  },
  {
    id: 'cmuuw8auy00l5f329i4xglahp',
    name: 'Infinite',
    violence: 6,
    language: 4,
    sexNudity: 1,
    scariness: 2,
    sourceNotes: `${AI} (Infinite, 2021): continuous sci-fi gunplay and vehicle chases, stylised and largely bloodless.`,
  },
  {
    id: 'cmuuw8aqf00l4f329110blrei',
    name: 'Quantum of Solace',
    violence: 7,
    language: 3,
    sexNudity: 3,
    scariness: 2,
    sourceNotes: `${AI} (Quantum of Solace, 2008): the most relentlessly violent of the Craig entries — brutal hand-to-hand kills and chases; implied sex, no nudity.`,
  },
  {
    id: 'cmuuw89vp00kxf329grek9hjq',
    name: 'Spectre',
    violence: 6,
    language: 3,
    sexNudity: 3,
    scariness: 4,
    sourceNotes: `${AI} (Spectre, 2015): Bond action plus a drill-torture sequence and an eye-gouging, which lift the scariness above the series norm.`,
  },
]

// ---------------------------------------------------------------------------
// Hand-ranked order, best fit first. One comment per id giving the specific
// match in the family's rated history.
// ---------------------------------------------------------------------------

// FAMILY. The history is overwhelmingly Pixar / Disney Animation /
// DreamWorks / Illumination, plus the original Star Wars trilogy and
// Apollo 13. The clearest negative signals are the Shrek and Ice Age
// sequels, the live-action princess remakes, and the fairy-tale catalogue.
const FAMILY_TOP_ORDER: string[] = [
  'cmtf5jfie00byezj8p2ngenfe', // How to Train Your Dragon (2010) — the 2025 remake is LOVED; Chris Sanders also directed The Wild Robot (LOVED)
  'cmtf5jgj000c5ezj80kf8nu7b', // How to Train Your Dragon 2 — Dean DeBlois, same series
  'cmtf5iy0n007bezj8kao41w9w', // Toy Story 2 — Toy Story is LOVED
  'cmtf5iwvh006zezj81yue2bmk', // Toy Story 3 — same series
  'cmtf5j082007tezj89mkjtka5', // Toy Story 4 — same series
  'cmv4wadxa00gom9frs9i5adys', // Toy Story 5 — same series, and Andrew Stanton wrote/directed WALL·E (LOVED)
  'cmtf5j3i4008tezj82dtrnc66', // The Empire Strikes Back — Star Wars (1977) is LOVED; the prequels are not
  'cmtf5jd5e00b3ezj8vf4a4te3', // Return of the Jedi — same trilogy
  'cmtf5ixr00077ezj8ko0nke0g', // Inside Out — Pete Docter, who made Up (LOVED) and Soul (LIKED)
  'cmtf5iwbb006vezj8h9z29vbz', // Inside Out 2 — same
  'cmtf5j8fl009xezj8j5u41ow3', // Finding Dory — Finding Nemo is LIKED, Stanton again
  'cmu0vysio00g7h0gu4sokqvpu', // Wish Dragon — Chris Appelhans directed KPop Demon Hunters (LOVED)
  'cmu0vylov00eoh0gu7t43e0y6', // The Sea Beast — Chris Williams directed Big Hero 6 (LOVED)
  'cmtf5j2r3008iezj8xeygm6bl', // Elemental — Peter Sohn directed The Good Dinosaur (LOVED)
  'cmtf5j6u8009hezj843mxge79', // Elio — original Pixar sci-fi, the strongest Family pattern there is
  'cmtf5j4t30091ezj82rgk9gxr', // A Bug's Life — Lasseter/Stanton Pixar, alongside Toy Story and Cars (both LOVED)
  'cmtf5iezx002fezj8it8add9d', // The Bad Guys — DreamWorks heist comedy in the Mitchells vs. the Machines register (LOVED)
  'cmtf5ibhd001iezj8ev6wk7ax', // The Bad Guys 2 — same
  'cmtf5j2xt008lezj8ieycrebc', // Ralph Breaks the Internet — Wreck-It Ralph is LIKED
  'cmtf5jir100cpezj8js5bi5l6', // Migration — Illumination, as with Despicable Me 2 (LOVED)
  'cmtdn2glm003drvj4621nxyc6', // The Super Mario Galaxy Movie — The Super Mario Bros. Movie is LIKED, same directors
  'cmtf5iy53007dezj8hdvp7x73', // Moana 2 — Disney Animation, the Encanto/Frozen/Zootopia cluster they rate LIKED
  'cmukw3z5000apuz1wc3c08moa', // Meet the Robinsons — Disney sci-fi comedy close to Meet the Robinsons' sibling Big Hero 6
  'cmukw3ztl00avuz1w4wg6gyy2', // Spies in Disguise — animated spy comedy; Tom Holland and Will Smith, Blue Sky/Chernin register
  'cmv4w9b0f006bm9frr882o8da', // The Grinch (2018) — Illumination, and the 1966 Grinch is LIKED
  'cmuuw6423003ff329z4kj7l7p', // The Adventures of Tintin — Spielberg adventure; the family's live-action likes are adventure, not fairy tale
  'cmuuw61xl002yf329bt807tu3', // Close Encounters of the Third Kind — the Apollo 13 slot: awe-driven, grown-up but G-ish sci-fi
  'cmuuw6siv008xf3293mfljjqo', // Horton Hears a Who! — Ken Daurio wrote it, as he did Despicable Me 2 (LOVED)
  'cmtf5k9xg00j6ezj83nj1q9es', // Dog Man — DreamWorks, same broad-comedy lane as The Bad Guys
  'cmv4wadlr00glm9frxvnwwcjm', // Antz — PDI/DreamWorks; pairs with A Bug's Life
]

// ADULT. The history splits into four clear veins: cerebral sci-fi
// (Interstellar and The Matrix are LOVED), war (1917 LOVED; All Quiet,
// The Hurt Locker, American Sniper LIKED), espionage and heist thrillers
// (Mission: Impossible LOVED; Jack Reacher, Inside Man, The Gentlemen
// LIKED), and martial arts (Ip Man LOVED). The strong negative signal is
// late-period superhero films and Dwayne Johnson vehicles, plus horror.
const ADULT_TOP_ORDER: string[] = [
  'cmuuw6h82006df3295i4bm2fh', // The Prestige — Nolan; Interstellar is LOVED, Memento and Oppenheimer LIKED
  'cmuuw5rr3000pf3296vwlvtrr', // Arrival — Villeneuve's cerebral first-contact film, the Interstellar/Project Hail Mary vein
  'cmuuw5rw1000qf329yw0e9oel', // Saving Private Ryan — 1917 is LOVED, All Quiet on the Western Front LIKED
  'cmuaw28ua00lw132gqlutjphp', // Zero Dark Thirty — Kathryn Bigelow, who made The Hurt Locker (LIKED); cleared from the review queue this run
  'cmuuw810d00ixf329ez1ujs3t', // Casino Royale — cleared this run; the spy lane that Mission: Impossible (LOVED) and Jack Reacher sit in
  'cmuuw86rf00k8f3295rucodjq', // Skyfall — Sam Mendes, who directed 1917 (LOVED)
  'cmukw2qy80006uz1wqsmqy88m', // Top Gun: Maverick — Tom Cruise; M:I - The Final Reckoning is LOVED
  'cmuuw6jjq006wf329a2zhndfd', // The Bourne Identity — Doug Liman (Mr. & Mrs. Smith, LIKED); the Jack Reacher register
  'cmuuw6tzh0099f3295f2tlzam', // The Bourne Supremacy — same series
  'cmuuw6se1008wf3296v89785u', // The Bourne Ultimatum — same series
  'cmuuw84jc00jqf329t5hpo657', // Minority Report — Spielberg and Cruise doing idea-driven sci-fi, like In Time (LIKED)
  'cmuuw8cg600lif3291zesys7h', // Lone Survivor — the American Sniper / Hurt Locker slot exactly
  'cmuuw7rtp00gvf329hrucwhwn', // Blade Runner 2049 — Villeneuve again; The Matrix is LOVED
  'cmv4w8vgi0026m9fr1ae5jhdy', // Heat — Michael Mann crime epic; Inside Man and The Gentlemen are LIKED
  'cmtf5k7d300ihezj8ia4ker92', // Source Code — one-idea time-loop thriller, the Memento/In Time pattern
  'cmuuw5rmf000of329l4qrhwjp', // Catch Me If You Can — charming true-crime caper; The Big Short and War Dogs are LIKED
  'cmuuw6g4x0064f3298h44kycf', // The Equalizer — cleared this run; Denzel, as in Inside Man (LIKED)
  'cmukw3ds2005iuz1wz5xtael2', // Society of the Snow — cleared this run; survival endurance, as with 127 Hours (LIKED)
  'cmuuw67ac0045f3297341tbri', // Cloverfield — cleared this run; creature survival, as with World War Z and Bird Box (both LIKED)
  'cmuuw89vp00kxf329grek9hjq', // Spectre — Mendes Bond
  'cmuuw7w4n00huf329makav4ww', // No Time to Die — the Craig run they have not rated
  'cmv4w93p5004dm9frnhuy2rhn', // GoldenEye — the best-regarded Brosnan entry
  'cmuuw8aqf00l4f329110blrei', // Quantum of Solace — same series
  'cmtf5ieqn002bezj8ha9oxloc', // The Hunger Games: The Ballad of Songbirds & Snakes — all four earlier Hunger Games films are LIKED
  'cmtqvvz2h00l5cox7y3mybamm', // Crimson Tide — Denzel submarine thriller; the Tony Scott/military-procedural lane
  'cmuaw1qgi00he132gv8288v0n', // The Ministry of Ungentlemanly Warfare — Guy Ritchie (The Gentlemen, LIKED) plus WWII
  'cmuuw82xs00jdf329ggo6q1xc', // Guy Ritchie's The Covenant — Ritchie again, in the Afghanistan-war register of American Sniper
  'cmuuw5t4m0010f3290tpd5fr2', // War of the Worlds (2005) — Spielberg/Cruise invasion thriller; Signs and Bird Box are LIKED
  'cmtf5j9h700a7ezj8m329zqgc', // Indiana Jones and the Last Crusade — Dial of Destiny and Solo are LIKED
  'cmtqvvxwc00kxcox7woua3eck', // Patriots Day — Peter Berg true-event procedural, same shelf as Lone Survivor
]

async function writeContentScores() {
  let written = 0
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
    written += 1
  }
  console.log(`Wrote ${written} content score(s).`)
}

async function writeRankingCache(mode: 'FAMILY' | 'ADULT', topOrder: string[]) {
  // Re-fetch rather than reusing the inspection dump: ratings may have
  // moved since, and the fingerprint has to match what the route computes.
  const [titles, tasteHistory] = await Promise.all([
    prisma.title.findMany({ where: { familyId: 'default' }, include: { contentScore: true } }),
    prisma.tasteRating.findMany({ where: { familyId: 'default', mode }, include: { title: true } }),
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

  const candidateIds = notSeenCandidates.map((c) => c.id)
  const validTop = topOrder.filter((id) => candidateIds.includes(id))
  const remainder = candidateIds.filter((id) => !validTop.includes(id))
  const rankedIds = [...validTop, ...remainder]

  // Non-negotiable: a candidate missing from rankedIds does not fall to the
  // bottom of the dashboard, it disappears from it.
  if (rankedIds.length !== candidateIds.length) {
    throw new Error(
      `${mode}: rankedIds (${rankedIds.length}) does not cover candidateIds (${candidateIds.length}) — refusing to write`
    )
  }

  const dropped = topOrder.filter((id) => !candidateIds.includes(id))
  if (dropped.length > 0) {
    console.warn(`${mode}: ${dropped.length} hand-ranked id(s) are no longer candidates: ${dropped.join(', ')}`)
  }

  const inputFingerprint = computeRankingFingerprint(candidateIds, history)
  await prisma.rankingCache.upsert({
    where: { familyId_mode: { familyId: 'default', mode } },
    update: { inputFingerprint, rankedIds },
    create: { familyId: 'default', mode, inputFingerprint, rankedIds },
  })

  console.log(`${mode}: wrote ${rankedIds.length} ranked id(s), ${validTop.length} of them hand-ranked.`)
}

async function main() {
  await writeContentScores()
  await writeRankingCache('FAMILY', FAMILY_TOP_ORDER)
  await writeRankingCache('ADULT', ADULT_TOP_ORDER)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
