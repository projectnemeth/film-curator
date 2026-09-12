---
name: manual-catalog-refresh
description: Use when the user asks to content-rate, re-sort, and/or review newly-flagged titles in film-curator — e.g. "do that thing to update the site", "sort and rate some movies", "refresh the ratings/ranking", "anything to review?". This is the ONLY way content scores and rankings are ever produced: the app itself has no Anthropic API access. Claude does the judgment and writes straight to the database.
---

# Manual catalog refresh (the only source of scores and rankings)

**This skill is load-bearing, not an optimization.** The app has no
Anthropic API access at all — `ANTHROPIC_API_KEY` is gone from the
codebase and from Vercel. `src/lib/contentScoring.ts` only reads stored
scores, and `src/lib/ranking.ts` only serves the stored order, reconciling
it against the current candidates. Neither can generate anything.

So whatever this skill does not produce simply does not exist:

- A title with no `ContentScore` shows "Content details are added during
  the catalog refresh" on the dashboard, indefinitely.
- Newly ingested titles sit at the bottom of the Not Seen list in
  arrival order until they are hand-ranked here.
- A keyword-flagged title stays hidden and undecided until reviewed here.

There is no scheduler and no fallback. A scheduled cloud routine was
tested on 2026-09-05 and cannot work — the sandbox's egress proxy blocks
Neon, the Vercel app domain, and TMDB, and it has no secret injection
(see `docs/superpowers/specs/2026-09-05-zero-api-cost-architecture-design.md`).
Nothing warns you when this is overdue; a staleness banner was
deliberately declined. If the user has not run this in a while, that is
worth mentioning to them.

**You** (Claude, in this Claude Code session) read the data, reason about
it yourself, and write results straight into the production database.
This is billed to the Claude Code session.

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
that imports `prisma` from `../src/lib/prisma` and `isTitleVisible`
from `../src/lib/filtering`, then for each mode (`FAMILY`, `ADULT`) dumps:

- **Taste history**: `prisma.tasteRating.findMany({ where: { familyId: 'default', mode }, include: { title: true } })`, filtered to `rating !== 'NOT_SEEN'`, printing `titleName`, `rating`, `director`, `writer`, `topCast`, `studio`. Group/print by rating bucket (LOVED / LIKED / DISLIKED / NOT_INTERESTED / TOO_INAPPROPRIATE) — this is the actual taste signal.
- **Not-seen candidates**: same visibility + exclusion logic as `src/app/api/recommendations/route.ts` (`isTitleVisible`, exclude `HIDDEN_AFTER_RATING = new Set(['DISLIKED','LIKED','TOO_INAPPROPRIATE','NOT_INTERESTED'])` and `LOVED`), printing `id`, `name`, `year`, `director`, `writer`, `topCast`, `studio`.
- **Content-rating candidates**: `prisma.title.findMany({ where: { contentScore: null, providers: { isEmpty: false }, AND: [{ OR: [{ mpaaRating: { in: ['PG-13','R'] } }, { modeOverride: 'ADULT' }] }, { OR: [{ contentFlag: null }, { contentFlag: { not: 'EXCLUDED' } }] }] }, orderBy: { createdAt: 'desc' }, take: N })` — `id`, `name`, `year`, `mpaaRating`.

  Three traps here, each of which produced a silently wrong answer once:

  - **`contentFlag: { not: 'EXCLUDED' }` on its own drops every unreviewed
    title.** `contentFlag` is null for the vast majority of the catalog
    (778 of 891 as of 2026-09-05), and SQL `!= 'EXCLUDED'` is null — not
    true — for a null column, so Prisma filters those rows out. The query
    then matches only explicitly-CLEAR titles and can return zero while
    hundreds genuinely need scoring. `NOT: { contentFlag: 'EXCLUDED' }`
    has the same flaw; the `OR` above is the fix.
  - **Match on the mode override as well as the rating, not the rating
    alone.** A PG film moved into Adult Mode with `Title.modeOverride`
    (Lawrence of Arabia, Monty Python, Rocky I-IV, Raiders) is shown on the
    Adult dashboard but would never match `mpaaRating: { in: ['PG-13','R'] }`,
    so it could never be scored and its card read "Content details are added
    during the catalog refresh" permanently. Hence the `OR` on
    `modeOverride: 'ADULT'`. Note the two `OR`s must be nested inside an
    `AND` — two bare `OR` keys at the top level cannot both be expressed,
    and Prisma would silently keep only one.
  - **Do not filter on `tasteRatings: { none: { mode: 'ADULT' } }`.**
    Content scores are shown on Loved and Watchlist cards too, not just
    unrated ones, so that filter hides titles the dashboard is actively
    displaying. Score whatever appears in a mode and lacks a score.

  Skipping EXCLUDED titles is still right — content-rating a film that
  will never be shown is wasted judgment.

