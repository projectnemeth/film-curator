// One-off manual batch, run by Claude directly (not the app's Anthropic API):
// - Content-rates 30 unscored PG-13/R titles based on the assistant's own
//   knowledge of each film (noted honestly in sourceNotes, not sourced from
//   a fetched page).
// - Re-sorts the top of each mode's "not seen" list based on a real read of
//   this household's taste history (loved/liked/disliked patterns), with
//   the untouched remainder appended after in original order so nothing
//   already in the catalog is hidden.

import { prisma } from '../src/lib/prisma'
import { computeRankingFingerprint, type TasteHistoryEntry } from '../src/lib/ranking'
import { isRatingVisibleInMode } from '../src/lib/filtering'

const familyId = 'default'
const HIDDEN_AFTER_RATING = new Set(['DISLIKED', 'LIKED', 'TOO_INAPPROPRIATE', 'NOT_INTERESTED'])

type ContentRating = {
  id: string
  violence: number
  language: number
  sexNudity: number
  scariness: number
  sourceNotes: string
}

const CONTENT_RATINGS: ContentRating[] = [
  { id: 'cmtf5kn3000m7ezj8a3f2qwrv', violence: 6, language: 3, sexNudity: 4, scariness: 4, sourceNotes: "AI assessment from general knowledge (Piranha, 1978): campy creature-feature gore from piranha attacks, brief nudity (skinny-dipping), suspenseful but not graphic by modern standards." },
  { id: 'cmtf5kmy800m5ezj880u74pf8', violence: 5, language: 2, sexNudity: 1, scariness: 6, sourceNotes: "AI assessment from general knowledge (Wish Upon, 2017): PG-13 teen horror, several gruesome-but-restrained death sequences, sustained supernatural tension." },
  { id: 'cmtf5kmvl00m4ezj8awj9w9fy', violence: 3, language: 4, sexNudity: 1, scariness: 1, sourceNotes: "AI assessment from general knowledge (Friday Night Lights, 2004): intense football-field violence, some strong language, heavy themes of pressure and injury." },
  { id: 'cmtf5km8700m3ezj8ikesk5s5', violence: 5, language: 7, sexNudity: 2, scariness: 0, sourceNotes: "AI assessment from general knowledge (Keanu, 2016): comedic gunplay/gang violence played for laughs, frequent strong language, drug references." },
  { id: 'cmtf5km3f00m1ezj8pt9yxia4', violence: 7, language: 5, sexNudity: 1, scariness: 6, sourceNotes: "AI assessment from general knowledge (Better Watch Out, 2017): Christmas home-invasion thriller with a dark twist; graphic violence and disturbing content once the twist lands." },
  { id: 'cmtf5km1200m0ezj8e66e0a2r', violence: 0, language: 2, sexNudity: 3, scariness: 0, sourceNotes: "AI assessment from general knowledge (Book Club: The Next Chapter, 2023): frank but comedic sexual references/innuendo among older-adult characters, mild language, no violence." },
  { id: 'cmtf5klyt00lzezj8m1dgy7jc', violence: 6, language: 1, sexNudity: 0, scariness: 2, sourceNotes: "AI assessment from general knowledge (Ip Man, 2008): martial-arts biopic with wing chun fight sequences and wartime-occupation brutality; minimal language, no nudity." },
  { id: 'cmtf5klwm00lyezj8t6ntt8dt', violence: 5, language: 3, sexNudity: 0, scariness: 2, sourceNotes: "AI assessment from general knowledge (Sharknado, 2013): campy disaster-movie shark violence, played for camp rather than horror; mild language." },
  { id: 'cmtf5kls700lwezj84lse7ohc', violence: 6, language: 3, sexNudity: 3, scariness: 5, sourceNotes: "AI assessment from general knowledge (Prom Night, 1980): stalker-slasher film, moderate (era-typical, less graphic) violence, brief nudity, sustained suspense." },
  { id: 'cmtf5klph00lvezj83gy3hwut', violence: 0, language: 2, sexNudity: 1, scariness: 0, sourceNotes: "AI assessment from general knowledge (Pretty in Pink, 1986): John Hughes teen romance, mild language and teen drinking, no violence." },
  { id: 'cmtf5kkyv00ltezj83dxe1l1l', violence: 4, language: 2, sexNudity: 0, scariness: 1, sourceNotes: "AI assessment from general knowledge (Kindergarten Cop, 1990): action-comedy with gunplay/chase violence, mild language, no nudity." },
  { id: 'cmtf5kkma00lsezj8gwughn7u', violence: 4, language: 2, sexNudity: 0, scariness: 6, sourceNotes: "AI assessment from general knowledge (The Lazarus Effect, 2015): supernatural-resurrection horror, sustained scares, implied rather than graphic violence." },
  { id: 'cmtf5kkk200lrezj88fyo4ho5', violence: 4, language: 3, sexNudity: 6, scariness: 3, sourceNotes: "AI assessment from general knowledge (The Boy Next Door, 2015): erotic thriller with significant sexual content, stalking-driven tension, moderate violence." },
  { id: 'cmtf5kkfn00lpezj8bb6ws8cs', violence: 1, language: 4, sexNudity: 4, scariness: 0, sourceNotes: "AI assessment from general knowledge (Stuck in Love, 2013): dramedy with moderate sexual content and language, no meaningful violence." },
  { id: 'cmtf5kkdf00loezj8k128pdp3', violence: 5, language: 4, sexNudity: 0, scariness: 4, sourceNotes: "AI assessment from general knowledge (Freaks, 2019): sci-fi thriller about a girl with hidden powers; moderate violence and disturbing themes, no nudity." },
  { id: 'cmtf5kkas00lnezj820avk50b', violence: 5, language: 3, sexNudity: 1, scariness: 5, sourceNotes: "AI assessment from general knowledge (10x10, 2018): kidnapping thriller, sustained psychological tension and moderate violence." },
  { id: 'cmtf5kk8k00lmezj8wuvti3x7', violence: 5, language: 1, sexNudity: 0, scariness: 1, sourceNotes: "AI assessment from general knowledge (Ip Man 3, 2015): martial-arts sequel, PG-13-style restrained fight violence, minimal language." },
  { id: 'cmtf5kk6b00llezj8u5i3g90x', violence: 2, language: 3, sexNudity: 0, scariness: 3, sourceNotes: "AI assessment from general knowledge (Inside, 2023): Willem Dafoe art-heist-gone-wrong thriller confined to one apartment; psychological tension over graphic violence." },
  { id: 'cmtf5kjb900lkezj8nhq4m2ta', violence: 4, language: 4, sexNudity: 2, scariness: 3, sourceNotes: "AI assessment from general knowledge (Synchronic, 2020): sci-fi drug/time-travel thriller with drug-use depiction and moderate violence." },
  { id: 'cmtf5kj8l00ljezj8x0gickzw', violence: 0, language: 5, sexNudity: 4, scariness: 0, sourceNotes: "AI assessment from general knowledge (Sideways, 2004): wine-country dramedy, frequent strong language and moderate sexual content, no violence." },
  { id: 'cmtf5kj4000lhezj8juwcxc6d', violence: 8, language: 4, sexNudity: 0, scariness: 1, sourceNotes: "AI assessment from general knowledge (Triple Threat, 2019): martial-arts/gun-action ensemble film, heavy action violence throughout." },
  { id: 'cmtf5kj1t00lgezj84uywa6tj', violence: 3, language: 3, sexNudity: 2, scariness: 5, sourceNotes: "AI assessment from general knowledge (One Hour Photo, 2002): psychological thriller about an unsettling photo technician; tension-driven, minimal graphic violence." },
  { id: 'cmtf5kizm00lfezj86k9qafz4', violence: 7, language: 2, sexNudity: 0, scariness: 7, sourceNotes: "AI assessment from general knowledge (Hush, 2016): home-invasion slasher targeting a deaf writer; sustained, graphic tension and violence." },
  { id: 'cmtf5kixd00leezj876tgdzbl', violence: 7, language: 4, sexNudity: 1, scariness: 4, sourceNotes: "AI assessment from general knowledge (The Voices, 2014): dark comedy-horror, darkly comedic but graphic violence throughout." },
  { id: 'cmtf5kiv400ldezj8sen66lqg', violence: 4, language: 1, sexNudity: 0, scariness: 1, sourceNotes: "AI assessment from general knowledge (News of the World, 2020): western drama with period gunfight violence, minimal language." },
  { id: 'cmtf5kiss00lcezj8ku3q0x4s', violence: 0, language: 1, sexNudity: 1, scariness: 0, sourceNotes: "AI assessment from general knowledge (My Big Fat Greek Wedding 3, 2023): light family comedy, very mild content throughout." },
  { id: 'cmtf5kifn00lbezj8fkf4jnpa', violence: 5, language: 1, sexNudity: 0, scariness: 1, sourceNotes: "AI assessment from general knowledge (Master Z: Ip Man Legacy, 2018): martial-arts spinoff, PG-13-restrained action violence." },
  { id: 'cmtf5kib700l9ezj865ibcgqc', violence: 6, language: 3, sexNudity: 0, scariness: 4, sourceNotes: "AI assessment from general knowledge (Let Him Go, 2020): family-custody thriller that escalates to intense violence in its final act." },
  { id: 'cmtf5ki6g00l7ezj81b7ztk68', violence: 5, language: 4, sexNudity: 2, scariness: 3, sourceNotes: "AI estimate with lower confidence — this specific 2023 title wasn't one the assistant could confirm details on; generic R-rated-thriller estimate, treat cautiously." },
  { id: 'cmtf5ki0w00l5ezj8tli73o79', violence: 6, language: 2, sexNudity: 1, scariness: 7, sourceNotes: "AI assessment from general knowledge (Phantasm, 1979): cult supernatural horror; imaginative, unsettling violence and sustained scares." },
]

