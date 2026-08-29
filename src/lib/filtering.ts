export type OverrideInput = { decision: 'APPROVED' | 'REJECTED' } | null

const FAMILY_SHOWN_RATINGS = new Set(['G', 'PG', 'TV-Y', 'TV-Y7', 'TV-G', 'TV-PG'])
const ADULT_SHOWN_RATINGS = new Set(['PG-13', 'R', 'TV-14', 'TV-MA'])

export function isRatingVisibleInMode(mpaaRating: string | null, mode: 'FAMILY' | 'ADULT'): boolean {
  if (!mpaaRating) return false
  return mode === 'FAMILY' ? FAMILY_SHOWN_RATINGS.has(mpaaRating) : ADULT_SHOWN_RATINGS.has(mpaaRating)
}

export function isTitleVisible(mpaaRating: string | null, override: OverrideInput, mode: 'FAMILY' | 'ADULT'): boolean {
  if (override?.decision === 'APPROVED') return true
  if (override?.decision === 'REJECTED') return false
  return isRatingVisibleInMode(mpaaRating, mode)
}
