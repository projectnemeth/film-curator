# Zero-API-Cost Architecture

**Date:** 2026-09-05
**Status:** Design, awaiting approval

Remove film-curator's dependency on its own `ANTHROPIC_API_KEY` entirely,
moving all model judgment into a weekly Claude Code routine.

## Why

Not cost. Measured 2026-09-05, at Sonnet 5 rates ($2/M input, $10/M output):

| Call | Tokens | Cost | Trigger |
|---|---|---|---|
| Ranking (`rankByTasteCached`) | ~11k in, ~1k out | $0.032 | Next dashboard load after any rating, per mode |
| Content score (`getOrCreateContentScore`) | ~21k in, ≤2k out | ~$0.06 + web-search fee | Button click; cached permanently |

Realistic steady state is **$10–25/year**. The case for this work is:

1. **A hard ceiling.** With no key in the environment, no future bug can
   spend. Today a regression that broke the ranking cache write would
   re-rank on *every* page load — the tail risk is unbounded, the steady
   state is not.
2. **One reviewed pass.** Exclusion review already has no home but the
   weekly refresh (see `.claude/skills/manual-catalog-refresh/SKILL.md`
   Step 2). Content scoring and ranking joining it puts every judgment
   call in one place a human sees.
3. **Deleting code.** The app loses an SDK dependency, two prompt
   builders, and their response-parsing and error paths.

Explicitly *not* a goal: making the model calls cheaper. Trimming the
ranking prompt (full overviews for 60 candidates, 125 unabridged history
entries) would roughly halve its input tokens, but Stage 1 deletes that
prompt from the app, so the work is moot. Swapping to Haiku 4.5 is a 2×
saving, not the 10× commonly assumed, and costs ranking quality — rejected.

## Non-goals

- Changing what the dashboard shows, beyond one staleness indicator and
  the missing-content-score state.
- Touching the exclusion rule, ingest, or auth.
- Eliminating *all* spend. Stage 2 relocates cost to Claude Code usage.
  It is cheaper and better-bounded, not free.

---

## Stage 1 — the app stops calling Anthropic

Self-contained and independently valuable. Ships alone; Stage 2 is
optional after it.

### 1.1 Ranking serves a reconciled cache instead of re-ranking

`rankByTasteCached` currently calls `rankByTaste` on a fingerprint miss.
It will instead reconcile the stored order against the current candidate
set — keep the cached order minus departed ids, append arrivals in their
existing order — then write the result back under the new fingerprint.

This is exactly the logic in `scripts/repair-ranking-cache-2026-09-05.ts`.
**Extract it into one exported function** in `src/lib/ranking.ts`:

```ts
export function reconcileRanking(cachedIds: string[], candidateIds: string[]): string[]
```

and have both the route and the repair script call it. The manual-refresh
skill already warns that a second copy of this logic is how titles
silently vanish; two copies exist today and this collapses them.

Behavior:

- **Cache hit** (fingerprint matches): unchanged, return `rankedIds`.
- **Cache miss, cache exists**: return `reconcileRanking(...)` and upsert
  it with the new fingerprint, so the next load is a clean hit.
- **No cache at all**: return `candidateIds` unchanged. Unranked but
  complete — every candidate still appears.

The completeness invariant is unchanged and still asserted: the returned
array must cover every id in `candidateIds`, because
`src/app/api/recommendations/route.ts` does
`rankedIds.map(id => notSeenById.get(id)).filter(Boolean)` and anything
missing disappears from the dashboard.

Consequence: ordering reflects the last routine run, so it lags new
ratings by up to a week. New titles land at the bottom of the list until
the next run rather than in their merited position.

### 1.2 Content scores are read, never generated

- Rename `getOrCreateContentScore` → `getContentScore`. It returns the
  existing `ContentScore` row or `null`. `synthesizeContentScore` and its
  `web_search` / `web_fetch` configuration are deleted.
