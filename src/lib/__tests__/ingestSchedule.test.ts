import { describe, it, expect } from 'vitest'
import { hasTimeRemaining, INGEST_HARD_DEADLINE_MS, rotateProviderOrder } from '../ingestSchedule'

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

describe('rotateProviderOrder', () => {
  const ids = [8, 337, 9, 386]
  const oneDayMs = 24 * 60 * 60 * 1000

  it('starts from the beginning on day 0', () => {
    expect(rotateProviderOrder(ids, 0)).toEqual([8, 337, 9, 386])
  })

  it('rotates the starting provider forward by one day', () => {
    expect(rotateProviderOrder(ids, oneDayMs)).toEqual([337, 9, 386, 8])
  })

  it('wraps back around after a full cycle', () => {
    expect(rotateProviderOrder(ids, oneDayMs * ids.length)).toEqual([8, 337, 9, 386])
  })

  it('preserves every id with none dropped or duplicated', () => {
    const rotated = rotateProviderOrder(ids, oneDayMs * 2)
    expect([...rotated].sort()).toEqual([...ids].sort())
  })

  it('returns an empty array unchanged', () => {
    expect(rotateProviderOrder([], oneDayMs)).toEqual([])
  })
})
