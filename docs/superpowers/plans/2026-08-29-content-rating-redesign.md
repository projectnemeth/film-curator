# Content Rating Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace automatic, per-title Claude content scoring (expensive — ~$0.45-0.50/title observed live) with a free MPAA/TV-rating gate, an on-demand "Rate this" report the user triggers manually, and a cache so the taste-ranking Claude call only re-runs when its inputs actually change.

**Architecture:** `Title.mpaaRating` (already in the schema, currently unpopulated) becomes the only thing that decides visibility — G/PG auto-show in Family Mode, G/PG/PG-13/R auto-show in Adult Mode, NC-17/unrated always hidden in both. `ContentScore` stops gating anything and becomes purely informational, generated on demand by a single-title API call the user triggers by clicking a button. `ModeSettings` (the old configurable numeric thresholds) is retired entirely. A new `RankingCache` model avoids re-calling Claude for taste ranking on every page load.

**Tech Stack:** Next.js 15 App Router, TypeScript, Prisma/Postgres, Vitest + React Testing Library, `@anthropic-ai/sdk`, TMDB API.

**Spec:** `docs/superpowers/specs/2026-08-29-content-rating-redesign-design.md`

## Global Constraints

- `Title.mpaaRating` already exists in `prisma/schema.prisma` (`String?`) and in the initial migration — do NOT add it again. It has just never been populated or read anywhere in the codebase until now.
- Both modes use an explicit **allow-list** — anything not named is hidden, including unrecognized rating values. Family Mode shows exactly: `G`, `PG`, `TV-Y`, `TV-Y7`, `TV-G`, `TV-PG`. Adult Mode shows exactly: `PG-13`, `R`, `TV-14`, `TV-MA`. These are non-overlapping buckets — Adult Mode is NOT "everything Family shows, plus more"; a `G`-rated title never appears in Adult Mode.
- A manual `Override` (`APPROVED`/`REJECTED`) always takes precedence over the rating-based rule in both modes, unchanged from today.
- `ModeSettings` (model, `/api/mode-settings` route, the Settings page's threshold inputs, `prisma/seed.ts`) is retired entirely — not simplified, deleted.
- `TasteRating` becomes mode-scoped: a `mode` field is added, the unique key becomes `(familyId, titleId, mode)`, and a rating recorded while browsing in one mode never influences ranking in the other. Every route/page that records or reads taste ratings must pass its own current mode through.
- `TasteRatingValue` gains a `NOT_INTERESTED` value for the dashboard's new one-click "I don't want to see this" action — it's a taste signal like `DISLIKED`, not a hard block.
- The new on-demand scoring endpoint reuses `getOrCreateContentScore(titleId, signal)` from `src/lib/contentScoring.ts` unchanged (its `AbortSignal` support already exists) — do not reimplement scoring logic.
- Never call `getOrCreateContentScore` automatically from a cron, a page load, or any batch loop — it may only be invoked by an explicit, single-title, user-triggered request.

---

### Task 1: Retire `ModeSettings`, add `RankingCache`, move visibility to MPAA-only gating

**Files:**
- Modify: `prisma/schema.prisma`
- Create: migration via `npx prisma migrate dev --name content_rating_redesign`
- Delete: `prisma/seed.ts`
- Modify: `package.json` (remove `"prisma:seed"` script and the `"prisma": { "seed": ... }` block)
- Delete: `src/lib/__tests__/modeSettings.integration.test.ts`
- Modify: `src/lib/filtering.ts`
- Modify: `src/lib/__tests__/filtering.test.ts` (full rewrite)
- Modify: `src/lib/tasteInterview.ts`
- Modify: `src/lib/__tests__/tasteInterview.test.ts` (full rewrite)
- Modify: `src/lib/ranking.ts` (add `rankByTasteCached`)
- Create: `src/lib/__tests__/ranking.test.ts` (this file doesn't exist yet — verify with `ls src/lib/__tests__/ranking.test.ts` before assuming; if it does exist, extend it instead of creating)
- Modify: `src/app/api/recommendations/route.ts`
- Modify: `src/app/api/recommendations/__tests__/route.test.ts` (full rewrite)
- Delete: `src/app/api/mode-settings/route.ts` and `src/app/api/mode-settings/__tests__/route.test.ts`
- Modify: `src/app/settings/page.tsx`
- Modify: `src/app/settings/__tests__/page.test.tsx`
- Modify: `src/app/api/taste/route.ts`
- Modify: `src/app/api/taste/__tests__/route.test.ts`
- Modify: `src/app/rate/page.tsx`
- Modify: `src/app/rate/__tests__/page.test.tsx`

**Interfaces:**
- Produces: `isTitleVisible(mpaaRating: string | null, override: OverrideInput, mode: 'FAMILY' | 'ADULT'): boolean` from `src/lib/filtering.ts` — the single source of truth every later task's visibility check must use.
- Produces: `rankByTasteCached(familyId: string, mode: 'FAMILY' | 'ADULT', candidates: CandidateTitle[], tasteHistory: TasteHistoryEntry[]): Promise<string[]>` from `src/lib/ranking.ts`.
- Produces: `recordTasteRating(familyId: string, titleId: string, mode: 'FAMILY' | 'ADULT', rating: TasteRatingValue)` from `src/lib/tasteInterview.ts` — note the changed signature (mode is now a required third parameter, before `rating`). Task 4 (dashboard) calls this indirectly via `POST /api/taste` with `{ titleId, rating, mode }` in the body.
- Consumes: nothing from other tasks — this task is self-contained and can run first.

This is one task, not several, because these files are tightly coupled: removing `ModeSettings` from the schema breaks every file that queries it, and there's no meaningful intermediate state where only some of them are updated. A reviewer could not sensibly approve "remove `ModeSettings` from the schema" while rejecting "update `/api/recommendations` to stop querying it" — they're two halves of one change.

- [ ] **Step 1: Update the schema**

Replace the entire `ModeSettings` model in `prisma/schema.prisma` with a new `RankingCache` model:

```prisma
model RankingCache {
  id               String   @id @default(cuid())
  familyId         String   @default("default")
  mode             Mode
  inputFingerprint String
  rankedIds        String[]
  updatedAt        DateTime @updatedAt

  @@unique([familyId, mode])
}
```

Delete the `ModeSettings` model block entirely. The `Mode` enum stays (still used by `RankingCache` and elsewhere).

Also update `TasteRating` and `TasteRatingValue`:

```prisma
enum TasteRatingValue {
  DISLIKED
  LIKED
  LOVED
  NOT_SEEN
  TOO_INAPPROPRIATE
  NOT_INTERESTED
}

model TasteRating {
  id       String           @id @default(cuid())
  familyId String           @default("default")
  titleId  String
  title    Title            @relation(fields: [titleId], references: [id])
  mode     Mode             @default(FAMILY)
  rating   TasteRatingValue
  ratedAt  DateTime         @default(now())

  @@unique([familyId, titleId, mode])
}
```

The changes from today's version: `NOT_INTERESTED` added to the enum, `mode Mode @default(FAMILY)` added to the model (the default keeps the migration safe if any rows already exist), and the unique constraint extended from `(familyId, titleId)` to `(familyId, titleId, mode)`.

- [ ] **Step 2: Generate and run the migration**

```bash
npx prisma migrate dev --name content_rating_redesign
```

Confirm it drops the `ModeSettings` table and creates `RankingCache`. Run `npx prisma generate` if the command doesn't already do so.

- [ ] **Step 3: Delete the seed script**

`prisma/seed.ts` only ever seeded `ModeSettings` — delete the file. Remove `"prisma:seed": "tsx prisma/seed.ts"` from `package.json`'s `scripts` and the `"prisma": { "seed": "tsx prisma/seed.ts" }` block. Delete `src/lib/__tests__/modeSettings.integration.test.ts` (it only tested the now-deleted seed data).

- [ ] **Step 4: Rewrite `src/lib/filtering.ts`**

Replace the entire file:

```typescript
export type OverrideInput = { decision: 'APPROVED' | 'REJECTED' } | null

const FAMILY_SHOWN_RATINGS = new Set(['G', 'PG', 'TV-Y', 'TV-Y7', 'TV-G', 'TV-PG'])
const ADULT_SHOWN_RATINGS = new Set(['PG-13', 'R', 'TV-14', 'TV-MA'])

export function isRatingVisibleInMode(mpaaRating: string | null, mode: 'FAMILY' | 'ADULT'): boolean {
  if (!mpaaRating) return false
  return mode === 'FAMILY' ? FAMILY_SHOWN_RATINGS.has(mpaaRating) : ADULT_SHOWN_RATINGS.has(mpaaRating)
}

export function isTitleVisible(mpaaRating: string | null, override: OverrideInput, mode: 'FAMILY' | 'ADULT'): boolean {
  if (override?.decision === 'APPROVED') return true
  if (override?.decision === 'REJECTED') return false
  return isRatingVisibleInMode(mpaaRating, mode)
}
```

Both modes are now explicit allow-lists (not "everything except NC-17" for Adult) — Family and Adult are non-overlapping buckets. A `G`-rated title is `false` in Adult Mode, not just "not specially excluded."

- [ ] **Step 5: Rewrite `src/lib/__tests__/filtering.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { isRatingVisibleInMode, isTitleVisible } from '../filtering'

describe('isRatingVisibleInMode', () => {
  it('shows G and PG in Family Mode', () => {
    expect(isRatingVisibleInMode('G', 'FAMILY')).toBe(true)
    expect(isRatingVisibleInMode('PG', 'FAMILY')).toBe(true)
  })

  it('hides PG-13 and R in Family Mode', () => {
    expect(isRatingVisibleInMode('PG-13', 'FAMILY')).toBe(false)
    expect(isRatingVisibleInMode('R', 'FAMILY')).toBe(false)
  })

  it('hides NC-17 in Family Mode', () => {
    expect(isRatingVisibleInMode('NC-17', 'FAMILY')).toBe(false)
  })

  it('shows the kids TV-rating equivalents in Family Mode', () => {
    expect(isRatingVisibleInMode('TV-Y', 'FAMILY')).toBe(true)
    expect(isRatingVisibleInMode('TV-PG', 'FAMILY')).toBe(true)
  })

  it('hides TV-14 and TV-MA in Family Mode', () => {
    expect(isRatingVisibleInMode('TV-14', 'FAMILY')).toBe(false)
    expect(isRatingVisibleInMode('TV-MA', 'FAMILY')).toBe(false)
  })

  it('shows PG-13 and R in Adult Mode', () => {
    expect(isRatingVisibleInMode('PG-13', 'ADULT')).toBe(true)
    expect(isRatingVisibleInMode('R', 'ADULT')).toBe(true)
  })

  it('hides G and PG in Adult Mode — Family and Adult are non-overlapping buckets', () => {
    expect(isRatingVisibleInMode('G', 'ADULT')).toBe(false)
    expect(isRatingVisibleInMode('PG', 'ADULT')).toBe(false)
  })

  it('hides NC-17 in Adult Mode', () => {
    expect(isRatingVisibleInMode('NC-17', 'ADULT')).toBe(false)
  })

  it('shows TV-MA in Adult Mode', () => {
    expect(isRatingVisibleInMode('TV-MA', 'ADULT')).toBe(true)
  })

  it('hides a null/missing rating (unrated) in both modes', () => {
    expect(isRatingVisibleInMode(null, 'FAMILY')).toBe(false)
    expect(isRatingVisibleInMode(null, 'ADULT')).toBe(false)
  })
})

describe('isTitleVisible', () => {
  it('an approved override wins even over NC-17', () => {
    expect(isTitleVisible('NC-17', { decision: 'APPROVED' }, 'ADULT')).toBe(true)
  })

  it('a rejected override wins even over G', () => {
    expect(isTitleVisible('G', { decision: 'REJECTED' }, 'FAMILY')).toBe(false)
  })

  it('falls back to the rating-based rule with no override', () => {
    expect(isTitleVisible('PG-13', null, 'FAMILY')).toBe(false)
    expect(isTitleVisible('PG-13', null, 'ADULT')).toBe(true)
  })
})
```

Run `npx vitest run src/lib/__tests__/filtering.test.ts` — expect all pass (these are pure functions, no mocking needed).

- [ ] **Step 6: Update `src/lib/tasteInterview.ts`**

```typescript
import { prisma } from './prisma'
import type { TasteRatingValue } from '@prisma/client'
import { isTitleVisible } from './filtering'

export async function getNextTitleToRate(familyId: string, mode: 'FAMILY' | 'ADULT') {
  const [rated, overrides] = await Promise.all([
    prisma.tasteRating.findMany({ where: { familyId, mode }, select: { titleId: true } }),
    prisma.override.findMany({ where: { familyId } }),
  ])
  const ratedIds = rated.map((r) => r.titleId)
  const overrideByTitleId = new Map(overrides.map((o) => [o.titleId, o]))

  const candidates = await prisma.title.findMany({
    where: { familyId, id: { notIn: ratedIds } },
    orderBy: { createdAt: 'desc' },
  })

  for (const candidate of candidates) {
    const override = overrideByTitleId.get(candidate.id) ?? null
    if (isTitleVisible(candidate.mpaaRating, override, mode)) {
      return candidate
    }
  }

  return null
}

export async function recordTasteRating(familyId: string, titleId: string, mode: 'FAMILY' | 'ADULT', rating: TasteRatingValue) {
  return prisma.tasteRating.upsert({
    where: { familyId_titleId_mode: { familyId, titleId, mode } },
    update: { rating, ratedAt: new Date() },
    create: { familyId, titleId, mode, rating },
  })
}
```

Note the `getNextTitleToRate`'s "already rated" check is now scoped to `mode` too — a title rated in Family Mode can still surface to be rated again in Adult Mode later, since they're independent signals.

- [ ] **Step 7: Rewrite `src/lib/__tests__/tasteInterview.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../prisma', () => ({
  prisma: {
    tasteRating: { findMany: vi.fn(), upsert: vi.fn() },
    title: { findMany: vi.fn() },
    override: { findMany: vi.fn() },
  },
}))

import { prisma } from '../prisma'
import { getNextTitleToRate, recordTasteRating } from '../tasteInterview'

describe('getNextTitleToRate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('excludes already-rated titles, scoped to the active mode', async () => {
    ;(prisma.tasteRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ titleId: 't1' }])
    ;(prisma.override.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 't2', name: 'A PG Movie', mpaaRating: 'PG' },
    ])

    const next = await getNextTitleToRate('default', 'FAMILY')

    expect(prisma.tasteRating.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { familyId: 'default', mode: 'FAMILY' } })
    )
    expect(prisma.title.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { familyId: 'default', id: { notIn: ['t1'] } } })
    )
    expect(next?.id).toBe('t2')
  })

  it('never returns a title whose rating is hidden in the active mode, even if most recently created', async () => {
    ;(prisma.tasteRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(prisma.override.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'pg13-newest', name: 'PG-13 Newest', createdAt: new Date('2026-08-28'), mpaaRating: 'PG-13' },
      { id: 'pg-older', name: 'PG Older', createdAt: new Date('2020-01-01'), mpaaRating: 'PG' },
    ])

    const next = await getNextTitleToRate('default', 'FAMILY')

    expect(next?.id).toBe('pg-older')
  })

  it('excludes a title with a REJECTED override even when its rating would otherwise show', async () => {
    ;(prisma.tasteRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(prisma.override.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { titleId: 'rejected-but-pg', decision: 'REJECTED' },
    ])
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'rejected-but-pg', name: 'Rejected But PG', mpaaRating: 'PG' },
      { id: 'pg-fallback', name: 'PG Fallback', mpaaRating: 'PG' },
    ])

    const next = await getNextTitleToRate('default', 'FAMILY')

    expect(next?.id).toBe('pg-fallback')
  })

  it('returns null when every candidate is hidden in the active mode', async () => {
    ;(prisma.tasteRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(prisma.override.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'r-1', name: 'An R Movie', mpaaRating: 'R' },
      { id: 'unrated-1', name: 'Unrated 1', mpaaRating: null },
    ])

    const next = await getNextTitleToRate('default', 'FAMILY')

    expect(next).toBeNull()
  })
})

describe('recordTasteRating', () => {
  it('upserts a rating keyed by family, title, and mode', async () => {
    const mockUpsert = vi.fn().mockResolvedValue({ id: 'r1' })
    ;(prisma.tasteRating.upsert as ReturnType<typeof vi.fn>) = mockUpsert

    await recordTasteRating('default', 't1', 'ADULT', 'LOVED')

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { familyId_titleId_mode: { familyId: 'default', titleId: 't1', mode: 'ADULT' } } })
    )
  })
})
```

- [ ] **Step 8: Add `rankByTasteCached` to `src/lib/ranking.ts`**

Add these exports to the existing file (keep `rankByTaste` and its existing exports unchanged):

```typescript
import { createHash } from 'crypto'
import { prisma } from './prisma'

export function computeRankingFingerprint(candidateIds: string[], tasteHistory: TasteHistoryEntry[]): string {
  const sortedIds = [...candidateIds].sort()
  const sortedHistory = tasteHistory.map((h) => `${h.titleName}:${h.rating}`).sort()
  return createHash('sha256').update(sortedIds.join(',') + '|' + sortedHistory.join(',')).digest('hex')
}

export async function rankByTasteCached(
  familyId: string,
  mode: 'FAMILY' | 'ADULT',
  candidates: CandidateTitle[],
  tasteHistory: TasteHistoryEntry[]
): Promise<string[]> {
  if (candidates.length === 0) return []

  const fingerprint = computeRankingFingerprint(candidates.map((c) => c.id), tasteHistory)
  const cached = await prisma.rankingCache.findUnique({ where: { familyId_mode: { familyId, mode } } })
  if (cached && cached.inputFingerprint === fingerprint) {
    return cached.rankedIds
  }

  const rankedIds = await rankByTaste(candidates, tasteHistory)

  await prisma.rankingCache.upsert({
    where: { familyId_mode: { familyId, mode } },
    update: { inputFingerprint: fingerprint, rankedIds },
    create: { familyId, mode, inputFingerprint: fingerprint, rankedIds },
  })

  return rankedIds
}
```

Note: if `rankByTaste` throws, `rankByTasteCached` throws too (the upsert is never reached) — a failed ranking is never cached. This is intentional; don't add a try/catch here, the caller's own try/catch (in `/api/recommendations`) already handles the fallback.

- [ ] **Step 9: Write `src/lib/__tests__/ranking.test.ts`**

First check whether this file already exists (`ls src/lib/__tests__/ | grep ranking`). If it exists, add these tests to it without disturbing any existing ones. If not, create it:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../prisma', () => ({
  prisma: { rankingCache: { findUnique: vi.fn(), upsert: vi.fn() } },
}))
vi.mock('../anthropic', () => ({ getAnthropicClient: vi.fn() }))

