# Content-Scoring Architecture Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move content scoring entirely out of live, user-facing requests and into the weekly ingestion cron, with real request cancellation and a time budget, so no page load can ever be blocked by a slow Claude call again.

**Architecture:** `contentScoring.ts` gains real Anthropic-request cancellation via `AbortController`. `/api/ingest` gains a post-ingestion scoring phase with a 240-second time budget and a 50-second per-title timeout. `/api/recommendations` loses its lazy-scoring loop entirely — it only ever reads whatever score already exists.

**Tech Stack:** No new dependencies — `AbortController` is a Web API already available in the Node.js runtime.

**Spec:** `docs/superpowers/specs/2026-08-29-scoring-architecture-fix-design.md`

## Global Constraints

- `/api/ingest` gets `export const maxDuration = 300` — the verified Vercel Hobby (Fluid Compute) ceiling.
- Scoring phase time budget: 240,000ms (4 minutes), leaving a buffer within the 300-second function budget.
- Per-title scoring timeout: 50,000ms (50 seconds), enforced via a real `AbortController`, not just a `Promise.race` that stops waiting while the underlying request keeps running.
- A single title's scoring failure or timeout must never abort the batch — always continue to the next title.
- `/api/recommendations` must never call any content-scoring function — an unscored title is simply `null`, exactly as `evaluateTitle`/`isVisibleInMode` already handle it (fail-closed in Family Mode, flagged in Adult Mode). No change to `src/lib/filtering.ts`.

---

## Task 1: Real Cancellation Support in Content Scoring

**Files:**
- Modify: `src/lib/contentScoring.ts`
- Modify: `src/lib/__tests__/contentScoring.test.ts`

**Interfaces:**
- Modifies: `getOrCreateContentScore(titleId: string, signal?: AbortSignal)` — the optional second parameter is new; existing callers that omit it are unaffected. Task 2 will call this with a real signal.

- [ ] **Step 1: Write the failing test**

Add this test to the existing `src/lib/__tests__/contentScoring.test.ts`, alongside the tests already there (keep every existing test unchanged):

```ts
it('passes an abort signal through to the Claude API call when provided', async () => {
  ;(prisma.contentScore.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)
  ;(prisma.title.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 't1', name: 'Jurassic Park', year: 1993 })

  const synthesized = { violence: 3, language: 1, sexNudity: 0, scariness: 5, isUnrated: false, isNC17: false, sourceNotes: 'test' }
  const mockCreate = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: JSON.stringify(synthesized) }] })
  ;(getAnthropicClient as ReturnType<typeof vi.fn>).mockReturnValue({ messages: { create: mockCreate } })
  ;(prisma.contentScore.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'cs1', titleId: 't1', ...synthesized, computedAt: new Date() })

  const controller = new AbortController()
  await getOrCreateContentScore('t1', controller.signal)

  expect(mockCreate).toHaveBeenCalledWith(
    expect.objectContaining({ model: 'claude-sonnet-5' }),
    expect.objectContaining({ signal: controller.signal })
  )
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/__tests__/contentScoring.test.ts`
Expected: FAILS — `getOrCreateContentScore` doesn't accept a second argument yet, and `mockCreate` isn't called with a second `{ signal }` options argument.

- [ ] **Step 3: Modify `src/lib/contentScoring.ts`**

