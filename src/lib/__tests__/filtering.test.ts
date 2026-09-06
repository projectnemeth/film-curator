import { describe, it, expect } from 'vitest'
import { isRatingVisibleInMode, isTitleVisible } from '../filtering'

describe('isRatingVisibleInMode', () => {
  it('shows G and PG in Family Mode', () => {
    expect(isRatingVisibleInMode('G', 'FAMILY')).toBe(true)
    expect(isRatingVisibleInMode('PG', 'FAMILY')).toBe(true)
  })

  it('hides PG-13 and R in Family Mode', () => {
    expect(isRatingVisibleInMode('PG-13', 'FAMILY')).toBe(false)
    expect(isRatingVisibleInMode('R', 'FAMILY')).toBe(false)
  })

  it('hides NC-17 in Family Mode', () => {
    expect(isRatingVisibleInMode('NC-17', 'FAMILY')).toBe(false)
  })

  it('hides TV ratings in Family Mode — movies only', () => {
    expect(isRatingVisibleInMode('TV-Y', 'FAMILY')).toBe(false)
    expect(isRatingVisibleInMode('TV-PG', 'FAMILY')).toBe(false)
    expect(isRatingVisibleInMode('TV-14', 'FAMILY')).toBe(false)
    expect(isRatingVisibleInMode('TV-MA', 'FAMILY')).toBe(false)
  })

  it('shows PG-13 and R in Adult Mode', () => {
    expect(isRatingVisibleInMode('PG-13', 'ADULT')).toBe(true)
    expect(isRatingVisibleInMode('R', 'ADULT')).toBe(true)
  })

  it('hides G and PG in Adult Mode — Family and Adult are non-overlapping buckets', () => {
    expect(isRatingVisibleInMode('G', 'ADULT')).toBe(false)
    expect(isRatingVisibleInMode('PG', 'ADULT')).toBe(false)
  })

  it('hides NC-17 in Adult Mode', () => {
    expect(isRatingVisibleInMode('NC-17', 'ADULT')).toBe(false)
  })

  it('hides TV ratings in Adult Mode — movies only', () => {
    expect(isRatingVisibleInMode('TV-14', 'ADULT')).toBe(false)
    expect(isRatingVisibleInMode('TV-MA', 'ADULT')).toBe(false)
  })

  it('hides a null/missing rating (unrated) in both modes', () => {
    expect(isRatingVisibleInMode(null, 'FAMILY')).toBe(false)
    expect(isRatingVisibleInMode(null, 'ADULT')).toBe(false)
  })
})

describe('isTitleVisible', () => {
  const clean = { mpaaRating: 'R', contentFlag: null, keywords: ['heist', 'revenge'] }

  it('shows a title that passes both the mode and exclusion checks', () => {
    expect(isTitleVisible(clean, 'ADULT')).toBe(true)
  })

  it('hides a title excluded by mode even when the exclusion rule clears it', () => {
    expect(isTitleVisible({ ...clean, contentFlag: 'CLEAR' }, 'FAMILY')).toBe(false)
  })

  it('hides a title reviewed as EXCLUDED even when its rating fits the mode', () => {
    expect(isTitleVisible({ ...clean, contentFlag: 'EXCLUDED' }, 'ADULT')).toBe(false)
  })

  it('hides an unreviewed title whose keywords trip a watchlist', () => {
    expect(isTitleVisible({ ...clean, keywords: ['serial killer'] }, 'ADULT')).toBe(false)
  })

  it('shows a keyword-flagged title once it has been reviewed as CLEAR', () => {
    expect(isTitleVisible({ ...clean, keywords: ['sadism'], contentFlag: 'CLEAR' }, 'ADULT')).toBe(true)
  })

  it('treats a title with no keywords yet as unflagged rather than suspect', () => {
    // Titles ingested before keywords were captured must not all vanish.
    expect(isTitleVisible({ ...clean, keywords: [] }, 'ADULT')).toBe(true)
  })
})