- `src/app/api/titles/[id]/rate-content/route.ts` is deleted — it exists
  only to trigger generation.
- `src/app/page.tsx`: the "Why is this rated R?" button renders only when
  a score exists. With none, show a muted line — *"Content details arrive
  with the weekly refresh."* The `rateContent` handler, its
  `ratingStatus` state, and its error branch go with the route.

14 visible titles currently lack a score; the routine clears that backlog
on its first run.

### 1.3 Delete the dependency

The end state is verifiable by grep: **`grep -ri anthropic src/` returns
nothing.**

- Delete `src/lib/anthropic.ts` and its test.
- From `src/lib/ranking.ts`: delete `rankSubsetByIndex`, `rankByTaste`,
  `RankingResponseSchema`, `formatAffinityTag`, `MAX_CANDIDATES_TO_RANK`,
  **and the `CandidateTitle` type** — verified as used nowhere outside
  this file. Keep `computeRankingFingerprint`, `rankByTasteCached`,
  `reconcileRanking`, `TitleAffinityMetadata`, and `TasteHistoryEntry`;
  the last is consumed by the fingerprint and by
  `scripts/manual-batch-2026-08-30.ts` and
  `scripts/repair-ranking-cache-2026-09-05.ts`.
- **`rankByTasteCached`'s signature simplifies.** With no prompt to
  build, it needs candidate *ids*, not title objects:
  `rankByTasteCached(familyId, mode, candidateIds: string[], tasteHistory)`.
  In `src/app/api/recommendations/route.ts` the seven-field mapping that
  exists only to feed that prompt collapses to
  `notSeenCandidates.map((v) => v.id)`. `tasteHistory` stays — the
  fingerprint hashes it, so ratings still invalidate the cache and the
  reconcile still runs.
- From `src/lib/contentScoring.ts`: delete `synthesizeContentScore` and
  `SynthesizedScoreSchema`. Keep `SynthesizedScore` as a type — the
  routine's batch scripts construct it.
- Remove `@anthropic-ai/sdk` from `package.json` dependencies.
- Remove `ANTHROPIC_API_KEY` from `.env.example`.

### 1.4 Tests

`src/lib/__tests__/ranking.test.ts` (17 tests) and
`contentScoring.test.ts` (9) are mostly exercises of the API path —
prompt shape, response parsing, malformed-JSON recovery. Those go.
Replacing them:

- `reconcileRanking`: preserves cached order; drops departed ids; appends
  arrivals; handles an empty cache; handles a cache disjoint from
  candidates; **always covers every candidate id** (the invariant).
- `rankByTasteCached`: hit returns cached; miss reconciles *and* writes
  back; no-cache returns candidates unchanged; never constructs an
  Anthropic client.
- `getContentScore`: returns an existing row; returns null when absent;
  never writes.
- `page.test.tsx`: button renders with a score, muted line without.

### 1.5 Verification

1. `npx vitest run` green.
2. `npx tsc --noEmit` clean.
3. `grep -ri anthropic src/` empty.
4. Run the dev server with `ANTHROPIC_API_KEY` unset and load both modes
   — the dashboard renders fully.
5. **Then** the user removes `ANTHROPIC_API_KEY` from Vercel. This is
   the step that makes the guarantee real; the code change alone only
   makes it unused.

---

## Stage 2 — the weekly routine

A Claude Code routine on a cron, in Anthropic's cloud. Runs whether or
not the user's machine is on.

**Schedule:** Mondays, several hours after the existing Vercel ingest
cron (Mondays 06:00 UTC, `vercel.json`) so it operates on a fresh
catalog. 14:00 UTC proposed.

### 2.1 What it does

Each step is independently idempotent, so a partial failure is safe to
re-run:

1. **Confirm the ingest ran** — `max(Title.updatedAt)` within the last
   24h. If not, report and continue; the rest still works on stale data.
2. **Clear the exclusion review queue** — `scripts/review-exclusions.ts`,
   judge each pending title against the stated rule, record verdicts with
   reasons, apply.