const FAMILY_TOP_ORDER = [
  'cmtf5j3i4008tezj82dtrnc66', // The Empire Strikes Back — direct sequel to LOVED Star Wars
  'cmtf5jd5e00b3ezj8vf4a4te3', // Return of the Jedi — same
  'cmtf5ixr00077ezj8ko0nke0g', // Inside Out — Pete Docter, most-loved director here
  'cmtf5j1az0086ezj86wia40n7', // Raiders of the Lost Ark — Spielberg, matches loved Apollo 13 adventure spirit
  'cmtf5jfie00byezj8p2ngenfe', // How to Train Your Dragon — source of LOVED 2025 live-action remake, same director
  'cmtf5izvt007sezj8fkgy9ykb', // Ratatouille — Brad Bird
  'cmtf5j4qh0090ezj8hbt7efzk', // Incredibles 2 — Brad Bird, sequel to LOVED Incredibles
  'cmtf5jgj000c5ezj80kf8nu7b', // How to Train Your Dragon 2 — Dean DeBlois
  'cmtf5j8fl009xezj8j5u41ow3', // Finding Dory — Andrew Stanton (loved WALL-E)
  'cmtf5iuew006bezj8p00gym6a', // Toy Story — foundational Pixar original
  'cmtf5j2r3008iezj8xeygm6bl', // Elemental — Peter Sohn (loved Good Dinosaur)
  'cmtf5j1ua008aezj8it6zoch0', // Raya and the Last Dragon — Don Hall (loved Big Hero 6)
  'cmtf5iywt007lezj8tvcsh3vl', // Tangled — Byron Howard (loved Zootopia 2)
  'cmtf5j86m009tezj8tetvj1vx', // Indiana Jones and the Temple of Doom — Spielberg adventure
  'cmtf5iy0n007bezj8kao41w9w', // Toy Story 2
  'cmtf5j4t30091ezj82rgk9gxr', // A Bug's Life
  'cmtf5iwvh006zezj81yue2bmk', // Toy Story 3 — Lee Unkrich (liked Coco)
  'cmtf5j082007tezj89mkjtka5', // Toy Story 4
  'cmtf5jir100cpezj8js5bi5l6', // Migration — well-regarded original
  'cmtf5iezx002fezj8it8add9d', // The Bad Guys — well-reviewed original
  'cmtf5j1220082ezj8hz9ozxyw', // Cars — Pixar original
  'cmtf5j2xt008lezj8ieycrebc', // Ralph Breaks the Internet — sequel to liked Wreck-It Ralph
  'cmtf5k7hy00ijezj8sf1k277k', // Fantastic Mr. Fox — Wes Anderson, distinct quality
  'cmtf5j79p009kezj8elyuunrj', // Tomorrowland — Brad Bird
  'cmtf5j6u8009hezj843mxge79', // Elio — Domee Shi
  'cmtf5k5fj00hyezj8poer1eht', // Megamind — well-regarded DreamWorks original
  'cmtf5j0zv0081ezj8n16xc43a', // The Emperor's New Groove — cult favorite Disney original
  'cmtf5j8qv00a2ezj83j7lx0xh', // Rio — Carlos Saldanha
  'cmtf5iy53007dezj8hdvp7x73', // Moana 2
  'cmtf5k6pg00idezj8dlh5fepv', // Flushed Away
]

