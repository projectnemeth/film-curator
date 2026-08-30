// Pure so it's testable with plain numbers — Date.now mocking proved flaky
// elsewhere in this project (an unrelated Date.now() call during a request
// can shift a call-counting spy by one).
export const INGEST_HARD_DEADLINE_MS = 280_000

export function hasTimeRemaining(functionStart: number, now: number): boolean {
  return now - functionStart < INGEST_HARD_DEADLINE_MS
}
