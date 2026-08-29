# Web-Grounded Content Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Claude's content-descriptor scoring actually read real Common Sense Media / IMDb Parents Guide pages via server-side web search and fetch tools, instead of answering from its own training-data recall.

**Architecture:** Add Anthropic's server-side `web_search` and `web_fetch` tools (domain-restricted to `commonsensemedia.org` and `imdb.com`) to the existing `synthesizeContentScore` call in `src/lib/contentScoring.ts`. Both tools execute entirely on Anthropic's infrastructure, so the function stays a single `messages.create()` call — no agentic loop, no new architecture.

**Tech Stack:** `@anthropic-ai/sdk` (already installed at `^0.122.0`, which supports these tool types), no new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-29-web-grounded-content-scoring-design.md`

## Global Constraints

- Only `src/lib/contentScoring.ts` changes — `src/lib/ranking.ts` and every other file are untouched.
- `allowed_domains` on both tools must be exactly `['commonsensemedia.org', 'imdb.com']` — never a general web crawl.
- `thinking` changes from `{ type: 'disabled' }` to `{ type: 'adaptive' }`.
- `max_tokens` changes from 500 to 2048.
- No new database fields, no schema changes.
- No live/real API call test — all tests continue to mock `getAnthropicClient()`.

---

## Task 1: Add Web Search/Fetch Grounding to Content Scoring

**Files:**
- Modify: `src/lib/contentScoring.ts`
- Modify: `src/lib/__tests__/contentScoring.test.ts`

**Interfaces:**
- No change to the exported interface: `getOrCreateContentScore(titleId: string)` still returns the same shape. This task only changes the internals of `synthesizeContentScore`.

- [ ] **Step 1: Write the new failing test**

Add this test to the existing `src/lib/__tests__/contentScoring.test.ts`, alongside the tests already there (do not remove the existing tests — they stay valid unchanged since they only assert on the final parsed text block, which this change doesn't alter the shape of):

```ts
it('extracts the final text block even when search/fetch tool-result blocks precede it', async () => {
  ;(prisma.contentScore.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)
  ;(prisma.title.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 't1', name: 'Jurassic Park', year: 1993 })

  const synthesized = { violence: 3, language: 1, sexNudity: 0, scariness: 5, isUnrated: false, isNC17: false, sourceNotes: 'Common Sense Media: dinosaur peril, no gore shown.' }
  const mockCreate = vi.fn().mockResolvedValue({ id: 'cs1', titleId: 't1', ...synthesized, computedAt: new Date() })
  ;(prisma.contentScore.create as ReturnType<typeof vi.fn>) = mockCreate

  ;(getAnthropicClient as ReturnType<typeof vi.fn>).mockReturnValue({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [
          { type: 'thinking', thinking: 'Let me search for this title...' },
          { type: 'server_tool_use', id: 'srv1', name: 'web_search', input: { query: 'Jurassic Park Common Sense Media' } },
          { type: 'web_search_tool_result', tool_use_id: 'srv1', content: [{ type: 'web_search_result', title: 'Jurassic Park - Common Sense Media', url: 'https://www.commonsensemedia.org/movie-reviews/jurassic-park' }] },
          { type: 'text', text: JSON.stringify(synthesized) },
        ],
      }),
    },
  })

  const result = await getOrCreateContentScore('t1')

  expect(mockCreate).toHaveBeenCalledWith({ data: { titleId: 't1', ...synthesized } })
  expect(result.violence).toBe(3)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/__tests__/contentScoring.test.ts`
Expected: the new test FAILS — the current implementation has no `tools` configured, but since this test only mocks the client's response (it doesn't assert on what `tools` were passed), the actual failure mode depends on the current text-extraction logic. Confirm the failure is NOT about missing `tools` config (this test doesn't check that) — it should currently pass already if extraction is correct, since `.find()` already scans by type. If it passes without any code change, that's expected and fine — it's confirming the existing extraction logic already handles this shape; proceed to Step 3 regardless, since the `tools`/`thinking`/`max_tokens` changes are the actual deliverable of this task.

- [ ] **Step 3: Modify `src/lib/contentScoring.ts`**

Change the `synthesizeContentScore` function's `client.messages.create()` call. Replace this entire function body:

```ts
async function synthesizeContentScore(titleName: string, year: number | null): Promise<SynthesizedScore> {
  const client = getAnthropicClient()
  const message = await client.messages.create({
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
        content: `Search for and read the Common Sense Media review or IMDb Parents Guide for "${titleName}"${year ? ` (${year})` : ''}. Base your answer on what you actually find on those pages. If you cannot find a page for this title, say so in sourceNotes and give your best estimate instead.\n\nRespond with ONLY a JSON object with these exact keys and no other text: violence (0-10), language (0-10), sexNudity (0-10), scariness (0-10), isUnrated (boolean), isNC17 (boolean), sourceNotes (a short string citing what you found or explaining that no page was found).`,
      },
    ],
  })
  const block = message.content.find((b) => b.type === 'text')
  const text = block?.type === 'text' ? block.text : ''
  const cleaned = text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  return SynthesizedScoreSchema.parse(JSON.parse(cleaned))
}
```

Leave everything else in the file (the `SynthesizedScoreSchema` zod schema, the `SynthesizedScore` type, and `getOrCreateContentScore`) exactly as it is — this task only replaces the function body shown above.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/contentScoring.test.ts`
Expected: PASS (all tests, including the new one and the pre-existing ones)

- [ ] **Step 5: Run the full test suite and the production build**

Run: `npm test`
Expected: all tests pass across the whole project (nothing outside this file changed, so nothing else should be affected).

Run: `npm run build`
Expected: compiles successfully — this confirms the `@anthropic-ai/sdk@^0.122.0` types actually include the `web_search_20260209`/`web_fetch_20260209` tool types and the `thinking: { type: 'adaptive' }` shape.

- [ ] **Step 6: Commit**

```bash
git add src/lib/contentScoring.ts src/lib/__tests__/contentScoring.test.ts
git commit -m "feat: ground content scoring in real Common Sense Media / IMDb pages via web search"
```

---