import { prisma } from '../prisma'
import { getAnthropicClient } from '../anthropic'
import { rankByTasteCached, computeRankingFingerprint } from '../ranking'

const candidates = [{ id: 't1', name: 'A', overview: null }]
const history = [{ titleName: 'B', rating: 'LIKED' }]

describe('computeRankingFingerprint', () => {
  it('is stable regardless of input order', () => {
    const fp1 = computeRankingFingerprint(['t1', 't2'], [{ titleName: 'A', rating: 'LIKED' }, { titleName: 'B', rating: 'LOVED' }])
    const fp2 = computeRankingFingerprint(['t2', 't1'], [{ titleName: 'B', rating: 'LOVED' }, { titleName: 'A', rating: 'LIKED' }])
    expect(fp1).toBe(fp2)
  })

  it('changes when the taste history changes', () => {
    const fp1 = computeRankingFingerprint(['t1'], [{ titleName: 'A', rating: 'LIKED' }])
    const fp2 = computeRankingFingerprint(['t1'], [{ titleName: 'A', rating: 'DISLIKED' }])
    expect(fp1).not.toBe(fp2)
  })
})

describe('rankByTasteCached', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reuses the cached ranking when the fingerprint matches, without calling Claude', async () => {
    const fingerprint = computeRankingFingerprint(['t1'], history)
    ;(prisma.rankingCache.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ inputFingerprint: fingerprint, rankedIds: ['t1'] })

    const result = await rankByTasteCached('default', 'FAMILY', candidates, history)

    expect(result).toEqual(['t1'])
    expect(getAnthropicClient).not.toHaveBeenCalled()
    expect(prisma.rankingCache.upsert).not.toHaveBeenCalled()
  })

  it('recomputes and saves a new cache row when the fingerprint does not match', async () => {
    ;(prisma.rankingCache.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ inputFingerprint: 'stale', rankedIds: ['old'] })
    ;(getAnthropicClient as ReturnType<typeof vi.fn>).mockReturnValue({
      messages: { create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: JSON.stringify({ rankedTitleIds: ['t1'] }) }] }) },
    })
    ;(prisma.rankingCache.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({})

    const result = await rankByTasteCached('default', 'FAMILY', candidates, history)

    expect(result).toEqual(['t1'])
    expect(prisma.rankingCache.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { familyId_mode: { familyId: 'default', mode: 'FAMILY' } } })
    )
  })

  it('recomputes when no cache row exists yet', async () => {
    ;(prisma.rankingCache.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    ;(getAnthropicClient as ReturnType<typeof vi.fn>).mockReturnValue({
      messages: { create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: JSON.stringify({ rankedTitleIds: ['t1'] }) }] }) },
    })
    ;(prisma.rankingCache.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({})

    const result = await rankByTasteCached('default', 'FAMILY', candidates, history)

    expect(result).toEqual(['t1'])
  })

  it('does not cache a failed ranking', async () => {
    ;(prisma.rankingCache.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    ;(getAnthropicClient as ReturnType<typeof vi.fn>).mockReturnValue({
      messages: { create: vi.fn().mockRejectedValue(new Error('rate limited')) },
    })

    await expect(rankByTasteCached('default', 'FAMILY', candidates, history)).rejects.toThrow()
    expect(prisma.rankingCache.upsert).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 10: Rewrite `src/app/api/recommendations/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isTitleVisible } from '@/lib/filtering'
import { rankByTasteCached } from '@/lib/ranking'

export const maxDuration = 60

export async function GET(req: NextRequest) {
  const modeParam = req.nextUrl.searchParams.get('mode')
  const mode: 'FAMILY' | 'ADULT' = modeParam === 'ADULT' ? 'ADULT' : 'FAMILY'
  const familyId = 'default'

  const [titles, overrides, tasteHistory] = await Promise.all([
    prisma.title.findMany({ where: { familyId }, include: { contentScore: true } }),
    prisma.override.findMany({ where: { familyId } }),
    prisma.tasteRating.findMany({ where: { familyId, mode }, include: { title: true } }),
  ])

  const overrideByTitleId = new Map(overrides.map((o) => [o.titleId, o]))

  const visible = titles.filter((title) => {
    const override = overrideByTitleId.get(title.id) ?? null
    return isTitleVisible(title.mpaaRating, override, mode)
  })

  const history = tasteHistory
    .filter((t) => t.rating !== 'NOT_SEEN')
    .map((t) => ({ titleName: t.title.name, rating: t.rating }))

  let rankedIds: string[]
  try {
    rankedIds = await rankByTasteCached(
      familyId,
      mode,
      visible.map((v) => ({ id: v.id, name: v.name, overview: v.overview })),
      history
    )
  } catch (err) {
    console.error('Failed to rank titles by taste, falling back to unranked order:', err)
    rankedIds = visible.map((v) => v.id)
  }
  const byId = new Map(visible.map((v) => [v.id, v]))
  const ranked = rankedIds.map((id) => byId.get(id)).filter((v): v is typeof visible[number] => Boolean(v))

  return NextResponse.json({
    mode,
    titles: ranked.map((t) => ({
      id: t.id,
      name: t.name,
      year: t.year,
      posterPath: t.posterPath,
      providers: t.providers,
      mpaaRating: t.mpaaRating,
      contentScore: t.contentScore,
    })),
  })
}
```

- [ ] **Step 11: Rewrite `src/app/api/recommendations/__tests__/route.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    title: { findMany: vi.fn() },
    override: { findMany: vi.fn() },
    tasteRating: { findMany: vi.fn() },
  },
}))
vi.mock('@/lib/ranking', () => ({ rankByTasteCached: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { rankByTasteCached } from '@/lib/ranking'
import { GET } from '../route'

describe('GET /api/recommendations', () => {
  beforeEach(() => vi.clearAllMocks())

  it('defaults to FAMILY when mode is missing or invalid', async () => {
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(prisma.override.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(prisma.tasteRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(rankByTasteCached as ReturnType<typeof vi.fn>).mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/recommendations?mode=nonsense')
    const res = await GET(req)
    const body = await res.json()
    expect(body.mode).toBe('FAMILY')
  })

  it('shows PG-13 and R in Adult Mode but hides them in Family Mode', async () => {
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 't1', name: 'A PG Movie', overview: null, mpaaRating: 'PG', posterPath: null, providers: [], contentScore: null, year: 2020 },
      { id: 't2', name: 'An R Movie', overview: null, mpaaRating: 'R', posterPath: null, providers: [], contentScore: null, year: 2020 },
    ])
    ;(prisma.override.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(prisma.tasteRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(rankByTasteCached as ReturnType<typeof vi.fn>).mockImplementation(async (_f: string, _m: string, candidates: { id: string }[]) => candidates.map((c) => c.id))

    const family = await (await GET(new NextRequest('http://localhost/api/recommendations?mode=FAMILY'))).json()
    expect(family.titles.map((t: { id: string }) => t.id)).toEqual(['t1'])

    const adult = await (await GET(new NextRequest('http://localhost/api/recommendations?mode=ADULT'))).json()
    expect(adult.titles.map((t: { id: string }) => t.id)).toEqual(['t1', 't2'])
  })

  it('excludes titles with REJECTED overrides even when the rating would otherwise show', async () => {
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 't1', name: 'Clean Title', overview: null, mpaaRating: 'G', posterPath: null, providers: [], contentScore: null, year: 2020 },
      { id: 't3', name: 'Rejected Title', overview: null, mpaaRating: 'G', posterPath: null, providers: [], contentScore: null, year: 2020 },
    ])
    ;(prisma.override.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ titleId: 't3', decision: 'REJECTED' }])
    ;(prisma.tasteRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(rankByTasteCached as ReturnType<typeof vi.fn>).mockImplementation(async (_f: string, _m: string, candidates: { id: string }[]) => candidates.map((c) => c.id))

    const req = new NextRequest('http://localhost/api/recommendations?mode=FAMILY')
    const body = await (await GET(req)).json()

    expect(body.titles.map((t: { id: string }) => t.id)).toEqual(['t1'])
  })

  it('falls back to visible titles in original order when ranking fails', async () => {
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 't1', name: 'A', overview: null, mpaaRating: 'G', posterPath: null, providers: [], contentScore: null, year: 2020 },
      { id: 't2', name: 'B', overview: null, mpaaRating: 'G', posterPath: null, providers: [], contentScore: null, year: 2020 },
    ])
    ;(prisma.override.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(prisma.tasteRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(rankByTasteCached as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('anthropic rate limited'))

    const req = new NextRequest('http://localhost/api/recommendations?mode=FAMILY')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.titles.map((t: { id: string }) => t.id)).toEqual(['t1', 't2'])
  })

  it('only reads taste ratings recorded in the active mode — family and adult ratings never cross-influence each other', async () => {
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 't1', name: 'A', overview: null, mpaaRating: 'R', posterPath: null, providers: [], contentScore: null, year: 2020 },
    ])
    ;(prisma.override.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(prisma.tasteRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(rankByTasteCached as ReturnType<typeof vi.fn>).mockResolvedValue(['t1'])

    const req = new NextRequest('http://localhost/api/recommendations?mode=ADULT')
    await GET(req)

    expect(prisma.tasteRating.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { familyId: 'default', mode: 'ADULT' } })
    )
  })

  it('includes mpaaRating and contentScore in each returned title for the frontend to render', async () => {
    const score = { violence: 3, language: 1, sexNudity: 0, scariness: 2, sourceNotes: 'test' }
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 't1', name: 'A', overview: null, mpaaRating: 'R', posterPath: null, providers: [], contentScore: score, year: 2020 },
    ])
    ;(prisma.override.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(prisma.tasteRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(rankByTasteCached as ReturnType<typeof vi.fn>).mockResolvedValue(['t1'])

    const req = new NextRequest('http://localhost/api/recommendations?mode=ADULT')
    const body = await (await GET(req)).json()

    expect(body.titles[0].mpaaRating).toBe('R')
    expect(body.titles[0].contentScore).toEqual(score)
  })
})

describe('maxDuration', () => {
  it('exports a maxDuration of 60 seconds — this route still calls rankByTasteCached live', async () => {
    const routeModule = await import('../route')
    expect(routeModule.maxDuration).toBe(60)
  })
})
```

- [ ] **Step 12: Delete the `/api/mode-settings` route and its test**

Delete `src/app/api/mode-settings/route.ts` and `src/app/api/mode-settings/__tests__/route.test.ts` (and the now-empty `__tests__` directory if nothing else is in it).

- [ ] **Step 13: Simplify the Settings page**

Replace `src/app/settings/page.tsx` — keep `OverridesManager` exactly as it is today, drop everything else:

```tsx
'use client'
import { useEffect, useState } from 'react'

type OverrideRow = { id: string; titleId: string; decision: string; title: { name: string; posterPath: string | null } }

function OverridesManager() {
  const [overrides, setOverrides] = useState<OverrideRow[]>([])
  const [titleId, setTitleId] = useState('')
  const [decision, setDecision] = useState<'APPROVED' | 'REJECTED'>('APPROVED')

  function load() {
    fetch('/api/overrides')
      .then((res) => res.json())
      .then((data) => setOverrides(data.overrides))
  }

  useEffect(() => {
    load()
  }, [])

  async function add() {
    await fetch('/api/overrides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titleId, decision }),
    })
    setTitleId('')
    load()
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2 list-none p-0">
        {overrides.map((o) => (
          <li key={o.id} className="flex items-center gap-3 bg-surface border border-border rounded px-3 py-2">
            {o.title.posterPath ? (
              <img
                src={`https://image.tmdb.org/t/p/w200${o.title.posterPath}`}
                alt={`${o.title.name} poster`}
                width={40}
                height={60}
                className="rounded aspect-[2/3] object-cover"
              />
            ) : (
              <div className="w-10 aspect-[2/3] bg-border rounded" aria-hidden="true" />
            )}
            <span className={`text-sm ${o.decision === 'REJECTED' ? 'text-danger' : 'text-textPrimary'}`}>
              {o.title.name}: {o.decision}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2 items-center">
        <input
          placeholder="Title ID"
          value={titleId}
          onChange={(e) => setTitleId(e.target.value)}
          className="bg-surface border border-border rounded px-3 py-1.5 text-sm text-textPrimary focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <select
          value={decision}
          onChange={(e) => setDecision(e.target.value as 'APPROVED' | 'REJECTED')}
          className="bg-surface border border-border rounded px-3 py-1.5 text-sm text-textPrimary focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="APPROVED">Approve</option>
          <option value="REJECTED">Reject</option>
        </select>
        <button
          onClick={add}
          className="bg-accent text-bg text-sm font-medium rounded px-3 py-1.5 hover:bg-accentGlow transition-colors"
        >
          Add Override
        </button>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <main className="max-w-4xl mx-auto px-6 py-8">
      <h1 className="font-display text-3xl tracking-wide text-textPrimary mb-6">Content Filter Settings</h1>
      <section>
        <h2 className="font-display text-xl tracking-wide text-textPrimary mb-4">Overrides</h2>
        <OverridesManager />
      </section>
    </main>
  )
}
```

- [ ] **Step 14: Update `src/app/settings/__tests__/page.test.tsx`**

```tsx
import { describe, it, expect, vi, waitFor } from 'vitest'
import { render, screen } from '@testing-library/react'
import SettingsPage from '../page'