Run it (`npx tsx scripts/tmp-dump-inputs.ts`), and read the output. If it's
large, redirect to a file and read sections with `sed`/`grep` rather than
dumping it all into context at once — a household with real usage history
can easily have 100+ history entries and hundreds of not-seen candidates
per mode.

## Step 2 — clear the exclusion review queue

The family has a standing rule against sadistic-predation and occult
material (`src/lib/exclusion.ts`). TMDB keywords *nominate* titles for
review; they never decide. A newly-ingested title that trips a watchlist
is hidden from the dashboard with `contentFlag = null` and stays hidden,
undecided, until someone rules on it. **Nothing else in the system ever
does this** — there's no UI, no notification, no cron. If this step is
skipped, flagged titles pile up invisibly and good films stay buried.

```bash
npx tsx scripts/review-exclusions.ts
```

For each pending title, decide against the rule as the family stated it:

- **OUT** — sadistic predation (torture as spectacle, serial killers
  preying on the helpless) and occult/spiritually dark material (demonic,
  satanic, exorcism). Fantasy magic and horror-adjacent comedy are also
  out, by explicit choice — *Harry Potter*, *Ghostbusters* and *Zombieland*
  were all reviewed and excluded on 2026-09-05.
- **IN** — war and combat violence however graphic, including torture in a
  wartime setting; crime and cartel violence between armed professionals;
  monster/creature and dystopian-contest threat. *Nope*, *The Northman*,
  both *A Quiet Place* films and *Ip Man* were reviewed and kept.

There is a second nomination source alongside keywords: **the stored
`ContentScore.sexNudity` value**. The family's line is that sex scenes
come out while less-sexualised nudity can stay, and a number cannot tell
those apart, so the rule is split:

- **7 or above — auto-excluded.** Hidden with no decision needed. In this
  catalog that threshold has meant explicit sexual content every time
  (*The Reader*, *Fifty Shades*, *The Wolf of Wall Street*). The review
  script lists these separately so a wrong one can be overridden with an
  explicit CLEAR.
- **Exactly 6 — pending review.** This is where non-sexual nudity lives.
  *Schindler's List* scores 6 for concentration-camp nudity and *The
  Northman* for pagan ritual; both were reviewed and CLEARED. *Hit Man*
  and *The Boy Next Door* scored the same 6 and were EXCLUDED, because
  theirs are actual sex scenes. Judge what the nudity is doing in the
  film, never the number alone.

An unscored title is never nominated — only a minority of visible titles
have a score, so failing closed on missing data would hide most of the
catalog. This also means the rule only reaches films this skill has
already content-rated, which is one more reason not to skip Step 3.

The keyword is evidence, not a verdict: judge the film, not the tag. The
canonical case is *The Dark Knight*, tagged `sadism` for the Joker but not
remotely a sadism film. When you genuinely don't know a title, say so and
leave it pending rather than guessing — pending is safe, since it stays
hidden either way.

Add each decision to `VERDICTS` in `scripts/review-exclusions.ts` with a
one-line reason, then:

```bash
npx tsx scripts/review-exclusions.ts --apply
```

**If any verdict was written, the ranking cache is now stale** — the
fingerprint covers the candidate id set, and changing what's visible
changes that set. Left alone, the dashboard silently re-ranks through the
app's paid Anthropic key on the next load, which is the exact cost this
skill exists to avoid. Steps 4–5 rewrite the cache anyway, so just make
sure you complete them; `scripts/repair-ranking-cache-2026-09-05.ts` is
the standalone fix if you ever need to repair the cache on its own.

Report pending titles and your verdicts to the user — this is a rule about
their family's viewing, so surface the calls rather than burying them.

## Step 3 — do the actual judgment yourself (this is the point of the skill)

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

## Step 4 — write the batch script

Create `scripts/manual-batch-<date>.ts` (dated, since the picks are
specific to this run — don't try to make it generically reusable). It
must:

1. Define `CONTENT_RATINGS: {id, violence, language, sexNudity, scariness, sourceNotes}[]` — your Step 3 output.
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
`import { isTitleVisible } from '../src/lib/filtering'`) — don't
reimplement this logic; a drift between this script's copy and the real
route's copy is exactly how titles quietly disappear.

## Step 5 — run and verify

```bash
set -a; source .env.production.local; set +a
npx tsx scripts/manual-batch-<date>.ts
```

Then verify with a small check script: `contentScore.count()` went up by
the batch size, and each mode's `rankingCache.findUnique(...).rankedIds.length`
equals the full not-seen candidate count for that mode (not just your
hand-ranked subset — this is the same completeness check from Step 4,
confirmed against what's actually in the database now).

## Step 6 — clean up and commit

```bash
rm -f .env.production.local scripts/tmp-*.ts
git add scripts/manual-batch-<date>.ts scripts/review-exclusions.ts
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