const ADULT_TOP_ORDER = [
  'cmtf5iaat0017ezj8tvmqnx17', // Memento — Christopher Nolan (explicit stated affinity)
  'cmtf5ivxj006pezj8en4i1bwf', // The Devil Wears Prada (2006) — original of LOVED-adjacent sequel, Anne Hathaway (also in loved Interstellar)
  'cmtf5jhhv00ceezj8oicj6n5i', // World War Z — Brad Pitt (explicit stated affinity)
  'cmtf5jhk300cfezj8by7fyhnd', // Mr. & Mrs. Smith — Brad Pitt
  'cmtf5jeir00bpezj8ka4pauor', // The Martian — Ridley Scott, matches loved Interstellar/Hail Mary hard-sci-fi taste
  'cmtf5jlhc00dbezj8f7i8naek', // Oblivion — Tom Cruise (loved M:I) + sci-fi, double match
  'cmtf5itkn0068ezj8me6w4ieb', // Iron Man — origin of LOVED Endgame/liked Infinity War ensemble
  'cmtf5j3x7008wezj8q44i0gwk', // Captain America: The Winter Soldier
  'cmtf5j21x008dezj8ucsmrvbo', // Guardians of the Galaxy
  'cmtf5izqz007qezj863kucfhb', // Black Panther
  'cmtdn2cnr001mrvj4mh2r2ek3', // Captain America: Civil War
  'cmtf5iyjz007gezj8djtbiqn9', // Guardians of the Galaxy Vol. 2
  'cmtf5iyho007fezj8msbqmpvv', // Doctor Strange
  'cmtf5iw6m006tezj8euyc7gry', // Thor: Ragnarok
  'cmtf5iuo8006fezj88xyb6ja0', // Iron Man 2
  'cmtf5itfv0066ezj87ipra41c', // Guardians of the Galaxy Vol. 3
  'cmtf5jhol00chezj8n20yv175', // Gladiator II — Ridley Scott epic, matches liked Troy
  'cmtf5k91d00izezj88wggka32', // Robin Hood (2010) — Ridley Scott
  'cmtf5k4ss00hvezj8ekb9y1of', // Exodus: Gods and Kings — Ridley Scott
  'cmtf5ichp001rezj8hqe6narb', // Peaky Blinders: The Immortal Man — Cillian Murphy (Nolan-adjacent actor)
  'cmtf5iy7b007eezj8on1ylepi', // Black Panther: Wakanda Forever
  'cmtf5j39y008qezj8fgz3wg3m', // Captain America: The First Avenger
  'cmtf5jjd200cvezj8tgoldfvu', // In Time — Cillian Murphy
  'cmtf5j9h700a7ezj8m329zqgc', // Indiana Jones and the Last Crusade
  'cmtf5j77g009jezj8yly3v9ul', // Indiana Jones and the Dial of Destiny
  'cmtf5j9q500abezj89ljsbxn4', // Indiana Jones and the Kingdom of the Crystal Skull
  'cmtf5j0ka007yezj86i29fr0s', // Logan
  'cmtf5ifhs002iezj89ldv1bxx', // The Gentlemen — McConaughey
  'cmtf5kgjf00kqezj89h2gpmsq', // Mud — McConaughey
  'cmtf5iuqi006gezj8yka3h5sy', // Avatar (2009) — Cameron sci-fi epic
]