describe('SettingsPage', () => {
  it('shows existing overrides', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.startsWith('/api/overrides')) {
        return Promise.resolve({ json: async () => ({ overrides: [{ id: 'o1', titleId: 't1', decision: 'APPROVED', title: { name: 'Jurassic Park', posterPath: '/poster.jpg' } }] }) })
      }
      return Promise.resolve({ json: async () => ({}) })
    }) as unknown as typeof fetch

    render(<SettingsPage />)
    expect(await screen.findByText(/Jurassic Park: APPROVED/)).toBeInTheDocument()
  })
})
```

(Note: `waitFor` is imported above only if used — if not needed after simplification, import just `render, screen` from `@testing-library/react` and drop the unused `waitFor` import from `vitest` entirely; don't leave an unused import.)

- [ ] **Step 15: Update `src/app/api/taste/route.ts` for mode-scoped ratings**

`recordTasteRating` now takes `mode` as its third parameter (Step 6). Update the POST handler to read `mode` from the request body and pass it through:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getNextTitleToRate, recordTasteRating } from '@/lib/tasteInterview'

const VALID_RATINGS = ['DISLIKED', 'LIKED', 'LOVED', 'NOT_SEEN', 'TOO_INAPPROPRIATE', 'NOT_INTERESTED']

export async function GET(req: NextRequest) {
  const modeParam = req.nextUrl.searchParams.get('mode')
  const mode: 'FAMILY' | 'ADULT' = modeParam === 'ADULT' ? 'ADULT' : 'FAMILY'
  const title = await getNextTitleToRate('default', mode)
  return NextResponse.json({ title })
}

export async function POST(req: NextRequest) {
  const { titleId, rating, mode } = await req.json()
  const resolvedMode: 'FAMILY' | 'ADULT' = mode === 'ADULT' ? 'ADULT' : 'FAMILY'
  if (!titleId || !VALID_RATINGS.includes(rating)) {
    return NextResponse.json({ error: 'invalid input' }, { status: 400 })
  }
  const result = await recordTasteRating('default', titleId, resolvedMode, rating)
  return NextResponse.json({ result })
}
```

