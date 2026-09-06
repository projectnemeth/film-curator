import { isHiddenByExclusion } from './exclusion'

// Movies only — TV shows are never ingested or searched for, but existing
// TV-rated titles (TV-Y, TV-14, TV-MA, etc.) are excluded here too, so
// nothing already in the catalog before this restriction slips through.
const FAMILY_SHOWN_RATINGS = new Set(['G', 'PG'])
const ADULT_SHOWN_RATINGS = new Set(['PG-13', 'R'])

export function isRatingVisibleInMode(mpaaRating: string | null, mode: 'FAMILY' | 'ADULT'): boolean {
  if (!mpaaRating) return false
  return mode === 'FAMILY' ? FAMILY_SHOWN_RATINGS.has(mpaaRating) : ADULT_SHOWN_RATINGS.has(mpaaRating)
}

// The single visibility gate for a title: it must fit the mode's rating
// bucket AND survive the family's standing exclusion rule. Both callers
// (the dashboard and the taste interview) go through here, so an excluded
// film is never shown and never asked about.
export function isTitleVisible(
  title: {
    mpaaRating: string | null
    contentFlag: string | null
    keywords: string[]
    contentScore?: { sexNudity: number } | null
  },
  mode: 'FAMILY' | 'ADULT'
): boolean {
  if (!isRatingVisibleInMode(title.mpaaRating, mode)) return false
  return !isHiddenByExclusion(title.contentFlag, title.keywords, title.contentScore)
}
