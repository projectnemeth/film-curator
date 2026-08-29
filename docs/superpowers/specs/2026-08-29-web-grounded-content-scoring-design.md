# Web-Grounded Content Scoring — Design Spec

Date: 2026-08-29

## Purpose

The original spec called for Claude to synthesize per-category content
scores "by reading public review text (Common Sense Media pages, IMDb
parents guide, etc.)." What actually got built asks Claude to answer from
its own training-data recall instead — a real gap the final MVP review
flagged: it means content scores for recent or obscure titles rely on the
model's parametric memory with no signal to the caller about whether that
memory is any good, which matters for a feature whose whole job is family
safety. This spec closes that gap using Claude's server-side web search and
web fetch tools, so scores are grounded in an actual page whenever one
exists.

## Scope

Modifies only `synthesizeContentScore` in `src/lib/contentScoring.ts`. No
schema changes — still writes the same `ContentScore` fields. No change to
`src/lib/ranking.ts`: taste ranking only uses the user's own rating history
and candidate synopses already in the database, and has no need for
external grounding.

## Architecture

- Add a `tools` array to the existing `client.messages.create()` call:
  - `{ type: 'web_search_20260209', name: 'web_search', max_uses: 3, allowed_domains: ['commonsensemedia.org', 'imdb.com'] }`
  - `{ type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 3, allowed_domains: ['commonsensemedia.org', 'imdb.com'] }`
  - Both are server-side tools: they execute entirely on Anthropic's
    infrastructure and their results land as content blocks in the same
    response. No agentic loop, no client-side tool execution, no change to
    the "one API call per title" shape of this function — Claude can
    search, fetch, and answer within a single `messages.create()` call.
  - `allowed_domains` is the key constraint: it keeps Claude to exactly the
    two sources the spec named, not a general web crawl.
- Re-enable adaptive thinking: change `thinking: { type: 'disabled' }` to
  `thinking: { type: 'adaptive' }`. It was disabled originally on the
  reasoning that this was pure structured extraction with no judgment
  involved; that no longer holds once Claude has to decide which search
  result is trustworthy and worth fetching.
- Update the prompt: replace "Using publicly known parental-guide-style
  information..." with an explicit instruction to search for and read the
  title's Common Sense Media review or IMDb Parents Guide page before
  answering, and to say so in `sourceNotes` if no page could be found (in
  which case Claude falls back to its own best estimate, same as today —
  this change makes grounded scores better, it doesn't make un-groundable
  titles fail).
- Raise `max_tokens` from 500 to 2048 — added headroom for the tool-use
  round trip within the response, reducing truncation risk.
- No change to text-block extraction: the existing `.find((b) => b.type === 'text')`
  scan already handles arbitrary block types preceding the final text
  block (thinking, `server_tool_use`, `web_search_tool_result`,
  `web_fetch_tool_result`), since it searches by type rather than indexing
  position.

## Data flow

1. `getOrCreateContentScore` calls `synthesizeContentScore` exactly as
   before, on a cache miss.
2. Claude's response may now contain, in order: a `thinking` block, one or
   more `server_tool_use`/`web_search_tool_result`/`web_fetch_tool_result`
   block pairs, and a final `text` block with the JSON payload.
3. The function extracts the `text` block, strips any markdown code fence,
   `JSON.parse`s it, and validates it through the existing zod schema — all
   unchanged from today.
4. The validated score is persisted to `ContentScore` exactly as before.

## Error handling

- Server-tool errors (a search or fetch call failing) return HTTP 200 with
  an error object in that tool's result block rather than throwing — this
  is normal Anthropic API behavior, not a failure condition our code needs
  to branch on. Claude sees the error in its own context and can still
  respond with a best-effort answer from its own knowledge, which is
  already the documented fallback behavior.
- No change to this function's own error handling — it still either
  returns a validated score or throws, and the existing caller
  (`recommendations/route.ts`, fixed in the final MVP review) already
  catches that and degrades to the `'unscored'` fail-closed path.

## Testing

- Existing tests already mock `getAnthropicClient()` entirely and only
  assert on the final parsed/validated score, so they remain valid
  unchanged — they don't need to know whether real search happened.
- Add one new regression test: mock a response `content` array containing
  a `web_search_tool_result` block followed by the final `text` block, and
  confirm `synthesizeContentScore` still extracts and validates it
  correctly. This extends the existing "thinking block precedes text" test
  pattern to also cover a tool-result block preceding text.
- No live/integration test against the real Anthropic API is planned —
  consistent with the original spec's testing philosophy that Claude-driven
  pieces are tested for well-formed output and graceful degradation, not
  exact-output assertions, and a live call here costs real money for no
  additional confidence the mocked test doesn't already provide.

## Explicitly out of scope

- No new database field for "was this score grounded in a real source" —
  `sourceNotes` (free text) is where that shows up, same as today. Adding
  a structured confidence field is a reasonable future idea but not needed
  now.
- No change to `ranking.ts` or any other Claude-calling code.
- No change to which model is used (`claude-sonnet-5`, unchanged from the
  original build).