`NOT_INTERESTED` is added to `VALID_RATINGS`. A missing/invalid `mode` in the POST body defaults to `FAMILY`, matching the same lenient-default convention the GET handler already uses.

Update `src/app/api/taste/__tests__/route.test.ts`'s `POST /api/taste` describe block:

```typescript
describe('POST /api/taste', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects an invalid rating value', async () => {
    const req = new NextRequest('http://localhost/api/taste', {
      method: 'POST',
      body: JSON.stringify({ titleId: 't1', rating: 'NOT_A_RATING', mode: 'FAMILY' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    expect(recordTasteRating).not.toHaveBeenCalled()
  })

  it('records a valid rating scoped to the given mode', async () => {
    ;(recordTasteRating as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'r1' })
    const req = new NextRequest('http://localhost/api/taste', {
      method: 'POST',
      body: JSON.stringify({ titleId: 't1', rating: 'LOVED', mode: 'ADULT' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(recordTasteRating).toHaveBeenCalledWith('default', 't1', 'ADULT', 'LOVED')
  })

  it('defaults to FAMILY when mode is missing from the body', async () => {
    ;(recordTasteRating as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'r1' })
    const req = new NextRequest('http://localhost/api/taste', {
      method: 'POST',
      body: JSON.stringify({ titleId: 't1', rating: 'LIKED' }),
    })
    await POST(req)
    expect(recordTasteRating).toHaveBeenCalledWith('default', 't1', 'FAMILY', 'LIKED')
  })

  it('accepts NOT_INTERESTED as a valid rating', async () => {
    ;(recordTasteRating as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'r1' })
    const req = new NextRequest('http://localhost/api/taste', {
      method: 'POST',
      body: JSON.stringify({ titleId: 't1', rating: 'NOT_INTERESTED', mode: 'FAMILY' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
  })
})
```

