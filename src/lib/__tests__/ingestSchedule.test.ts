import { describe, it, expect } from 'vitest'
import { hasTimeRemaining, INGEST_HARD_DEADLINE_MS } from '../ingestSchedule'

describe('hasTimeRemaining', () => {
  it('returns true when well within the deadline', () => {
    expect(hasTimeRemaining(0, 1_000)).toBe(true)
  })

  it('returns false once the deadline has passed', () => {
    expect(hasTimeRemaining(0, INGEST_HARD_DEADLINE_MS + 1)).toBe(false)
  })

  it('returns false exactly at the deadline', () => {
    expect(hasTimeRemaining(0, INGEST_HARD_DEADLINE_MS)).toBe(false)
  })
})
