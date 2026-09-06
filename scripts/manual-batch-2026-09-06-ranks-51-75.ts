// Content scores for the 19 unscored titles in Adult ranks 51-75,
// 2026-09-06. Six of that band were already scored.
//
// Produced by five parallel research subagents reading Common Sense
// Media, the IMDb Parents Guide and Kids-In-Mind, scoring against a
// rubric anchored to this catalog's existing values, and returning data
// here rather than writing it — so calibration could be checked at the
// 6/7 boundary, where 7 auto-excludes with no review and 6 goes to a
// human.
//
// Usage: npx tsx scripts/manual-batch-2026-09-06-ranks-51-75.ts

import { prisma } from '../src/lib/prisma'

const CONTENT_RATINGS = [
  { id: 'cmtf5k2r200hhezj8ysgsp3dc', violence: 5, language: 2, sexNudity: 1, scariness: 5,
    sourceNotes: "Based on Common Sense Media and IMDb Parents Guide excerpts (Fantastic Beasts and Where to Find Them, 2016); Kids-In-Mind 2.4.2. The violence score understates a few genuinely grim beats — close-ups of mutilated murder victims, a near-execution in acid, and a mother beating her son with a belt — set against otherwise bloodless wand-battle fantasy." },

  { id: 'cmtf5j14b0083ezj8qhmtyorn', violence: 5, language: 4, sexNudity: 1, scariness: 3,
    sourceNotes: "Based on Common Sense Media and Kids-In-Mind 2.5.4 (Ant-Man and the Wasp, 2018): frequent but comedic, bloodless MCU action. Language is the notable dimension for a PG-13 Marvel film — s--t, bulls--t, goddammit — though no f-word." },

  { id: 'cmtf5ir5r005cezj86r5uxtrs', violence: 6, language: 5, sexNudity: 3, scariness: 3,
    sourceNotes: "Based on Common Sense Media, Kids-In-Mind 3.6.5 and Plugged In excerpts (Back in Action, 2025): a high volume of gunfights, explosions, a plane crash and an avalanche, but very little blood. Language is one f-word plus heavy moderate profanity throughout." },

  { id: 'cmtf5kap500jdezj8689uwskx', violence: 5, language: 7, sexNudity: 4, scariness: 4,
    sourceNotes: "Based on Common Sense Media, Kids-In-Mind 5.5.7 and IMDb Parents Guide excerpts (Black Bag, 2025; direct fetch blocked): multiple sources confirm no nudity and no on-screen sex — bedroom scenes are kissing and pillow talk, with infidelity and orgy references verbal only. Violence is infrequent but sharp when it lands. The R is driven almost entirely by roughly 30 f-words." },

  { id: 'cmtf5ibjm001jezj8dvu3j39n', violence: 5, language: 5, sexNudity: 2, scariness: 5,
    sourceNotes: "Confirmed as the 2025 meta-comedy remake (tt33244668) with Jack Black and Paul Rudd, not the 1997 original. Common Sense Media rates violence and scariness 'moderate' and sex 'minimal' with no nudity; Plugged In counts 2 f-words and roughly 40 s-words, matching Kids-In-Mind 1.7.5. One outlier source claims a far higher profanity count than either supports." },

  { id: 'cmtf5k75400ieezj80bmtrq1q', violence: 5, language: 4, sexNudity: 4, scariness: 6,
    sourceNotes: "Based on Common Sense Media and Kids-In-Mind 3.5.6 (Armageddon, 1998): the burden is scale and peril rather than gore — global-extinction stakes, cities levelled, named characters dying — so scariness outranks violence. Two f-words plus milder profanity; sexual content is suggestive (the animal-cracker scene, a brief bare backside, strip-club dancers), never explicit." },

  { id: 'cmtf5keuc00kgezj8iarml3wp', violence: 7, language: 8, sexNudity: 5, scariness: 5,
    sourceNotes: "Confirmed as the 2020 Tate Taylor assassin thriller with Jessica Chastain (tt8784956). Kids-In-Mind 5.8.9; CSM rates violence and language 'a lot' — throat-slitting, stabbings, a drowning, 40-plus f-words. The sexNudity 5 is deliberate: no actual sex scene, only implied oral sex with a shirtless man shown and a brief background glimpse. The R here is driven by violence and language." },

  { id: 'cmtf5jnu400dvezj89d7okeo1', violence: 8, language: 6, sexNudity: 1, scariness: 4,
    sourceNotes: "Based on IMDb Parents Guide via search excerpts (Boyka: Undisputed IV, 2016; direct fetch 403): Violence & Gore 'Severe', Sex & Nudity 'None'. Near-continuous bare-knuckle and prison-fight brutality including a fighter killed in the ring, but blood is contained rather than gory, so below the Dredd tier. The language score is a midpoint between the MPAA's 'language throughout' and IMDb's crowd rating of 'Moderate' — medium confidence on that dimension." },

  { id: 'cmtf5ipv10050ezj8z9lf7uzw', violence: 8, language: 7, sexNudity: 0, scariness: 6,
    sourceNotes: "Based on Common Sense Media (Elysium, 2013), corroborated by Kids-In-Mind 2.8.10 via excerpt: violence 'a lot', with two moments well beyond the general register — an extended graphic exoskeleton-grafting surgery and a face destroyed by a grenade — hence 8. CSM scores sex/romance 'None', with no kissing at all in the film, so the 0 is literal rather than an estimate." },

  { id: 'cmtf5k47k00hrezj84nwbvwtq', violence: 5, language: 5, sexNudity: 3, scariness: 3,
    sourceNotes: "Based on Common Sense Media (Hobbs & Shaw, 2019) and Kids-In-Mind 3.6.5: comic-book action — chases, gunfights, explosions, a cyborg's back sliced open — bloodless enough to sit just under Black Widow. Sexual content is innuendo and cleavage, no nudity." },

  { id: 'cmtf5jtfl00f1ezj832tnao7r', violence: 5, language: 4, sexNudity: 2, scariness: 4,
    sourceNotes: "Based on Common Sense Media (Blue Beetle, 2023) and Kids-In-Mind 3.6.4: heavy mech combat explicitly 'without blood or gore', but with real deaths of sympathetic characters. The scariness is driven less by action than by the scarab bonding scene, which plays as possession — red eyes, writhing, screaming under the skin — and is the moment most likely to frighten a younger viewer." },

  { id: 'cmtf5jjhn00cxezj8x974mnnr', violence: 3, language: 7, sexNudity: 6, scariness: 4,
    sourceNotes: "Confirmed as the 2026 Spanish-language teen romance (dir. Sonia Méndez, from Flor M. Salvador's novel, tt38235625) — NOT the 2014 Robin Williams film of the same name. Common Sense Media reports exactly one sex scene with no genitals shown, so it sits at the line where a depicted sex scene begins. No Kids-In-Mind entry exists and the film is too recent for much secondary coverage, hence medium confidence." },

  { id: 'cmtf5kcdg00jxezj8dotc0lis', violence: 2, language: 5, sexNudity: 4, scariness: 1,
    sourceNotes: "Based on Common Sense Media and Kids-In-Mind 4.3.4 (Bring It On, 2000): the content is innuendo rather than depiction — a dream sequence with pom-poms covering the chest, bikinis, an oral-sex gesture. Language is scored above IMDb's 'Moderate' because alongside ordinary profanity the film uses homophobic slurs, the same reason Green Book scores 6." },

  { id: 'cmtf5ibsj001nezj8xyfp4o00', violence: 6, language: 2, sexNudity: 1, scariness: 7,
    sourceNotes: "Based on Common Sense Media and Kids-In-Mind 1.6.3 (Godzilla Minus One, 2023): heavy but not gory — Godzilla bites people in half bloodlessly, a city is destroyed by atomic blast. The number that matters is scariness, not violence: the film's weight is post-war trauma, survivor guilt, kamikaze and suicide themes, and mass civilian death, which land harder than the monster attacks." },

  { id: 'cmtf5jrsf00emezj8d3wm7mum', violence: 8, language: 8, sexNudity: 5, scariness: 4,
    sourceNotes: "Based on Common Sense Media and Kids-In-Mind 6.8.10 (From Paris with Love, 2010): unrelenting gunfights with bloodied bodies, point-blank shootings, on-screen cocaine use, pervasive profanity. The sexNudity 5 is deliberately below Kids-In-Mind's 6 — the one sex scene happens entirely behind a closed door with no nudity shown." },

  { id: 'cmtf5khrm00l1ezj8qrxsynam', violence: 7, language: 2, sexNudity: 2, scariness: 3,
    sourceNotes: "English-language coverage is thin: no Common Sense Media review and no Kids-In-Mind entry exist for Fist of Legend (1994), and IMDb's Parents Guide returned 403, so this rests on search excerpts plus critical reviews. IMDb rates Violence & Gore 'Severe' — bone-snapping choreography across much of the runtime — with limited blood; Sex & Nudity and Profanity both 'Mild'. Confidence lowered because the dubbed and subtitled cuts differ and no second detailed source was available." },

  { id: 'cmtgukwvv00gh11ut7bdk39zw', violence: 6, language: 7, sexNudity: 3, scariness: 4,
    sourceNotes: "Based on Common Sense Media and Kids-In-Mind 3.6.8 (Enemy of the State, 1998): frequent but largely bloodless action violence, roughly 24 f-words plus ethnic slurs, and sexual content that is implied rather than shown — an oral-sex scene with no nudity, a lingerie-store scene, innuendo." },

  { id: 'cmtf5i98u000zezj8g5yatd9r', violence: 8, language: 2, sexNudity: 3, scariness: 7,
    sourceNotes: "Confirmed as Guillermo del Toro's 2025 Netflix adaptation (MPA R for 'bloody violence and grisly images'). The violence score understates the texture: Kids-In-Mind rates gore 10/10 for sustained body horror — dissection, sawing, stitching and peeling of flesh, exposed organs, hangings — which is more disturbing per shot than a death count implies. Nudity is a brief bare bottom and brief partial female nudity, no sex scene. Medium confidence; IMDb Parents Guide unreachable." },

  { id: 'cmtf5jrz400epezj8wcgkzbmx', violence: 8, language: 9, sexNudity: 7, scariness: 4,
    sourceNotes: "Based on Kids-In-Mind 9.8.10 and Common Sense Media, all three categories 'a lot' (Crank, 2006). The sexNudity 7 is specific, not a general adult-film penalty: the Chinatown scene is an extended, broad-daylight simulated sex act in front of a crowd — a signature set piece, not a cutaway — alongside a topless strip club, topless women at a pool including brief full-frontal, and an implied oral-sex scene. More explicit and far more sustained than Accident Man's brief scenes at 6; it stays at 7 rather than higher because the film is an action gimmick rather than an erotically-driven one. Language is roughly 115 f-words." },
]

async function main() {
  let written = 0
  for (const r of CONTENT_RATINGS) {
    const { id, ...score } = r
    if (await prisma.contentScore.findUnique({ where: { titleId: id } })) continue
    await prisma.contentScore.create({ data: { titleId: id, ...score, isUnrated: false, isNC17: false } })
    written++
  }
  console.log(`content scores written: ${written} (of ${CONTENT_RATINGS.length} in this batch)`)
  console.log(`  at the review threshold (6): ${CONTENT_RATINGS.filter((r) => r.sexNudity === 6).length}`)
  console.log(`  auto-excluded (>= 7): ${CONTENT_RATINGS.filter((r) => r.sexNudity >= 7).length}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