3. **Content-score new visible titles** — every `PG-13`/`R` title with
   providers, no score, and not `EXCLUDED`. Judgment via WebSearch /
   WebFetch against Common Sense Media and IMDb Parents Guide, matching
   what the deleted app path did. `sourceNotes` must stay honest about
   its basis, including explicit low-confidence caveats — that field
   exists so a human knows how much to trust the numbers.
4. **Re-rank both modes** — hand-order candidates from taste history,
   then the completeness assertion, fingerprint, and cache upsert exactly
   as `manual-catalog-refresh` Step 4 specifies.
5. **Health check** — `vitest run`, both API routes return 200, per-mode
   `rankedIds.length` equals the candidate count.
6. **Record and report** — write `Setting.lastRefreshAt` (see 2.3),
   commit the updated `VERDICTS` map and any dated batch script, push,
   and push-notify a summary.

Steps 2–4 are the `manual-catalog-refresh` skill. The routine should
invoke that skill rather than restating it, so there is one description
of the work.

**No TMDB access needed.** Ingest now writes `genres` and `keywords`
itself (`src/app/api/ingest/route.ts`), so the routine only reads the
database and applies judgment. This matters: `TMDB_API_KEY` is a
Vercel-sensitive variable that cannot be pulled by anyone, so a design
needing it would require provisioning the key into a second environment.

### 2.2 Secrets

`DATABASE_URL` only. It pulls normally from Vercel, unlike the sensitive
three (`CRON_SECRET`, `ANTHROPIC_API_KEY`, `TMDB_API_KEY`).

### 2.3 Staleness is visible in the product

The failure mode that matters is the routine silently not running:
nothing errors, the dashboard just serves progressively older rankings
and hides unreviewed titles indefinitely.

Two mitigations, both cheap:

- The routine writes a `lastRefreshAt` timestamp. A new one-row
  `Setting` table (`key`/`value`) is the smallest way to store it and is
  reusable for later flags; this needs a migration, so it must be run by
  the user per the standing workflow.
- The dashboard renders a muted banner when that timestamp is older than
  10 days: *"Recommendations last refreshed N days ago."* Ten days, not
  seven, so a single missed run isn't noisy.

A push notification on completion and on failure supplements this; the
banner is the part that doesn't depend on the routine being alive to
tell you it's dead.

### 2.4 Ordering stability

Re-ranking from scratch weekly can reshuffle the list even when taste
hasn't moved, which reads as instability. The routine's instruction
should be to preserve the prior order except where taste history has
changed materially, and to say in its report what moved and why.

---

## Risks and open questions

**Must be resolved before Stage 2 is built:**

1. **Can a scheduled cloud agent reach the Neon database?** Neon is
   publicly addressable with credentials, so it should, but this is
   unverified and the whole stage depends on it.
2. **How does the routine obtain `DATABASE_URL` and the repo?** Whether
   it runs `vercel env pull` (needing Vercel auth in that environment) or
   reads a stored secret is unknown. Same for whether the working tree is
   available for the scripts and the commit step.

Both are cheap to test with a one-off manual run before committing to the
schedule.

**Accepted risks:**

3. **Staleness.** Rankings and new content scores lag up to a week. For a
   household movie picker this is judged acceptable; 2.3 makes it visible
   rather than silent.
4. **Cost relocation.** Claude Code usage replaces API dollars. Expected
   to be well inside existing usage, but it is not zero.
5. **Judgment drift** between weekly runs and the previous inline
   prompts. The routine has more context than the old 11k-token prompt
   did, so quality should improve, but it will differ.

---

## Rollback

Stage 1 is a git revert plus re-adding `ANTHROPIC_API_KEY` to Vercel.
`reconcileRanking` is additive and can stay either way. Stage 2 is a
cron deletion; the manual skill invocation remains available and
unchanged, which is exactly how the work is done today.