async function writeContentScores() {
  console.log(`Writing ${CONTENT_RATINGS.length} content scores...`)
  for (const r of CONTENT_RATINGS) {
    const title = await prisma.title.findUnique({ where: { id: r.id }, select: { name: true } })
    if (!title) {
      console.error(`  SKIP (title not found): ${r.id}`)
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
    console.log(`  scored: ${title.name}`)
  }
}

async function writeRankingCache(mode: 'FAMILY' | 'ADULT', topOrder: string[]) {
  const [titles, tasteHistory] = await Promise.all([
    prisma.title.findMany({ where: { familyId } }),
    prisma.tasteRating.findMany({ where: { familyId, mode }, include: { title: true } }),
  ])

  const tasteRatingByTitleId = new Map(tasteHistory.map((t) => [t.titleId, t.rating]))
  const visible = titles.filter((t) => isRatingVisibleInMode(t.mpaaRating, mode))
  const notSeenCandidates = visible.filter(
    (t) => !HIDDEN_AFTER_RATING.has(tasteRatingByTitleId.get(t.id) ?? '') && tasteRatingByTitleId.get(t.id) !== 'LOVED'
  )

  const history: TasteHistoryEntry[] = tasteHistory
    .filter((t) => t.rating !== 'NOT_SEEN')
    .map((t) => ({
      titleName: t.title.name,
      rating: t.rating,
      director: t.title.director,
      writer: t.title.writer,
      topCast: t.title.topCast,
      studio: t.title.studio,
    }))

  const candidateIds = notSeenCandidates.map((c) => c.id)
  const candidateIdSet = new Set(candidateIds)
  const validTop = topOrder.filter((id) => candidateIdSet.has(id))
  const seen = new Set(validTop)
  const remainder = candidateIds.filter((id) => !seen.has(id))
  const rankedIds = [...validTop, ...remainder]

  const isComplete = rankedIds.length === candidateIds.length && candidateIds.every((id) => rankedIds.includes(id))
  if (!isComplete) {
    console.error(`  ${mode}: ranking incomplete (${rankedIds.length} vs ${candidateIds.length} candidates) — not writing cache.`)
    return
  }

  const fingerprint = computeRankingFingerprint(candidateIds, history)
  await prisma.rankingCache.upsert({
    where: { familyId_mode: { familyId, mode } },
    update: { inputFingerprint: fingerprint, rankedIds },
    create: { familyId, mode, inputFingerprint: fingerprint, rankedIds },
  })
  console.log(`  ${mode}: wrote ranking cache — ${validTop.length} hand-ranked, ${remainder.length} appended untouched, ${rankedIds.length} total.`)
}

async function main() {
  await writeContentScores()
  console.log('\nWriting ranking caches...')
  await writeRankingCache('FAMILY', FAMILY_TOP_ORDER)
  await writeRankingCache('ADULT', ADULT_TOP_ORDER)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