Leave the existing `GET /api/taste` describe block untouched — it's unaffected by this change.

- [ ] **Step 16: Update `src/app/rate/page.tsx` for mode-scoped ratings**

The page already tracks `mode` in local state (used for the `GET` call). Add it to the `POST` body in the `rate` function — this is the only change needed:

```typescript
async function rate(rating: string) {
  if (!title) return
  await fetch('/api/taste', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ titleId: title.id, rating, mode }),
  })
  loadNext(mode)
}
```

Update the corresponding assertion in `src/app/rate/__tests__/page.test.tsx`'s "submits a rating and loads the next title" test:

```typescript
expect(fetch).toHaveBeenCalledWith(
  '/api/taste',
  expect.objectContaining({ method: 'POST', body: JSON.stringify({ titleId: 't1', rating: 'LOVED', mode: 'FAMILY' }) })
)
```

- [ ] **Step 17: Run the full suite and build**

```bash
npm test
npm run build
```

Expect all tests green and a clean build. This task touches the most files in the plan — if anything still references `modeSettings`, `evaluateTitle`, `isVisibleInMode`, `ContentScoreInput`, `ModeThresholds`, or the old two-argument `recordTasteRating(familyId, titleId, rating)` signature, the build will fail with a clear TypeScript error naming the file; fix it before moving on.

- [ ] **Step 18: Commit**

```bash
git add -A
git commit -m "feat: replace configurable content thresholds with MPAA-rating gating"
```

---

### Task 2: Capture MPAA/TV ratings from TMDB; remove the ingest cron's scoring phase

**Files:**
- Modify: `src/lib/tmdb.ts`
- Modify: `src/lib/__tests__/tmdb.test.ts`
- Modify: `src/app/api/ingest/route.ts`
- Modify: `src/app/api/ingest/__tests__/route.test.ts` (large rewrite — the entire scoring-phase test suite is deleted)
- Modify: `src/app/api/search/route.ts`
- Modify: `src/app/api/search/__tests__/route.test.ts`
- Delete: `src/lib/scoringSchedule.ts` and `src/lib/__tests__/scoringSchedule.test.ts` (dead code — superseded by this redesign; the batch time-budget problem it solved no longer exists once scoring isn't automatic)

**Interfaces:**
- Produces: `getCertification(tmdbId: number, mediaType: 'movie' | 'tv'): Promise<string | null>` from `src/lib/tmdb.ts`.
- Consumes: nothing from Task 1 — this task's files (`tmdb.ts`, `ingest/route.ts`, `search/route.ts`) don't touch the schema, filtering, or ranking. Safe to do independently of Task 1.

- [ ] **Step 1: Write the failing tests for `getCertification`**

Add to `src/lib/__tests__/tmdb.test.ts`:

```typescript
describe('getCertification', () => {
  it('returns the US certification for a movie', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { iso_3166_1: 'FR', release_dates: [{ certification: '' }] },
          { iso_3166_1: 'US', release_dates: [{ certification: 'PG-13' }, { certification: 'PG-13' }] },
        ],
      }),
    }) as unknown as typeof fetch

    expect(await getCertification(1, 'movie')).toBe('PG-13')
  })

  it('returns the US rating for a TV show', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ iso_3166_1: 'GB', rating: '15' }, { iso_3166_1: 'US', rating: 'TV-14' }] }),
    }) as unknown as typeof fetch

    expect(await getCertification(1, 'tv')).toBe('TV-14')
  })

  it('returns null when there is no US entry', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) }) as unknown as typeof fetch
    expect(await getCertification(1, 'movie')).toBeNull()
  })

  it('returns null when the US entry has no certification value set', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ iso_3166_1: 'US', release_dates: [{ certification: '' }] }] }),
    }) as unknown as typeof fetch
    expect(await getCertification(1, 'movie')).toBeNull()
  })
})
```

Add `getCertification` to the import line at the top of the test file.

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run src/lib/__tests__/tmdb.test.ts -t "getCertification"
```

Expect a failure — `getCertification` doesn't exist yet.

- [ ] **Step 3: Implement `getCertification` in `src/lib/tmdb.ts`**

Add this function (verified live against the real TMDB API on 2026-08-29 — movies use `release_dates[].certification`, TV uses top-level `rating`, both keyed by `iso_3166_1`):

```typescript
type TmdbMovieReleaseDate = { certification: string }
type TmdbMovieReleaseDatesResult = { iso_3166_1: string; release_dates: TmdbMovieReleaseDate[] }
type TmdbTvContentRatingsResult = { iso_3166_1: string; rating: string }

export async function getCertification(tmdbId: number, mediaType: 'movie' | 'tv'): Promise<string | null> {
  if (mediaType === 'movie') {
    const data = await tmdbFetch(`/movie/${tmdbId}/release_dates`)
    const results: TmdbMovieReleaseDatesResult[] = data.results ?? []
    const us = results.find((r) => r.iso_3166_1 === 'US')
    const withCert = us?.release_dates.find((rd) => rd.certification)
    return withCert?.certification || null
  }
  const data = await tmdbFetch(`/tv/${tmdbId}/content_ratings`)
  const results: TmdbTvContentRatingsResult[] = data.results ?? []
  const us = results.find((r) => r.iso_3166_1 === 'US')
  return us?.rating || null
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run src/lib/__tests__/tmdb.test.ts
```

Expect all pass, including the pre-existing `searchTitle`/`getWatchProviders`/`discoverByProvider` tests unchanged.

- [ ] **Step 5: Delete the dead scoring-schedule code**

```bash
rm src/lib/scoringSchedule.ts src/lib/__tests__/scoringSchedule.test.ts
```

- [ ] **Step 6: Rewrite `src/app/api/ingest/route.ts`**

Replace the entire file — this removes the scoring phase entirely and adds certification capture:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { discoverByProvider, getWatchProviders, getCertification, PROVIDER_IDS } from '@/lib/tmdb'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'server misconfigured: CRON_SECRET is not set' }, { status: 500 })
  }

  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const familyId = 'default'
  const results = { ingested: 0, failed: 0 }

  for (const providerId of Object.values(PROVIDER_IDS)) {
    for (const mediaType of ['movie', 'tv'] as const) {
      let items
      try {
        items = await discoverByProvider(providerId, mediaType)
      } catch (error) {
        console.error(`Failed to discover titles for provider ${providerId} (${mediaType}):`, error)
        results.failed++
        continue
      }

      for (const item of items) {
        try {
          const [providers, mpaaRating] = await Promise.all([
            getWatchProviders(item.id, mediaType),
            getCertification(item.id, mediaType),
          ])
          const dateStr = item.release_date ?? item.first_air_date
          const year = dateStr ? Number(dateStr.slice(0, 4)) : null

          await prisma.title.upsert({
            where: { familyId_tmdbId: { familyId, tmdbId: item.id } },
            update: { providers, mpaaRating },
            create: {
              familyId,
              tmdbId: item.id,
              name: item.title ?? item.name ?? 'Unknown',
              year,
              posterPath: item.poster_path,
              overview: item.overview,
              providers,
              mpaaRating,
            },
          })
          results.ingested++
        } catch (error) {
          console.error(`Failed to ingest title tmdbId=${item.id} name=${item.title ?? item.name ?? 'Unknown'}:`, error)
          results.failed++
        }
      }
    }
  }

  return NextResponse.json(results)
}
```

No `maxDuration` export — this route no longer makes any Claude calls, so the platform default is more than enough for TMDB-only ingestion. If a future run proves too slow, that's a one-line follow-up, not something to guess at now.

- [ ] **Step 7: Rewrite `src/app/api/ingest/__tests__/route.test.ts`**

Replace the entire file:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/tmdb', () => ({
  discoverByProvider: vi.fn(),
  getWatchProviders: vi.fn(),
  getCertification: vi.fn(),
  PROVIDER_IDS: { netflix: 8, disney_plus: 337, prime_video: 9, peacock: 386 },
}))
vi.mock('@/lib/prisma', () => ({
  prisma: { title: { upsert: vi.fn() } },
}))

import { discoverByProvider, getWatchProviders, getCertification } from '@/lib/tmdb'
import { prisma } from '@/lib/prisma'
import { GET } from '../route'

const originalSecret = process.env.CRON_SECRET

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = 'test-secret'
  ;(discoverByProvider as ReturnType<typeof vi.fn>).mockResolvedValue([])
  ;(getWatchProviders as ReturnType<typeof vi.fn>).mockResolvedValue([])
  ;(getCertification as ReturnType<typeof vi.fn>).mockResolvedValue(null)
})

afterEach(() => {
  process.env.CRON_SECRET = originalSecret
})

