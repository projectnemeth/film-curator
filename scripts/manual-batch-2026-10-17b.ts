// Manual catalog refresh, 2026-10-17 (second pass).
//
// The user asked for 100 titles this time rather than the skill's default
// ~30. Same rules as scripts/manual-batch-2026-10-17.ts: the deployed app
// has no Anthropic API access, so these scores and this ordering exist only
// because they are written here.
//
// Run in two stages, because eleven of these scores land at or above the
// sexNudity review threshold and so change what is visible:
//
//   npx tsx scripts/manual-batch-2026-10-17b.ts scores
//   npx tsx scripts/review-exclusions.ts --apply     # the new verdicts
//   npx tsx scripts/manual-batch-2026-10-17b.ts rank
//
// Writing the ranking cache before the verdicts would fingerprint a
// candidate set that is about to change, and the app would quietly
// reconcile on the next load.

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

const CONTENT_RATINGS: ContentRating[] = [
  {
    id: 'cmuuw88zc00kqf329aduoikhd',
    name: 'Dances with Wolves',
    violence: 6,
    language: 3,
    sexNudity: 3,
    scariness: 3,
    sourceNotes: 'AI assessment from general knowledge (Dances with Wolves, 1990): battlefield and raid violence including scalping and a buffalo hunt; one restrained love scene and brief nudity.',
  },
  {
    id: 'cmuuw88m500knf329u0zg00ca',
    name: 'Only the Brave',
    violence: 3,
    language: 6,
    sexNudity: 1,
    scariness: 6,
    sourceNotes: 'AI assessment from general knowledge (Only the Brave, 2017): little violence, but the Yarnell Hill burnover is harrowing and the firefighter profanity is constant.',
  },
  {
    id: 'cmuuw88hc00kmf329w7shk4gi',
    name: 'The Perks of Being a Wallflower',
    violence: 3,
    language: 5,
    sexNudity: 4,
    scariness: 3,
    sourceNotes: 'AI assessment from general knowledge (Perks of Being a Wallflower, 2012): a fistfight and an off-screen suicide; the weight is thematic — childhood sexual abuse, drug use and a teenage sexual encounter, discussed more than shown.',
  },
  {
    id: 'cmuuw875300kbf3295fy20not',
    name: 'Licence to Kill',
    violence: 8,
    language: 4,
    sexNudity: 3,
    scariness: 5,
    sourceNotes: 'AI assessment from general knowledge (Licence to Kill, 1989): by some distance the most brutal Bond — a shark maiming, a decompression-chamber death and a man fed into a grinder.',
  },
  {
    id: 'cmuuw870q00kaf3299lcdig1c',
    name: 'Hunter Killer',
    violence: 6,
    language: 6,
    sexNudity: 0,
    scariness: 3,
    sourceNotes: 'AI assessment from general knowledge (Hunter Killer, 2018): submarine and special-forces combat, with military profanity throughout and no sexual content.',
  },
  {
    id: 'cmuuw86rf00k8f3295rucodjq',
    name: 'Skyfall',
    violence: 6,
    language: 3,
    sexNudity: 4,
    scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (Skyfall, 2012): Bond gunplay plus Silva\'s menace and the Shanghai/Macau set pieces; a shower scene and implied sex, no explicit nudity.',
  },
  {
    id: 'cmuuw861400k2f329c8r3vul2',
    name: 'Seven Pounds',
    violence: 2,
    language: 3,
    sexNudity: 2,
    scariness: 5,
    sourceNotes: 'AI assessment from general knowledge (Seven Pounds, 2008): almost no violence, but a deliberate suicide by jellyfish and unrelieved grief make it heavy going.',
  },
  {
    id: 'cmuuw85sb00k0f3295p7uif42',
    name: 'Total Recall',
    violence: 8,
    language: 6,
    sexNudity: 4,
    scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (Total Recall, 1990): Verhoeven at his bloodiest — shootings used as human shields, eyes bulging in vacuum; brief nudity including the three-breasted gag.',
  },
  {
    id: 'cmuuw85id00jyf3296mb7ik12',
    name: 'The Judge',
    violence: 2,
    language: 7,
    sexNudity: 2,
    scariness: 2,
    sourceNotes: 'AI assessment from general knowledge (The Judge, 2014): a courtroom and family drama; the R is language and adult subject matter, not depiction.',
  },
  {
    id: 'cmuuw859k00jwf3299qdczwge',
    name: 'There Will Be Blood',
    violence: 6,
    language: 5,
    sexNudity: 0,
    scariness: 5,
    sourceNotes: 'AI assessment from general knowledge (There Will Be Blood, 2007): a derrick fire, a murder with a bowling pin and a shooting; the dread is tonal and sustained.',
  },
  {
    id: 'cmuuw855400jvf329vz3ybmkz',
    name: 'The Voyeurs',
    violence: 4,
    language: 6,
    sexNudity: 9,
    scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (The Voyeurs, 2021): an erotic thriller built on explicit sex observed through a window — among the most sexually explicit titles in this catalog.',
  },
  {
    id: 'cmuuw84s200jsf329mm7cvnzm',
    name: 'Casino',
    violence: 9,
    language: 10,
    sexNudity: 6,
    scariness: 5,
    sourceNotes: 'AI assessment from general knowledge (Casino, 1995): a head crushed in a vise, a cornfield beating with bats, near-continuous profanity, and real sex and nudity. Scored honestly; excluded by verdict in scripts/review-exclusions.ts.',
  },
  {
    id: 'cmuuw84jc00jqf329t5hpo657',
    name: 'Minority Report',
    violence: 6,
    language: 4,
    sexNudity: 3,
    scariness: 6,
    sourceNotes: 'AI assessment from general knowledge (Minority Report, 2002): the eye-replacement surgery and the spider-scan sequence are the memorable unpleasantness, over regular sci-fi gunplay.',
  },
  {
    id: 'cmuuw82xs00jdf329ggo6q1xc',
    name: 'Guy Ritchie\'s The Covenant',
    violence: 8,
    language: 8,
    sexNudity: 0,
    scariness: 5,
    sourceNotes: 'AI assessment from general knowledge (The Covenant, 2023): sustained and graphic Afghanistan combat — ambushes, executions, wounds shown plainly.',
  },
  {
    id: 'cmuuw810d00ixf329ez1ujs3t',
    name: 'Casino Royale',
    violence: 7,
    language: 3,
    sexNudity: 4,
    scariness: 5,
    sourceNotes: 'AI assessment from general knowledge (Casino Royale, 2006): a stairwell fight, a poisoning, and the naked rope-torture scene, which is prolonged though not explicit.',
  },
  {
    id: 'cmuuw80r300ivf329210wn8lv',
    name: 'Snatch',
    violence: 6,
    language: 9,
    sexNudity: 1,
    scariness: 3,
    sourceNotes: 'AI assessment from general knowledge (Snatch, 2000): bare-knuckle boxing, shootings and bodies fed to pigs, all played comically; the profanity is relentless.',
  },
  {
    id: 'cmuuw7yuw00igf329gmdpd0mq',
    name: '“Wuthering Heights”',
    violence: 4,
    language: 5,
    sexNudity: 8,
    scariness: 3,
    sourceNotes: 'AI estimate with lower confidence — could not confirm details on this specific title; treat cautiously. A 2026 Emerald Fennell adaptation I cannot verify in detail; everything about its production and marketing points to a heavily eroticised treatment, so it is scored high on that basis. Re-score if that proves wrong.',
  },
  {
    id: 'cmuuw7w4n00huf329makav4ww',
    name: 'No Time to Die',
    violence: 7,
    language: 4,
    sexNudity: 2,
    scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (No Time to Die, 2021): heavy Bond action and a poison-nanobot plot; restrained on sexual content for the series.',
  },
  {
    id: 'cmuuw7v9d00hnf329etm0lgc4',
    name: 'Wrath of Man',
    violence: 8,
    language: 8,
    sexNudity: 1,
    scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (Wrath of Man, 2021): cold, abrupt executions and a long final shootout; Ritchie in his bleakest register.',
  },
  {
    id: 'cmuuw7v4v00hmf32991lvw2im',
    name: 'Now You See Me: Now You Don\'t',
    violence: 4,
    language: 4,
    sexNudity: 1,
    scariness: 2,
    sourceNotes: 'AI estimate with lower confidence — could not confirm details on this specific title; treat cautiously. A 2025 sequel I cannot confirm details on; scored to match the first two heist-magic films, which are light on everything but spectacle.',
  },
  {
    id: 'cmuuw7uix00hhf329ldu8czhy',
    name: 'The Godfather Part II',
    violence: 7,
    language: 6,
    sexNudity: 3,
    scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (The Godfather Part II, 1974): assassinations, a garrotting and a suicide; one brothel scene with brief nudity.',
  },
  {
    id: 'cmuuw7u5q00hef329k3ko46cv',
    name: 'John Wick: Chapter 4',
    violence: 9,
    language: 5,
    sexNudity: 1,
    scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (John Wick: Chapter 4, 2023): close to three hours of stylised but graphic headshots and knife kills; essentially no sexual content.',
  },
  {
    id: 'cmuuw7to800haf3294mme8b3w',
    name: 'The Terminator',
    violence: 8,
    language: 7,
    sexNudity: 4,
    scariness: 7,
    sourceNotes: 'AI assessment from general knowledge (The Terminator, 1984): a massacre in a police station, a hand-through-chest kill, and the endoskeleton\'s relentless pursuit; one sex scene with brief nudity.',
  },
  {
    id: 'cmuuw7t6000h6f329jzys3jes',
    name: 'Terminator 2: Judgment Day',
    violence: 7,
    language: 7,
    sexNudity: 1,
    scariness: 6,
    sourceNotes: 'AI assessment from general knowledge (Terminator 2, 1991): heavy gunplay deliberately aimed at legs, the T-1000\'s impalements, and the nuclear-playground nightmare.',
  },
  {
    id: 'cmuuw7sff00h0f329ty10szpt',
    name: 'The Godfather',
    violence: 7,
    language: 5,
    sexNudity: 3,
    scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (The Godfather, 1972): the toll-booth and restaurant killings, the horse\'s head; a brief wedding-night nudity scene.',
  },
  {
    id: 'cmuuw7rtp00gvf329hrucwhwn',
    name: 'Blade Runner 2049',
    violence: 6,
    language: 5,
    sexNudity: 6,
    scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (Blade Runner 2049, 2017): a few sudden brutal killings, including a newborn replicant; substantial nudity — the Joi holograms, the giant advertisements, and a synchronised intimacy scene. Left pending review rather than decided: whether that scene reads as a sex scene is the family\'s call.',
  },
  {
    id: 'cmuuw7q4600ghf329w8gu3rcz',
    name: 'Haunted Mansion',
    violence: 2,
    language: 3,
    sexNudity: 0,
    scariness: 5,
    sourceNotes: 'AI assessment from general knowledge (Haunted Mansion, 2023): a Disney ghost comedy — jump scares and seance imagery rather than violence.',
  },
  {
    id: 'cmuuw727g00b3f329t95owdcp',
    name: 'Fall for Me',
    violence: 4,
    language: 5,
    sexNudity: 7,
    scariness: 3,
    sourceNotes: 'AI estimate with lower confidence — could not confirm details on this specific title; treat cautiously. A 2025 German-language Netflix thriller; marketed squarely as an erotic thriller, so scored on that basis rather than on scenes I can confirm.',
  },
  {
    id: 'cmuuw71u900b0f329peoc79vg',
    name: 'After Ever Happy',
    violence: 2,
    language: 6,
    sexNudity: 7,
    scariness: 1,
    sourceNotes: 'AI assessment from general knowledge (After Ever Happy, 2022): fourth of the After films; consistent with After We Fell, already scored 7 here — the explicit sex is the draw.',
  },
  {
    id: 'cmuuw70gr00apf329pcbmsxlg',
    name: 'Ladies First',
    violence: 3,
    language: 6,
    sexNudity: 4,
    scariness: 2,
    sourceNotes: 'AI estimate with lower confidence — could not confirm details on this specific title; treat cautiously. A 2026 title I cannot place; scored as a generic R-rated contemporary comedy-drama.',
  },
  {
    id: 'cmuuw6zzg00alf329qlmtuokp',
    name: 'Crimson Peak',
    violence: 7,
    language: 4,
    sexNudity: 5,
    scariness: 7,
    sourceNotes: 'AI assessment from general knowledge (Crimson Peak, 2015): del Toro gothic horror — stabbings and a skull-caving, decaying ghosts throughout, and one explicit sex scene.',
  },
  {
    id: 'cmuuw6z4k00aef32906etbhzl',
    name: '22 Jump Street',
    violence: 5,
    language: 9,
    sexNudity: 6,
    scariness: 2,
    sourceNotes: 'AI assessment from general knowledge (22 Jump Street, 2014): comic action violence, wall-to-wall profanity, and a depicted sex scene with sustained crude sexual humour.',
  },
  {
    id: 'cmuuw6y3r00a6f329o9njyr35',
    name: 'Ticket to Paradise',
    violence: 1,
    language: 4,
    sexNudity: 2,
    scariness: 1,
    sourceNotes: 'AI assessment from general knowledge (Ticket to Paradise, 2022): a Clooney/Roberts romantic comedy; mild on every axis.',
  },
  {
    id: 'cmuuw6wzo009xf329nrtcdfis',
    name: 'Pearl Harbor',
    violence: 7,
    language: 4,
    sexNudity: 3,
    scariness: 6,
    sourceNotes: 'AI assessment from general knowledge (Pearl Harbor, 2001): the attack sequence is prolonged and includes hospital carnage; one love scene without nudity.',
  },
  {
    id: 'cmuuw6wpz009vf329sxfkffwh',
    name: 'Underworld: Blood Wars',
    violence: 8,
    language: 5,
    sexNudity: 4,
    scariness: 6,
    sourceNotes: 'AI assessment from general knowledge (Underworld: Blood Wars, 2016): vampire and lycan combat with heavy gore and dismemberment; brief nudity.',
  },
  {
    id: 'cmuuw6wjn009uf329gpsx7jk4',
    name: 'Schumacher \'94 - The Birth of a Legend',
    violence: 2,
    language: 3,
    sexNudity: 0,
    scariness: 4,
    sourceNotes: 'AI estimate with lower confidence — could not confirm details on this specific title; treat cautiously. A 2026 Formula One documentary I cannot confirm; scored on the assumption it covers the 1994 season, which means Senna\'s fatal crash.',
  },
  {
    id: 'cmuuw6vtl009of329judttcnc',
    name: 'The Bourne Legacy',
    violence: 6,
    language: 4,
    sexNudity: 1,
    scariness: 3,
    sourceNotes: 'AI assessment from general knowledge (The Bourne Legacy, 2012): the series\' usual close-quarters fights and a long motorcycle chase; a lab massacre is the grimmest beat.',
  },
  {
    id: 'cmuuw6ul9009ef32909eytmet',
    name: 'Ma Rainey\'s Black Bottom',
    violence: 5,
    language: 9,
    sexNudity: 3,
    scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (Ma Rainey\'s Black Bottom, 2020): one sudden fatal stabbing, but the real weight is a monologue describing a gang rape, and the profanity is constant.',
  },
  {
    id: 'cmuuw6tzh0099f3295f2tlzam',
    name: 'The Bourne Supremacy',
    violence: 6,
    language: 4,
    sexNudity: 0,
    scariness: 3,
    sourceNotes: 'AI assessment from general knowledge (The Bourne Supremacy, 2004): hand-to-hand fights and the Moscow car chase; no sexual content.',
  },
  {
    id: 'cmuuw6srq008zf329q8erfljz',
    name: '21 Jump Street',
    violence: 5,
    language: 9,
    sexNudity: 5,
    scariness: 2,
    sourceNotes: 'AI assessment from general knowledge (21 Jump Street, 2012): comic shootouts, relentless profanity, and heavy sexual humour including brief graphic nudity played as a gag.',
  },
  {
    id: 'cmuuw6se1008wf3296v89785u',
    name: 'The Bourne Ultimatum',
    violence: 6,
    language: 4,
    sexNudity: 0,
    scariness: 3,
    sourceNotes: 'AI assessment from general knowledge (The Bourne Ultimatum, 2007): the Tangier rooftop chase and the book-and-towel fight; no sexual content.',
  },
  {
    id: 'cmuuw6nzt007wf329di3p9n7d',
    name: 'Jason Bourne',
    violence: 6,
    language: 4,
    sexNudity: 0,
    scariness: 3,
    sourceNotes: 'AI assessment from general knowledge (Jason Bourne, 2016): riot and vehicle mayhem on a larger scale than the earlier films, same low sexual content.',
  },
  {
    id: 'cmuuw6mq5007mf329yj68ua1j',
    name: 'The Da Vinci Code',
    violence: 5,
    language: 3,
    sexNudity: 3,
    scariness: 5,
    sourceNotes: 'AI assessment from general knowledge (The Da Vinci Code, 2006): murders and Silas\'s self-flagellation; a brief ritual scene is the sexual content.',
  },
  {
    id: 'cmuuw6m8g007if329v4a09dge',
    name: 'Love Actually',
    violence: 1,
    language: 7,
    sexNudity: 6,
    scariness: 1,
    sourceNotes: 'AI assessment from general knowledge (Love Actually, 2003): no violence; the body-double subplot is full nudity simulating sex, played for comedy, and there is a brief sex scene elsewhere. Left pending review — whether comic non-erotic nudity counts is the family\'s call.',
  },
  {
    id: 'cmuuw6m3q007hf329acnvio5p',
    name: 'Angels & Demons',
    violence: 6,
    language: 3,
    sexNudity: 1,
    scariness: 6,
    sourceNotes: 'AI assessment from general knowledge (Angels & Demons, 2009): cardinals branded and burned alive on screen; grim for a PG-13.',
  },
  {
    id: 'cmuuw6jjq006wf329a2zhndfd',
    name: 'The Bourne Identity',
    violence: 6,
    language: 4,
    sexNudity: 2,
    scariness: 3,
    sourceNotes: 'AI assessment from general knowledge (The Bourne Identity, 2002): the apartment fight and the Mini chase; an implied sex scene without nudity.',
  },
  {
    id: 'cmuuw6h82006df3295i4bm2fh',
    name: 'The Prestige',
    violence: 5,
    language: 3,
    sexNudity: 2,
    scariness: 5,
    sourceNotes: 'AI assessment from general knowledge (The Prestige, 2006): drownings, a shooting and a mangled hand; the dread builds steadily rather than shocking.',
  },
  {
    id: 'cmuuw6g4x0064f3298h44kycf',
    name: 'The Equalizer',
    violence: 9,
    language: 8,
    sexNudity: 3,
    scariness: 6,
    sourceNotes: 'AI assessment from general knowledge (The Equalizer, 2014): exceptionally brutal and inventive kills — a corkscrew, a nail gun, a drill — shown in detail.',
  },
  {
    id: 'cmuuw6fqt0061f329ofb9q1fm',
    name: 'Crazy Rich, Incredibly Broke',
    violence: 2,
    language: 4,
    sexNudity: 2,
    scariness: 1,
    sourceNotes: 'AI estimate with lower confidence — could not confirm details on this specific title; treat cautiously. A 2026 Egyptian comedy I cannot confirm; scored as a mainstream PG-13 comedy.',
  },
  {
    id: 'cmuuw6dt7005lf329rdh4phwp',
    name: 'Doing Life',
    violence: 4,
    language: 7,
    sexNudity: 3,
    scariness: 3,
    sourceNotes: 'AI estimate with lower confidence — could not confirm details on this specific title; treat cautiously. A 2026 Tyler Perry title I cannot confirm; scored as a generic R-rated Perry drama, where the rating usually rests on language and theme.',
  },
  {
    id: 'cmuuw6abe004tf329cf9xgel1',
    name: 'The Crazies',
    violence: 8,
    language: 6,
    sexNudity: 1,
    scariness: 8,
    sourceNotes: 'AI assessment from general knowledge (The Crazies, 2010): infected townspeople killing in graphic ways — a pitchfork, a bone saw, a burning; relentlessly tense.',
  },
  {
    id: 'cmukw591n00luuz1wytsdysbm',
    name: 'Warhorse One',
    violence: 7,
    language: 7,
    sexNudity: 1,
    scariness: 4,
    sourceNotes: 'AI estimate with lower confidence — could not confirm details on this specific title; treat cautiously. Lower confidence on specifics, but this is a 2023 Navy SEAL survival action film; scored as sustained graphic combat with military profanity.',
  },
  {
    id: 'cmukw4myl00ghuz1w9bbk251q',
    name: 'No manches, Frida',
    violence: 2,
    language: 5,
    sexNudity: 4,
    scariness: 1,
    sourceNotes: 'AI assessment from general knowledge (No manches Frida, 2016): a Mexican remake of Fack ju Göhte — crude sexual humour and innuendo, very little violence.',
  },
  {
    id: 'cmukw4l5500g1uz1wrw3z8tkb',
    name: 'Legally Blonde 2: Red, White & Blonde',
    violence: 1,
    language: 3,
    sexNudity: 2,
    scariness: 1,
    sourceNotes: 'AI assessment from general knowledge (Legally Blonde 2, 2003): essentially benign; mild innuendo only.',
  },
  {
    id: 'cmukw4jal00fluz1w3o3hzu9z',
    name: 'Killer Heat',
    violence: 5,
    language: 5,
    sexNudity: 4,
    scariness: 3,
    sourceNotes: 'AI assessment from general knowledge (Killer Heat, 2024): a noir murder mystery on Crete — a killing, an affair, and brief sexual content.',
  },
  {
    id: 'cmukw4hx300f9uz1wxd9183k3',
    name: 'Teen Wolf: The Movie',
    violence: 6,
    language: 5,
    sexNudity: 2,
    scariness: 5,
    sourceNotes: 'AI assessment from general knowledge (Teen Wolf: The Movie, 2023): werewolf combat with some gore and supernatural menace.',
  },
  {
    id: 'cmukw4hou00f7uz1wsafyehav',
    name: 'Carlito\'s Way',
    violence: 8,
    language: 9,
    sexNudity: 5,
    scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (Carlito\'s Way, 1993): De Palma crime — a pool-hall massacre and the Grand Central shootout; constant profanity, strip-club nudity and a sex scene.',
  },
  {
    id: 'cmukw430s00bmuz1wg6yjvj62',
    name: 'Once Upon a Time... in Hollywood',
    violence: 8,
    language: 8,
    sexNudity: 4,
    scariness: 5,
    sourceNotes: 'AI assessment from general knowledge (Once Upon a Time in Hollywood, 2019): mostly a relaxed hangout film, then a climax of extreme and graphic violence; cleared for the dashboard on 2026-10-17 as the `satanic cult` tag was simply wrong.',
  },
  {
    id: 'cmukw40wz00b4uz1w2pmvk1mo',
    name: 'The Love Hypothesis',
    violence: 1,
    language: 6,
    sexNudity: 6,
    scariness: 1,
    sourceNotes: 'AI estimate with lower confidence — could not confirm details on this specific title; treat cautiously. A 2026 adaptation of a romance novel whose source material is explicit; an R rating suggests that carried over, but I cannot confirm what is depicted. Scored at the review threshold deliberately so a human rules on it.',
  },
  {
    id: 'cmukw3vuq009wuz1wjedfommb',
    name: 'Fantastic Four',
    violence: 5,
    language: 3,
    sexNudity: 1,
    scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (Fantastic Four, 2015): body-horror transformation imagery and a destructive finale; otherwise mild.',
  },
  {
    id: 'cmukw3dwh005juz1wfmh1wxe6',
    name: 'Happy Gilmore 2',
    violence: 3,
    language: 6,
    sexNudity: 2,
    scariness: 1,
    sourceNotes: 'AI estimate with lower confidence — could not confirm details on this specific title; treat cautiously. A 2025 sequel I cannot confirm in detail; scored to match the original — comic violence and crude language, no real sexual content.',
  },
  {
    id: 'cmukw3ds2005iuz1wz5xtael2',
    name: 'Society of the Snow',
    violence: 6,
    language: 4,
    sexNudity: 2,
    scariness: 8,
    sourceNotes: 'AI assessment from general knowledge (Society of the Snow, 2023): the crash and the avalanche are extended and graphic, and the bodies are shown; cleared on 2026-10-17 because the cannibalism is survival, not predation.',
  },
  {
    id: 'cmukw3dnv005huz1wdxd5gvew',
    name: 'The Mortal Instruments: City of Bones',
    violence: 5,
    language: 3,
    sexNudity: 2,
    scariness: 5,
    sourceNotes: 'AI assessment from general knowledge (City of Bones, 2013): YA demon-hunting action with some grotesque creature imagery.',
  },
  {
    id: 'cmukw3djl005guz1w5i3ypxry',
    name: 'Safe House',
    violence: 8,
    language: 7,
    sexNudity: 2,
    scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (Safe House, 2012): bruising hand-to-hand fights and executions, shot with deliberate brutality.',
  },
  {
    id: 'cmukw3c4c0054uz1wqs9v9n56',
    name: 'After Everything',
    violence: 1,
    language: 6,
    sexNudity: 6,
    scariness: 1,
    sourceNotes: 'AI assessment from general knowledge (After Everything, 2023): the tamest of the After films, but still built on depicted sex; excluded by verdict for consistency with the rest of the series.',
  },
  {
    id: 'cmukw3bny0050uz1wfawafl50',
    name: 'The Interpreter',
    violence: 5,
    language: 4,
    sexNudity: 1,
    scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (The Interpreter, 2005): a bus bombing and an assassination plot; restrained for a political thriller.',
  },
  {
    id: 'cmukw3bf0004yuz1wj2hez460',
    name: 'Roma',
    violence: 5,
    language: 4,
    sexNudity: 5,
    scariness: 6,
    sourceNotes: 'AI assessment from general knowledge (Roma, 2018): the Corpus Christi massacre and an extended stillbirth scene are both hard to watch; full-frontal male nudity in the martial-arts scene is non-sexual.',
  },
  {
    id: 'cmukw39x9004luz1w7yz8yrv5',
    name: '6 Underground',
    violence: 9,
    language: 8,
    sexNudity: 4,
    scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (6 Underground, 2019): Michael Bay at his most gratuitous — eyeballs, impalements and gore played as comedy, plus constant profanity.',
  },
  {
    id: 'cmukw37f50043uz1w8wzwfaii',
    name: 'Rebel Moon - Part One: A Child of Fire',
    violence: 6,
    language: 3,
    sexNudity: 2,
    scariness: 5,
    sourceNotes: 'AI assessment from general knowledge (Rebel Moon Part One, 2023): the PG-13 theatrical cut — heavy sci-fi battle violence with an attempted-assault scene handled off-screen.',
  },
  {
    id: 'cmukw349d003duz1ws73stq4s',
    name: 'Resident Evil: Vendetta',
    violence: 8,
    language: 5,
    sexNudity: 2,
    scariness: 7,
    sourceNotes: 'AI assessment from general knowledge (Resident Evil: Vendetta, 2017): CG zombie action with heavy gore and body horror.',
  },
  {
    id: 'cmukw30z4002luz1wmktmkgzh',
    name: 'Resident Evil: Death Island',
    violence: 8,
    language: 5,
    sexNudity: 1,
    scariness: 7,
    sourceNotes: 'AI assessment from general knowledge (Resident Evil: Death Island, 2023): same register as Vendetta; cleared on 2026-10-17 as creature threat rather than predation.',
  },
  {
    id: 'cmukw2qy80006uz1wqsmqy88m',
    name: 'Top Gun: Maverick',
    violence: 4,
    language: 3,
    sexNudity: 2,
    scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (Top Gun: Maverick, 2022): combat flying with real peril but almost no blood; the romance is chaste.',
  },
  {
    id: 'cmukw2q4f0000uz1wzo110fz0',
    name: 'Unabomber',
    violence: 5,
    language: 6,
    sexNudity: 1,
    scariness: 5,
    sourceNotes: 'AI estimate with lower confidence — could not confirm details on this specific title; treat cautiously. A 2026 Janus Metz title I cannot confirm; scored as a true-crime drama about the bombing campaign — depicted or described bombings, little else.',
  },
  {
    id: 'cmuaw29zz00m6132g9mnicanx',
    name: 'Beast',
    violence: 6,
    language: 5,
    sexNudity: 0,
    scariness: 7,
    sourceNotes: 'AI assessment from general knowledge (Beast, 2022): a rogue lion mauling people on screen; sustained predatory tension.',
  },
  {
    id: 'cmuaw29vr00m5132gthurritz',
    name: 'Rebel Moon - Part Two: The Scargiver',
    violence: 6,
    language: 3,
    sexNudity: 2,
    scariness: 5,
    sourceNotes: 'AI assessment from general knowledge (Rebel Moon Part Two, 2024): the PG-13 cut; a feature-length battle, same register as Part One.',
  },
  {
    id: 'cmuaw296n00lz132g7pcekf2f',
    name: 'Train Dreams',
    violence: 3,
    language: 3,
    sexNudity: 2,
    scariness: 4,
    sourceNotes: 'AI estimate with lower confidence — could not confirm details on this specific title; treat cautiously. A 2025 adaptation of the Denis Johnson novella; scored on the book\'s content — a logging death and the loss of a family, quietly handled.',
  },
  {
    id: 'cmuaw28ua00lw132gqlutjphp',
    name: 'Zero Dark Thirty',
    violence: 7,
    language: 7,
    sexNudity: 1,
    scariness: 6,
    sourceNotes: 'AI assessment from general knowledge (Zero Dark Thirty, 2012): the opening interrogation sequences are prolonged and ugly, and the bombings are sudden; named in src/lib/exclusion.ts as a film that stays in the pool.',
  },
  {
    id: 'cmuaw28co00ls132glfg99j8l',
    name: 'A Big Bold Beautiful Journey',
    violence: 1,
    language: 5,
    sexNudity: 4,
    scariness: 2,
    sourceNotes: 'AI estimate with lower confidence — could not confirm details on this specific title; treat cautiously. A 2025 Kogonada romance I cannot confirm in detail; scored as a gentle R-rated romantic drama.',
  },
  {
    id: 'cmuaw284j00lq132g5h38yzrw',
    name: 'Day Shift',
    violence: 7,
    language: 7,
    sexNudity: 1,
    scariness: 5,
    sourceNotes: 'AI assessment from general knowledge (Day Shift, 2022): vampire-hunting action with contorting bodies and heavy gore, played for laughs.',
  },
  {
    id: 'cmuaw280a00lp132gddhrci0f',
    name: 'Triangle of Sadness',
    violence: 3,
    language: 6,
    sexNudity: 5,
    scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (Triangle of Sadness, 2022): little real violence, but an extended sequence of vomiting and sewage, plus nudity and frank sexual talk.',
  },
  {
    id: 'cmuaw27bc00lj132g1ugc8h01',
    name: 'Carry-On',
    violence: 5,
    language: 5,
    sexNudity: 1,
    scariness: 5,
    sourceNotes: 'AI assessment from general knowledge (Carry-On, 2024): an airport hostage thriller — a few sudden killings and sustained tension.',
  },
  {
    id: 'cmuaw273000lh132gfhyaexvb',
    name: 'Eat Pray Love',
    violence: 1,
    language: 3,
    sexNudity: 3,
    scariness: 1,
    sourceNotes: 'AI assessment from general knowledge (Eat Pray Love, 2010): a travel memoir drama; implied sex, nothing depicted.',
  },
  {
    id: 'cmuaw26us00lf132gezg11ic5',
    name: 'Arthur the King',
    violence: 3,
    language: 4,
    sexNudity: 0,
    scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (Arthur the King, 2024): adventure-race injuries and real peril to the dog, which is the upsetting part.',
  },
  {
    id: 'cmuaw255x00l0132gp7jgahwz',
    name: 'Money Monster',
    violence: 5,
    language: 8,
    sexNudity: 2,
    scariness: 5,
    sourceNotes: 'AI assessment from general knowledge (Money Monster, 2016): a hostage standoff ending in a sudden graphic shooting; heavy profanity throughout.',
  },
  {
    id: 'cmuaw24h300ku132gqap06vkb',
    name: 'Extraction',
    violence: 9,
    language: 8,
    sexNudity: 1,
    scariness: 5,
    sourceNotes: 'AI assessment from general knowledge (Extraction, 2020): continuous and very graphic combat, including violence involving teenagers.',
  },
  {
    id: 'cmuaw20qs00jx132g7buhjduf',
    name: 'Army of the Dead',
    violence: 9,
    language: 8,
    sexNudity: 3,
    scariness: 7,
    sourceNotes: 'AI assessment from general knowledge (Army of the Dead, 2021): Snyder zombie carnage — dismemberment and gore throughout, plus brief nudity.',
  },
  {
    id: 'cmuaw1qgi00he132gv8288v0n',
    name: 'The Ministry of Ungentlemanly Warfare',
    violence: 8,
    language: 6,
    sexNudity: 2,
    scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (Ministry of Ungentlemanly Warfare, 2024): gleeful, bloody WWII commando violence — throats cut, Nazis shot at close range.',
  },
  {
    id: 'cmuaw1o3b00gt132g344hik5f',
    name: 'Lust Stories 3',
    violence: 2,
    language: 5,
    sexNudity: 7,
    scariness: 1,
    sourceNotes: 'AI estimate with lower confidence — could not confirm details on this specific title; treat cautiously. A 2026 entry in an anthology series explicitly about sex; scored on the series\' established content rather than on scenes I can confirm.',
  },
  {
    id: 'cmuaw1nz500gs132guruq9zhj',
    name: 'Best of the Best',
    violence: 3,
    language: 3,
    sexNudity: 1,
    scariness: 2,
    sourceNotes: 'AI estimate with lower confidence — could not confirm details on this specific title; treat cautiously. A 2026 Lena Khan title I cannot confirm; scored as a mainstream PG-13 family-adjacent film.',
  },
  {
    id: 'cmuaw1mrx00gi132gqrw4uooh',
    name: 'Little Italy',
    violence: 1,
    language: 6,
    sexNudity: 4,
    scariness: 1,
    sourceNotes: 'AI assessment from general knowledge (Little Italy, 2018): a light romantic comedy whose R rests on language and sexual references.',
  },
  {
    id: 'cmuaw1ig000fg132gl1eflsa7',
    name: 'The AI Doc: Or How I Became an Apocaloptimist',
    violence: 1,
    language: 4,
    sexNudity: 0,
    scariness: 3,
    sourceNotes: 'AI estimate with lower confidence — could not confirm details on this specific title; treat cautiously. A 2026 documentary I cannot confirm; scored as a talking-heads documentary whose only discomfort is its subject matter.',
  },
  {
    id: 'cmuaw10e100b3132g5in7sl8k',
    name: 'Lucky Number Slevin',
    violence: 7,
    language: 7,
    sexNudity: 4,
    scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (Lucky Number Slevin, 2006): stylised but graphic killings including a torture scene; a sex scene with brief nudity.',
  },
  {
    id: 'cmuaw0zvs00az132gpqbwgwx7',
    name: 'Judge Dredd',
    violence: 7,
    language: 6,
    sexNudity: 2,
    scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (Judge Dredd, 1995): heavy futuristic gunplay and executions, bloodier than its PG-13 contemporaries.',
  },
  {
    id: 'cmuaw0zjj00aw132g108s4r41',
    name: 'Upgraded',
    violence: 1,
    language: 5,
    sexNudity: 3,
    scariness: 1,
    sourceNotes: 'AI assessment from general knowledge (Upgraded, 2024): a light romantic comedy; the R is language and innuendo.',
  },
  {
    id: 'cmuaw0yv400aq132ggk1y2gu6',
    name: 'Carrie',
    violence: 7,
    language: 6,
    sexNudity: 3,
    scariness: 8,
    sourceNotes: 'AI assessment from general knowledge (Carrie, 2013): the prom massacre is extended and graphic, and the bullying and menstruation scenes are deliberately distressing.',
  },
  {
    id: 'cmuaw0xp300ag132gn0ovyp7x',
    name: 'The Longest Yard',
    violence: 5,
    language: 6,
    sexNudity: 3,
    scariness: 2,
    sourceNotes: 'AI assessment from general knowledge (The Longest Yard, 2005): football brutality played for laughs, prison violence, and crude sexual humour.',
  },
  {
    id: 'cmuaw0wqw00a9132g8fj9r46k',
    name: 'Superhero Movie',
    violence: 3,
    language: 5,
    sexNudity: 4,
    scariness: 1,
    sourceNotes: 'AI assessment from general knowledge (Superhero Movie, 2008): a spoof — slapstick violence and persistent crude sexual gags.',
  },
  {
    id: 'cmuaw0whq00a7132ggr2dtqs4',
    name: 'Men of Honor',
    violence: 4,
    language: 7,
    sexNudity: 2,
    scariness: 4,
    sourceNotes: 'AI assessment from general knowledge (Men of Honor, 2000): a Navy diver drama — an amputation and diving accidents, with heavy racist language as part of the subject.',
  },
  {
    id: 'cmuaw0w5100a4132gt77yh9ps',
    name: 'Licorice Pizza',
    violence: 2,
    language: 7,
    sexNudity: 3,
    scariness: 2,
    sourceNotes: 'AI assessment from general knowledge (Licorice Pizza, 2021): no real violence; constant profanity and frank teenage sexual talk, but nothing depicted. Cleared for the dashboard on 2026-10-17.',
  },
  {
    id: 'cmuaw0vfv009y132gz9boz2we',
    name: 'Dark Angel',
    violence: 7,
    language: 6,
    sexNudity: 3,
    scariness: 5,
    sourceNotes: 'AI assessment from general knowledge (Dark Angel, 1990, aka I Come in Peace): an alien-drug-dealer action film — shootouts, exploding bodies and a forced-overdose premise.',
  },
]

// Hand-ranked order carried forward from the first pass of 2026-10-17 —
// the taste history has not moved since, so the reasoning there still
// holds and is not restated here. Anything that has become invisible in
// the meantime (Blade Runner 2049, if its pending review stands) simply
// drops out and the assertion below still has to pass.
const FAMILY_TOP_ORDER: string[] = [
  'cmtf5jfie00byezj8p2ngenfe', // How to Train Your Dragon (2010)
  'cmtf5jgj000c5ezj80kf8nu7b', // How to Train Your Dragon 2
  'cmtf5iy0n007bezj8kao41w9w', // Toy Story 2
  'cmtf5iwvh006zezj81yue2bmk', // Toy Story 3
  'cmtf5j082007tezj89mkjtka5', // Toy Story 4
  'cmv4wadxa00gom9frs9i5adys', // Toy Story 5
  'cmtf5j3i4008tezj82dtrnc66', // The Empire Strikes Back
  'cmtf5jd5e00b3ezj8vf4a4te3', // Return of the Jedi
  'cmtf5ixr00077ezj8ko0nke0g', // Inside Out
  'cmtf5iwbb006vezj8h9z29vbz', // Inside Out 2
  'cmtf5j8fl009xezj8j5u41ow3', // Finding Dory
  'cmu0vysio00g7h0gu4sokqvpu', // Wish Dragon
  'cmu0vylov00eoh0gu7t43e0y6', // The Sea Beast
  'cmtf5j2r3008iezj8xeygm6bl', // Elemental
  'cmtf5j6u8009hezj843mxge79', // Elio
  'cmtf5j4t30091ezj82rgk9gxr', // A Bug's Life
  'cmtf5iezx002fezj8it8add9d', // The Bad Guys
  'cmtf5ibhd001iezj8ev6wk7ax', // The Bad Guys 2
  'cmtf5j2xt008lezj8ieycrebc', // Ralph Breaks the Internet
  'cmtf5jir100cpezj8js5bi5l6', // Migration
  'cmtdn2glm003drvj4621nxyc6', // The Super Mario Galaxy Movie
  'cmtf5iy53007dezj8hdvp7x73', // Moana 2
  'cmukw3z5000apuz1wc3c08moa', // Meet the Robinsons
  'cmukw3ztl00avuz1w4wg6gyy2', // Spies in Disguise
  'cmv4w9b0f006bm9frr882o8da', // The Grinch (2018)
  'cmuuw6423003ff329z4kj7l7p', // The Adventures of Tintin
  'cmuuw61xl002yf329bt807tu3', // Close Encounters of the Third Kind
  'cmuuw6siv008xf3293mfljjqo', // Horton Hears a Who!
  'cmtf5k9xg00j6ezj83nj1q9es', // Dog Man
  'cmv4wadlr00glm9frxvnwwcjm', // Antz
]

const ADULT_TOP_ORDER: string[] = [
  'cmuuw6h82006df3295i4bm2fh', // The Prestige
  'cmuuw5rr3000pf3296vwlvtrr', // Arrival
  'cmuuw5rw1000qf329yw0e9oel', // Saving Private Ryan
  'cmuaw28ua00lw132gqlutjphp', // Zero Dark Thirty
  'cmuuw810d00ixf329ez1ujs3t', // Casino Royale
  'cmuuw86rf00k8f3295rucodjq', // Skyfall
  'cmukw2qy80006uz1wqsmqy88m', // Top Gun: Maverick
  'cmuuw6jjq006wf329a2zhndfd', // The Bourne Identity
  'cmuuw6tzh0099f3295f2tlzam', // The Bourne Supremacy
  'cmuuw6se1008wf3296v89785u', // The Bourne Ultimatum
  'cmuuw84jc00jqf329t5hpo657', // Minority Report
  'cmuuw8cg600lif3291zesys7h', // Lone Survivor
  // Promoted 2026-10-17 on three ratings given in conversation: The Gray
  // Man and Extraction both LOVED, and In the Grey (Guy Ritchie, 2026)
  // LIKED. Mercenary-and-heist action is now the strongest single vein in
  // the Adult history, and Ritchie is the name attached to it.
  'cmuuw7v9d00hnf329etm0lgc4', // Wrath of Man — Ritchie heist-revenge; the closest match in the pool to In the Grey
  'cmuuw80r300ivf329210wn8lv', // Snatch — the Ritchie back catalogue, now that four of his films are rated LIKED or better
  'cmtgukwvv00gh11ut7bdk39zw', // Enemy of the State — Tony Scott surveillance thriller; sits directly beside the three Bourne films above
  'cmuuw7rtp00gvf329hrucwhwn', // Blade Runner 2049 — may drop out pending its review
  'cmv4w8vgi0026m9fr1ae5jhdy', // Heat
  'cmtf5k7d300ihezj8ia4ker92', // Source Code
  'cmuuw5rmf000of329l4qrhwjp', // Catch Me If You Can
  'cmukw3ds2005iuz1wz5xtael2', // Society of the Snow
  'cmuuw67ac0045f3297341tbri', // Cloverfield
  'cmuuw89vp00kxf329grek9hjq', // Spectre
  'cmuuw7w4n00huf329makav4ww', // No Time to Die
  'cmv4w93p5004dm9frnhuy2rhn', // GoldenEye
  'cmuuw8aqf00l4f329110blrei', // Quantum of Solace
  'cmtf5ieqn002bezj8ha9oxloc', // The Hunger Games: The Ballad of Songbirds & Snakes
  'cmtqvvz2h00l5cox7y3mybamm', // Crimson Tide
  'cmuuw5t4m0010f3290tpd5fr2', // War of the Worlds (2005)
  'cmtf5j9h700a7ezj8m329zqgc', // Indiana Jones and the Last Crusade
  'cmtqvvxwc00kxcox7woua3eck', // Patriots Day
]

async function writeContentScores() {
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
  }
  console.log(`Wrote ${CONTENT_RATINGS.length} content score(s).`)
}

async function writeRankingCache(mode: 'FAMILY' | 'ADULT', topOrder: string[]) {
  // Re-fetch rather than trusting anything cached in this process.
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

  // A candidate missing from rankedIds does not sink to the bottom of the
  // dashboard — it disappears from it.
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
  const stage = process.argv[2]
  if (stage === 'scores') {
    await writeContentScores()
  } else if (stage === 'rank') {
    await writeRankingCache('FAMILY', FAMILY_TOP_ORDER)
    await writeRankingCache('ADULT', ADULT_TOP_ORDER)
  } else {
    throw new Error('usage: manual-batch-2026-10-17b.ts <scores|rank>')
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
