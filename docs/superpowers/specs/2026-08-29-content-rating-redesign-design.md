# Content Rating Redesign — Design Spec

Date: 2026-08-29

## Purpose

The scoring-architecture-fix shipped earlier today made the weekly cron's
Claude-based content scoring *safe* (bounded, non-blocking, cancellable),
but live testing immediately surfaced the real problem: automatically
scoring every ingested title costs real money — roughly $0.45-0.50 per
title observed in production testing today — for movies nobody has asked
about. Scoring the full 160-title catalog would run $60-80, recurring
every time the catalog grows. That's the wrong shape of cost for a family
hobby app.

This spec replaces "the system scores everything automatically, then
gates visibility by configurable numeric thresholds" with a fundamentally
simpler model: the **free MPAA/TV rating** (already available from TMDB)
becomes the only thing that gates visibility. The expensive Claude+web-
search report becomes an **on-demand, purely informational** tool the
user pulls up voluntarily on a specific title they're already considering
— never run automatically, never gating anything.

## The two axes, and how they interact

- **Content** (is this appropriate to show at all) — now decided entirely
  by the title's official MPAA/TV rating. No numeric thresholds, no
  automatic Claude scoring.
- **Taste** (do we like this kind of movie) — unchanged. `rankByTaste`
  orders whatever the content filter lets through. Taste never affects
  whether a title is shown, only its order.

## Visibility rules

Both modes use an explicit **allow-list**, not a block-list — anything
not named below is hidden, including any rating value the system doesn't
recognize. This matches the fail-closed principle already used everywhere
else in this app (unscored/unrated defaults to hidden, never shown).

| Mode | Shown automatically | Everything else | Optional info |
|---|---|---|---|
| Family | G, PG, TV-Y, TV-Y7, TV-G, TV-PG | Hidden (PG-13, R, NC-17, TV-14, TV-MA, unrated/unknown, anything else) | none — no button in Family Mode |
| Adult | PG-13, R, TV-14, TV-MA | Hidden (G, PG, NC-17, unrated/unknown, anything else) | "Rate this" button available on any shown, unscored title |

Family and Adult Mode are deliberately **non-overlapping buckets**, not
"Adult shows everything Family shows, plus more" — G/PG movies live in
Family Mode only; PG-13/R movies live in Adult Mode only. If a G-rated
movie also needs to show up for an adult browsing session, that's what
Family Mode is for.

PG-13 is deliberately excluded from Family Mode entirely for now — no
nuanced exception system, no button. This can be revisited later if it
turns out to matter in practice; simplicity wins for now.

NC-17 and unrated/unknown titles are a hard floor in both modes: never
shown, no "Rate this" button, no automatic path around it. A manual,
title-specific `Override` (the existing feature, used deliberately) is
the only way to admit one of these, unchanged from today's behavior —
this is a hard-to-reach, deliberate action, distinct from casually
clicking a button.

## The "Rate this" flow (replaces automatic scoring)

On any Adult Mode title that's visible (PG-13 or R) but has no saved
`ContentScore` yet, the card offers a "Why is this rated R?" (or PG-13)
button. Clicking it:

1. Calls a new on-demand endpoint that runs the existing
   `getOrCreateContentScore(titleId, signal)` (the real web-search-backed
   Claude call, unchanged from today — Task 1's `AbortSignal` support
   from the last plan is exactly what this needs).
2. The page shows a waiting state ("Checking Common Sense Media and IMDb
   — this can take a minute or two") while the request is in flight.
3. On success, the result (violence/language/sex-nudity/scariness
   breakdown, plus a short note on what was found) renders inline on the
   card, saved permanently — never re-fetched or re-billed for that
   title again.
4. On timeout or failure, the card shows "That took too long — try
   again?" with a manual retry. No automatic retry, ever — a failed
   attempt costs nothing further unless the user explicitly asks again.

This is deliberately synchronous (page waits), not a background job with
polling — at this volume (occasional single clicks, not a batch), a
queue/worker service would be real infrastructure for no real benefit.

Because this now only ever handles one title at a time, each call also
gets a single hard timeout (a fixed value comfortably under Vercel's
300-second ceiling — e.g. 270s) via `AbortController`, reusing Task 1's
cancellation support. No more shared time-budget math across many titles
— that whole problem goes away with the batch loop it was built for.

## What gets removed

- **The ingest cron's entire scoring phase** (`SCORING_TIME_BUDGET`/
  `timeoutForNextAttempt` logic added today) — the weekly job goes back to
  being a pure catalog sync: fast, free, no Claude calls at all.
  `src/lib/scoringSchedule.ts` becomes unused and is deleted.
