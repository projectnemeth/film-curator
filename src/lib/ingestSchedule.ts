// Pure so it's testable with plain numbers — Date.now mocking proved flaky
// elsewhere in this project (an unrelated Date.now() call during a request
// can shift a call-counting spy by one).
export const INGEST_HARD_DEADLINE_MS = 280_000

export function hasTimeRemaining(functionStart: number, now: number): boolean {
  return now - functionStart < INGEST_HARD_DEADLINE_MS
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000

// Rotates which provider starts the run, so a time-budget cutoff mid-run
// doesn't always starve the same provider (previously always last:
// peacock). Pure so it's testable with plain numbers.
export function rotateProviderOrder<T>(ids: T[], now: number): T[] {
  if (ids.length === 0) return []
  const offset = Math.floor(now / ONE_DAY_MS) % ids.length
  return [...ids.slice(offset), ...ids.slice(0, offset)]
}
