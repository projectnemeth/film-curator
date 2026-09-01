---
name: manual-catalog-refresh
description: Use when the user asks to manually content-rate and/or re-sort a batch of movies in film-curator "right now" without spending the app's own Anthropic API budget — e.g. "do that thing to update the site", "sort and rate some movies", "refresh the ratings/ranking". Claude does the judgment itself and writes straight to the database, instead of triggering the app's own Claude-API-backed routes.
---

# Manual catalog refresh (content rating + sorting, no app API spend)

film-curator normally does two things via its own Anthropic API key:
content-rating a movie (the "Why is this rated R?" button →
`getOrCreateContentScore` in `src/lib/contentScoring.ts`) and sorting the
"Not Seen" list by taste (`rankByTasteCached` in `src/lib/ranking.ts`).
Both cost real money against the app's own API key every time they run.

This skill does the same two jobs a different way: **you** (Claude, running
in this Claude Code session) read the actual data, reason about it
yourself, and write the results straight into the production database.
No app-side Anthropic API call happens at all — this is billed to the
Claude Code session, not `ANTHROPIC_API_KEY`.

Default batch size is ~30 for content rating, and ~30 hand-ranked titles
per mode for sorting, unless the user asks for a different number.

## Step 0 — sanity check secrets

`CRON_SECRET`, `ANTHROPIC_API_KEY`, and `TMDB_API_KEY` are Vercel
**sensitive** env vars — `vercel env pull` cannot retrieve real values for
these for anyone, ever (they come back as an 11-character `[SENSITIVE]`
placeholder). Don't rely on them. `DATABASE_URL` pulls fine. This skill
only needs `DATABASE_URL`.

Schema-changing commands (`prisma migrate dev`/`deploy`) are blocked by
this session's auto-mode classifier and must be run by the user directly
in their own terminal — that's a different problem from this skill and
doesn't come up here, since this skill only writes application data, not
schema. Don't confuse the two if a migration is ever also needed.

## Step 1 — pull prod env and inspect current state

```bash
vercel env pull .env.production.local --environment=production --yes
set -a; source .env.production.local; set +a
```

Write a throwaway inspection script (e.g. `scripts/tmp-dump-inputs.ts`)
that imports `prisma` from `../src/lib/prisma` and `isRatingVisibleInMode`
from `../src/lib/filtering`, then for each mode (`FAMILY`, `ADULT`) dumps:

- **Taste history**: `prisma.tasteRating.findMany({ where: { familyId: 'default', mode }, include: { title: true } })`, filtered to `rating !== 'NOT_SEEN'`, printing `titleName`, `rating`, `director`, `writer`, `topCast`, `studio`. Group/print by rating bucket (LOVED / LIKED / DISLIKED / NOT_INTERESTED / TOO_INAPPROPRIATE) — this is the actual taste signal.
- **Not-seen candidates**: same visibility + exclusion logic as `src/app/api/recommendations/route.ts` (`isRatingVisibleInMode`, exclude `HIDDEN_AFTER_RATING = new Set(['DISLIKED','LIKED','TOO_INAPPROPRIATE','NOT_INTERESTED'])` and `LOVED`), printing `id`, `name`, `year`, `director`, `writer`, `topCast`, `studio`.
- **Content-rating candidates**: `prisma.title.findMany({ where: { mpaaRating: { in: ['PG-13','R'] }, contentScore: null, tasteRatings: { none: { mode: 'ADULT' } } }, orderBy: { createdAt: 'desc' }, take: N })` — `id`, `name`, `year`, `mpaaRating`.

Run it (`npx tsx scripts/tmp-dump-inputs.ts`), and read the output. If it's
large, redirect to a file and read sections with `sed`/`grep` rather than
dumping it all into context at once — a household with real usage history
can easily have 100+ history entries and hundreds of not-seen candidates
per mode.

## Step 2 — do the actual judgment yourself (this is the point of the skill)

**Content rating** (for each of the N candidates): assess `violence`,
`language`, `sexNudity`, `scariness` (0–10 each), `isUnrated: false`,
`isNC17: false`, and write a `sourceNotes` string that's **honest about
its basis** — e.g. `"AI assessment from general knowledge (Title, Year):
..."` for a film you know well, and an explicit lower-confidence caveat
(`"AI estimate with lower confidence — couldn't confirm details on this
specific title; generic R-rated-thriller estimate, treat cautiously."`)
for anything you're not sure you're thinking of the right film. Never
fabricate false confidence — this schema field exists specifically so a
human reading it later knows how much to trust the number.

