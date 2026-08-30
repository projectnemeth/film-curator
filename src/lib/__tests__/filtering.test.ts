import { describe, it, expect } from 'vitest'
import { isRatingVisibleInMode } from '../filtering'

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