Read the current file fully first. Change `synthesizeContentScore` and `getOrCreateContentScore` to accept and thread through an optional `AbortSignal`. The `client.messages.create()` call takes a second argument (an options object) for per-request overrides — the Anthropic TypeScript SDK supports this pattern (confirm it type-checks; if `signal` isn't accepted at that exact call site per the installed SDK's types, check the SDK's type definitions for the correct way to pass an abort signal to `messages.create()` rather than guessing further). Keep every other part of both functions — the tool declarations, `thinking`/`max_tokens` config, the prompt text, the zod schema, the text-block extraction, the code-fence stripping — exactly as they currently are; only add the signal parameter and thread it through.

```ts
async function synthesizeContentScore(titleName: string, year: number | null, signal?: AbortSignal): Promise<SynthesizedScore> {
  const client = getAnthropicClient()
  const message = await client.messages.create(
    {
      model: 'claude-sonnet-5',
      max_tokens: 2048,
      thinking: { type: 'adaptive' },
      tools: [
        {
          type: 'web_search_20260209',
          name: 'web_search',
          max_uses: 3,
          allowed_domains: ['commonsensemedia.org', 'imdb.com'],
        },
        {
          type: 'web_fetch_20260209',
          name: 'web_fetch',
          max_uses: 3,
          allowed_domains: ['commonsensemedia.org', 'imdb.com'],
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Search for and read the Common Sense Media review or IMDb Parents Guide for "${titleName}"${year ? ` (${year})` : ''}. Base your answer on what you actually find on those pages. If you cannot find a page for this title, say so in sourceNotes and give your best estimate instead.\n\nRespond with ONLY a JSON object as your final message, with no explanatory text before or after it and no narration of your search process. The JSON object must have these exact keys: violence (0-10), language (0-10), sexNudity (0-10), scariness (0-10), isUnrated (boolean), isNC17 (boolean), sourceNotes (a short string citing what you found or explaining that no page was found).`,
        },
      ],
    },
    { signal }
  )
  const textBlocks = message.content.filter((b) => b.type === 'text')
  const lastBlock = textBlocks[textBlocks.length - 1]
  const text = lastBlock?.type === 'text' ? lastBlock.text : ''
  const cleaned = text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  return SynthesizedScoreSchema.parse(JSON.parse(cleaned))
}

export async function getOrCreateContentScore(titleId: string, signal?: AbortSignal) {
  const existing = await prisma.contentScore.findUnique({ where: { titleId } })
  if (existing) return existing

  const title = await prisma.title.findUniqueOrThrow({ where: { id: titleId } })
  const synthesized = await synthesizeContentScore(title.name, title.year, signal)
  return prisma.contentScore.create({ data: { titleId, ...synthesized } })
}
```

(This reproduces the exact current prompt/tools/config from the prior fix — do not change wording beyond what's shown here; if the file you read differs from this in any way other than the signal threading, preserve the file's actual current content and only add the signal parameter.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/contentScoring.test.ts`
Expected: PASS (all tests, including the new one)

- [ ] **Step 5: Run the full test suite and the production build**

Run: `npm test && npm run build`
Expected: all tests pass, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/lib/contentScoring.ts src/lib/__tests__/contentScoring.test.ts
git commit -m "feat: add real request cancellation support to content scoring"
```

---

## Task 2: Move Scoring Into the Weekly Ingestion Cron

**Files:**
- Modify: `src/app/api/ingest/route.ts`
- Modify: `src/app/api/ingest/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `getOrCreateContentScore(titleId, signal?)` from `@/lib/contentScoring` (Task 1).
- Produces: `GET /api/ingest` response shape grows from `{ ingested, failed }` to `{ ingested, failed, scored, skipped }`.

- [ ] **Step 1: Write the failing tests**

Read the current `src/app/api/ingest/route.ts` and its test file fully first — keep every existing test passing unchanged; add these new tests to the same file:

```ts
vi.mock('@/lib/contentScoring', () => ({
  getOrCreateContentScore: vi.fn(),
}))
```

(add this mock alongside the existing `vi.mock('@/lib/tmdb', ...)` and `vi.mock('@/lib/prisma', ...)` calls — the mocked `prisma` object needs a `title.findMany` mock added to its existing shape, alongside the existing `title.upsert` mock)

