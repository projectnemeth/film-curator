// Content-rating pass, 2026-09-11 (third batch of the day).
//
// Chosen by position in the Adult Not Seen list rather than by ingest
// recency, so the scores land on the cards the family actually sees first.
// Titles I could not confidently place — several unreleased 2026 films —
// were skipped rather than guessed at.
//
// Usage: npx tsx scripts/manual-batch-2026-09-11c.ts

import { prisma } from '../src/lib/prisma'

const CONTENT_RATINGS = [
  { id: 'cmtf5id5k001yezj8aqhkh5yo', violence: 4, language: 3, sexNudity: 2, scariness: 5,
    sourceNotes: 'AI estimate with moderate confidence (Nuremberg, 2025): the trial of the Nazi leadership. The distressing material is the documentary camp footage screened in court rather than staged violence. I could not confirm details of this specific release.' },
  { id: 'cmtf5ilxp0042ezj8214346um', violence: 8, language: 7, sexNudity: 6, scariness: 6,
    sourceNotes: 'AI assessment from general knowledge (Wind River, 2017): the case being investigated is the rape and death of a young woman, and the assault is shown in an extended flashback. Brutal, not titillating — scored 6 on sex/nudity specifically so a person reviews it rather than the number deciding.' },
  { id: 'cmtf5jhx000ckezj81tykxjwy', violence: 6, language: 8, sexNudity: 2, scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (The Usual Suspects, 1995): crime thriller. Executions including a family killed offscreen, a boat massacre, and pervasive profanity.' },
  { id: 'cmtf5jvcp00fkezj8hcoqfui7', violence: 7, language: 8, sexNudity: 6, scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (L.A. Confidential, 1997): police corruption. Sudden brutal shootings, a torture interrogation, and a call-girl ring central to the plot with sex scenes and nudity — the 6 routes it to review rather than deciding it.' },
  { id: 'cmtf5kcvu00k0ezj854oi8opg', violence: 2, language: 7, sexNudity: 4, scariness: 2,
    sourceNotes: 'AI assessment from general knowledge (Little Miss Sunshine, 2006): family comedy-drama. A grandfather’s heroin use, a suicide attempt in the backstory, and a child’s beauty-pageant routine played as uncomfortable satire.' },
  { id: 'cmtf5jj1g00ctezj8w8gxkr20', violence: 6, language: 6, sexNudity: 2, scariness: 3,
    sourceNotes: 'AI estimate with moderate confidence (Heads of State, 2025): buddy action comedy with gunfights and explosions and comic profanity; I could not confirm specifics of this release.' },
  { id: 'cmtf5jqz300efezj80x5jl9a4', violence: 1, language: 4, sexNudity: 4, scariness: 1,
    sourceNotes: 'AI assessment from general knowledge (Just Go with It, 2011): romantic comedy built on sexual deception, with swimsuit ogling and innuendo throughout but nothing explicit.' },
  { id: 'cmtf5ib2e001gezj8ytkfg3lq', violence: 5, language: 2, sexNudity: 1, scariness: 2,
    sourceNotes: 'AI assessment from general knowledge (Karate Kid: Legends, 2025): tournament martial arts in the series’ usual register — bullying, training, and a climactic bout; clean language.' },
  { id: 'cmtf5jjoh00d0ezj832br0tnm', violence: 3, language: 6, sexNudity: 7, scariness: 2,
    sourceNotes: 'AI assessment from general knowledge (My Fault: London, 2025): the English-language remake of My Fault, an erotic step-sibling romance. Extended explicit sex scenes; the original scores the same and is already auto-excluded.' },
  { id: 'cmtf5jzo400geezj8zj5ruxs3', violence: 6, language: 4, sexNudity: 1, scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (RoboCop, 2014): the PG-13 remake. Shootings and drone executions with little blood, plus a genuinely unsettling scene revealing what remains of the man inside the suit.' },
  { id: 'cmtf5jepl00bsezj8bhh9e06n', violence: 6, language: 3, sexNudity: 1, scariness: 3,
    sourceNotes: 'AI assessment from general knowledge (The Good, the Bad and the Ugly, 1966): Leone western. Many shootings and a brutal prison-camp beating, stylised rather than gory; almost no sexual content.' },
  { id: 'cmtf5jlcx00d9ezj8bikjgok2', violence: 7, language: 6, sexNudity: 1, scariness: 8,
    sourceNotes: 'AI assessment from general knowledge (The Mist, 2007): creature siege. People dissolved and torn apart by insects, a religious mob turning to human sacrifice, and one of the bleakest endings in the genre — including a parent killing his children.' },
  { id: 'cmtf5jltf00dgezj8si4vbn73', violence: 4, language: 6, sexNudity: 3, scariness: 2,
    sourceNotes: 'AI estimate with moderate confidence (Roofman, 2025): true-crime comedy-drama about a serial robber living inside a toy store. Robbery at gunpoint rather than bloodshed; I could not confirm scene specifics.' },
  { id: 'cmtf5jquo00edezj8houfd3dw', violence: 7, language: 8, sexNudity: 2, scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (Southpaw, 2015): boxing drama. Bloody ring punishment, and a wife shot dead early on in front of her husband; relentless profanity.' },
  { id: 'cmtf5jen900brezj8hpjw63il', violence: 7, language: 7, sexNudity: 2, scariness: 5,
    sourceNotes: 'AI estimate with moderate confidence (The Running Man, 2025): Edgar Wright’s adaptation of the dystopian manhunt. Scored as sustained violent pursuit with strong language; I could not confirm how graphic this version goes.' },
  { id: 'cmtf5j6h3009fezj80229jwoy', violence: 3, language: 4, sexNudity: 3, scariness: 1,
    sourceNotes: 'AI assessment from general knowledge (The Simpsons Movie, 2007): animated comedy. Slapstick peril, crude humour, and the famous brief full-frontal skateboard gag.' },
  { id: 'cmtf5io6r004kezj8dhdtaz2k', violence: 7, language: 6, sexNudity: 4, scariness: 5,
    sourceNotes: 'AI assessment from general knowledge (What Happened to Monday, 2017): dystopian thriller. Sisters killed one by one, including a graphic tooth extraction and a child’s death in flashback.' },
  { id: 'cmtf5jypt00g6ezj8et97eit8', violence: 7, language: 7, sexNudity: 3, scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (Novocaine, 2025): action comedy about a man who feels no pain, which is the engine for inventive gore — burns, impalement and a deep-fryer scene played half for laughs.' },
  { id: 'cmtqvu450003ecox77goe8pgg', violence: 1, language: 7, sexNudity: 8, scariness: 1,
    sourceNotes: 'AI assessment from general knowledge (Good Luck Chuck, 2007): the premise is a sex montage. Extensive nudity and explicit comic sex throughout.' },
  { id: 'cmtf5kbhn00jpezj8csp5kgga', violence: 3, language: 5, sexNudity: 4, scariness: 2,
    sourceNotes: 'AI assessment from general knowledge (Life of Brian, 1979): Python satire. A crucifixion played as a musical finale, and a brief full-frontal gag; the content most likely to matter here is religious rather than graphic.' },
  { id: 'cmtf5kduu00kaezj8tf4feja5', violence: 7, language: 5, sexNudity: 4, scariness: 8,
    sourceNotes: 'AI assessment from general knowledge (We Need to Talk About Kevin, 2011): a mother’s account of her son’s school massacre. The dread is relentless and the aftermath includes the killing of family members; deeply disturbing rather than gory.' },
  { id: 'cmtqvu7qs004ccox7nbug8yfh', violence: 7, language: 5, sexNudity: 3, scariness: 7,
    sourceNotes: 'AI assessment from general knowledge (Halloween III: Season of the Witch, 1982): unrelated to the Myers films. Children killed by booby-trapped masks, insects and snakes emerging from a child’s head, and a druidic-ritual plot.' },
  { id: 'cmtqvubxr005gcox7n4v2exqp', violence: 6, language: 7, sexNudity: 2, scariness: 3,
    sourceNotes: 'AI assessment from general knowledge (The Substitute, 1996): a mercenary goes undercover as a teacher. Gang shootouts and beatings in a school setting, with heavy profanity.' },
  { id: 'cmtf5ijyp003oezj81by4n494', violence: 3, language: 9, sexNudity: 5, scariness: 1,
    sourceNotes: 'AI assessment from general knowledge (The Big Lebowski, 1998): Coen comedy. Little real violence, but among the highest profanity counts in mainstream film, plus a nude art sequence and pornography as a plot element.' },
  { id: 'cmtf5ik37003qezj8p45ia289', violence: 5, language: 3, sexNudity: 2, scariness: 3,
    sourceNotes: 'AI assessment from general knowledge (Waterworld, 1995): post-apocalyptic adventure. Sea battles and a brief threat to a child; mild for its scale.' },
  { id: 'cmtqvtz7q0024cox76yd6vuyh', violence: 5, language: 6, sexNudity: 6, scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (The Girl on the Train, 2016): thriller. A bludgeoning death, alcoholic blackouts, and several explicit sex scenes including infidelity — the 6 sends it to review rather than deciding it.' },
  { id: 'cmtf5iwft006xezj8qsu84o54', violence: 5, language: 2, sexNudity: 2, scariness: 5,
    sourceNotes: 'AI assessment from general knowledge (Pirates of the Caribbean: The Curse of the Black Pearl, 2003): swashbuckler. Sword fighting throughout and skeletal undead pirates in moonlight, which is the frightening element for younger viewers.' },
  { id: 'cmtf5iw00006qezj8k7acj5lf', violence: 4, language: 3, sexNudity: 2, scariness: 3,
    sourceNotes: 'AI assessment from general knowledge (Thor: Love and Thunder, 2022): superhero comedy. Bloodless battles, a child-abduction plot, and a villain whose scenes are shot as near-horror; mild innuendo.' },
  { id: 'cmtf5jbn400aqezj8fzwknzpy', violence: 4, language: 1, sexNudity: 0, scariness: 3,
    sourceNotes: 'AI assessment from general knowledge (Mulan, 2020): the live-action remake. Battle violence with no blood and no romance to speak of; clean throughout.' },
  { id: 'cmtf5jj3s00cuezj8mra1vn2c', violence: 7, language: 6, sexNudity: 1, scariness: 3,
    sourceNotes: 'AI assessment from general knowledge (The Accountant 2, 2025): action thriller. Precise, heavy gun violence in the register of the first film; little sexual content.' },
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