**Sorting**: read the taste-history buckets and extract real signal —
which directors/actors/writers/studios/genres recur in LOVED and LIKED,
and which recur in DISLIKED/NOT_INTERESTED/TOO_INAPPROPRIATE (note:
TOO_INAPPROPRIATE is a content-line signal, not a taste-preference
signal — treat it as "avoid this level of graphic/crude content," not
"avoid this genre"). Use that to hand-order ~30 of the not-seen
candidates per mode, best-fit first, citing the specific match (shared
director, shared actor, sequel-to-a-loved-title, matches a clear genre
pattern, etc.) in a code comment next to each id so the reasoning is
auditable later.

## Step 3 — write the batch script

Create `scripts/manual-batch-<date>.ts` (dated, since the picks are
specific to this run — don't try to make it generically reusable). It
must:

1. Define `CONTENT_RATINGS: {id, violence, language, sexNudity, scariness, sourceNotes}[]` — your Step 2 output.
2. Define `FAMILY_TOP_ORDER: string[]` and `ADULT_TOP_ORDER: string[]` — your hand-ranked id lists, one comment per id explaining the pick.
3. `writeContentScores()`: for each rating, `prisma.contentScore.create({ data: { titleId: id, ...rating } })`. (The candidate query in Step 1 already excludes titles with an existing score, so a plain `create` is fine — no need for upsert here.)
4. `writeRankingCache(mode, topOrder)`: **re-fetch** titles/tasteHistory fresh (don't reuse the Step 1 dump — ratings may have changed), rebuild `notSeenCandidates` and `history` exactly like `src/app/api/recommendations/route.ts` does, then:
   ```ts
   const candidateIds = notSeenCandidates.map((c) => c.id)
   const validTop = topOrder.filter((id) => candidateIds.includes(id))
   const remainder = candidateIds.filter((id) => !validTop.includes(id))
   const rankedIds = [...validTop, ...remainder]
   ```
   **This completeness step is not optional.** `rankedIds` must contain
   every id in `candidateIds` — the real recommendations route does
   `rankedIds.map((id) => notSeenById.get(id)).filter(Boolean)`, so any
   not-seen title missing from `rankedIds` silently vanishes from the
   dashboard entirely, in both modes. Assert
   `rankedIds.length === candidateIds.length` before writing and abort
   with a clear error if it doesn't hold.
   Then compute the fingerprint with the *same* `computeRankingFingerprint`
   from `../src/lib/ranking` (so the app doesn't immediately consider the
   cache stale) and `prisma.rankingCache.upsert(...)`.
5. Run both, catch/log errors, `prisma.$disconnect()` in `finally`.

Reuse app code directly (`import { prisma } from '../src/lib/prisma'`,
`import { computeRankingFingerprint, type TasteHistoryEntry } from '../src/lib/ranking'`,
`import { isRatingVisibleInMode } from '../src/lib/filtering'`) — don't
reimplement this logic; a drift between this script's copy and the real
route's copy is exactly how titles quietly disappear.

## Step 4 — run and verify

```bash
set -a; source .env.production.local; set +a
npx tsx scripts/manual-batch-<date>.ts
```

Then verify with a small check script: `contentScore.count()` went up by
the batch size, and each mode's `rankingCache.findUnique(...).rankedIds.length`
equals the full not-seen candidate count for that mode (not just your
hand-ranked subset — this is the same completeness check from Step 3,
confirmed against what's actually in the database now).

## Step 5 — clean up and commit

```bash
rm -f .env.production.local scripts/tmp-*.ts
git add scripts/manual-batch-<date>.ts
git commit -m "..."
git push origin main
```

Keep the dated batch script in the repo (matches
`scripts/backfill-adult-mode-ratings.ts` and
`scripts/manual-batch-2026-08-30.ts` as prior art) — it's a record of what
was written and why, not meant to be re-run. Report back to the user:
how many titles were content-rated, how many were hand-ranked per mode,
and a couple of concrete examples of the reasoning (e.g. "Memento ranked
#1 in Adult — you've loved two Nolan films").
