# Film Curator — Design Spec

Date: 2026-08-28

## Purpose

A personal web app that curates what to watch from the streaming
services the user actually subscribes to, filtered by a strict,
category-level content filter (not just MPAA rating) and ranked by
the user's own taste — so the user doesn't have to manually search
multiple services or second-guess a rating.

**Primary user (MVP):** the user (single person, on their laptop).
**Future:** other families, self-hosted per-family or offered as a
hosted product; each family manages their own service list, filters,
and taste profile.

## Streaming services (MVP scope)

- Netflix, Disney+, Prime Video, Peacock — covered via TMDB's
  watch-provider data.
- Kanopy, Hoopla — **Phase 2 / best-effort.** No public API exists for
  either (library-card auth, no developer access). Not part of MVP
  ingestion or filtering; may be added later as a manual/curated list.

## Content filtering model

Filtering is **per-category, not a single MPAA rating cutoff.**
Categories: violence, language, sex/nudity, scariness/intensity
(matching how Common Sense Media / Kids-in-Mind break down content).

Two modes, each with independently configurable thresholds per
category:

- **Family Mode** — default ceiling around G/PG, but explicitly
  intended to admit PG-13 titles whose PG-13 rating comes from mild
  "thematic" content rather than the categories that actually matter
  (e.g. Jurassic Park, Twister are examples the user gave of titles
  that should pass Family Mode despite the PG-13 label).
- **Adult Mode** — mostly PG-13, occasional R for violence/language,
  very low tolerance for sex/nudity, and a hard ceiling: **no NC-17,
  no unrated content, ever**, regardless of other scores.

An **override table** lets the user manually pin a title as approved
or rejected regardless of its computed scores — this is the correction
mechanism for cases like Jurassic Park where the automated score
might not match the user's judgment.

Fail-closed rule: a title with no computed content score is **excluded
from Family Mode by default** and shown in Adult Mode only with a
"not yet rated" flag. Never show an unscored title to Family Mode.

## Taste profile

A "learn my taste" feature, framed as a lightweight, replayable game
("Rate More Movies") rather than a one-time onboarding step — the
user can open it any time to rate more titles. For each title
presented, the user rates: disliked / liked / loved / didn't see /
too inappropriate. Ratings accumulate into a taste profile used to
rank filtered candidates when generating recommendations.

## Architecture

- **Next.js (TypeScript, App Router)** — single full-stack app,
  covers UI and backend API routes in one deployable.
- **Hosting: Vercel.** Deploys from a GitHub repo (push → build), no
  server/Docker management required.
- **Database: Vercel Postgres**, accessed via Prisma. (SQLite was
  considered but doesn't persist on Vercel's ephemeral filesystem;
  Prisma keeps the ORM code identical either way.)
- **TMDB API** (free, JustWatch-backed) — search, title metadata,
  watch-provider mapping.
- **Anthropic API (Claude)** — three distinct jobs:
  1. Synthesize per-category content scores by reading public review
     text (Common Sense Media pages, IMDb parents guide, etc.) for a
     title, since Common Sense Media's own API requires a partnership
     agreement the user doesn't have.
  2. Run the conversational "learn my taste" interview.
  3. Rank filtered candidate titles against the user's taste history
     for recommendations.
- **Scheduled ingestion: Vercel Cron**, running weekly, hits an API
  route that pulls new/trending titles per provider from TMDB and
  upserts them.

Forward-looking note: even though MVP has one implicit user, a
`familyId` column is included on the relevant tables now (unused/
defaulted for the MVP) so multi-family support later is additive, not
a schema rewrite.

## Data model (high level)

- `Title` — tmdb_id, name, year, poster, overview, mpaa_rating,
  providers[], familyId
- `ContentScore` — titleId, violence, language, sexNudity,
  scariness, sourceNotes, computedAt
- `ModeSettings` — familyId, mode (family|adult), per-category
  thresholds
- `Override` — titleId, familyId, decision (approved|rejected), note
- `TasteRating` — titleId, familyId, rating (disliked|liked|loved|
  notSeen|tooInappropriate), ratedAt

## Data flow

1. **Weekly ingestion** (Vercel Cron): pull new/trending titles per
   provider from TMDB → upsert into `Title`.
2. **On-demand search**: live TMDB lookup for a title not yet cached
   → upsert into `Title`.
3. **Lazy content scoring**: any title lacking a `ContentScore` gets
   scored via Claude the first time it's actually surfaced (search
   result, new-arrival feed, or taste-interview pick) — never
   pre-scored in bulk. Cached permanently once computed.
4. **Filtering**: active mode's `ModeSettings` thresholds are applied
   against `ContentScore`, with `Override` taking precedence when
   present.
5. **Ranking**: filtered candidates are ranked against `TasteRating`
   history (via Claude) to produce the dashboard's recommendation
   list.

## Components

- **Catalog ingestion** — weekly cron job (see data flow #1).
- **Search** — on-demand lookup (see data flow #2).
- **Content-descriptor scoring service** — lazy, cached (see data
  flow #3).
- **Mode filtering** — threshold comparison + override precedence,
  pure/deterministic logic.
- **Taste interview** ("Rate More Movies") — Claude-driven,
  replayable at any time, not gated to first use.
- **Dashboard UI** — mode toggle (Family/Adult), ranked recommendation
  list, entry points to taste interview and override management.

## Error handling & edge cases

- Title with no/insufficient content score → excluded from Family
  Mode (fail closed); shown in Adult Mode flagged "not yet rated."
- Title with no TMDB watch-provider data → shown as "availability
  unknown," not filtered out (providers occasionally drop from TMDB's
  feed without actually leaving the service).
- Claude's computed score disagrees with the user's judgment → fixed
  once via `Override`, permanent, no per-mode re-litigation.
- TMDB/Anthropic API failure on-demand → graceful failure with a
  retry-later message. Weekly cron logs per-title failures and retries
  on the next run rather than blocking the whole batch.

## Testing approach

- **Filtering logic** (threshold comparison, override precedence,
  mode selection): deterministic, unit-tested thoroughly — this is
  the safety-critical piece.
- **API routes** (search, ingestion, scoring): integration tests with
  mocked TMDB/Anthropic responses — no live calls or cost in CI.
- **Claude-driven pieces** (scoring synthesis, taste interview,
  ranking): tested for well-formed output and graceful degradation on
  bad/missing input, not exact-output assertions. Quality is validated
  through real use, not an automated suite.

## Explicitly out of scope for MVP

- Kanopy and Hoopla (no public API; Phase 2 best-effort).
- Multi-family / multi-user auth and onboarding (schema is
  forward-compatible, but no UI/auth work happens now).
- Self-hosting on shared hosting (not viable for this stack; Vercel
  chosen instead).