```ts
import { getOrCreateContentScore } from '@/lib/contentScoring'

describe('scoring phase', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'test-secret'
    ;(discoverByProvider as ReturnType<typeof vi.fn>).mockResolvedValue([])
  })

  it('scores every unscored title after ingestion completes', async () => {
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 't1', name: 'Title One' },
      { id: 't2', name: 'Title Two' },
    ])
    ;(getOrCreateContentScore as ReturnType<typeof vi.fn>).mockResolvedValue({})

    const req = new NextRequest('http://localhost/api/ingest', { headers: { authorization: 'Bearer test-secret' } })
    const res = await GET(req)
    const body = await res.json()

    expect(getOrCreateContentScore).toHaveBeenCalledTimes(2)
    expect(body.scored).toBe(2)
    expect(body.skipped).toBe(0)
  })

  it('counts a scoring failure as skipped and continues to the next title', async () => {
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 't1', name: 'Fails' },
      { id: 't2', name: 'Succeeds' },
    ])
    ;(getOrCreateContentScore as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('timed out'))
      .mockResolvedValueOnce({})

    const req = new NextRequest('http://localhost/api/ingest', { headers: { authorization: 'Bearer test-secret' } })
    const res = await GET(req)
    const body = await res.json()

    expect(body.scored).toBe(1)
    expect(body.skipped).toBe(1)
  })

  it('stops starting new scoring attempts once the time budget is exceeded', async () => {
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 't1', name: 'First' },
      { id: 't2', name: 'Second' },
    ])
    ;(getOrCreateContentScore as ReturnType<typeof vi.fn>).mockResolvedValue({})

    const realNow = Date.now.bind(Date)
    let call = 0
    vi.spyOn(Date, 'now').mockImplementation(() => {
      call++
      if (call <= 2) return realNow()
      return realNow() + 999_999
    })

    const req = new NextRequest('http://localhost/api/ingest', { headers: { authorization: 'Bearer test-secret' } })
    const res = await GET(req)
    const body = await res.json()

    expect(getOrCreateContentScore).toHaveBeenCalledTimes(1)
    expect(body.scored).toBe(1)

    vi.restoreAllMocks()
  })
})

describe('maxDuration', () => {
  it('exports a maxDuration of 300 seconds for the Vercel Hobby Fluid Compute ceiling', async () => {
    const routeModule = await import('../route')
    expect(routeModule.maxDuration).toBe(300)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/api/ingest/__tests__/route.test.ts`
Expected: FAILS — the scoring phase and `maxDuration` export don't exist yet.

- [ ] **Step 3: Modify `src/app/api/ingest/route.ts`**

Read the current file fully first, then add `export const maxDuration = 300` near the top, the two timing constants, and the scoring phase after the existing per-provider ingestion loop (leave that loop's own logic completely unchanged — only add code after it, and add `scored`/`skipped` to the `results` object):

```ts
export const maxDuration = 300

const SCORING_TIME_BUDGET_MS = 240_000
const PER_TITLE_TIMEOUT_MS = 50_000
```

Add `scored: 0, skipped: 0` to the `results` object's initial declaration, alongside the existing `ingested: 0, failed: 0`.

After the existing double `for` loop over providers/media-types (do not modify that loop), add:

```ts
  const unscoredTitles = await prisma.title.findMany({
    where: { familyId, contentScore: null },
    orderBy: { createdAt: 'desc' },
  })

  const scoringStart = Date.now()
  for (const title of unscoredTitles) {
    if (Date.now() - scoringStart > SCORING_TIME_BUDGET_MS) break

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), PER_TITLE_TIMEOUT_MS)
    try {
      await getOrCreateContentScore(title.id, controller.signal)
      results.scored++
    } catch (err) {
      console.error(`Failed to score title ${title.id} (${title.name}):`, err)
      results.skipped++
    } finally {
      clearTimeout(timer)
    }
  }
```

Add the import: `import { getOrCreateContentScore } from '@/lib/contentScoring'` alongside the existing imports.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/api/ingest/__tests__/route.test.ts`
Expected: PASS (all tests, including every pre-existing one and the new ones)

- [ ] **Step 5: Run the full test suite and the production build**

Run: `npm test && npm run build`
Expected: all tests pass, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/ingest/route.ts src/app/api/ingest/__tests__/route.test.ts
git commit -m "feat: score unscored titles during weekly ingestion instead of on-demand"
```

---

## Task 3: Remove Lazy Scoring From Recommendations

**Files:**
- Modify: `src/app/api/recommendations/route.ts`
- Modify: `src/app/api/recommendations/__tests__/route.test.ts`

**Interfaces:**
- No change to the route's public contract (`GET /api/recommendations?mode=...` response shape is unchanged) — only its internals change (no more content-scoring calls).

- [ ] **Step 1: Replace `src/app/api/recommendations/route.ts`**

```tsx
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { evaluateTitle, isVisibleInMode, type ContentScoreInput } from '@/lib/filtering'
import { rankByTaste } from '@/lib/ranking'

export async function GET(req: NextRequest) {
  const modeParam = req.nextUrl.searchParams.get('mode')
  const mode: 'FAMILY' | 'ADULT' = modeParam === 'ADULT' ? 'ADULT' : 'FAMILY'
  const familyId = 'default'

  const [titles, thresholds, overrides, tasteHistory] = await Promise.all([
    prisma.title.findMany({ where: { familyId }, include: { contentScore: true } }),
    prisma.modeSettings.findUniqueOrThrow({ where: { familyId_mode: { familyId, mode } } }),
    prisma.override.findMany({ where: { familyId } }),
    prisma.tasteRating.findMany({ where: { familyId }, include: { title: true } }),
  ])

  const overrideByTitleId = new Map(overrides.map((o) => [o.titleId, o]))

  const visible: Array<{ id: string; name: string; overview: string | null; contentScore: ContentScoreInput | null; filterReason: string }> = []
  for (const title of titles) {
    const score: ContentScoreInput | null = title.contentScore
    const override = overrideByTitleId.get(title.id) ?? null
    const reason = evaluateTitle(score, thresholds, override)
    if (isVisibleInMode(reason, mode)) {
      visible.push({ ...title, contentScore: score, filterReason: reason })
    }
  }

  const history = tasteHistory
    .filter((t) => t.rating !== 'NOT_SEEN')
    .map((t) => ({ titleName: t.title.name, rating: t.rating }))

  let rankedIds: string[]
  try {
    rankedIds = await rankByTaste(
      visible.map((v) => ({ id: v.id, name: v.name, overview: v.overview })),
      history
    )
  } catch (err) {
    console.error('Failed to rank titles by taste, falling back to unranked order:', err)
    rankedIds = visible.map((v) => v.id)
  }
  const byId = new Map(visible.map((v) => [v.id, v]))
  const ranked = rankedIds.map((id) => byId.get(id)).filter((v): v is typeof visible[number] => Boolean(v))

  return NextResponse.json({ mode, titles: ranked })
}
```

Note what's gone compared to the current file: the `getOrCreateContentScore` import, the `export const maxDuration = 60` (removed — the platform's own Hobby/Fluid-Compute default is already 300s, and this route no longer needs any extension above the default since it does no scoring), the `SCORING_CONCURRENCY` constant, and the entire lazy-scoring batching loop. The ranking-failure try/catch (falling back to unranked order) is unchanged — that's unrelated to scoring and still needed.

