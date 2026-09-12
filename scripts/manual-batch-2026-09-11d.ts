// Content-rating pass, 2026-09-11 (fourth batch).
//
// The highest-ranked unscored titles are now mostly unreleased 2026 films
// I cannot place, so this batch takes the well-known ones further down the
// list instead of guessing at the ones above them.
//
// Usage: npx tsx scripts/manual-batch-2026-09-11d.ts

import { prisma } from '../src/lib/prisma'

const CONTENT_RATINGS = [
  { id: 'cmtqvubq8005ecox7wd2x5m05', violence: 5, language: 4, sexNudity: 2, scariness: 3,
    sourceNotes: 'AI estimate with moderate confidence (Erased / The Expatriate, 2012): a father and daughter on the run after his employer erases him. Shootings and chases; I could not confirm scene specifics.' },
  { id: 'cmtf5jk8h00d5ezj8z9kloxrr', violence: 5, language: 5, sexNudity: 2, scariness: 2,
    sourceNotes: 'AI estimate with moderate confidence (Playdate, 2025): action comedy with two fathers pursued by hired killers. Comic gunplay with children present; specifics unconfirmed.' },
  { id: 'cmtf5iw4f006sezj818v3y6l6', violence: 6, language: 4, sexNudity: 2, scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (X-Men: Days of Future Past, 2014): Sentinels impaling and incinerating mutants in the future scenes, which are notably grim for the series; a brief rear shot of Mystique.' },
  { id: 'cmtf5imfg004aezj8aq4copnq', violence: 7, language: 8, sexNudity: 3, scariness: 3,
    sourceNotes: 'AI assessment from general knowledge (Den of Thieves 2: Pantera, 2025): heist sequel. Sustained gunfights and cartel killings with heavy profanity throughout.' },
  { id: 'cmtf5iq400054ezj80smzqj00', violence: 5, language: 6, sexNudity: 2, scariness: 5,
    sourceNotes: 'AI assessment from general knowledge (STRAW, 2025): a mother’s very bad day spirals into a hostage situation. The distress is psychological — poverty, a dying child, police confrontation — with one shooting.' },
  { id: 'cmtf5jaff00agezj8l7r5g744', violence: 5, language: 2, sexNudity: 1, scariness: 3,
    sourceNotes: 'AI assessment from general knowledge (John Carter, 2012): pulp sci-fi. Bloodless arena and battlefield fighting against alien creatures; clean language.' },
  { id: 'cmtf5jwh400fsezj8imb1nvyf', violence: 6, language: 5, sexNudity: 2, scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (Escape from New York, 1981): Carpenter dystopia. Shootings, a gladiatorial bludgeoning and a grimy prison-city atmosphere; tame gore by modern standards.' },
  { id: 'cmtf5jytk00g7ezj8ztk3bznq', violence: 5, language: 4, sexNudity: 3, scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (The Lost City of Z, 2017): Amazon exploration. Arrow attacks, a WWI trench sequence, disease and starvation; brief tribal nudity that is ethnographic rather than sexual.' },
  { id: 'cmtf5i9fq0012ezj8we1omzqz', violence: 3, language: 6, sexNudity: 9, scariness: 2,
    sourceNotes: 'AI assessment from general knowledge (365 Days: This Day, 2022): the sequel is close to wall-to-wall explicit sex; the series is the clearest case in the catalogue for the auto-exclude threshold.' },
  { id: 'cmtf5iad40018ezj8rrkinu4c', violence: 5, language: 4, sexNudity: 4, scariness: 3,
    sourceNotes: 'AI assessment from general knowledge (The Fifth Element, 1997): space opera. Comic-book violence, a strip-club setting, and Leeloo’s strap costume plus a brief non-sexual full-body reveal on creation.' },
  { id: 'cmtf5id36001xezj83kx573u6', violence: 5, language: 3, sexNudity: 1, scariness: 3,
    sourceNotes: 'AI assessment from general knowledge (Dungeons & Dragons: Honor Among Thieves, 2023): fantasy adventure played for comedy. Bloodless combat, undead and a dragon; very mild for its rating.' },
  { id: 'cmtf5ie230026ezj879ba1oz4', violence: 5, language: 7, sexNudity: 9, scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (Poor Things, 2023): Lanthimos. Extensive, frank and prolonged sexual content including an extended brothel section, plus surgical body horror.' },
  { id: 'cmtf5ieoc002aezj87vt3b2bo', violence: 2, language: 2, sexNudity: 3, scariness: 3,
    sourceNotes: 'AI estimate with moderate confidence (Hamnet, 2025): Chloé Zhao’s film about the death of Shakespeare’s son. Grief and plague rather than violence; I could not confirm specifics of this release.' },
  { id: 'cmtf5ifd7002gezj8797jj8q9', violence: 7, language: 8, sexNudity: 4, scariness: 4,
    sourceNotes: 'AI estimate with moderate confidence (Caught Stealing, 2025): Aronofsky crime thriller in 1990s New York. Scored for sudden brutal violence and pervasive profanity; specifics of this release unconfirmed.' },
  { id: 'cmtf5jjf900cwezj8kiywvf6x', violence: 9, language: 7, sexNudity: 8, scariness: 5,
    sourceNotes: 'AI assessment from general knowledge (Sin City: A Dame to Kill For, 2014): stylised ultra-violence — dismemberment, eyes torn out — rendered in white blood, plus extended full nudity from its central character.' },
  { id: 'cmtf5ijcp003jezj89iw1uviu', violence: 5, language: 2, sexNudity: 1, scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (The Great Wall, 2016): Zhang Yimou creature siege. Massed but bloodless battle against alien beasts; clean otherwise.' },
  { id: 'cmtf5il22003xezj8mzfloap6', violence: 3, language: 6, sexNudity: 9, scariness: 2,
    sourceNotes: 'AI assessment from general knowledge (The Next 365 Days, 2022): third in the series and unchanged in register — explicit sex is the film’s substance.' },
  { id: 'cmtf5ijag003iezj8508df6sq', violence: 8, language: 6, sexNudity: 6, scariness: 6,
    sourceNotes: 'AI assessment from general knowledge (Starship Troopers, 1997): satirical war film. Extreme insect-war dismemberment, and a famous co-ed shower scene whose nudity is matter-of-fact rather than sexual — the Schindler’s List side of the 6, so it needs a person to look.' },
  { id: 'cmtf5ijwi003nezj898wt4mkg', violence: 3, language: 3, sexNudity: 1, scariness: 2,
    sourceNotes: 'AI assessment from general knowledge (The Thursday Murder Club, 2025): gentle retirement-village whodunnit. Murders discussed and discovered rather than shown.' },
  { id: 'cmtf5imho004bezj8om5pygp6', violence: 5, language: 4, sexNudity: 2, scariness: 2,
    sourceNotes: 'AI assessment from general knowledge (Creed II, 2018): boxing. Heavy ring punishment and a hospitalisation; otherwise restrained.' },
  { id: 'cmtf5im6k0046ezj86zyfy2j0', violence: 5, language: 3, sexNudity: 2, scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (The 5th Wave, 2016): YA alien invasion. Child soldiers, a mass shooting of refugees, and a parent killed; bloodless but bleak.' },
  { id: 'cmtf5ini0004hezj8hp3uwfis', violence: 8, language: 9, sexNudity: 6, scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (True Romance, 1993): Tarantino-scripted crime. A prolonged and vicious beating of the heroine, a shootout finale, relentless profanity and slurs, and explicit sex — the 6 sends it to review.' },
  { id: 'cmtf5ipiu004vezj8ywciotkw', violence: 2, language: 6, sexNudity: 5, scariness: 1,
    sourceNotes: 'AI assessment from general knowledge (Dumb and Dumber To, 2014): gross-out comedy leaning heavily on sexual and bodily humour, including a prolonged joke about an elderly woman.' },
  { id: 'cmtf5iult006eezj8ak7e1rv9', violence: 6, language: 3, sexNudity: 1, scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (The Incredible Hulk, 2008): monster brawls through a campus and Harlem; the Abomination is the frightening element.' },
  { id: 'cmtf5iuo8006fezj88xyb6ja0', violence: 5, language: 3, sexNudity: 2, scariness: 3,
    sourceNotes: 'AI assessment from general knowledge (Iron Man 2, 2010): superhero action. Whiplash’s racetrack attack and drone battles, bloodless; mild innuendo.' },
  { id: 'cmtf5iwdj006wezj88mxyxq60', violence: 6, language: 3, sexNudity: 2, scariness: 5,
    sourceNotes: 'AI assessment from general knowledge (X-Men: Apocalypse, 2016): mass destruction and the disintegration of people by the villain, which is unsettling rather than gory.' },
  { id: 'cmtf5ixye007aezj8kgvvg9hr', violence: 6, language: 3, sexNudity: 2, scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (Iron Man 3, 2013): Extremis soldiers burning through people, a house destroyed with the hero inside, and a plane rescue; darker than its predecessors.' },
  { id: 'cmtf5ix730074ezj8r7s6gkiv', violence: 5, language: 2, sexNudity: 1, scariness: 3,
    sourceNotes: 'AI assessment from general knowledge (Thor, 2011): Asgardian and Frost Giant combat, bloodless; very mild content otherwise.' },
  { id: 'cmtf5j0cw007vezj8g376pq30', violence: 5, language: 2, sexNudity: 3, scariness: 5,
    sourceNotes: 'AI assessment from general knowledge (Pirates of the Caribbean: On Stranger Tides, 2011): sword fights and a genuinely frightening mermaid attack sequence; mermaids are topless with hair placed to cover.' },
  { id: 'cmtf5j5m70096ezj80l9fvyqs', violence: 4, language: 3, sexNudity: 1, scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (Cruella, 2021): the dark origin story. A mother’s death by dogs shown in flashback is the frightening beat; otherwise a heist comedy.' },
]

async function main() {
  for (const rating of CONTENT_RATINGS) {
    const { id, ...score } = rating
    await prisma.contentScore.create({ data: { titleId: id, ...score } })
  }
  console.log(`content scores written: ${CONTENT_RATINGS.length}`)
  console.log(`total scores now: ${await prisma.contentScore.count()}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
