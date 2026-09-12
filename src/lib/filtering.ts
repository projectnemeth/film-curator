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

// The single visibility gate for a title: it must belong to this mode AND
// survive the family's standing exclusion rule. Both callers (the dashboard
// and the taste interview) go through here, so an excluded film is never
// shown and never asked about.
//
// Which mode a title belongs to is normally its MPAA bucket, but a manual
// override wins: a PG film can be perfectly age-appropriate and still be no
// fun for the kids, so it can be moved wholesale into Adult Mode (and vice
// versa). The override names exactly ONE mode, which is what keeps Family
// and Adult non-overlapping — an earlier global Override table granted
// blanket approval with no mode attached, silently unlocked titles in both
// modes, and was removed for exactly that reason.
//
// The override decides WHICH mode a title lives in, never WHETHER the
// family's exclusion rule applies to it; that check runs either way.
export function isTitleVisible(
  title: {
    mpaaRating: string | null
    contentFlag: string | null
    keywords: string[]
    contentScore?: { sexNudity: number } | null
    modeOverride?: 'FAMILY' | 'ADULT' | null
  },
  mode: 'FAMILY' | 'ADULT'
): boolean {
  const belongsToMode = title.modeOverride
    ? title.modeOverride === mode
    : isRatingVisibleInMode(title.mpaaRating, mode)
  if (!belongsToMode) return false
  return !isHiddenByExclusion(title.contentFlag, title.keywords, title.contentScore)
}
