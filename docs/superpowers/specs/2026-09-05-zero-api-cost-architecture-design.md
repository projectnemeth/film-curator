# Zero-API-Cost Architecture

**Date:** 2026-09-05
**Status:** Stage 1 approved for implementation. Stage 2 resolved as manual.

Remove film-curator's dependency on its own `ANTHROPIC_API_KEY`, so the
deployed app cannot spend against it under any circumstance.

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
   manual refresh (`.claude/skills/manual-catalog-refresh/SKILL.md`
   Step 2). Content scoring and ranking joining it puts every judgment
   call in one place a human sees.
3. **Deleting code.** The app loses an SDK dependency, two prompt
   builders, and their response-parsing and error paths.

Explicitly *not* a goal: making the model calls cheaper. Trimming the
ranking prompt (full overviews for 60 candidates, 125 unabridged history
entries) would roughly halve its input tokens, but Stage 1 deletes that
prompt, so the work is moot. Swapping to Haiku 4.5 is a 2× saving, not
the 10× commonly assumed, and costs ranking quality — rejected.

## Non-goals

- Changing what the dashboard shows, beyond the missing-content-score
  state.
- Touching the exclusion rule, ingest, or auth.
- Any staleness indicator or freshness banner. Explicitly declined.
- Automating the refresh. See Stage 2.

---

## Stage 2 first: the automation that isn't

Stage 2 was originally specced as a scheduled Claude Code cloud routine.
**That was tested empirically on 2026-09-05 and does not work.** It is
recorded here because it constrains Stage 1's value and because the
result is not obvious from the outside.

Two live routine runs (`trig_01Vtsp2enE1DFRYJPR5L6HaD`) established:

**1. No network path to the database.**

```
TCP to <neon-pooler-host>:5432   → TCP_FAIL
Raw TCP to api.github.com:443    → RAW_TCP_443_OK
```

Raw sockets are not blocked — the destination is refused. The Neon
pooler host also resolves IPv6-only.

**2. Egress is an allowlisting HTTPS proxy.**

| Host | Result |
|---|---|
| `api.github.com` | 200 |
| `api.anthropic.com` | 404 (host reached) |
| `film-curator-theta.vercel.app` | **403 — CONNECT tunnel failed** |
| `console.neon.tech` | **403** |
| `api.themoviedb.org` | **403** |

This also kills the fallback design, in which the routine would call the
app's own authenticated endpoints so credentials never leave the server:
the Vercel domain is itself denied. Only Anthropic and GitHub pass.

**3. No secret injection mechanism.** Setting
`job_config.ccr.environment_variables` on the routine was accepted by the
API and silently dropped; the sandbox reported the test variable as
`UNSET`. The environment carries only infrastructure variables
(`GITHUB_TOKEN`, `AWS_*`, `CCR_*`) — nothing project-scoped.

Separately, creating a routine with a git source returns
`HTTP 401 — Connect your GitHub account before saving a routine that uses
a GitHub repository`. That one is solvable; the three above are not, from
inside the sandbox.

The sandbox is otherwise well-equipped — node 22, git, and psql 16.13 are
installed. It has the client and cannot reach the server.

### Stage 2, as resolved: manual refresh

**Judgment happens when the user invokes `manual-catalog-refresh`.** No
scheduler, no cloud routine, no GitHub Action. This is already how the
work is done today; the change is that it becomes the *only* path rather
than a cost-saving alternative to the app doing it inline.

Alternatives considered and declined: GitHub Actions (unrestricted egress
and real secrets, but needs an auth story for Claude that doesn't just
reintroduce the API key) and a local launchd job (full access, but only
runs when the machine is awake).

**Accepted risk, chosen deliberately:** if a refresh is forgotten,
rankings and content scores go stale silently. There is no banner, no
notification, and no automated fallback. A staleness indicator was
specced and explicitly declined, along with the one-row `Setting` table
that would have backed it — **so this design needs no migration at all.**

---

## Stage 1 — the app stops calling Anthropic

### 1.1 Ranking serves a reconciled cache instead of re-ranking

`rankByTasteCached` currently calls `rankByTaste` on a fingerprint miss.
It will instead reconcile the stored order against the current candidate
set — keep the cached order minus departed ids, append arrivals in their
existing order — then write the result back under the new fingerprint.

This is the logic already in
`scripts/repair-ranking-cache-2026-09-05.ts`. **Extract it into one
exported function** in `src/lib/ranking.ts`:

```ts
export function reconcileRanking(cachedIds: string[], candidateIds: string[]): string[]
```

and have both the route and the repair script call it. The manual-refresh
skill already warns that a second copy of this logic is how titles
silently vanish; two copies exist today and this collapses them.

Behavior:

- **Cache hit** (fingerprint matches): unchanged, return `rankedIds`.
- **Cache miss, cache exists**: return `reconcileRanking(...)` and upsert
  it under the new fingerprint, so the next load is a clean hit.
- **No cache at all**: return `candidateIds` unchanged. Unranked but
  complete — every candidate still appears.

The completeness invariant is unchanged and still asserted: the returned
array must cover every id in `candidateIds`, because
`src/app/api/recommendations/route.ts` does
`rankedIds.map(id => notSeenById.get(id)).filter(Boolean)` and anything
missing disappears from the dashboard.

Consequence: ordering reflects the last manual refresh. New titles land
at the bottom of the list until the next one.

### 1.2 Content scores are read, never generated

- Rename `getOrCreateContentScore` → `getContentScore`. It returns the
  existing `ContentScore` row or `null`. `synthesizeContentScore` and its
  `web_search` / `web_fetch` configuration are deleted.
- `src/app/api/titles/[id]/rate-content/route.ts` is deleted — it exists
  only to trigger generation.
- `src/app/page.tsx`: the "Why is this rated R?" button renders only when
  a score exists. With none, show a muted line — *"Content details are
  added during the catalog refresh."* The `rateContent` handler, its
  `ratingStatus` state, and its error branch go with the route.

14 visible titles currently lack a score; the next manual refresh clears
that backlog.

### 1.3 Delete the dependency

End state is verifiable by grep: **`grep -ri anthropic src/` returns
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
  manual batch scripts construct it.
- Remove `@anthropic-ai/sdk` from `package.json` dependencies.
- Remove `ANTHROPIC_API_KEY` from `.env.example`.

### 1.4 The refresh skill becomes load-bearing

`.claude/skills/manual-catalog-refresh/SKILL.md` is written as a
cost-saving alternative to the app's own API-backed routes. After Stage 1
those routes do not exist, so the skill is the only way content scores
and rankings are ever produced. Its framing must change accordingly, and
it should state plainly that skipping a step means that data simply never
gets created.

### 1.5 Tests

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

### 1.6 Verification

1. `npx vitest run` green.
2. `npx tsc --noEmit` clean.
3. `grep -ri anthropic src/` empty.
4. Run the dev server with `ANTHROPIC_API_KEY` unset and load both modes
   — the dashboard renders fully.
5. Deploy, confirm the site is healthy.
6. **Then** remove `ANTHROPIC_API_KEY` from Vercel. This is the step that
   makes the guarantee real; the code change alone only makes it unused.

Order note: removing the key before deploying is not dangerous. The old
code would throw inside `rankByTasteCached`, the recommendations route
already catches that and falls back to unranked order, and the dashboard
still renders.

---

## Rollback

A git revert plus re-adding `ANTHROPIC_API_KEY` to Vercel. No migration
is involved in either direction, and `reconcileRanking` is additive —
it can stay regardless.
