// Standing family rule: no films built around sadistic predation or occult
// darkness. This is deliberately NOT a genre filter — TMDB tags Get Out as
// Horror (kept) and The Silence of the Lambs as Crime/Drama (excluded), so
// genre gets both wrong. What actually separates them is subject matter:
// violence inflicted on the helpless for its own sake, and demonic/satanic
// material. War, combat, and crime violence are explicitly fine — Sicario,
// Saving Private Ryan and Zero Dark Thirty all stay in the pool.
//
// TMDB keywords are crowd-sourced and tell you a theme is PRESENT, not that
// the film is ABOUT it: The Dark Knight carries `sadism` for the Joker but
// is not a sadism film. So these lists are tuned for recall, not precision —
// they nominate titles for review, and the stored review verdict
// (Title.contentFlag) is what actually decides. Over-flagging costs a review;
// under-flagging puts a film in front of the family that shouldn't be there.

export type ExclusionCategory = 'PREDATION' | 'OCCULT' | 'LGBTQ'

export type ExclusionTrigger = {
  category: ExclusionCategory
  keyword: string
}

// Violence done to someone who cannot fight back, as the point of the film.
// Broad terms that war and crime films share — `brutality`, `murder`,
// `violence`, `interrogation`, `kidnapping` — are deliberately absent:
// they are what would wrongly catch Sicario and Get Out.
const PREDATION_KEYWORDS = new Set([
  'sadism',
  'sadist',
  'sadistic',
  'sadistic horror',
  'torture',
  'torturing',
  'torture porn',
  'serial killer',
  'serial murder',
  'serial murderer',
  'cannibal',
  'cannibalism',
  'skinning',
  'mutilation',
  'dismemberment',
  'snuff film',
  'slasher',
  'splatter',
  'gore',
  'extreme violence',
  'survival horror',
  'death game',
  'psychological horror',
  'crime horror',
  'rape',
  'sexual violence',
  'child murder',
  'human experimentation',
])

// Demonic, satanic and ritual-occult material. `supernatural` and `ghost`
// on their own are too broad (they sweep up ghost stories and fantasy), so
// only the explicitly dark compounds are listed.
const OCCULT_KEYWORDS = new Set([
  'demon',
  'demonic',
  'demonic possession',
  'demonic entity',
  'satan',
  'satanic',
  'satanism',
  'satanic ritual',
  'satanic cult',
  'devil',
  'antichrist',
  'exorcism',
  'exorcist',
  'possession',
  'possessed',
  'possessed child',
  'occult',
  'occultism',
  'witchcraft',
  'coven',
  'seance',
  'séance',
  'ritual murder',
  'human sacrifice',
  'black magic',
  'supernatural horror',
  'religious horror',
  'paranormal',
  'paranormal phenomena',
])

// LGBTQ subject matter, per the family's stated preference.
//
// This list behaves differently from the two above and the difference is
// worth knowing: `sadistic horror` describes what Saw IS, but `lgbt` is
// applied to any film with a gay supporting character or a single plot
// beat — Green Book and Clueless carry it alongside films actually about
// the subject. So expect a low hit rate on central cases and a high share
// of incidental ones, and lean on review (Title.contentFlag) accordingly.
//
// Recall is weaker too: crowd-sourced tagging favours films where the
// subject is marketed, so quieter instances carry no tag at all. This
// filter is dependable on overt cases and patchy everywhere else.
//
// `gender disguise` is deliberately absent — its only hit in this catalog
// is Mulan (1998, G), where it means she poses as a soldier.
const LGBTQ_KEYWORDS = new Set([
  'lgbt',
  'lgbtq',
  'lgbtq+',
  'gay',
  'gay theme',
  'gay youth',
  'gay romance',
  'gay relationship',
  'gay couple',
  'gay parent',
  'gay marriage',
  'gay bar',
  'gay pride',
  'lesbian',
  'lesbian relationship',
  'bisexual',
  'bisexual man',
  'bisexual woman',
  'bisexuality',
  'transgender',
  'trans woman',
  'trans man',
  'trans girl',
  'trans female',
  'queer',
  'homosexuality',
  'closeted homosexual',
  'coming out',
  'same sex relationship',
  'same-sex relationship',
  'same sex marriage',
  'drag queen',
])

const WATCHLISTS: ReadonlyArray<readonly [ExclusionCategory, Set<string>]> = [
  ['PREDATION', PREDATION_KEYWORDS],
  ['OCCULT', OCCULT_KEYWORDS],
  ['LGBTQ', LGBTQ_KEYWORDS],
]

function normalize(keyword: string): string {
  return keyword.trim().toLowerCase()
}

// Whole-keyword matching only. Substring matching would read "possession of
// a firearm" as demonic possession.
export function findExclusionTriggers(keywords: string[]): ExclusionTrigger[] {
  const triggers: ExclusionTrigger[] = []
  const seen = new Set<string>()

  for (const raw of keywords) {
    const keyword = normalize(raw)
    if (seen.has(keyword)) continue

    for (const [category, watchlist] of WATCHLISTS) {
      if (watchlist.has(keyword)) {
        triggers.push({ category, keyword })
        seen.add(keyword)
        break
      }
    }
  }

  return triggers
}

// A reviewed verdict always wins over the keyword heuristic. Unreviewed
// titles fail closed if flagged and open if not: suspects stay hidden until
// someone looks at them, while the untouched majority of the catalog is
// unaffected.
// Sexual content is nominated by the stored ContentScore rather than by
// keywords, because the number is the only signal that tracks how much is
// actually on screen.
//
// The two-tier split is deliberate. A score of 6 is where NON-SEXUAL
// nudity lives: Schindler's List scores 6 for concentration-camp nudity
// and The Northman for pagan ritual, neither of which is what the family
// is filtering — they want sex scenes out, not nudity as such. The score
// measures quantity, not intent, so 6 goes to a human instead of being
// decided by arithmetic. 7 and above has, in this catalog, meant explicit
// sexual content every time.
export const SEX_NUDITY_AUTO_EXCLUDE = 7
export const SEX_NUDITY_REVIEW = 6

export type ScoreNomination = {
  kind: 'AUTO_EXCLUDE' | 'REVIEW'
  dimension: 'sexNudity'
  value: number
}

// An absent score is NOT treated as suspect. Only a minority of visible
// titles are scored at any time (84 of 289 in Adult as of 2026-09-06),
// and failing closed on missing data would hide most of the catalog.
export function findScoreNomination(contentScore: { sexNudity: number } | null | undefined): ScoreNomination | null {
  if (!contentScore) return null
  const value = contentScore.sexNudity
  if (value >= SEX_NUDITY_AUTO_EXCLUDE) return { kind: 'AUTO_EXCLUDE', dimension: 'sexNudity', value }
  if (value >= SEX_NUDITY_REVIEW) return { kind: 'REVIEW', dimension: 'sexNudity', value }
  return null
}

// A reviewed verdict always wins over both heuristics. Unreviewed titles
// fail closed if either the keywords or the score nominate them, and open
// if neither does.
export function isHiddenByExclusion(
  contentFlag: string | null,
  keywords: string[],
  contentScore?: { sexNudity: number } | null
): boolean {
  if (contentFlag === 'EXCLUDED') return true
  if (contentFlag === 'CLEAR') return false
  if (findScoreNomination(contentScore) !== null) return true
  return findExclusionTriggers(keywords).length > 0
}