- [ ] **Step 2: Update the test file**

Read the current `src/app/api/recommendations/__tests__/route.test.ts` fully. Remove `vi.mock('@/lib/contentScoring', ...)` and the `getOrCreateContentScore` import entirely (the route no longer imports it, so mocking it is pointless). Remove any test whose purpose was verifying scoring-failure fallback behavior (a test that mocks `getOrCreateContentScore` to reject and checks the title is excluded/flagged) — that behavior no longer exists in this route; it's now covered by Task 2's ingest-route tests instead. Keep every other existing test (mode defaulting, cached-score correctness, override-exclusion, ranking-failure fallback) unchanged. Add this new test:

```ts
it('never calls any content-scoring function — a title with no cached score is treated as unscored', async () => {
  ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
    { id: 't1', name: 'Scored', overview: null, contentScore: cleanScore },
    { id: 't2', name: 'Unscored', overview: null, contentScore: null },
  ])
  ;(prisma.modeSettings.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue(familyThresholds)
  ;(prisma.override.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
  ;(prisma.tasteRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
  ;(rankByTaste as ReturnType<typeof vi.fn>).mockResolvedValue(['t1'])

  const req = new NextRequest('http://localhost/api/recommendations?mode=FAMILY')
  const res = await GET(req)
  const body = await res.json()

  expect(body.titles.map((t: { id: string }) => t.id)).toEqual(['t1'])
})
```

(`cleanScore` and `familyThresholds` should already exist as fixtures near the top of the test file from the existing tests — reuse them, don't redefine.)

- [ ] **Step 3: Run the tests to verify they pass**

Run: `npx vitest run src/app/api/recommendations/__tests__/route.test.ts`
Expected: PASS (mode-default, cached-score, override-exclusion, ranking-fallback, and the new never-calls-scoring test)

- [ ] **Step 4: Run the full test suite and the production build**

Run: `npm test && npm run build`
Expected: all tests pass, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/recommendations/route.ts src/app/api/recommendations/__tests__/route.test.ts
git commit -m "refactor: remove lazy content scoring from the recommendations route"
```

---