- **`ModeSettings`** (the per-mode configurable violence/language/sex-
  nudity/scariness numeric limits) — no longer has any job to do, since
  gating is now MPAA-rating-only. Removed from schema, API
  (`/api/mode-settings`), and the Settings page UI entirely, not just
  hidden.
- **Threshold-based gating in `evaluateTitle`** — replaced by a much
  simpler rating-tier lookup (see below). `ContentScore` still exists and
  is still generated by the "Rate this" button, but it's read-only,
  informational content now — nothing compares it against a numeric
  limit to decide visibility.

## What's added

- **`Title.mpaaRating`** (nullable string) — captured during the existing
  per-title TMDB fetch in the ingest loop, via TMDB's `release_dates`
  (movies) / `content_ratings` (TV) endpoint, filtered to the US entry.
  This is a free, additional TMDB call per title (TMDB has no per-call
  cost, just rate limits) — no dollar cost, minor added ingestion time.
  Verified live today: TMDB reliably returns the plain certification
  (e.g. "PG-13") but its "descriptors" field (the granular reason, like
  "for sequences of violence") came back empty on every title tested,
  including a 2024 release — that field is effectively unpopulated in
  practice. TMDB gives us the letter grade only; the reasoning behind it
  still requires the Claude+web-search report.
- **A pure `isTitleVisible(mpaaRating, override, mode)` function** in
  `src/lib/filtering.ts`, replacing the threshold-comparison logic.
  Checks `Override` first (unchanged, highest precedence — an approved
  override wins even over NC-17; a rejected override wins even over G),
  then falls back to an allow-list lookup per mode (see Visibility rules
  above).
- **A new on-demand scoring endpoint** (e.g.
  `POST /api/titles/[id]/rate-content`) for the button, replacing any
  batch/lazy scoring path.
- **A "Rate this" UI affordance** on Adult Mode title cards, plus an
  inline report display once a `ContentScore` exists for that title.

## Cost/latency reduction on the Claude call itself

Independent of the above, and worth doing regardless: the underlying
`synthesizeContentScore` call in `src/lib/contentScoring.ts` currently
uses `thinking: { type: 'adaptive' }` and allows 3 web searches + 3 web
fetches. Live testing today showed real call latency from 48s to 8.8
minutes — since the user will now be waiting on-page for this, cutting
that latency matters as much as cutting cost. Plan: drop adaptive
thinking (this is a straightforward extraction task, not one that
obviously benefits from extended reasoning) and reduce the search/fetch
budget to 1+1. This needs a small validation pass (a couple of real test
calls) before committing, since we haven't confirmed accuracy holds up
without thinking — flagged as a task-level concern for the implementation
plan, not a blocking design question.

## Error handling

- A single title's scoring failure/timeout affects only that title's
  button — no batch, no shared state, no other title's request touches
  it.
- `evaluateTitle`'s Override-first, then-rating-tier logic is the only
  place visibility is decided — same single-source-of-truth principle as
  before, just simpler content.
- Unrated/unknown-certification titles fail closed (hidden) in both
  modes, matching the original "absolutely no NC-17 or unrated" rule —
  this now applies via the MPAA tier check directly rather than via a
  synthesized `isUnrated` flag on `ContentScore`.

## Taste-ranking cache (a second, related cost fix)

`rankByTaste` (`src/lib/ranking.ts`) is a separate Claude call from
content scoring — no web search, no extended thinking, small output cap
— but it currently runs fresh on *every* `/api/recommendations` request,
with no caching. Repeatedly loading the dashboard means repeatedly paying
for the same ranking, even when nothing about your taste history or the
visible catalog has changed since the last load. Folding a fix into this
same redesign:

