# Content-Scoring Architecture Fix — Design Spec

Date: 2026-08-29

## Purpose

An adversarial pressure-test confirmed live that real content-scoring calls
(web search + web fetch + adaptive thinking) can take 8.5+ minutes, while
they were being triggered lazily inside live, user-facing page requests.
Even Vercel Hobby's generous Fluid Compute duration ceiling (300s/5 minutes
— verified directly against current Vercel docs, not assumed) doesn't cover
the observed worst case, and no family member should ever be staring at a
multi-minute-or-longer dashboard load regardless of the exact timeout
number. This spec moves scoring entirely out of the live request path and
into the weekly ingestion cron, where it belongs.

## Scope

- `src/lib/contentScoring.ts`: add real cancellation support (not just
  "stop waiting" — actually abort the in-flight Anthropic request) so a
  slow scoring attempt can be cut off without continuing to run up cost.
- `src/app/api/ingest/route.ts`: after ingesting new titles, work through
  the backlog of unscored titles within a time budget, with a hard
  per-title timeout.
- `src/app/api/recommendations/route.ts`: remove all lazy scoring — the
  dashboard becomes fast and predictable regardless of how many titles are
  currently unscored.
- No schema changes. No change to `src/lib/filtering.ts` (the fail-closed
  behavior for unscored titles already does exactly what's needed here —
  this spec just changes *when* a score gets computed, never the safety
  logic around missing scores).

## Verified platform constraint

Vercel Hobby plan, with Fluid Compute (the default for this project, since
it predates none of the pre-April-2025 legacy defaults): function duration
default **and** maximum are both **300 seconds**. Cron jobs on Hobby have a
once-per-day minimum interval floor, which doesn't affect a weekly
schedule. (Verified directly against `vercel.com/docs/functions/configuring-functions/duration`
on 2026-08-29 — not assumed from a stale or third-party source.)

## Architecture

- **`getOrCreateContentScore`/`synthesizeContentScore`** gain an optional
  `signal?: AbortSignal` parameter, threaded through to the
  `client.messages.create()` call (the Anthropic SDK accepts a request
  options object with `signal` for real cancellation — this actually stops
  the request server-side, not just client-side waiting, which matters
  because it's what actually caps wasted spend on a request we're giving
  up on).
- **`/api/ingest`** gets `export const maxDuration = 300` (the Hobby max)
  and, after its existing per-provider ingestion loop completes, runs a
  scoring phase:
  1. Query all of the family's titles with no `ContentScore` yet (not just
     this run's newly-ingested ones — this also drains any pre-existing
     backlog over successive weekly runs).
  2. Process them one at a time. Before starting each one, check elapsed
     time since the scoring phase began; stop starting new attempts once
     4 minutes (240,000ms) have elapsed, leaving a buffer within the
     300-second function budget for the last in-flight attempt plus
     response overhead.
  3. Each individual scoring attempt gets its own hard timeout (50 seconds)
     via a real `AbortController`, not just a `Promise.race` that stops
     waiting while the underlying request keeps running unattended. A
     title that times out is skipped (logged with its id/name and the
     error) and left unscored — it stays safely hidden in Family Mode
     (existing fail-closed behavior) and will be retried on a future run.
  4. The response includes counts of newly ingested titles, newly scored
     titles, and skipped-due-to-timeout titles, for observability.
- **`/api/recommendations`** loses its lazy-scoring loop entirely. It now
  just reads whatever `ContentScore` already exists (or `null`) for each
  title and passes it straight to `evaluateTitle` — no `await`, no Claude
  call, no per-title try/catch for scoring failure (nothing to catch
  anymore). The now-unnecessary `export const maxDuration = 60` (which was
  actually a needless *reduction* below the platform's own 300s default)
  is removed along with the concurrency-batching code that supported the
  lazy-scoring loop, since there's nothing left to batch.

## Data flow

1. Weekly cron fires `/api/ingest`.
2. New titles get upserted (unchanged from today).
3. The scoring phase drains as much of the unscored backlog as fits in the
   remaining time budget, skipping (not failing the whole run) on
   individual timeouts.
4. Any dashboard/rate-page load in between cron runs sees whatever's
   already scored — instantly, with no Claude call in the request path.
   Freshly-ingested titles show as "not yet rated" (Family Mode: hidden;
   Adult Mode: shown, flagged) until a scoring run catches up to them —
   normally within the same week, potentially longer if the backlog is
   large or many titles time out.

## Error handling

- A single title's scoring failure or timeout never aborts the batch —
  the loop continues to the next title regardless.
- The overall `/api/ingest` response reports `ingested`/`failed` (existing,
  for the TMDB ingestion phase) plus new `scored`/`skipped` counts (for the
  scoring phase), so a stuck backlog is visible in the route's own
  response rather than silent.
- No change to `evaluateTitle`/`isVisibleInMode` — an unscored title is
  still `null` → `'unscored'` → hidden in Family Mode, shown-flagged in
  Adult Mode, exactly as already implemented and tested.

## Explicitly out of scope

- No queue service, no external infrastructure — this stays entirely
  within the existing Next.js/Vercel/Prisma stack.
- No change to how often the ingest cron fires (still weekly).
- No UI change — the dashboard already shows "not yet rated" for unscored
  titles; that flag just now persists for longer between a title's
  ingestion and its score landing, which is an accepted, explicit
  trade-off of this design, not a new UI requirement.
- No retry backoff/prioritization logic for repeatedly-timing-out titles
  (e.g. no exponential backoff, no "give up after N attempts and mark
  permanently unscoreable") — a title that keeps timing out simply stays
  in the backlog and gets retried on every future run. If this proves to
  be a real problem in practice, it's a follow-up, not part of this fix.