describe('GET /api/ingest', () => {
  it('rejects requests without the correct bearer token', async () => {
    const req = new NextRequest('http://localhost/api/ingest')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns 500 when CRON_SECRET is not configured, rather than authenticating "Bearer undefined"', async () => {
    delete process.env.CRON_SECRET
    const req = new NextRequest('http://localhost/api/ingest', { headers: { authorization: 'Bearer undefined' } })
    const res = await GET(req)
    expect(res.status).toBe(500)
  })

  it('ingests titles for every provider and media type, counting failures', async () => {
    ;(discoverByProvider as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ id: 1, title: 'A', overview: '', poster_path: null, release_date: '2020-01-01' }])
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue([])
    ;(getWatchProviders as ReturnType<typeof vi.fn>).mockResolvedValue(['netflix'])
    ;(prisma.title.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({})

    const req = new NextRequest('http://localhost/api/ingest', { headers: { authorization: 'Bearer test-secret' } })
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ingested).toBe(1)
    expect(body.failed).toBe(1)
  })

  it('captures the MPAA/TV rating from TMDB and stores it on the title', async () => {
    ;(discoverByProvider as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ id: 1, title: 'A', overview: '', poster_path: null, release_date: '2020-01-01' }])
      .mockResolvedValue([])
    ;(getWatchProviders as ReturnType<typeof vi.fn>).mockResolvedValue(['netflix'])
    ;(getCertification as ReturnType<typeof vi.fn>).mockResolvedValue('PG-13')
    ;(prisma.title.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({})

    const req = new NextRequest('http://localhost/api/ingest', { headers: { authorization: 'Bearer test-secret' } })
    await GET(req)

    expect(prisma.title.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ mpaaRating: 'PG-13' }),
        create: expect.objectContaining({ mpaaRating: 'PG-13' }),
      })
    )
  })
})
```

- [ ] **Step 8: Update `src/app/api/search/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { searchTitle, getWatchProviders, getCertification } from '@/lib/tmdb'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q')
  if (!query) return NextResponse.json({ error: 'q is required' }, { status: 400 })

  const results = await searchTitle(query)
  const titles = []

  for (const result of results.slice(0, 10)) {
    const mediaType = result.title ? 'movie' : 'tv'
    const [providers, mpaaRating] = await Promise.all([
      getWatchProviders(result.id, mediaType),
      getCertification(result.id, mediaType),
    ])
    const dateStr = result.release_date ?? result.first_air_date
    const year = dateStr ? Number(dateStr.slice(0, 4)) : null

    const title = await prisma.title.upsert({
      where: { familyId_tmdbId: { familyId: 'default', tmdbId: result.id } },
      update: { providers, mpaaRating },
      create: {
        familyId: 'default',
        tmdbId: result.id,
        name: result.title ?? result.name ?? 'Unknown',
        year,
        posterPath: result.poster_path,
        overview: result.overview,
        providers,
        mpaaRating,
      },
    })
    titles.push(title)
  }

  return NextResponse.json({ titles })
}
```

- [ ] **Step 9: Update `src/app/api/search/__tests__/route.test.ts`**

Add `getCertification: vi.fn()` to the `@/lib/tmdb` mock, import it, and add:

```typescript
it('captures the MPAA rating alongside providers', async () => {
  ;(searchTitle as ReturnType<typeof vi.fn>).mockResolvedValue([
    { id: 42, title: 'Jurassic Park', overview: '...', poster_path: '/x.jpg', release_date: '1993-06-11' },
  ])
  ;(getWatchProviders as ReturnType<typeof vi.fn>).mockResolvedValue(['netflix'])
  ;(getCertification as ReturnType<typeof vi.fn>).mockResolvedValue('PG-13')
  ;(prisma.title.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 't1', name: 'Jurassic Park' })

  const req = new NextRequest('http://localhost/api/search?q=jurassic')
  await GET(req)

  expect(prisma.title.upsert).toHaveBeenCalledWith(
    expect.objectContaining({ update: expect.objectContaining({ mpaaRating: 'PG-13' }) })
  )
})
```

Add a default `(getCertification as ReturnType<typeof vi.fn>).mockResolvedValue(null)` in the existing test's setup if it doesn't set one, so the pre-existing "searches TMDB, upserts results, and returns them" test keeps passing unchanged.

- [ ] **Step 10: Run the full suite and build**

```bash
npm test
npm run build
```

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: capture MPAA/TV ratings from TMDB, remove automatic content scoring from ingest"
```

---

### Task 3: On-demand "Rate this" endpoint

**Files:**
- Create: `src/app/api/titles/[id]/rate-content/route.ts`
- Create: `src/app/api/titles/[id]/rate-content/__tests__/route.test.ts`
- Modify: `src/middleware.ts` (verify this new route is NOT accidentally caught by any auth-bypass list — it should require the normal session cookie like every other page/API route; only `/login`, `/api/auth/login`, `/api/ingest` bypass auth today, so no change should be needed, but check)

**Interfaces:**
- Consumes: `getOrCreateContentScore(titleId: string, signal?: AbortSignal)` from `src/lib/contentScoring.ts` (unchanged, already supports this).
- Produces: `POST /api/titles/:id/rate-content` → `{ score: ContentScore }` on success, `{ error: string }` with status 504 on timeout/failure. Task 4 (dashboard UI) calls this exact endpoint shape.

This task is independent of Tasks 1 and 2 — it touches none of their files.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/app/api/titles/[id]/rate-content/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/contentScoring', () => ({
  getOrCreateContentScore: vi.fn(),
}))

import { getOrCreateContentScore } from '@/lib/contentScoring'
import { POST } from '../route'

describe('POST /api/titles/[id]/rate-content', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the synthesized score on success', async () => {
    const score = { id: 'cs1', titleId: 't1', violence: 3, language: 1, sexNudity: 0, scariness: 5, isUnrated: false, isNC17: false, sourceNotes: 'test' }
    ;(getOrCreateContentScore as ReturnType<typeof vi.fn>).mockResolvedValue(score)

    const req = new NextRequest('http://localhost/api/titles/t1/rate-content', { method: 'POST' })
    const res = await POST(req, { params: Promise.resolve({ id: 't1' }) })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.score).toEqual(score)
    expect(getOrCreateContentScore).toHaveBeenCalledWith('t1', expect.any(AbortSignal))
  })

  it('returns a 504 when scoring fails or times out', async () => {
    ;(getOrCreateContentScore as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('timed out'))

    const req = new NextRequest('http://localhost/api/titles/t1/rate-content', { method: 'POST' })
    const res = await POST(req, { params: Promise.resolve({ id: 't1' }) })

    expect(res.status).toBe(504)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run src/app/api/titles/[id]/rate-content/__tests__/route.test.ts
```

Expect failure — the route doesn't exist yet.

- [ ] **Step 3: Implement the route**

```typescript
// src/app/api/titles/[id]/rate-content/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getOrCreateContentScore } from '@/lib/contentScoring'

export const maxDuration = 300
const REQUEST_TIMEOUT_MS = 270_000

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const score = await getOrCreateContentScore(id, controller.signal)
    return NextResponse.json({ score })
  } catch (err) {
    console.error(`Failed to score title ${id}:`, err)
    return NextResponse.json({ error: 'scoring failed or timed out' }, { status: 504 })
  } finally {
    clearTimeout(timer)
  }
}
```

`maxDuration = 300` is isolated to this one route — it's the only place in the app that still needs the Vercel Hobby/Fluid Compute ceiling, since this is the only remaining path that calls the slow, web-search-backed Claude synthesis, and now only for one title per request.

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run src/app/api/titles/[id]/rate-content/__tests__/route.test.ts
```

- [ ] **Step 5: Verify middleware doesn't need changes**

Read `src/middleware.ts` and confirm its bypass list is still exactly `/login`, `/api/auth/login`, `/api/ingest`, `/_next/*`, favicon — this new route should NOT be in that list (it needs the normal session-cookie auth, same as every other authenticated API route). If it's already correct, no change needed; note this in the task report rather than editing the file.

- [ ] **Step 6: Run the full suite and build**

```bash
npm test
npm run build
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add on-demand content-rating endpoint for a single title"
```

---

### Task 4: Dashboard UI — MPAA display, "Rate this" button, inline report

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: `/api/recommendations` response shape from Task 1 (`{ mode, titles: [{ id, name, year, posterPath, providers, mpaaRating, contentScore }] }`) and `POST /api/titles/:id/rate-content` from Task 3 (`{ score }` or `{ error }` with status 504).

This task depends on Task 1 (response shape) and Task 3 (the endpoint it calls) — dispatch it after both are complete.

- [ ] **Step 1: Write the failing tests**

Replace `src/app/__tests__/page.test.tsx` entirely:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import HomePage from '../page'

