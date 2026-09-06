// Content scores for the 16 unscored titles in the Adult top 50,
// 2026-09-06. Written in two waves: 13, then 3 more that were promoted
// into the top 50 when exclusions removed titles above them.
//
// Produced by four parallel research subagents rather than from general
// knowledge: each read Common Sense Media and the IMDb Parents Guide for
// its films and returned scores against a shared rubric anchored to
// scores already in this catalog. Reviewed here for calibration before
// writing — particularly at the 6/7 boundary, where 7+ auto-excludes a
// film with no human review and 6 sends it to one.
//
// Two agents reported that IMDb's Parents Guide returned 403 to a direct
// fetch and that they used search excerpts of that page instead; both
// said so in their sourceNotes rather than passing the gap off silently.
//
// Usage: npx tsx scripts/manual-batch-2026-09-06-top50-scores.ts

import { prisma } from '../src/lib/prisma'

const CONTENT_RATINGS = [
  { id: 'cmtgujmm4005g11utyoddcnif', violence: 1, language: 3, sexNudity: 4, scariness: 1,
    sourceNotes: "Based on Common Sense Media and IMDb Parents Guide (13 Going on 30, 2004): CSM rates violence 'very little' (a silhouetted crotch kick, light bullying); language 'some' (bulls--t, damn, ass, bitch, plus anatomical jokes); sex 'some' — heavy innuendo, a comedic partial striptease to briefs, and a naked man whose nudity is fully blocked by an umbrella, with no sex scenes depicted, so the sexNudity score reflects frank talk and gag nudity rather than sexual content." },

  { id: 'cmtf5jswi00euezj8nhk65vwa', violence: 6, language: 1, sexNudity: 0, scariness: 3,
    sourceNotes: "Based on Common Sense Media and IMDb Parents Guide (A Fistful of Dollars, 1964): CSM notes 'lots and lots and lots of shooting', a high body count, a firebombing, a machete through a man's chest, and a prolonged beating of the protagonist, but IMDb rates Violence & Gore only 'Moderate' because the blood is bright and stylised — hence 6 rather than higher. Language 'none' beyond 'go to hell'; sex/nudity none. Scariness reflects the torture sequence and a child menaced by gunfire." },

  { id: 'cmtf5jund00feezj819ejwpfu', violence: 7, language: 6, sexNudity: 3, scariness: 8,
    sourceNotes: "Based on Common Sense Media and IMDb Parents Guide (127 Hours, 2010): IMDb rates Violence & Gore and Frightening & Intense both 'Severe'. The 7 understates the peak — the film's weight is one extended, extremely graphic self-amputation, body horror rather than combat — and the 8 for scariness carries the real burden: sustained entrapment, panic and hallucination, with reports of viewers fainting. Sexual content is flashback implication only." },

  { id: 'cmtf5kewl00khezj8c4t015o7', violence: 9, language: 9, sexNudity: 6, scariness: 5,
    sourceNotes: "Based on Common Sense Media and IMDb Parents Guide (Accident Man, 2018): CSM rates violence and language both 'a lot' — 'non-stop gory, sadistic violence' with decapitations, impalements, axe kills and drowning, and constant extreme language (~112 f-words plus c--t and slurs). Sex/nudity is brief flashback sex scenes with visible breasts: real sex scenes, so not below 6, but short rather than extended." },

  { id: 'cmtf5k5xb00i6ezj8jkjpoaxg', violence: 3, language: 4, sexNudity: 4, scariness: 2,
    sourceNotes: "Based on Common Sense Media (Ace Ventura: Pet Detective, 1994) and the Kids-In-Mind breakdown: violence is almost entirely slapstick with two sharper beats — a man falls from a balcony with visible blood, and a shark-tank peril scene; language is frequent mid-level profanity; sexual content is innuendo-driven — cleavage, implied oral sex, a comedic shower shot — with nothing explicit depicted, so this sits alongside Clueless rather than above it." },

  { id: 'cmtf5kc1v00jsezj8i957z28g', violence: 2, language: 6, sexNudity: 5, scariness: 2,
    sourceNotes: "Based on Common Sense Media and IMDb Parents Guide (Almost Famous, 2000): the violence score of 2 understates the film's real weight, which is substance use — marijuana, LSD, heavy drinking, and a teen girl's near-fatal overdose. On sex specifically, no sex scene is depicted: the protagonist's deflowering is implied and cut away from, and the only nudity is a roughly two-second glimpse. The disturbing element is contextual — an underage groupie in a relationship with an adult musician — rather than anything explicit onscreen." },

  { id: 'cmtf5jqww00eeezj8nqxij783', violence: 9, language: 7, sexNudity: 4, scariness: 9,
    sourceNotes: "Based on Common Sense Media and the Kids-In-Mind breakdown (28 Weeks Later, 2007): extreme graphic gore — helicopter rotors shredding a crowd, an on-screen eye-gouging, decapitations, a sympathetic parent killed on screen — plus sustained apocalyptic dread with repeated child-in-peril. Scariness 9 is deliberately a notch above Nope and A Quiet Place Part II. Nudity is mostly non-sexual: a decontamination shower where it is clinical, and a distant glimpse through a rifle scope." },

  { id: 'cmtf5i94h000xezj8gqa8benu', violence: 3, language: 6, sexNudity: 7, scariness: 1,
    sourceNotes: "Based on Common Sense Media and aggregated Parents Guide data (After We Fell, 2021; IMDb's own page returned 403): rated R specifically for 'sexual content and language', with multiple extended sex scenes, a roughly two-minute chair scene with partial nudity, upper female and male nudity, and a phone-sex sequence. Sexual content is the film's core draw and is explicit and extended, not incidental — hence at the auto-exclude threshold rather than the review one." },

  { id: 'cmtf5jr7o00eiezj8du0uvfwm', violence: 5, language: 8, sexNudity: 6, scariness: 3,
    sourceNotes: "Confirmed as the 2026 Peter Farrelly action-comedy and based on its Common Sense Media review: the MPA rating cites crude sexual material and graphic nudity, but CSM describes the nudity as comedic and rear-focused — a bare bottom, condom demonstrations, novelty props — with no actual sex scenes depicted, so 6 for human review rather than 7+. Heavy cocaine use also noted. Language is constant f-words plus anatomical slang." },

  { id: 'cmtf5imxx004dezj883y9swph', violence: 2, language: 7, sexNudity: 1, scariness: 2,
    sourceNotes: "Confirmed as the 2018 Netflix sports drama about a 14-year-old basketball prodigy, not the 2025 thriller of a similar name. Based on Common Sense Media: frequent strong profanity including the N-word drives the language score; violence is limited to bullying and hazing; sex/nudity effectively absent. The intensity is thematic — exploitation of young athletes, injury, mental health — rather than depicted." },

  { id: 'cmtf5kgnv00ksezj80qr196pi', violence: 3, language: 6, sexNudity: 6, scariness: 1,
    sourceNotes: "Based on Common Sense Media and IMDb Parents Guide (National Lampoon's Animal House, 1978): CSM flags 'a lot' of sex/nudity — bare breasts, ladder voyeurism on topless women, a topless passed-out girl, manual sex barely offscreen — and 'a lot' of language including a homophobic slur. Scored 6 rather than 7+ because the actual sex is implied or offscreen, but a reviewer should note the crude statutory-age and unconscious-woman gags, which the number does not convey." },

  { id: 'cmtf5jnwv00dwezj8ailsexfh', violence: 6, language: 4, sexNudity: 4, scariness: 6,
    sourceNotes: "Based on Common Sense Media and IMDb Parents Guide (Before I Go to Sleep, 2014): a few scenes of very intense violence — a man bashing a woman with blunt objects, bloody flashback beatings. Sex & Nudity rated 'Mild': one brief rear-nude shot and a bathroom scene with no nudity; the assault content is violence-coded rather than titillating. Sustained psychological dread and gaslighting drive the scariness." },

  { id: 'cmtf5kba200jmezj8g7rc6a80', violence: 2, language: 2, sexNudity: 5, scariness: 2,
    sourceNotes: "Based on Common Sense Media and IMDb Parents Guide (Asteroid City, 2023): violence is deliberately unreal — a stage-framed shoot-out, distant mushroom clouds. PG-13 was assigned on appeal for 'brief graphic nudity': one brief full-frontal shot of a woman at a window, plus implied off-screen sex in dialogue. Scored 5 rather than 6 because there is no sex scene, but note the number alone hides that the nudity is full-frontal." },

  { id: 'cmtf5im4f0045ezj84i9cvhtd', violence: 7, language: 9, sexNudity: 5, scariness: 4,
    sourceNotes: "Based on Common Sense Media and IMDb Parents Guide (Den of Thieves, 2018; IMDb 403'd on direct fetch, details from search excerpts of that page): sustained realistic gunfights with multiple deaths. Profanity is near-constant at roughly 170 instances including the N-word, which is what drives the 9. Sexual content is a strip-club sequence and one brief partial nude shot with no sex scene — though the 5 understates the film's pervasive leering objectification, which is a tone problem rather than an explicitness one." },

  { id: 'cmtf5jrq600elezj8v66mhzpi', violence: 9, language: 8, sexNudity: 5, scariness: 7,
    sourceNotes: "Based on Common Sense Media and IMDb Parents Guide (Dredd, 2012; IMDb 403'd on direct fetch, details from search excerpts): extreme slow-motion gore is the film's signature — roughly 100 on-screen deaths, people burned and skinned alive, 'gallons of blood', placing it alongside 28 Weeks Later at the top of this scale. 200+ obscenities. Sexual content is one brief imagined scene, not extended or central." },

  { id: 'cmtf5izlv007oezj8b0mv3knx', violence: 6, language: 3, sexNudity: 1, scariness: 5,
    sourceNotes: "Based on Common Sense Media and IMDb Parents Guide (Black Widow, 2021): heavy but bloodless comic-book combat, knives, gunfire, and a mother shot in front of her children. IMDb rates Sex & Nudity 'None'. Scariness reflects the Red Room's trafficking and forced-surgery themes and children in peril, tempered by Marvel tone." },
]

async function main() {
  let written = 0
  for (const r of CONTENT_RATINGS) {
    const { id, ...score } = r
    // Skip what already exists — this batch landed in two waves, and the
    // file is meant to be an accurate record of all of it.
    if (await prisma.contentScore.findUnique({ where: { titleId: id } })) continue
    await prisma.contentScore.create({ data: { titleId: id, ...score, isUnrated: false, isNC17: false } })
    written++
  }
  console.log(`content scores written: ${written} (of ${CONTENT_RATINGS.length} in this batch)`)
  const atReview = CONTENT_RATINGS.filter((r) => r.sexNudity === 6).length
  const autoExcluded = CONTENT_RATINGS.filter((r) => r.sexNudity >= 7).length
  console.log(`  landing at the review threshold (6): ${atReview}`)
  console.log(`  auto-excluded (>= 7): ${autoExcluded}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
