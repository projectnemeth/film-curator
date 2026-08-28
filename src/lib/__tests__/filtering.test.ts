import { describe, it, expect } from 'vitest'
import { evaluateTitle, isVisibleInMode, type ContentScoreInput, type ModeThresholds } from '../filtering'

const familyThresholds: ModeThresholds = {
  maxViolence: 4,
  maxLanguage: 2,
  maxSexNudity: 1,
  maxScariness: 5,
  allowUnrated: false,
  allowNC17: false,
}

const adultThresholds: ModeThresholds = {
  maxViolence: 8,
  maxLanguage: 8,
  maxSexNudity: 3,
  maxScariness: 10,
  allowUnrated: false,
  allowNC17: false,
}

function score(overrides: Partial<ContentScoreInput> = {}): ContentScoreInput {
  return { violence: 1, language: 1, sexNudity: 0, scariness: 1, isUnrated: false, isNC17: false, ...overrides }
}

describe('evaluateTitle', () => {
  it('passes a clean title under Family Mode thresholds', () => {
    expect(evaluateTitle(score(), familyThresholds, null)).toBe('passes')
  })

  it('fails a title exceeding a single category threshold', () => {
    expect(evaluateTitle(score({ sexNudity: 2 }), familyThresholds, null)).toBe('fails_category')
  })

  it('returns unscored when there is no content score and no override', () => {
    expect(evaluateTitle(null, familyThresholds, null)).toBe('unscored')
  })

  it('excludes NC-17 titles under Adult Mode by default', () => {
    expect(evaluateTitle(score({ isNC17: true }), adultThresholds, null)).toBe('fails_category')
  })

  it('excludes unrated titles under Adult Mode by default', () => {
    expect(evaluateTitle(score({ isUnrated: true }), adultThresholds, null)).toBe('fails_category')
  })

  it('an approved override wins even over NC-17', () => {
    expect(evaluateTitle(score({ isNC17: true }), adultThresholds, { decision: 'APPROVED' })).toBe('override_approved')
  })

  it('a rejected override wins even over a passing score', () => {
    expect(evaluateTitle(score(), familyThresholds, { decision: 'REJECTED' })).toBe('override_rejected')
  })
})

describe('isVisibleInMode', () => {
  it('hides unscored titles in Family Mode (fail closed)', () => {
    expect(isVisibleInMode('unscored', 'FAMILY')).toBe(false)
  })

  it('shows unscored titles in Adult Mode (flagged by the caller)', () => {
    expect(isVisibleInMode('unscored', 'ADULT')).toBe(true)
  })

  it('hides rejected overrides in both modes', () => {
    expect(isVisibleInMode('override_rejected', 'FAMILY')).toBe(false)
    expect(isVisibleInMode('override_rejected', 'ADULT')).toBe(false)
  })

  it('shows passing and approved titles in both modes', () => {
    expect(isVisibleInMode('passes', 'FAMILY')).toBe(true)
    expect(isVisibleInMode('override_approved', 'ADULT')).toBe(true)
  })

  it('hides fails_category in both modes', () => {
    expect(isVisibleInMode('fails_category', 'FAMILY')).toBe(false)
    expect(isVisibleInMode('fails_category', 'ADULT')).toBe(false)
  })
})
