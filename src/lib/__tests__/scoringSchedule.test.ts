import { describe, it, expect } from 'vitest'
import { timeoutForNextAttempt } from '../scoringSchedule'

describe('timeoutForNextAttempt', () => {
  it('caps the timeout to whatever time remains before the hard deadline, when that is less than the per-title max', () => {
    // HARD_DEADLINE_MS=280_000; 200_000ms elapsed leaves 80_000ms remaining, under the 240_000ms max.
    expect(timeoutForNextAttempt(0, 200_000)).toBe(80_000)
  })

  it('caps the timeout to the per-title max, when more than that much time remains', () => {
    // At time zero, the full 280_000ms remains — bigger than the 240_000ms per-title max.
    expect(timeoutForNextAttempt(0, 0)).toBe(240_000)
  })

  it('returns null once too little time remains for a useful attempt', () => {
    // 250_000ms elapsed leaves only 30_000ms remaining, under the 45_000ms floor.
    expect(timeoutForNextAttempt(0, 250_000)).toBeNull()
  })

  it('returns null once the hard deadline has already passed', () => {
    expect(timeoutForNextAttempt(0, 999_999)).toBeNull()
  })
})