- New `RankingCache` model: `{ familyId, mode, inputFingerprint, rankedIds, updatedAt }`,
  unique on `(familyId, mode)`.
- `inputFingerprint` is a hash of the sorted visible-candidate title IDs
  plus the sorted taste-history entries (title + rating). Same visible
  set and same taste history always produce the same fingerprint.
- On each request: compute the current fingerprint. If it matches the
  cached row, reuse the cached ranked order — no Claude call. If it
  differs (a new rating was submitted, a title's visibility changed, a
  new title was ingested, etc.), call `rankByTaste` as today and save the
  new result with its fingerprint.
- No manual invalidation scattered across other routes — the fingerprint
  comparison self-invalidates whenever the real inputs change.
- A failed ranking (existing fallback-to-unranked-order behavior) is
  never cached — only a real, successful ranking gets saved, so a
  transient failure can't lock in a bad order for future loads.

## Mode-scoped taste ratings (a third, related change)

Today, `TasteRating` holds one rating per title per family, full stop —
there's no concept of *whose* taste it reflects. But Family Mode and
Adult Mode are genuinely different audiences (kids watching together vs.
an adult's own personal taste), and a rating given in one context
shouldn't quietly influence recommendations in the other. If the family
loved a PG movie together, that's a family-taste signal; if an adult
rates an R movie they watched alone, that's a separate, personal signal
for a completely different pool of movies (Family and Adult Mode no
longer even show overlapping ratings, per the visibility rules above) —
but the underlying mechanism needs to generalize correctly regardless.

- `TasteRating` gains a `mode: Mode` field. Whichever mode you're
  browsing in when you submit a rating is recorded as that rating's mode
  — no new UI concept, since every screen that submits a rating (the
  dashboard's quick-rate flow, the dedicated `/rate` taste-training page)
  already has a mode toggle.
- The unique key becomes `(familyId, titleId, mode)` instead of
  `(familyId, titleId)` — the same title can hold independent ratings for
  each mode over time.
- Recommendations in a given mode only look at that mode's own
  `TasteRating` rows when building taste history for `rankByTaste` — a
  family rating never influences an Adult Mode ranking and vice versa.
- The taste-training page's "already rated, don't ask again" check is
  scoped the same way — a title rated in Family Mode can still come up to
  be rated in Adult Mode later, since they're independent signals.
- This is a plain discriminator column, not two databases or two tables
  — the same pattern already used for `RankingCache` and (formerly)
  `ModeSettings`.

## "Not interested" quick action

Next to the dashboard's existing "I've seen this" link (which expands
into Disliked/Liked/Loved for a movie you've already watched), a second,
single-click "I don't want to see this" button covers the case where you
haven't seen it and don't want to. It records a new `TasteRatingValue`,
`NOT_INTERESTED`, immediately — no expansion step, since there's nothing
to disambiguate. Like every other taste signal, it's mode-scoped and it
only ever *ranks* the title (and similar ones) lower over time via
`rankByTaste` — it doesn't hard-block or remove the title from the
catalog, so there's no separate suppression mechanism to build or
maintain.

## Known trade-off: TMDB certification coverage isn't complete

TMDB's US certification data isn't populated for every title — older
films, foreign titles, and some catalog entries may have no certification
on record at all. Under this design that reads as "unrated" and the title
is hidden in both modes, same as a genuinely-unrated release. Previously,
an unrated-by-TMDB title still got a real Claude-synthesized judgment
call; now it won't be scored at all unless manually approved via
`Override`. In practice this likely means some perfectly appropriate but
older/obscure titles disappear from view with no button to unlock them.
Accepted as a reasonable trade-off given the cost savings, but worth
knowing going in — if it proves annoying in practice, a follow-up could
extend the "Rate this" button to unrated titles specifically (distinct
from NC-17, which stays hard-blocked).

## Explicitly out of scope

- No PG-13 exception system for Family Mode (dropped entirely, may
  revisit later if it turns out to matter).
- No background job/queue infrastructure for the on-demand scoring call
  — a single synchronous request with a hard timeout is enough at this
  volume.
- No retry/backoff logic beyond a manual "try again" button.
- No numeric threshold configuration anywhere — `ModeSettings` is fully
  retired, not replaced by a simpler version of itself.
