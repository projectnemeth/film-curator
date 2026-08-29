// Real scoring calls (web search + web fetch + adaptive thinking) were measured live at
// 48s-527s per title — far too variable for two independent fixed timeouts to stay safely
// under maxDuration. Instead each attempt gets whatever time remains before HARD_DEADLINE_MS,
// capped at MAX_PER_TITLE_TIMEOUT_MS, which guarantees the scoring phase can never run the
// function past its deadline regardless of how long ingestion took or how many attempts run.
export const HARD_DEADLINE_MS = 280_000
export const MAX_PER_TITLE_TIMEOUT_MS = 240_000
export const MIN_USEFUL_ATTEMPT_MS = 45_000

// Pure so it's testable with plain numbers — no Date mocking, which is flaky
// here since any unrelated Date.now() call during the request (even a console
// log's internal stream write) can shift a call-counting spy by one.
export function timeoutForNextAttempt(functionStart: number, now: number): number | null {
  const remaining = HARD_DEADLINE_MS - (now - functionStart)
  if (remaining < MIN_USEFUL_ATTEMPT_MS) return null
  return Math.min(MAX_PER_TITLE_TIMEOUT_MS, remaining)
}
