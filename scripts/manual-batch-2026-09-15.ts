// Manual catalog refresh, 2026-09-15.
//
// Fourth pass since 2026-09-11. The exclusion queue had 11 keyword/score
// nominations waiting; ten were ruled on (see scripts/review-exclusions.ts)
// and Blue Moon was deliberately left pending, so both modes are re-ranked
// here — those verdicts changed which titles are visible.
//
// Usage: npx tsx scripts/manual-batch-2026-09-15.ts

import { prisma } from '../src/lib/prisma'
import { isTitleVisible } from '../src/lib/filtering'
import { computeRankingFingerprint, type TasteHistoryEntry } from '../src/lib/ranking'

const HIDDEN_AFTER_RATING = new Set(['DISLIKED', 'LIKED', 'TOO_INAPPROPRIATE', 'NOT_INTERESTED'])
const MOVED_TO_OWN_SECTION = new Set(['LOVED', 'WATCHLISTED'])

// The 30 most recently ingested unscored PG-13/R titles. sourceNotes states
// its own basis; the four I could not place confidently say so outright.
const CONTENT_RATINGS = [
  { id: 'cmu0vzjfv00m7h0gu3qtjvw4u', violence: 6, language: 4, sexNudity: 3, scariness: 3,
    sourceNotes: 'AI assessment from general knowledge (Daredevil, 2003): superhero action. Repeated brutal beatings and several on-screen murders by Bullseye, a rooftop fight that doubles as a flirtation, and a brief bedroom scene — all kept within PG-13.' },
  { id: 'cmu0vyu7200gkh0gurvw7qnup', violence: 6, language: 6, sexNudity: 0, scariness: 3,
    sourceNotes: 'AI assessment from general knowledge (Rebel Ridge, 2024): an ex-Marine takes on a corrupt police department. Notably restrained for the genre — the protagonist deliberately avoids killing, so the tension is sustained threat, tasings and hand-to-hand rather than bloodshed.' },
  { id: 'cmu0vyu2k00gjh0guglnjzxer', violence: 6, language: 8, sexNudity: 3, scariness: 3,
    sourceNotes: 'AI estimate with lower confidence (Trap House, 2025): I cannot confirm scene detail for this specific title and may be thinking of another film. Scored as a generic R-rated action comedy — fights, gunplay, heavy profanity, some crude sexual humour. Treat cautiously.' },
  { id: 'cmu0vyttd00ghh0gu8zuyii10', violence: 5, language: 3, sexNudity: 1, scariness: 3,
    sourceNotes: "AI assessment from general knowledge (My Hero Academia: You're Next, 2024): shonen anime feature. Continuous stylised superpowered combat with injuries and blood, but no sexual content and mild language." },
  { id: 'cmu0vytoz00ggh0guk1q3ijtd', violence: 9, language: 8, sexNudity: 3, scariness: 5,
    sourceNotes: 'AI assessment from general knowledge (Havoc, 2025): Gareth Evans, who made The Raid, and it shows. Sustained extremely graphic gun and blade violence with heavy gore, relentless profanity, and a strip-club setting.' },
  { id: 'cmu0vytkl00gfh0gu2glsr0x6', violence: 2, language: 4, sexNudity: 3, scariness: 1,
    sourceNotes: 'AI assessment from general knowledge (Liar Liar, 1997): Jim Carrey comedy. Slapstick self-inflicted beating in a courthouse bathroom; an adulterous opening liaison and a running stream of adult innuendo, all verbal.' },
  { id: 'cmu0vysyl00gah0guhp5vuhiq', violence: 9, language: 8, sexNudity: 1, scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (Violent Night, 2022): Santa Claus versus mercenaries. Gleefully extreme gore — impalings, a sledgehammer, a Home Alone pastiche played for real injury — plus constant profanity.' },
  { id: 'cmu0vysrg00g9h0guo2btvm2f', violence: 8, language: 6, sexNudity: 4, scariness: 7,
    sourceNotes: 'AI assessment from general knowledge (The Platform 2, 2024): Spanish dystopian horror. Cannibalism, mutilation and starvation on a vertical prison, with the same grim register as the first film, which is already in the catalog.' },
  { id: 'cmu0vysn200g8h0gu7ipkncbn', violence: 7, language: 8, sexNudity: 0, scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (Ambulance, 2022): Michael Bay heist chase. Prolonged shootouts with bloody wounds and an improvised in-vehicle surgery scene shown in detail; wall-to-wall profanity, no sexual content.' },
  { id: 'cmu0vyr1500fvh0guosnbw9fo', violence: 2, language: 3, sexNudity: 1, scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (Lion, 2016): a five-year-old lost across India. Almost no depicted violence, but the threat of child trafficking hangs over the first half and the distress is the point — the scariness here is emotional, not visual.' },
  { id: 'cmu0vyqw800fuh0gukjulbdwc', violence: 0, language: 5, sexNudity: 2, scariness: 0,
    sourceNotes: 'AI estimate with moderate confidence (Blue Moon, 2025): Linklater’s chamber piece about Lorenz Hart on the opening night of Oklahoma!. Essentially a single-set conversation — drinking, self-laceration and frank adult talk, no violence or depicted sex. Scored partly to inform the exclusion decision still pending on it.' },
  { id: 'cmu0vyqaa00fph0guu2agfb5z', violence: 0, language: 4, sexNudity: 1, scariness: 0,
    sourceNotes: 'AI assessment from general knowledge (The Founder, 2016): Ray Kroc and the McDonald brothers. A business betrayal story — no violence, moderate profanity, an affair handled discreetly.' },
  { id: 'cmu0vyomt00fch0gumxv9eam6', violence: 6, language: 5, sexNudity: 5, scariness: 5,
    sourceNotes: 'AI assessment from general knowledge (Ferrari, 2023): Michael Mann. Mostly a marriage-and-business drama until the Guidizzolo crash, which is shown with shocking, dismembering realism including child deaths. An affair with brief nudity.' },
  { id: 'cmu0vyoid00fbh0gutqllu2et', violence: 5, language: 2, sexNudity: 1, scariness: 6,
    sourceNotes: 'AI assessment from general knowledge (Damsel, 2024): a bride thrown into a dragon’s cave. Burns, a self-cauterised wound and a badly broken leg, plus sustained trapped-in-the-dark dread — the scares outweigh the gore.' },
  { id: 'cmu0vyodz00fah0gursxzytg7', violence: 5, language: 5, sexNudity: 0, scariness: 2,
    sourceNotes: 'AI assessment from general knowledge (The Adam Project, 2022): time-travel adventure. Bloodless sci-fi shootouts and lightsaber-ish fights, with a preteen lead trading profanity-adjacent insults with his adult self.' },
  { id: 'cmu0vyo9h00f9h0gutiwdme9j', violence: 7, language: 6, sexNudity: 2, scariness: 3,
    sourceNotes: 'AI assessment from general knowledge (The Old Guard 2, 2025): immortal mercenaries. Repeated graphic killings that the characters simply recover from, axe and blade work, moderate profanity; the established couple is affectionate rather than explicit.' },
  { id: 'cmu0vynrk00f5h0guhkzlt35u', violence: 7, language: 7, sexNudity: 2, scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (The Old Guard, 2020): as the sequel, plus an extended sequence of a captive being vivisected in a lab, which is the film’s darkest stretch.' },
  { id: 'cmu0vyhso00dth0gui6mcxmum', violence: 7, language: 7, sexNudity: 1, scariness: 6,
    sourceNotes: 'AI assessment from general knowledge (Those Who Wish Me Dead, 2021): two assassins hunt a boy through a wildfire. Executions including of bystanders, severe burns, and a child in sustained peril.' },
  { id: 'cmu0vy6xe00beh0guoi525ej9', violence: 2, language: 7, sexNudity: 4, scariness: 1,
    sourceNotes: 'AI estimate with lower confidence (Go Team!, 2026): I could not confirm details of this Spanish comedy. Scored as a generic R-rated ensemble comedy — crude language and sexual humour, little violence. Treat cautiously.' },
  { id: 'cmu0vy6fd00bah0gunkqi57eu', violence: 2, language: 4, sexNudity: 3, scariness: 1,
    sourceNotes: 'AI estimate with lower confidence (Why Did I Get Married Again?, 2026): I cannot confirm this specific sequel. Scored on the established pattern of the Tyler Perry couples-retreat films — marital confrontation, infidelity discussed and implied rather than shown. Treat cautiously.' },
  { id: 'cmu0vy6ai00b9h0gukhnbcsui', violence: 1, language: 6, sexNudity: 4, scariness: 0,
    sourceNotes: 'AI estimate with lower confidence (Call My Agent! The Movie, 2026): I know the French series but not this feature. Scored on the series’ register — showbusiness farce with frank sexual dialogue and affairs, no violence. Treat cautiously.' },
  { id: 'cmu0vy42v00arh0gusxek6k1z', violence: 7, language: 8, sexNudity: 4, scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (Get the Gringo, 2012): Mel Gibson in a lawless Mexican prison town. Shootings, stabbings and a child under threat of organ harvesting; pervasive profanity and a prison economy that includes prostitution.' },
  { id: 'cmu0vy3tz00aph0guk002khwa', violence: 4, language: 4, sexNudity: 2, scariness: 3,
    sourceNotes: 'AI assessment from general knowledge (The Skulls, 2000): secret-society thriller. A staged suicide, a duel and several beatings; hazing rituals supply most of the menace.' },
  { id: 'cmu0vy1r600a8h0gutiycisft', violence: 0, language: 6, sexNudity: 2, scariness: 0,
    sourceNotes: 'AI assessment from general knowledge (Begin Again, 2014): music-industry romance, rated R essentially for language alone. Infidelity is a plot point but handled off-screen.' },
  { id: 'cmu0vy08d009wh0gu8aibjg0u', violence: 4, language: 5, sexNudity: 1, scariness: 6,
    sourceNotes: 'AI assessment from general knowledge (Drop, 2025): a first date turned hostage situation by phone. Sustained dread over a threat to the heroine’s child and sister, with the violence concentrated in a short brutal finale.' },
  { id: 'cmu0vxw2g008zh0guetrtadhg', violence: 3, language: 5, sexNudity: 4, scariness: 3,
    sourceNotes: 'AI assessment from general knowledge (Remember Me, 2010): a romance with a fistfight, a suicide in the backstory and a sex scene, ending inside the September 11 attacks — a gut-punch rather than a scare.' },
  { id: 'cmu0vxgmg005ih0gu2eml01lz', violence: 8, language: 7, sexNudity: 1, scariness: 3,
    sourceNotes: 'AI assessment from general knowledge (The Last Stand, 2013): Schwarzenegger border-town siege. Cartel gunfights with unusually graphic squib work, including a bisection and several point-blank kills.' },
  { id: 'cmu0vxght005hh0gu4x1h0cse', violence: 3, language: 3, sexNudity: 2, scariness: 6,
    sourceNotes: 'AI assessment from general knowledge (Sound of Freedom, 2023): child-trafficking rescue drama. The abuse is implied throughout and never depicted, but the subject is unrelenting and the dread around the children is the whole film.' },
  { id: 'cmu0vxer30053h0gugmi4s5nk', violence: 5, language: 4, sexNudity: 1, scariness: 5,
    sourceNotes: 'AI assessment from general knowledge (Small Soldiers, 1998): Joe Dante. Militarised toys hunt a family — cartoonish on paper, but the mutilated Gwendy dolls and the home-invasion siege are genuinely frightening for younger viewers, which is why it drew complaints about its PG-13.' },
  { id: 'cmu0vxdy1004xh0guucg3j0pr', violence: 8, language: 6, sexNudity: 6,  scariness: 6,
    sourceNotes: 'AI assessment from general knowledge (Munich, 2005): Spielberg on the reprisals after the 1972 Olympic massacre. Point-blank assassinations, a bombing, and the massacre itself shown in fragments; the sexNudity 6 is a full sex scene intercut with the killings, not incidental nudity — it should nominate this title for review, and on the Hit Man precedent rather than the Schindler’s List one.' },
]

// Hand-ranked from the taste history. FAMILY reads as: Pixar and
// DreamWorks/Sony feature animation at the top (every LOVED entry bar three
// is animated), space and adventure next, and a hard floor under fairy-tale
// remakes and franchise-sequel animation — Shrek, Ice Age, Smurfs, Angry
// Birds, Hotel Transylvania and the live-action princess remakes are all
// DISLIKED or NOT_INTERESTED, so none of them are promoted here.
const FAMILY_TOP_ORDER: string[] = [
  'cmtf5jfie00byezj8p2ngenfe', // How to Train Your Dragon (2010) — they LOVED the 2025 remake; this is Dean DeBlois and Chris Sanders' original, and Sanders also directed the LOVED Wild Robot
  'cmtf5jgj000c5ezj80kf8nu7b', // How to Train Your Dragon 2 (2014) — DeBlois again, straight sequel to the film above
  'cmtf5j3i4008tezj82dtrnc66', // The Empire Strikes Back (1980) — Star Wars (1977) is LOVED and The Phantom Menace DISLIKED; the original trilogy is the part that landed
  'cmtf5jd5e00b3ezj8vf4a4te3', // Return of the Jedi (1983) — same trilogy
  'cmtf5ixr00077ezj8ko0nke0g', // Inside Out (2015) — Pete Docter, who made the LOVED Up; Soul and Monsters, Inc. are both LIKED
  'cmtf5iy0n007bezj8kao41w9w', // Toy Story 2 (1999) — Toy Story is LOVED, Lasseter also directed the LOVED Cars
  'cmtf5iwvh006zezj81yue2bmk', // Toy Story 3 (2010) — same series
  'cmtf5iwbb006vezj8h9z29vbz', // Inside Out 2 (2024) — sequel to the Docter film above
  'cmu0vylov00eoh0gu7t43e0y6', // The Sea Beast (2022) — Chris Williams, director of the LOVED Big Hero 6; seafaring monster adventure rather than fairy tale
  'cmtf5j8fl009xezj8j5u41ow3', // Finding Dory (2016) — Andrew Stanton, who made the LOVED WALL·E; Finding Nemo is LIKED
  'cmtf5j082007tezj89mkjtka5', // Toy Story 4 (2019) — same series
  'cmtf5j2r3008iezj8xeygm6bl', // Elemental (2023) — Peter Sohn, director of the LOVED The Good Dinosaur
  'cmtf5j6u8009hezj843mxge79', // Elio (2025) — Pixar, and a kid-meets-aliens space story; space is the throughline of LOVED WALL·E, Star Wars and Project Hail Mary
  'cmu0vysio00g7h0gu4sokqvpu', // Wish Dragon (2021) — Chris Appelhans, director of the LOVED KPop Demon Hunters, at the same studio (Sony Animation) as both LOVED Spider-Verse films
  'cmtf5j4t30091ezj82rgk9gxr', // A Bug's Life (1998) — Lasseter and Stanton, the pair behind LOVED Toy Story, Cars and WALL·E
  'cmtf5j79p009kezj8elyuunrj', // Tomorrowland (2015) — Brad Bird, director of the LOVED The Incredibles; live-action optimistic sci-fi
  'cmtf5iezx002fezj8it8add9d', // The Bad Guys (2022) — heist comedy in the Lord-and-Miller register of LOVED Mitchells vs. the Machines; Super Mario Bros. and Sing are LIKED
  'cmtf5ibhd001iezj8ev6wk7ax', // The Bad Guys 2 (2025) — same
  'cmtf5j2xt008lezj8ieycrebc', // Ralph Breaks the Internet (2018) — Rich Moore; Wreck-It Ralph is LIKED
  'cmtf5jir100cpezj8js5bi5l6', // Migration (2023) — Illumination, whose Sing, Secret Life of Pets and Despicable Me films are all LIKED or LOVED
  'cmtf5jfpi00c1ezj8n5pwj007', // Despicable Me 4 (2024) — Despicable Me 2 is LOVED and Despicable Me 3 LIKED, same director
  'cmtdn2glm003drvj4621nxyc6', // The Super Mario Galaxy Movie (2026) — The Super Mario Bros. Movie is LIKED, same directors and studio
  'cmtf5i8f1000tezj8e007sxql', // Minions: The Rise of Gru (2022) — Minions is LIKED
  'cmtf5k33h00hmezj89x5al7f4', // The Secret Life of Pets 2 (2019) — the first is LIKED, same director
  'cmtf5ipsb004zezj8413uu1rh', // The Karate Kid (1984) — Ip Man is LOVED in Adult mode; the same underdog martial-arts story at a Family rating
  'cmtqvtwc3001ecox7g06bzd5o', // The Goonies (1985) — Amblin kids-on-an-adventure, the live-action register of LOVED Apollo 13 and LIKED Home Alone 2
  'cmtf5ja6k00acezj8fv59xhs6', // National Treasure (2004) — treasure-hunt adventure; Indiana Jones and the Dial of Destiny is LIKED in Adult mode
  'cmtguk9ws00b211utqy6hdgsu', // Honey, I Shrunk the Kids (1989) — Joe Johnston family adventure comedy, same shelf as The Goonies
  'cmtf5ja8q00adezj87281mj2q', // Treasure Planet (2002) — Disney's space-pirate adventure; adventure and space rather than the princess material they passed on
  'cmtf5j26l008fezj8egeh7s1b', // Mulan (1998) — the action-led end of Disney Animation, near LIKED Lion King, Zootopia and Raya, and clear of the fairy-tale remakes they declined
]

// ADULT reads as: grounded war and espionage, hard sci-fi, martial arts and
// puzzle-box thrillers. The consistent DISLIKE is quippy CGI star-vehicle
// action comedy (Red Notice, Free Guy, Jungle Cruise, Red One, Uncharted,
// The Lost City) and mid-tier MCU, so none of that is promoted. The four
// TOO_INAPPROPRIATE ratings are a content line, not a genre one — they rule
// out crude and graphic sexual content, not thrillers.
const ADULT_TOP_ORDER: string[] = [
  'cmtf5j1az0086ezj86wia40n7', // Raiders of the Lost Ark (1981) — Indiana Jones and the Dial of Destiny is LIKED, as is every Star Wars film; this is the Spielberg/Ford original
  'cmtf5j9h700a7ezj8m329zqgc', // Indiana Jones and the Last Crusade (1989) — same series, same pairing
  'cmtqvudwz005zcox79yqnsmsu', // Alien (1979) — Ridley Scott, who made the LIKED The Martian; survival sci-fi next to LOVED Interstellar
  'cmtqvugso006rcox7mgxd48cg', // Aliens (1986) — combines the two strongest Adult signals, war combat and space sci-fi
  'cmtf5jhx000ckezj81tykxjwy', // The Usual Suspects (1995) — puzzle-box crime thriller; Memento is LIKED and Gone Girl too
  'cmtf5k7d300ihezj8ia4ker92', // Source Code (2011) — a tight sci-fi loop with a human core, the LOVED Interstellar and Project Hail Mary register
  'cmtf5kifn00lbezj8fkf4jnpa', // Master Z: Ip Man Legacy (2018) — Ip Man is LOVED and Ip Man 3 LIKED; this is the direct spin-off
  'cmtf5jo1e00dyezj87kp8hi0c', // Sakra (2023) — Donnie Yen directing and starring, the same draw as LOVED Ip Man
  'cmtf5khrm00l1ezj8qrxsynam', // Fist of Legend (1994) — Jet Li in the same martial-arts-under-occupation story Ip Man tells
  'cmtqvvz2h00l5cox7y3mybamm', // Crimson Tide (1995) — Tony Scott submarine standoff; Denzel Washington's Inside Man is LIKED, and military procedure is the LOVED 1917 register
  'cmtf5khp300l0ezj8kyckvs8c', // K-19: The Widowmaker (2002) — Kathryn Bigelow, director of the LIKED The Hurt Locker and A House of Dynamite
  'cmtqvw0h600licox7n7ibzjs0', // Valkyrie (2008) — Tom Cruise plus WWII, two of the strongest signals in the history at once
  'cmtgukwvv00gh11ut7bdk39zw', // Enemy of the State (1998) — Tony Scott surveillance thriller, the Jack Reacher and Collateral shelf
  'cmtf5kap500jdezj8689uwskx', // Black Bag (2025) — Soderbergh spy thriller for adults; The Gray Man and Gone Girl are both LIKED
  'cmtqvukqv007tcox750nkqq0q', // The Killer (2023) — David Fincher, whose Gone Girl is LIKED
  'cmu0vyu7200gkh0gurvw7qnup', // Rebel Ridge (2024) — one competent man against a corrupt system, which is exactly the LIKED Jack Reacher premise
  'cmtf5jqnz00eaezj85gkw4ps6', // The Last of the Mohicans (1992) — Michael Mann, director of the LIKED Collateral; historical combat epic like the LIKED Troy
  'cmtf5id5k001yezj8aqhkh5yo', // Nuremberg (2025) — Rami Malek, whose The Amateur they WATCHLISTED; the Oppenheimer shelf of serious postwar drama
  'cmtdn29q2000hrvj4tnze88bz', // Schindler's List (1993) — Spielberg WWII; All Quiet on the Western Front and The Hurt Locker are LIKED, and this cleared exclusion review on 2026-09-05
  'cmtf5jhfh00cdezj8esgqxejr', // The Pianist (2002) — WWII survival, same shelf
  'cmtqvuwv100azcox7jlrbj92v', // The Deer Hunter (1978) — Vietnam epic; war violence is explicitly in-bounds for this family
  'cmtf5ifqp002mezj8go2hcwuc', // Rocky (1976) — Rocky II, III and IV already sit in Adult mode; this is the one that started them
  'cmtf5iodq004nezj8vjle5pvz', // Creed (2015) — Ryan Coogler, director of the LIKED Black Panther, continuing the Rocky line
  'cmtf5imho004bezj8om5pygp6', // Creed II (2018) — same, and it brings back the Drago thread from Rocky IV
  'cmtf5ieqn002bezj8ha9oxloc', // The Hunger Games: The Ballad of Songbirds & Snakes (2023) — all four earlier Hunger Games films are LIKED
  'cmtqvtxju001pcox7kjlslwhw', // Star Trek (2009) — J.J. Abrams, whose The Force Awakens is LIKED; the whole Star Wars run is LIKED or LOVED
  'cmtf5ipv10050ezj8z9lf7uzw', // Elysium (2013) — Matt Damon in class-divide sci-fi; The Martian and In Time are both LIKED
  'cmtqvvxwc00kxcox7woua3eck', // Patriots Day (2016) — Peter Berg true-story procedural, the American Sniper and Hurt Locker register
  'cmtqvune2008icox7u449fcfl', // The Impossible (2012) — survival against a disaster, the LIKED 127 Hours shelf
  'cmtf5iikj003cezj8pawk8gb9', // Sisu: Road to Revenge (2025) — WWII-era combat action; graphic war violence is the category they kept
]

async function writeContentScores() {
  let written = 0
  for (const rating of CONTENT_RATINGS) {
    const { id, ...score } = rating
    await prisma.contentScore.create({ data: { titleId: id, ...score, isUnrated: false, isNC17: false } })
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