describe('HomePage', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && url.includes('/rate-content')) {
        return Promise.resolve({ ok: true, json: async () => ({ score: {} }) })
      }
      if (init?.method === 'POST') {
        return Promise.resolve({ json: async () => ({ result: { id: 'r1' } }) })
      }
      return Promise.resolve({
        json: async () => ({
          mode: 'FAMILY',
          titles: [{ id: 't1', name: 'Jurassic Park', year: 1993, providers: ['netflix'], posterPath: '/poster.jpg', mpaaRating: 'PG-13', contentScore: null }],
        }),
      })
    }) as unknown as typeof fetch
  })

  it('renders recommended titles for the default mode', async () => {
    render(<HomePage />)
    expect(await screen.findByText(/Jurassic Park/)).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith('/api/recommendations?mode=FAMILY')
  })

  it('refetches with mode=ADULT when the Adult Mode button is clicked', async () => {
    render(<HomePage />)
    await screen.findByText(/Jurassic Park/)
    fireEvent.click(screen.getByRole('button', { name: 'Adult Mode' }))
    await waitFor(() => expect(fetch).toHaveBeenLastCalledWith('/api/recommendations?mode=ADULT'))
  })

  it('shows the MPAA rating on every card', async () => {
    render(<HomePage />)
    expect(await screen.findByText('PG-13')).toBeInTheDocument()
  })

  it('flags titles with no known provider as availability unknown', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return Promise.resolve({ json: async () => ({ result: { id: 'r1' } }) })
      return Promise.resolve({
        json: async () => ({
          mode: 'FAMILY',
          titles: [{ id: 't3', name: 'Mystery Title', year: 2024, providers: [], posterPath: '/poster.jpg', mpaaRating: 'G', contentScore: null }],
        }),
      })
    })
    render(<HomePage />)
    expect(await screen.findByText(/availability unknown/)).toBeInTheDocument()
  })

  it('renders a poster image when posterPath is present', async () => {
    render(<HomePage />)
    const img = await screen.findByAltText(/Jurassic Park poster/i)
    expect(img).toHaveAttribute('src', expect.stringContaining('/poster.jpg'))
  })

  it('shows a placeholder when posterPath is null', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return Promise.resolve({ json: async () => ({ result: { id: 'r1' } }) })
      return Promise.resolve({
        json: async () => ({
          mode: 'FAMILY',
          titles: [{ id: 't4', name: 'No Poster Movie', year: 2024, providers: ['netflix'], posterPath: null, mpaaRating: 'PG', contentScore: null }],
        }),
      })
    })
    render(<HomePage />)
    expect(await screen.findByText(/No Poster Movie/)).toBeInTheDocument()
    expect(screen.queryByAltText(/No Poster Movie poster/i)).not.toBeInTheDocument()
  })

  it('quick-rates a title through the two-step seen/rating flow', async () => {
    render(<HomePage />)
    await screen.findByText(/Jurassic Park/)
    fireEvent.click(screen.getByRole('button', { name: "I've seen this" }))
    fireEvent.click(screen.getByRole('button', { name: 'Liked' }))
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/taste',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ titleId: 't1', rating: 'LIKED', mode: 'FAMILY' }) })
      )
    )
    expect(await screen.findByText(/Rated: LIKED/)).toBeInTheDocument()
  })

  it('marks a title not-interested with a single click, scoped to the active mode', async () => {
    render(<HomePage />)
    await screen.findByText(/Jurassic Park/)
    fireEvent.click(screen.getByRole('button', { name: "I don't want to see this" }))
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/taste',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ titleId: 't1', rating: 'NOT_INTERESTED', mode: 'FAMILY' }) })
      )
    )
    expect(await screen.findByText(/Rated: NOT_INTERESTED/)).toBeInTheDocument()
  })

  it('shows a "Rate this" button for an unscored title in Adult Mode, and renders the report once scored', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && url.includes('/rate-content')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ score: { violence: 6, language: 3, sexNudity: 1, scariness: 4, sourceNotes: 'Found on Common Sense Media.' } }),
        })
      }
      if (init?.method === 'POST') return Promise.resolve({ json: async () => ({ result: { id: 'r1' } }) })
      return Promise.resolve({
        json: async () => ({
          mode: 'ADULT',
          titles: [{ id: 't5', name: 'An R Movie', year: 2024, providers: ['netflix'], posterPath: null, mpaaRating: 'R', contentScore: null }],
        }),
      })
    }) as unknown as typeof fetch

    render(<HomePage />)
    fireEvent.click(screen.getByRole('button', { name: 'Adult Mode' }))
    const button = await screen.findByRole('button', { name: /Why is this rated R/ })
    fireEvent.click(button)

    expect(await screen.findByText(/Found on Common Sense Media/)).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith('/api/titles/t5/rate-content', expect.objectContaining({ method: 'POST' }))
  })

  it('does not show a "Rate this" button in Family Mode', async () => {
    render(<HomePage />)
    await screen.findByText(/Jurassic Park/)
    expect(screen.queryByRole('button', { name: /Why is this rated/ })).not.toBeInTheDocument()
  })

  it('shows a retry option when rating content fails', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && url.includes('/rate-content')) {
        return Promise.resolve({ ok: false, json: async () => ({ error: 'timed out' }) })
      }
      if (init?.method === 'POST') return Promise.resolve({ json: async () => ({ result: { id: 'r1' } }) })
      return Promise.resolve({
        json: async () => ({
          mode: 'ADULT',
          titles: [{ id: 't6', name: 'A Slow Movie', year: 2024, providers: [], posterPath: null, mpaaRating: 'PG-13', contentScore: null }],
        }),
      })
    }) as unknown as typeof fetch

    render(<HomePage />)
    fireEvent.click(screen.getByRole('button', { name: 'Adult Mode' }))
    const button = await screen.findByRole('button', { name: /Why is this rated PG-13/ })
    fireEvent.click(button)

    expect(await screen.findByRole('button', { name: /Try again/ })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify the new tests fail**

```bash
npx vitest run src/app/__tests__/page.test.tsx
```

Expect failures on the new MPAA-rating/button/report tests (the old `filterReason`-based ones no longer exist in this rewritten file, so there's nothing stale to fail).

- [ ] **Step 3: Implement the dashboard changes**

Replace `src/app/page.tsx` entirely:

```tsx
'use client'
import { useState } from 'react'
import { ModeToggle } from '@/components/ModeToggle'

type ContentScore = { violence: number; language: number; sexNudity: number; scariness: number; sourceNotes: string | null } | null

type Title = {
  id: string
  name: string
  year: number | null
  providers: string[]
  posterPath: string | null
  mpaaRating: string | null
  contentScore: ContentScore
}

const QUICK_RATINGS = [
  { value: 'DISLIKED', label: 'Disliked' },
  { value: 'LIKED', label: 'Liked' },
  { value: 'LOVED', label: 'Loved' },
]

export default function HomePage() {
  const [mode, setMode] = useState<'FAMILY' | 'ADULT'>('FAMILY')
  const [titles, setTitles] = useState<Title[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [rated, setRated] = useState<Record<string, string>>({})
  const [scores, setScores] = useState<Record<string, ContentScore>>({})
  const [ratingStatus, setRatingStatus] = useState<Record<string, 'loading' | 'error' | undefined>>({})

  function load(currentMode: 'FAMILY' | 'ADULT') {
    setLoading(true)
    fetch(`/api/recommendations?mode=${currentMode}`)
      .then((res) => res.json())
      .then((data) => setTitles(data.titles))
      .finally(() => setLoading(false))
  }

  useState(() => {
    load(mode)
  })

  function changeMode(next: 'FAMILY' | 'ADULT') {
    setMode(next)
    load(next)
  }

  async function submitRating(titleId: string, rating: string) {
    await fetch('/api/taste', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titleId, rating, mode }),
    })
    setRated((prev) => ({ ...prev, [titleId]: rating }))
    setExpanded((prev) => ({ ...prev, [titleId]: false }))
  }

  async function rateContent(titleId: string) {
    setRatingStatus((prev) => ({ ...prev, [titleId]: 'loading' }))
    try {
      const res = await fetch(`/api/titles/${titleId}/rate-content`, { method: 'POST' })
      if (!res.ok) throw new Error('failed')
      const data = await res.json()
      setScores((prev) => ({ ...prev, [titleId]: data.score }))
      setRatingStatus((prev) => ({ ...prev, [titleId]: undefined }))
    } catch {
      setRatingStatus((prev) => ({ ...prev, [titleId]: 'error' }))
    }
  }

  return (
    <main className="max-w-6xl mx-auto px-6 py-8">
      <h1 className="font-display text-3xl tracking-wide text-textPrimary mb-6">Film Curator</h1>
      <ModeToggle mode={mode} onChange={changeMode} />
      {loading ? (
        <p className="text-textSecondary">Loading...</p>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6 list-none p-0">
          {titles.map((title) => {
            const score = scores[title.id] ?? title.contentScore
            const status = ratingStatus[title.id]
            return (
              <li key={title.id} className="bg-surface border border-border rounded-lg overflow-hidden flex flex-col">
                {title.posterPath ? (
                  <img
                    src={`https://image.tmdb.org/t/p/w200${title.posterPath}`}
                    alt={`${title.name} poster`}
                    width={200}
                    height={300}
                    className="w-full aspect-[2/3] object-cover"
                  />
                ) : (
                  <div className="w-full aspect-[2/3] bg-border" aria-hidden="true" />
                )}
                <div className="p-3 flex flex-col gap-2 flex-1">
                  <div className="text-sm font-medium text-textPrimary">
                    {title.name} {title.year ? `(${title.year})` : ''}
                  </div>
                  <div className="text-xs text-textSecondary">
                    {title.providers.length > 0 ? title.providers.join(', ') : 'availability unknown'}
                  </div>
                  {title.mpaaRating && <span className="text-xs text-textSecondary">{title.mpaaRating}</span>}

                  {mode === 'ADULT' && !score && status !== 'loading' && status !== 'error' && (
                    <button
                      onClick={() => rateContent(title.id)}
                      className="text-xs text-accent underline hover:text-accentGlow transition-colors text-left"
                    >
                      Why is this rated {title.mpaaRating}?
                    </button>
                  )}
                  {mode === 'ADULT' && status === 'loading' && (
                    <p className="text-xs text-textSecondary">Checking Common Sense Media and IMDb — this can take a minute or two.</p>
                  )}
                  {mode === 'ADULT' && status === 'error' && (
                    <div className="flex flex-col gap-1">
                      <p className="text-xs text-danger">That took too long.</p>
                      <button
                        onClick={() => rateContent(title.id)}
                        className="text-xs text-accent underline hover:text-accentGlow transition-colors text-left"
                      >
                        Try again?
                      </button>
                    </div>
                  )}
                  {mode === 'ADULT' && score && (
                    <div className="text-xs text-textSecondary flex flex-col gap-1">
                      <p>
                        Violence {score.violence}/10 · Language {score.language}/10 · Sex/Nudity {score.sexNudity}/10 · Scariness{' '}
                        {score.scariness}/10
                      </p>
                      {score.sourceNotes && <p className="italic">{score.sourceNotes}</p>}
                    </div>
                  )}

                  <div className="mt-auto pt-2">
                    {rated[title.id] ? (
                      <span className="text-xs text-accent">✓ Rated: {rated[title.id]}</span>
                    ) : expanded[title.id] ? (
                      <div className="flex flex-wrap gap-1.5">
                        {QUICK_RATINGS.map((r) => (
                          <button
                            key={r.value}
                            onClick={() => submitRating(title.id, r.value)}
                            className="text-xs border border-accent text-accent rounded px-2 py-1 hover:bg-accent hover:text-bg transition-colors"
                          >
                            {r.label}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2 items-center">
                        <button
                          onClick={() => setExpanded((prev) => ({ ...prev, [title.id]: true }))}
                          className="text-xs text-textSecondary underline hover:text-accent transition-colors"
                        >
                          I&apos;ve seen this
                        </button>
                        <button
                          onClick={() => submitRating(title.id, 'NOT_INTERESTED')}
                          className="text-xs text-textSecondary underline hover:text-danger transition-colors"
                        >
                          I don&apos;t want to see this
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
```

Note the change from the original `useEffect(() => { ... }, [mode])` to an explicit `changeMode` handler that calls `load` directly — this avoids re-fetching on every render and keeps the mode-change trigger explicit and easy to test, matching how `ModeToggle`'s `onChange` is already wired everywhere else in this codebase. `useState(() => { load(mode) })` runs the initializer function exactly once on mount to trigger the first load, mirroring the effect of the original `useEffect` for the initial render only, since `changeMode` now owns every subsequent load.

`submitRating` is reused directly for the new "I don't want to see this" button (passing `'NOT_INTERESTED'`) — no separate handler needed, since it already does exactly the right thing: records the rating with the current `mode`, and marks the title as rated in local state (so it flips to the `✓ Rated: NOT_INTERESTED` display, same as any other quick rating).

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run src/app/__tests__/page.test.tsx
```

- [ ] **Step 5: Run the full suite and build**

```bash
npm test
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: show MPAA rating and on-demand content report on the dashboard"
```

---

### Task 5: Reduce cost/latency of the content-scoring Claude call

**Files:**
- Modify: `src/lib/contentScoring.ts`
- Modify: `src/lib/__tests__/contentScoring.test.ts`

**Interfaces:**
- Consumes/produces nothing new — this task only changes the parameters passed to an existing call. Fully independent of every other task; can run anytime.

**Important — read before starting:** this task changes ONLY the request parameters (`thinking`, tool `max_uses`). It does NOT include running a real, live Claude API call to verify output quality still holds without extended thinking — that costs real money and requires the user's explicit go-ahead, which the coordinator will request separately after this task's automated (mocked) tests pass. Do not make any real API calls while implementing this task.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/__tests__/contentScoring.test.ts`:

```typescript
it('disables extended thinking and limits search/fetch tool use to reduce cost and latency', async () => {
  ;(prisma.contentScore.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)
  ;(prisma.title.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 't1', name: 'Jurassic Park', year: 1993 })

  const synthesized = { violence: 3, language: 1, sexNudity: 0, scariness: 5, isUnrated: false, isNC17: false, sourceNotes: 'test' }
  const mockCreate = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: JSON.stringify(synthesized) }] })
  ;(getAnthropicClient as ReturnType<typeof vi.fn>).mockReturnValue({ messages: { create: mockCreate } })
  ;(prisma.contentScore.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'cs1', titleId: 't1', ...synthesized, computedAt: new Date() })

  await getOrCreateContentScore('t1')

  const [params] = mockCreate.mock.calls[0]
  expect(params.thinking).toEqual({ type: 'disabled' })
  expect(params.tools.find((t: { name: string }) => t.name === 'web_search').max_uses).toBe(1)
  expect(params.tools.find((t: { name: string }) => t.name === 'web_fetch').max_uses).toBe(1)
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run src/lib/__tests__/contentScoring.test.ts -t "disables extended thinking"
```

Expect failure — current code uses `thinking: { type: 'adaptive' }` and `max_uses: 3` for both tools.

- [ ] **Step 3: Update `src/lib/contentScoring.ts`**

In `synthesizeContentScore`, change:

```typescript
thinking: { type: 'adaptive' },
```

to:

```typescript
thinking: { type: 'disabled' },
```

(matching the exact convention already used in `src/lib/ranking.ts`'s own Claude call), and change both tool definitions' `max_uses: 3` to `max_uses: 1`. Leave everything else in the file — the prompt text, `allowed_domains`, `max_tokens`, the text-block-extraction logic, the `signal` parameter — completely unchanged.

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run src/lib/__tests__/contentScoring.test.ts
```

Expect all tests pass, including the pre-existing ones (none of them assert on `thinking` or `max_uses`, so they're unaffected).

- [ ] **Step 5: Run the full suite and build**

```bash
npm test
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "perf: disable extended thinking and reduce search/fetch budget for content scoring"
```

- [ ] **Step 7: Flag for live validation (coordinator, not implementer)**

After this task's review is complete, the coordinator asks the user for explicit permission to run 1-2 real "Rate this" calls against a couple of real titles (small real cost) to confirm the report quality still holds up without extended thinking, before considering this task fully done. This step is NOT performed by the task implementer.

---

## Task Dependency Summary

- Task 1: independent, do first (foundational schema/visibility change).
- Task 2: independent of Task 1 — safe to run any time.
- Task 3: independent of Tasks 1 and 2.
- Task 4: depends on Task 1 (response shape) and Task 3 (the endpoint) — dispatch last among 1-4.
- Task 5: fully independent — can run anytime, including in parallel with any other task.

## Final Steps (after all 5 tasks are complete and individually reviewed)

1. Run the full test suite and production build one more time on the final state.
2. Dispatch a final consolidated review across all 5 tasks (most capable available model), focused on cross-task consistency — in particular: confirm `evaluateTitle`/`isVisibleInMode`/`ModeThresholds`/`ContentScoreInput`/`FilterReason` and `ModeSettings` have zero remaining references anywhere in `src/`; confirm `isTitleVisible` is the only visibility check used by `/api/recommendations`, `tasteInterview.ts`, and nowhere else duplicates this logic; confirm the "Rate this" endpoint is never called automatically from anywhere (grep for `rate-content` and `getOrCreateContentScore` call sites — the only caller of `getOrCreateContentScore` should be the new on-demand route); confirm every caller of `recordTasteRating`/every `POST /api/taste` body includes the real current mode (grep for `recordTasteRating(` and for `'/api/taste'` fetch calls) — a caller silently defaulting to FAMILY would corrupt the family/adult taste separation this redesign added.
3. Get the user's explicit go-ahead before running any real (paid) validation call for Task 5.
4. Push and deploy to Vercel; live-verify: trigger `/api/ingest` and confirm the response no longer has `scored`/`skipped` fields and completes quickly; load the dashboard in both modes and confirm Family Mode shows only G/PG, Adult Mode shows only PG-13/R, and clicking "Rate this" on one real title renders the report; rate a title in Family Mode and confirm it doesn't affect Adult Mode's ranking (and vice versa).
5. Clean up this plan's SDD workspace.
