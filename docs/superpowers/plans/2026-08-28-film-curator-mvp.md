# Film Curator MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the MVP of Film Curator — a Next.js web app that pulls streaming catalog data from TMDB, filters it through per-category content thresholds (violence/language/sex-nudity/scariness) for Family and Adult modes, and ranks results against a taste profile built through a replayable rating game, all backed by Vercel Postgres and deployed to Vercel.

**Architecture:** Single Next.js (App Router, TypeScript) app. Pure/deterministic filtering logic is isolated from the two Claude-backed subsystems (content-score synthesis, taste ranking) so the safety-critical filtering code can be tested exhaustively without live API calls. Prisma is the only data-access layer; all API routes and the cron job go through it.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Prisma + Vercel Postgres, TMDB API, Anthropic API (`@anthropic-ai/sdk`), Vitest + Testing Library, Vercel Cron.

**Spec:** `docs/superpowers/specs/2026-08-28-film-curator-design.md`

## Global Constraints

- Family Mode must never show an unscored title — fail closed.
- Adult Mode's default thresholds exclude NC-17 and unrated content; this is bypassed only by an explicit manual `Override`, never automatically.
- Kanopy and Hoopla are out of scope for all code in this plan (no public API — Phase 2).
- Every Prisma model carries a `familyId` field defaulted to `"default"`, even though there is no multi-tenant UI yet.
- Hosting target is Vercel (Postgres via Prisma, Vercel Cron for scheduled ingestion) — no Docker/self-hosting code belongs in this plan.
- Catalog ingestion cadence is weekly, not nightly.
- The taste-rating feature ("Rate More Movies") must be reachable at any time, not gated to first-run onboarding.
- Claude-backed code (content scoring, ranking) must validate its own output shape (via `zod`) rather than trusting free-form text.

---

## Task 1: Project Scaffold & Tooling

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.mjs`
- Create: `next-env.d.ts`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Create: `.env.example`
- Create: `.gitignore`
- Test: `src/lib/__tests__/sanity.test.ts`

**Interfaces:**
- Produces: a working `npm run dev` / `npm test` toolchain that every later task builds on. Path alias `@/*` → `src/*`.

- [ ] **Step 1: Create `.gitignore`**

```
node_modules
.next
.env
.env.local
*.log
```

- [ ] **Step 2: Create `.env.example`**

```
DATABASE_URL="postgres://user:password@host:5432/dbname"
TMDB_API_KEY=""
ANTHROPIC_API_KEY=""
CRON_SECRET=""
```

- [ ] **Step 3: Create `package.json`**

```json
{
  "name": "film-curator",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:seed": "tsx prisma/seed.ts"
  },
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  },
  "dependencies": {
    "next": "^15.0.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "@prisma/client": "^5.18.0",
    "@anthropic-ai/sdk": "^0.27.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "@types/node": "^20.14.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "prisma": "^5.18.0",
    "tsx": "^4.16.0",
    "vitest": "^2.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "jsdom": "^24.0.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.4.0"
  }
}
```

- [ ] **Step 4: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 5: Create `next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {}
export default nextConfig
```

- [ ] **Step 6: Create `next-env.d.ts`**

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
```

- [ ] **Step 7: Create `src/app/layout.tsx`**

```tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 8: Create placeholder `src/app/page.tsx`**

```tsx
export default function HomePage() {
  return (
    <main>
      <h1>Film Curator</h1>
    </main>
  )
}
```

- [ ] **Step 9: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
```

- [ ] **Step 10: Create `vitest.setup.ts`**

```ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 11: Write the sanity test**

```ts
// src/lib/__tests__/sanity.test.ts
import { describe, it, expect } from 'vitest'

describe('sanity', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 12: Install dependencies and run the test**

Run: `npm install && npm test`
Expected: PASS (1 test)

- [ ] **Step 13: Smoke-check the dev server**

Run: `npm run dev` (then Ctrl+C once it boots without error)
Expected: server starts on port 3000 with no errors; stop it before continuing.

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with Vitest tooling"
```

---

## Task 2: Prisma Schema, Client, and Default Mode Settings Seed

**Files:**
- Create: `prisma/schema.prisma`
- Create: `src/lib/prisma.ts`
- Create: `prisma/seed.ts`
- Test: `src/lib/__tests__/modeSettings.integration.test.ts`

**Interfaces:**
- Produces: `prisma` (singleton `PrismaClient`, exported from `src/lib/prisma.ts`); Prisma models `Title`, `ContentScore`, `ModeSettings`, `Override`, `TasteRating` with enums `Mode`, `OverrideDecision`, `TasteRatingValue` — every later task's Prisma calls use these exact names.

**Manual setup required before this task's tests can pass:** provision a Vercel Postgres database (Vercel dashboard → Storage → Create Database → Postgres) and put its connection string in a local `.env` as `DATABASE_URL`. This is a one-time step done by the user or whoever has dashboard access — there is no way to script it without Vercel account credentials.

- [ ] **Step 1: Create `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Mode {
  FAMILY
  ADULT
}

enum OverrideDecision {
  APPROVED
  REJECTED
}

enum TasteRatingValue {
  DISLIKED
  LIKED
  LOVED
  NOT_SEEN
  TOO_INAPPROPRIATE
}

model Title {
  id           String   @id @default(cuid())
  familyId     String   @default("default")
  tmdbId       Int
  name         String
  year         Int?
  posterPath   String?
  overview     String?
  mpaaRating   String?
  providers    String[]
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  contentScore ContentScore?
  overrides    Override[]
  tasteRatings TasteRating[]

  @@unique([familyId, tmdbId])
}

model ContentScore {
  id          String   @id @default(cuid())
  titleId     String   @unique
  title       Title    @relation(fields: [titleId], references: [id])
  violence    Int
  language    Int
  sexNudity   Int
  scariness   Int
  isUnrated   Boolean  @default(false)
  isNC17      Boolean  @default(false)
  sourceNotes String?
  computedAt  DateTime @default(now())
}

model ModeSettings {
  id           String  @id @default(cuid())
  familyId     String  @default("default")
  mode         Mode
  maxViolence  Int
  maxLanguage  Int
  maxSexNudity Int
  maxScariness Int
  allowUnrated Boolean @default(false)
  allowNC17    Boolean @default(false)

  @@unique([familyId, mode])
}

model Override {
  id        String           @id @default(cuid())
  familyId  String           @default("default")
  titleId   String
  title     Title            @relation(fields: [titleId], references: [id])
  decision  OverrideDecision
  note      String?
  createdAt DateTime         @default(now())

  @@unique([familyId, titleId])
}

model TasteRating {
  id       String           @id @default(cuid())
  familyId String           @default("default")
  titleId  String
  title    Title            @relation(fields: [titleId], references: [id])
  rating   TasteRatingValue
  ratedAt  DateTime         @default(now())

  @@unique([familyId, titleId])
}
```

- [ ] **Step 2: Create `src/lib/prisma.ts`**

```ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
```

- [ ] **Step 3: Run the initial migration**

Run: `npx prisma migrate dev --name init`
Expected: migration applies cleanly against the `DATABASE_URL` from `.env`; `@prisma/client` types are generated.

- [ ] **Step 4: Create `prisma/seed.ts` with the agreed default thresholds**

Family Mode is deliberately loose enough to admit PG-13 titles like Jurassic Park/Twister whose rating comes from mild thematic content, not the categories below. Adult Mode hard-excludes NC-17/unrated by default (see Global Constraints).

```ts
import { prisma } from '../src/lib/prisma'

async function main() {
  await prisma.modeSettings.upsert({
    where: { familyId_mode: { familyId: 'default', mode: 'FAMILY' } },
    update: {},
    create: {
      familyId: 'default',
      mode: 'FAMILY',
      maxViolence: 4,
      maxLanguage: 2,
      maxSexNudity: 1,
      maxScariness: 5,
      allowUnrated: false,
      allowNC17: false,
    },
  })
  await prisma.modeSettings.upsert({
    where: { familyId_mode: { familyId: 'default', mode: 'ADULT' } },
    update: {},
    create: {
      familyId: 'default',
      mode: 'ADULT',
      maxViolence: 8,
      maxLanguage: 8,
      maxSexNudity: 3,
      maxScariness: 10,
      allowUnrated: false,
      allowNC17: false,
    },
  })
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
```

- [ ] **Step 5: Run the seed**

Run: `npm run prisma:seed`
Expected: completes with no errors.

- [ ] **Step 6: Write the integration test**

```ts
// src/lib/__tests__/modeSettings.integration.test.ts
import { describe, it, expect, afterAll } from 'vitest'
import { prisma } from '../prisma'

describe('ModeSettings seed', () => {
  it('has the agreed default thresholds for FAMILY and ADULT', async () => {
    const family = await prisma.modeSettings.findUniqueOrThrow({
      where: { familyId_mode: { familyId: 'default', mode: 'FAMILY' } },
    })
    expect(family.maxSexNudity).toBe(1)
    expect(family.maxViolence).toBe(4)

    const adult = await prisma.modeSettings.findUniqueOrThrow({
      where: { familyId_mode: { familyId: 'default', mode: 'ADULT' } },
    })
    expect(adult.allowNC17).toBe(false)
    expect(adult.allowUnrated).toBe(false)
  })
})

afterAll(async () => {
  await prisma.$disconnect()
})
```

- [ ] **Step 7: Run the test**

Run: `npx vitest run src/lib/__tests__/modeSettings.integration.test.ts`
Expected: PASS (requires the migrated + seeded `DATABASE_URL` from Steps 3 and 5)

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add Prisma schema, client, and default mode settings seed"
```

---

## Task 3: TMDB Client Library

**Files:**
- Create: `src/lib/tmdb.ts`
- Test: `src/lib/__tests__/tmdb.test.ts`

**Interfaces:**
- Consumes: `process.env.TMDB_API_KEY`, global `fetch`.
- Produces: `searchTitle(query: string): Promise<TmdbSearchResult[]>`, `getWatchProviders(tmdbId: number, mediaType: 'movie'|'tv'): Promise<string[]>` (returns lowercase provider slugs like `"netflix"`), `discoverByProvider(providerId: number, mediaType: 'movie'|'tv'): Promise<TmdbSearchResult[]>`, `PROVIDER_IDS: { netflix: number, disney_plus: number, prime_video: number, peacock: number }`, type `TmdbSearchResult { id: number; title?: string; name?: string; release_date?: string; first_air_date?: string; overview: string; poster_path: string | null }`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/__tests__/tmdb.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { searchTitle, getWatchProviders, discoverByProvider, PROVIDER_IDS } from '../tmdb'

const originalFetch = global.fetch
const originalEnv = process.env.TMDB_API_KEY

beforeEach(() => {
  process.env.TMDB_API_KEY = 'test-key'
})

afterEach(() => {
  global.fetch = originalFetch
  process.env.TMDB_API_KEY = originalEnv
})

describe('searchTitle', () => {
  it('returns results from the TMDB multi-search endpoint', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ id: 1, title: 'Jurassic Park', overview: '...', poster_path: '/x.jpg', release_date: '1993-06-11' }] }),
    }) as unknown as typeof fetch

    const results = await searchTitle('Jurassic Park')
    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('Jurassic Park')
  })
})

describe('getWatchProviders', () => {
  it('maps TMDB provider names to internal slugs, US region only', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: {
          US: { flatrate: [{ provider_id: 8, provider_name: 'Netflix' }, { provider_id: 337, provider_name: 'Disney Plus' }] },
        },
      }),
    }) as unknown as typeof fetch

    const providers = await getWatchProviders(1, 'movie')
    expect(providers).toEqual(['netflix', 'disney_plus'])
  })

  it('returns an empty array when there is no US flatrate data', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: {} }) }) as unknown as typeof fetch
    const providers = await getWatchProviders(1, 'movie')
    expect(providers).toEqual([])
  })
})

describe('discoverByProvider', () => {
  it('requests discover sorted by popularity for the given provider', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) })
    global.fetch = fetchMock as unknown as typeof fetch

    await discoverByProvider(PROVIDER_IDS.netflix, 'movie')
    const calledUrl = fetchMock.mock.calls[0][0] as string
    expect(calledUrl).toContain('/discover/movie')
    expect(calledUrl).toContain(`with_watch_providers=${PROVIDER_IDS.netflix}`)
    expect(calledUrl).toContain('sort_by=popularity.desc')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/tmdb.test.ts`
Expected: FAIL — `../tmdb` has no exports yet.

- [ ] **Step 3: Implement `src/lib/tmdb.ts`**

```ts
const TMDB_BASE = 'https://api.themoviedb.org/3'

export type TmdbSearchResult = {
  id: number
  title?: string
  name?: string
  release_date?: string
  first_air_date?: string
  overview: string
  poster_path: string | null
}

type TmdbWatchProvider = {
  provider_id: number
  provider_name: string
}

const PROVIDER_NAME_MAP: Record<string, string> = {
  Netflix: 'netflix',
  'Disney Plus': 'disney_plus',
  'Amazon Prime Video': 'prime_video',
  Peacock: 'peacock',
}

export const PROVIDER_IDS = {
  netflix: 8,
  disney_plus: 337,
  prime_video: 9,
  peacock: 386,
}

async function tmdbFetch(path: string, params: Record<string, string> = {}) {
  const apiKey = process.env.TMDB_API_KEY
  if (!apiKey) throw new Error('TMDB_API_KEY is not set')
  const url = new URL(TMDB_BASE + path)
  url.searchParams.set('api_key', apiKey)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`TMDB request failed: ${res.status}`)
  return res.json()
}

export async function searchTitle(query: string): Promise<TmdbSearchResult[]> {
  const data = await tmdbFetch('/search/multi', { query })
  return data.results
}

export async function getWatchProviders(tmdbId: number, mediaType: 'movie' | 'tv'): Promise<string[]> {
  const data = await tmdbFetch(`/${mediaType}/${tmdbId}/watch/providers`)
  const flatrate: TmdbWatchProvider[] = data.results?.US?.flatrate ?? []
  return flatrate.map((p) => PROVIDER_NAME_MAP[p.provider_name]).filter((slug): slug is string => Boolean(slug))
}

export async function discoverByProvider(providerId: number, mediaType: 'movie' | 'tv'): Promise<TmdbSearchResult[]> {
  const data = await tmdbFetch(`/discover/${mediaType}`, {
    with_watch_providers: String(providerId),
    watch_region: 'US',
    sort_by: 'popularity.desc',
  })
  return data.results
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/tmdb.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add TMDB client library"
```

---

## Task 4: Anthropic Client Wrapper

**Files:**
- Create: `src/lib/anthropic.ts`
- Test: `src/lib/__tests__/anthropic.test.ts`

**Interfaces:**
- Consumes: `process.env.ANTHROPIC_API_KEY`.
- Produces: `getAnthropicClient(): Anthropic` (memoized singleton), `resetAnthropicClientForTests(): void` (test-only reset hook used by later tasks that mock this module).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/anthropic.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getAnthropicClient, resetAnthropicClientForTests } from '../anthropic'

const originalKey = process.env.ANTHROPIC_API_KEY

beforeEach(() => {
  resetAnthropicClientForTests()
})

afterEach(() => {
  process.env.ANTHROPIC_API_KEY = originalKey
  resetAnthropicClientForTests()
})

describe('getAnthropicClient', () => {
  it('throws when ANTHROPIC_API_KEY is not set', () => {
    delete process.env.ANTHROPIC_API_KEY
    expect(() => getAnthropicClient()).toThrow('ANTHROPIC_API_KEY is not set')
  })

  it('returns the same instance on repeated calls', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    const first = getAnthropicClient()
    const second = getAnthropicClient()
    expect(first).toBe(second)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/anthropic.test.ts`
Expected: FAIL — `../anthropic` has no exports yet.

- [ ] **Step 3: Implement `src/lib/anthropic.ts`**

```ts
import Anthropic from '@anthropic-ai/sdk'

let client: Anthropic | null = null

export function getAnthropicClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
    client = new Anthropic({ apiKey })
  }
  return client
}

export function resetAnthropicClientForTests() {
  client = null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/anthropic.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Anthropic client wrapper"
```

---

## Task 5: Filtering Logic (Pure, Safety-Critical)

**Files:**
- Create: `src/lib/filtering.ts`
- Test: `src/lib/__tests__/filtering.test.ts`

**Interfaces:**
- Produces: `evaluateTitle(score, thresholds, override): FilterReason`, `isVisibleInMode(reason: FilterReason, mode: 'FAMILY' | 'ADULT'): boolean`, types `ContentScoreInput`, `ModeThresholds`, `OverrideInput`, `FilterReason = 'override_approved' | 'override_rejected' | 'passes' | 'fails_category' | 'unscored'`. This is the exact contract Task 10 (recommendations route) consumes.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/__tests__/filtering.test.ts
import { describe, it, expect } from 'vitest'
import { evaluateTitle, isVisibleInMode, type ContentScoreInput, type ModeThresholds } from '../filtering'

const familyThresholds: ModeThresholds = {
  maxViolence: 4,
  maxLanguage: 2,
  maxSexNudity: 1,
  maxScariness: 5,
  allowUnrated: false,
  allowNC17: false,
}

const adultThresholds: ModeThresholds = {
  maxViolence: 8,
  maxLanguage: 8,
  maxSexNudity: 3,
  maxScariness: 10,
  allowUnrated: false,
  allowNC17: false,
}

function score(overrides: Partial<ContentScoreInput> = {}): ContentScoreInput {
  return { violence: 1, language: 1, sexNudity: 0, scariness: 1, isUnrated: false, isNC17: false, ...overrides }
}

describe('evaluateTitle', () => {
  it('passes a clean title under Family Mode thresholds', () => {
    expect(evaluateTitle(score(), familyThresholds, null)).toBe('passes')
  })

  it('fails a title exceeding a single category threshold', () => {
    expect(evaluateTitle(score({ sexNudity: 2 }), familyThresholds, null)).toBe('fails_category')
  })

  it('returns unscored when there is no content score and no override', () => {
    expect(evaluateTitle(null, familyThresholds, null)).toBe('unscored')
  })

  it('excludes NC-17 titles under Adult Mode by default', () => {
    expect(evaluateTitle(score({ isNC17: true }), adultThresholds, null)).toBe('fails_category')
  })

  it('excludes unrated titles under Adult Mode by default', () => {
    expect(evaluateTitle(score({ isUnrated: true }), adultThresholds, null)).toBe('fails_category')
  })

  it('an approved override wins even over NC-17', () => {
    expect(evaluateTitle(score({ isNC17: true }), adultThresholds, { decision: 'APPROVED' })).toBe('override_approved')
  })

  it('a rejected override wins even over a passing score', () => {
    expect(evaluateTitle(score(), familyThresholds, { decision: 'REJECTED' })).toBe('override_rejected')
  })
})

describe('isVisibleInMode', () => {
  it('hides unscored titles in Family Mode (fail closed)', () => {
    expect(isVisibleInMode('unscored', 'FAMILY')).toBe(false)
  })

  it('shows unscored titles in Adult Mode (flagged by the caller)', () => {
    expect(isVisibleInMode('unscored', 'ADULT')).toBe(true)
  })

  it('hides rejected overrides in both modes', () => {
    expect(isVisibleInMode('override_rejected', 'FAMILY')).toBe(false)
    expect(isVisibleInMode('override_rejected', 'ADULT')).toBe(false)
  })

  it('shows passing and approved titles in both modes', () => {
    expect(isVisibleInMode('passes', 'FAMILY')).toBe(true)
    expect(isVisibleInMode('override_approved', 'ADULT')).toBe(true)
  })

  it('hides fails_category in both modes', () => {
    expect(isVisibleInMode('fails_category', 'FAMILY')).toBe(false)
    expect(isVisibleInMode('fails_category', 'ADULT')).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/filtering.test.ts`
Expected: FAIL — `../filtering` has no exports yet.

- [ ] **Step 3: Implement `src/lib/filtering.ts`**

```ts
export type ContentScoreInput = {
  violence: number
  language: number
  sexNudity: number
  scariness: number
  isUnrated: boolean
  isNC17: boolean
}

export type ModeThresholds = {
  maxViolence: number
  maxLanguage: number
  maxSexNudity: number
  maxScariness: number
  allowUnrated: boolean
  allowNC17: boolean
}

export type OverrideInput = { decision: 'APPROVED' | 'REJECTED' } | null

export type FilterReason = 'override_approved' | 'override_rejected' | 'passes' | 'fails_category' | 'unscored'

export function evaluateTitle(
  score: ContentScoreInput | null,
  thresholds: ModeThresholds,
  override: OverrideInput
): FilterReason {
  if (override?.decision === 'APPROVED') return 'override_approved'
  if (override?.decision === 'REJECTED') return 'override_rejected'
  if (!score) return 'unscored'
  if (score.isNC17 && !thresholds.allowNC17) return 'fails_category'
  if (score.isUnrated && !thresholds.allowUnrated) return 'fails_category'

  const withinThresholds =
    score.violence <= thresholds.maxViolence &&
    score.language <= thresholds.maxLanguage &&
    score.sexNudity <= thresholds.maxSexNudity &&
    score.scariness <= thresholds.maxScariness

  return withinThresholds ? 'passes' : 'fails_category'
}

export function isVisibleInMode(reason: FilterReason, mode: 'FAMILY' | 'ADULT'): boolean {
  if (reason === 'override_rejected' || reason === 'fails_category') return false
  if (reason === 'override_approved' || reason === 'passes') return true
  return mode === 'ADULT' // reason === 'unscored'
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/filtering.test.ts`
Expected: PASS (13 tests)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add pure content-filtering logic"
```

---

## Task 6: Content-Descriptor Scoring Service

**Files:**
- Create: `src/lib/contentScoring.ts`
- Test: `src/lib/__tests__/contentScoring.test.ts`

**Interfaces:**
- Consumes: `getAnthropicClient` from `src/lib/anthropic.ts`; `prisma` from `src/lib/prisma.ts`; Prisma `ContentScore` model from Task 2.
- Produces: `getOrCreateContentScore(titleId: string): Promise<ContentScore>` — used by Task 10 (recommendations route).

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/__tests__/contentScoring.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../anthropic', () => ({
  getAnthropicClient: vi.fn(),
}))
vi.mock('../prisma', () => ({
  prisma: {
    contentScore: { findUnique: vi.fn(), create: vi.fn() },
    title: { findUniqueOrThrow: vi.fn() },
  },
}))

import { getAnthropicClient } from '../anthropic'
import { prisma } from '../prisma'
import { getOrCreateContentScore } from '../contentScoring'

describe('getOrCreateContentScore', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the existing score without calling Claude', async () => {
    const existing = { id: 'cs1', titleId: 't1', violence: 1, language: 1, sexNudity: 0, scariness: 1, isUnrated: false, isNC17: false, sourceNotes: '', computedAt: new Date() }
    ;(prisma.contentScore.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existing)

    const result = await getOrCreateContentScore('t1')

    expect(result).toBe(existing)
    expect(getAnthropicClient).not.toHaveBeenCalled()
  })

  it('synthesizes and persists a new score when none exists', async () => {
    ;(prisma.contentScore.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    ;(prisma.title.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 't1', name: 'Jurassic Park', year: 1993 })

    const synthesized = { violence: 3, language: 1, sexNudity: 0, scariness: 5, isUnrated: false, isNC17: false, sourceNotes: 'Peril from dinosaurs, no gore shown on screen.' }
    const mockCreate = vi.fn().mockResolvedValue({ id: 'cs1', titleId: 't1', ...synthesized, computedAt: new Date() })
    ;(prisma.contentScore.create as ReturnType<typeof vi.fn>) = mockCreate

    ;(getAnthropicClient as ReturnType<typeof vi.fn>).mockReturnValue({
      messages: {
        create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: JSON.stringify(synthesized) }] }),
      },
    })

    const result = await getOrCreateContentScore('t1')

    expect(mockCreate).toHaveBeenCalledWith({ data: { titleId: 't1', ...synthesized } })
    expect(result.violence).toBe(3)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/contentScoring.test.ts`
Expected: FAIL — `../contentScoring` has no exports yet.

- [ ] **Step 3: Implement `src/lib/contentScoring.ts`**

```ts
import { z } from 'zod'
import { prisma } from './prisma'
import { getAnthropicClient } from './anthropic'

const SynthesizedScoreSchema = z.object({
  violence: z.number().min(0).max(10),
  language: z.number().min(0).max(10),
  sexNudity: z.number().min(0).max(10),
  scariness: z.number().min(0).max(10),
  isUnrated: z.boolean(),
  isNC17: z.boolean(),
  sourceNotes: z.string(),
})

export type SynthesizedScore = z.infer<typeof SynthesizedScoreSchema>

async function synthesizeContentScore(titleName: string, year: number | null): Promise<SynthesizedScore> {
  const client = getAnthropicClient()
  const message = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 500,
    messages: [
      {
        role: 'user',
        content: `Using publicly known parental-guide-style information (e.g. Common Sense Media, IMDb Parents Guide) about "${titleName}"${year ? ` (${year})` : ''}, respond with ONLY a JSON object with these exact keys and no other text: violence (0-10), language (0-10), sexNudity (0-10), scariness (0-10), isUnrated (boolean), isNC17 (boolean), sourceNotes (a short string citing what informed the scores).`,
      },
    ],
  })
  const block = message.content[0]
  const text = block.type === 'text' ? block.text : ''
  return SynthesizedScoreSchema.parse(JSON.parse(text))
}

export async function getOrCreateContentScore(titleId: string) {
  const existing = await prisma.contentScore.findUnique({ where: { titleId } })
  if (existing) return existing

  const title = await prisma.title.findUniqueOrThrow({ where: { id: titleId } })
  const synthesized = await synthesizeContentScore(title.name, title.year)
  return prisma.contentScore.create({ data: { titleId, ...synthesized } })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/contentScoring.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add lazy, cached content-descriptor scoring service"
```

---

## Task 7: On-Demand Search API Route

**Files:**
- Create: `src/app/api/search/route.ts`
- Test: `src/app/api/search/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `searchTitle`, `getWatchProviders` (Task 3); `prisma` (Task 2).
- Produces: `GET /api/search?q=...` → `{ titles: Title[] }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/search/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/tmdb', () => ({
  searchTitle: vi.fn(),
  getWatchProviders: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: { title: { upsert: vi.fn() } },
}))

import { searchTitle, getWatchProviders } from '@/lib/tmdb'
import { prisma } from '@/lib/prisma'
import { GET } from '../route'

describe('GET /api/search', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 400 when q is missing', async () => {
    const req = new NextRequest('http://localhost/api/search')
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('searches TMDB, upserts results, and returns them', async () => {
    ;(searchTitle as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 42, title: 'Jurassic Park', overview: '...', poster_path: '/x.jpg', release_date: '1993-06-11' },
    ])
    ;(getWatchProviders as ReturnType<typeof vi.fn>).mockResolvedValue(['netflix'])
    ;(prisma.title.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 't1', name: 'Jurassic Park' })

    const req = new NextRequest('http://localhost/api/search?q=jurassic')
    const res = await GET(req)
    const body = await res.json()

    expect(prisma.title.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { familyId_tmdbId: { familyId: 'default', tmdbId: 42 } },
      })
    )
    expect(body.titles).toEqual([{ id: 't1', name: 'Jurassic Park' }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/search/__tests__/route.test.ts`
Expected: FAIL — `../route` does not exist.

- [ ] **Step 3: Implement `src/app/api/search/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { searchTitle, getWatchProviders } from '@/lib/tmdb'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q')
  if (!query) return NextResponse.json({ error: 'q is required' }, { status: 400 })

  const results = await searchTitle(query)
  const titles = []

  for (const result of results.slice(0, 10)) {
    const mediaType = result.title ? 'movie' : 'tv'
    const providers = await getWatchProviders(result.id, mediaType)
    const dateStr = result.release_date ?? result.first_air_date
    const year = dateStr ? Number(dateStr.slice(0, 4)) : null

    const title = await prisma.title.upsert({
      where: { familyId_tmdbId: { familyId: 'default', tmdbId: result.id } },
      update: { providers },
      create: {
        familyId: 'default',
        tmdbId: result.id,
        name: result.title ?? result.name ?? 'Unknown',
        year,
        posterPath: result.poster_path,
        overview: result.overview,
        providers,
      },
    })
    titles.push(title)
  }

  return NextResponse.json({ titles })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/search/__tests__/route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add on-demand title search API route"
```

---

## Task 8: Weekly Ingestion Cron Route

**Files:**
- Create: `src/app/api/ingest/route.ts`
- Create: `vercel.json`
- Test: `src/app/api/ingest/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `discoverByProvider`, `getWatchProviders`, `PROVIDER_IDS` (Task 3); `prisma` (Task 2); `process.env.CRON_SECRET`.
- Produces: `GET /api/ingest` (Bearer-authenticated) → `{ ingested: number, failed: number }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/ingest/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/tmdb', () => ({
  discoverByProvider: vi.fn(),
  getWatchProviders: vi.fn(),
  PROVIDER_IDS: { netflix: 8, disney_plus: 337, prime_video: 9, peacock: 386 },
}))
vi.mock('@/lib/prisma', () => ({
  prisma: { title: { upsert: vi.fn() } },
}))

import { discoverByProvider, getWatchProviders } from '@/lib/tmdb'
import { prisma } from '@/lib/prisma'
import { GET } from '../route'

const originalSecret = process.env.CRON_SECRET

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = 'test-secret'
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

  it('ingests titles for every provider and media type, counting failures', async () => {
    ;(discoverByProvider as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ id: 1, title: 'A', overview: '', poster_path: null, release_date: '2020-01-01' }])
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue([])
    ;(getWatchProviders as ReturnType<typeof vi.fn>).mockResolvedValue(['netflix'])
    ;(prisma.title.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({})

    const req = new NextRequest('http://localhost/api/ingest', {
      headers: { authorization: 'Bearer test-secret' },
    })
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ingested).toBe(1)
    expect(body.failed).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/ingest/__tests__/route.test.ts`
Expected: FAIL — `../route` does not exist.

- [ ] **Step 3: Implement `src/app/api/ingest/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { discoverByProvider, getWatchProviders, PROVIDER_IDS } from '@/lib/tmdb'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
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
      } catch {
        results.failed++
        continue
      }

      for (const item of items) {
        try {
          const providers = await getWatchProviders(item.id, mediaType)
          const dateStr = item.release_date ?? item.first_air_date
          const year = dateStr ? Number(dateStr.slice(0, 4)) : null

          await prisma.title.upsert({
            where: { familyId_tmdbId: { familyId, tmdbId: item.id } },
            update: { providers },
            create: {
              familyId,
              tmdbId: item.id,
              name: item.title ?? item.name ?? 'Unknown',
              year,
              posterPath: item.poster_path,
              overview: item.overview,
              providers,
            },
          })
          results.ingested++
        } catch {
          results.failed++
        }
      }
    }
  }

  return NextResponse.json(results)
}
```

- [ ] **Step 4: Create `vercel.json`** (weekly, Monday 6am UTC)

```json
{
  "crons": [{ "path": "/api/ingest", "schedule": "0 6 * * 1" }]
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/app/api/ingest/__tests__/route.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add weekly catalog ingestion cron route"
```

---

## Task 9: Taste-Based Ranking Service

**Files:**
- Create: `src/lib/ranking.ts`
- Test: `src/lib/__tests__/ranking.test.ts`

**Interfaces:**
- Consumes: `getAnthropicClient` (Task 4).
- Produces: `rankByTaste(candidates: CandidateTitle[], tasteHistory: TasteHistoryEntry[]): Promise<string[]>` (returns candidate ids, best fit first) — used by Task 10.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/__tests__/ranking.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../anthropic', () => ({ getAnthropicClient: vi.fn() }))

import { getAnthropicClient } from '../anthropic'
import { rankByTaste } from '../ranking'

describe('rankByTaste', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns candidates unchanged when there is no taste history yet', async () => {
    const candidates = [{ id: 'a', name: 'A', overview: null }, { id: 'b', name: 'B', overview: null }]
    const result = await rankByTaste(candidates, [])
    expect(result).toEqual(['a', 'b'])
    expect(getAnthropicClient).not.toHaveBeenCalled()
  })

  it('returns an empty array for no candidates without calling Claude', async () => {
    const result = await rankByTaste([], [{ titleName: 'X', rating: 'LOVED' }])
    expect(result).toEqual([])
    expect(getAnthropicClient).not.toHaveBeenCalled()
  })

  it('parses and returns the ranked id order from Claude', async () => {
    const candidates = [{ id: 'a', name: 'A', overview: null }, { id: 'b', name: 'B', overview: null }]
    ;(getAnthropicClient as ReturnType<typeof vi.fn>).mockReturnValue({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: JSON.stringify({ rankedTitleIds: ['b', 'a'] }) }],
        }),
      },
    })

    const result = await rankByTaste(candidates, [{ titleName: 'Jurassic Park', rating: 'LOVED' }])
    expect(result).toEqual(['b', 'a'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/ranking.test.ts`
Expected: FAIL — `../ranking` has no exports yet.

- [ ] **Step 3: Implement `src/lib/ranking.ts`**

```ts
import { z } from 'zod'
import { getAnthropicClient } from './anthropic'

const RankingResponseSchema = z.object({
  rankedTitleIds: z.array(z.string()),
})

export type TasteHistoryEntry = { titleName: string; rating: string }
export type CandidateTitle = { id: string; name: string; overview: string | null }

export async function rankByTaste(candidates: CandidateTitle[], tasteHistory: TasteHistoryEntry[]): Promise<string[]> {
  if (candidates.length === 0) return []
  if (tasteHistory.length === 0) return candidates.map((c) => c.id)

  const client = getAnthropicClient()
  const message = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 1000,
    messages: [
      {
        role: 'user',
        content: `Given this viewer's taste history:\n${tasteHistory.map((h) => `- ${h.titleName}: ${h.rating}`).join('\n')}\n\nRank these candidate titles from best to worst fit for this viewer:\n${candidates.map((c) => `- id=${c.id} name="${c.name}" overview="${c.overview ?? ''}"`).join('\n')}\n\nRespond with ONLY JSON: { "rankedTitleIds": [...] } listing every candidate id exactly once, best fit first.`,
      },
    ],
  })

  const block = message.content[0]
  const text = block.type === 'text' ? block.text : ''
  const parsed = RankingResponseSchema.parse(JSON.parse(text))
  return parsed.rankedTitleIds
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/ranking.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Claude-backed taste ranking service"
```

---

## Task 10: Recommendations API Route

**Files:**
- Create: `src/app/api/recommendations/route.ts`
- Test: `src/app/api/recommendations/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 2); `getOrCreateContentScore` (Task 6); `evaluateTitle`, `isVisibleInMode` (Task 5); `rankByTaste` (Task 9).
- Produces: `GET /api/recommendations?mode=FAMILY|ADULT` → `{ mode, titles: Array<Title & { contentScore: ContentScore, filterReason: FilterReason }> }`, ranked best-fit first.

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/recommendations/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    title: { findMany: vi.fn() },
    modeSettings: { findUniqueOrThrow: vi.fn() },
    override: { findMany: vi.fn() },
    tasteRating: { findMany: vi.fn() },
  },
}))
vi.mock('@/lib/contentScoring', () => ({ getOrCreateContentScore: vi.fn() }))
vi.mock('@/lib/ranking', () => ({ rankByTaste: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { getOrCreateContentScore } from '@/lib/contentScoring'
import { rankByTaste } from '@/lib/ranking'
import { GET } from '../route'

const cleanScore = { violence: 1, language: 1, sexNudity: 0, scariness: 1, isUnrated: false, isNC17: false }
const familyThresholds = { maxViolence: 4, maxLanguage: 2, maxSexNudity: 1, maxScariness: 5, allowUnrated: false, allowNC17: false }

describe('GET /api/recommendations', () => {
  beforeEach(() => vi.clearAllMocks())

  it('filters by mode, lazily scores unscored titles, and ranks the result', async () => {
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 't1', name: 'Clean Title', overview: null, contentScore: cleanScore },
      { id: 't2', name: 'Needs Scoring', overview: null, contentScore: null },
    ])
    ;(prisma.modeSettings.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue(familyThresholds)
    ;(prisma.override.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(prisma.tasteRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(getOrCreateContentScore as ReturnType<typeof vi.fn>).mockResolvedValue(cleanScore)
    ;(rankByTaste as ReturnType<typeof vi.fn>).mockResolvedValue(['t2', 't1'])

    const req = new NextRequest('http://localhost/api/recommendations?mode=FAMILY')
    const res = await GET(req)
    const body = await res.json()

    expect(getOrCreateContentScore).toHaveBeenCalledWith('t2')
    expect(body.titles.map((t: { id: string }) => t.id)).toEqual(['t2', 't1'])
    expect(body.mode).toBe('FAMILY')
  })

  it('defaults to FAMILY when mode is missing or invalid', async () => {
    ;(prisma.title.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(prisma.modeSettings.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue(familyThresholds)
    ;(prisma.override.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(prisma.tasteRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(rankByTaste as ReturnType<typeof vi.fn>).mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/recommendations?mode=nonsense')
    const res = await GET(req)
    const body = await res.json()
    expect(body.mode).toBe('FAMILY')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/recommendations/__tests__/route.test.ts`
Expected: FAIL — `../route` does not exist.

- [ ] **Step 3: Implement `src/app/api/recommendations/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getOrCreateContentScore } from '@/lib/contentScoring'
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

  const visible: Array<{ id: string; name: string; overview: string | null; contentScore: ContentScoreInput; filterReason: string }> = []

  for (const title of titles) {
    let score = title.contentScore
    if (!score) {
      score = await getOrCreateContentScore(title.id)
    }
    const override = overrideByTitleId.get(title.id) ?? null
    const reason = evaluateTitle(score, thresholds, override)
    if (isVisibleInMode(reason, mode)) {
      visible.push({ ...title, contentScore: score, filterReason: reason })
    }
  }

  const history = tasteHistory
    .filter((t) => t.rating !== 'NOT_SEEN')
    .map((t) => ({ titleName: t.title.name, rating: t.rating }))

  const rankedIds = await rankByTaste(
    visible.map((v) => ({ id: v.id, name: v.name, overview: v.overview })),
    history
  )
  const byId = new Map(visible.map((v) => [v.id, v]))
  const ranked = rankedIds.map((id) => byId.get(id)).filter((v): v is typeof visible[number] => Boolean(v))

  return NextResponse.json({ mode, titles: ranked })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/recommendations/__tests__/route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add recommendations API route combining filtering, scoring, and ranking"
```

---

## Task 11: Taste Interview (Library + API Route)

**Files:**
- Create: `src/lib/tasteInterview.ts`
- Create: `src/app/api/taste/route.ts`
- Test: `src/lib/__tests__/tasteInterview.test.ts`
- Test: `src/app/api/taste/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 2).
- Produces: `getNextTitleToRate(familyId: string): Promise<Title | null>`, `recordTasteRating(familyId: string, titleId: string, rating: TasteRatingValue): Promise<TasteRating>`; `GET /api/taste` → `{ title: Title | null }`, `POST /api/taste` with `{ titleId, rating }` → `{ result: TasteRating }`.

- [ ] **Step 1: Write the failing test for `tasteInterview.ts`**

```ts
// src/lib/__tests__/tasteInterview.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../prisma', () => ({
  prisma: {
    tasteRating: { findMany: vi.fn(), upsert: vi.fn() },
    title: { findFirst: vi.fn() },
  },
}))

import { prisma } from '../prisma'
import { getNextTitleToRate, recordTasteRating } from '../tasteInterview'

describe('getNextTitleToRate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('excludes already-rated titles', async () => {
    ;(prisma.tasteRating.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ titleId: 't1' }])
    ;(prisma.title.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 't2', name: 'Unrated Title' })

    const next = await getNextTitleToRate('default')

    expect(prisma.title.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { familyId: 'default', id: { notIn: ['t1'] } } })
    )
    expect(next?.id).toBe('t2')
  })
})

describe('recordTasteRating', () => {
  it('upserts a rating keyed by family and title', async () => {
    const mockUpsert = vi.fn().mockResolvedValue({ id: 'r1' })
    ;(prisma.tasteRating.upsert as ReturnType<typeof vi.fn>) = mockUpsert

    await recordTasteRating('default', 't1', 'LOVED')

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { familyId_titleId: { familyId: 'default', titleId: 't1' } },
      })
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/tasteInterview.test.ts`
Expected: FAIL — `../tasteInterview` has no exports yet.

- [ ] **Step 3: Implement `src/lib/tasteInterview.ts`**

```ts
import { prisma } from './prisma'
import type { TasteRatingValue } from '@prisma/client'

export async function getNextTitleToRate(familyId: string) {
  const rated = await prisma.tasteRating.findMany({ where: { familyId }, select: { titleId: true } })
  const ratedIds = rated.map((r) => r.titleId)
  return prisma.title.findFirst({
    where: { familyId, id: { notIn: ratedIds } },
    orderBy: { createdAt: 'desc' },
  })
}

export async function recordTasteRating(familyId: string, titleId: string, rating: TasteRatingValue) {
  return prisma.tasteRating.upsert({
    where: { familyId_titleId: { familyId, titleId } },
    update: { rating, ratedAt: new Date() },
    create: { familyId, titleId, rating },
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/tasteInterview.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing test for the API route**

```ts
// src/app/api/taste/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/tasteInterview', () => ({
  getNextTitleToRate: vi.fn(),
  recordTasteRating: vi.fn(),
}))

import { getNextTitleToRate, recordTasteRating } from '@/lib/tasteInterview'
import { GET, POST } from '../route'

describe('GET /api/taste', () => {
  it('returns the next title to rate', async () => {
    ;(getNextTitleToRate as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 't1', name: 'A' })
    const res = await GET()
    const body = await res.json()
    expect(body.title.id).toBe('t1')
  })
})

describe('POST /api/taste', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects an invalid rating value', async () => {
    const req = new NextRequest('http://localhost/api/taste', {
      method: 'POST',
      body: JSON.stringify({ titleId: 't1', rating: 'NOT_A_RATING' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    expect(recordTasteRating).not.toHaveBeenCalled()
  })

  it('records a valid rating', async () => {
    ;(recordTasteRating as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'r1' })
    const req = new NextRequest('http://localhost/api/taste', {
      method: 'POST',
      body: JSON.stringify({ titleId: 't1', rating: 'LOVED' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(recordTasteRating).toHaveBeenCalledWith('default', 't1', 'LOVED')
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run src/app/api/taste/__tests__/route.test.ts`
Expected: FAIL — `../route` does not exist.

- [ ] **Step 7: Implement `src/app/api/taste/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getNextTitleToRate, recordTasteRating } from '@/lib/tasteInterview'

const VALID_RATINGS = ['DISLIKED', 'LIKED', 'LOVED', 'NOT_SEEN', 'TOO_INAPPROPRIATE']

export async function GET() {
  const title = await getNextTitleToRate('default')
  return NextResponse.json({ title })
}

export async function POST(req: NextRequest) {
  const { titleId, rating } = await req.json()
  if (!titleId || !VALID_RATINGS.includes(rating)) {
    return NextResponse.json({ error: 'invalid input' }, { status: 400 })
  }
  const result = await recordTasteRating('default', titleId, rating)
  return NextResponse.json({ result })
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run src/app/api/taste/__tests__/route.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add replayable taste interview library and API route"
```

---

## Task 12: Override Management API Route

**Files:**
- Create: `src/app/api/overrides/route.ts`
- Test: `src/app/api/overrides/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 2).
- Produces: `GET /api/overrides` → `{ overrides: Array<Override & { title: Title }> }`; `POST /api/overrides` with `{ titleId, decision, note? }` → `{ override }`; `DELETE /api/overrides?titleId=...` → `{ ok: true }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/overrides/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    override: { findMany: vi.fn(), upsert: vi.fn(), delete: vi.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import { GET, POST, DELETE } from '../route'

describe('overrides route', () => {
  beforeEach(() => vi.clearAllMocks())

  it('GET lists overrides for the default family', async () => {
    ;(prisma.override.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'o1' }])
    const res = await GET()
    const body = await res.json()
    expect(body.overrides).toEqual([{ id: 'o1' }])
  })

  it('POST rejects an invalid decision', async () => {
    const req = new NextRequest('http://localhost/api/overrides', {
      method: 'POST',
      body: JSON.stringify({ titleId: 't1', decision: 'MAYBE' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('POST upserts a valid override', async () => {
    ;(prisma.override.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'o1', decision: 'APPROVED' })
    const req = new NextRequest('http://localhost/api/overrides', {
      method: 'POST',
      body: JSON.stringify({ titleId: 't1', decision: 'APPROVED', note: 'Mild peril only' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(prisma.override.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { familyId_titleId: { familyId: 'default', titleId: 't1' } } })
    )
  })

  it('DELETE requires titleId', async () => {
    const req = new NextRequest('http://localhost/api/overrides')
    const res = await DELETE(req)
    expect(res.status).toBe(400)
  })

  it('DELETE removes the override', async () => {
    ;(prisma.override.delete as ReturnType<typeof vi.fn>).mockResolvedValue({})
    const req = new NextRequest('http://localhost/api/overrides?titleId=t1')
    const res = await DELETE(req)
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/overrides/__tests__/route.test.ts`
Expected: FAIL — `../route` does not exist.

- [ ] **Step 3: Implement `src/app/api/overrides/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const overrides = await prisma.override.findMany({ where: { familyId: 'default' }, include: { title: true } })
  return NextResponse.json({ overrides })
}

export async function POST(req: NextRequest) {
  const { titleId, decision, note } = await req.json()
  if (!titleId || !['APPROVED', 'REJECTED'].includes(decision)) {
    return NextResponse.json({ error: 'invalid input' }, { status: 400 })
  }
  const override = await prisma.override.upsert({
    where: { familyId_titleId: { familyId: 'default', titleId } },
    update: { decision, note },
    create: { familyId: 'default', titleId, decision, note },
  })
  return NextResponse.json({ override })
}

export async function DELETE(req: NextRequest) {
  const titleId = req.nextUrl.searchParams.get('titleId')
  if (!titleId) return NextResponse.json({ error: 'titleId required' }, { status: 400 })
  await prisma.override.delete({ where: { familyId_titleId: { familyId: 'default', titleId } } })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/overrides/__tests__/route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add override management API route"
```

---

## Task 13: Dashboard UI Page

**Files:**
- Modify: `src/app/page.tsx`
- Test: `src/app/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: `GET /api/recommendations?mode=...` (Task 10).

- [ ] **Step 1: Write the failing test**

```tsx
// src/app/__tests__/page.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import HomePage from '../page'

describe('HomePage', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({
        mode: 'FAMILY',
        titles: [{ id: 't1', name: 'Jurassic Park', year: 1993, filterReason: 'override_approved', providers: ['netflix'] }],
      }),
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

  it('flags unscored titles as not yet rated', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: async () => ({
        mode: 'ADULT',
        titles: [{ id: 't2', name: 'New Release', year: 2026, filterReason: 'unscored', providers: ['peacock'] }],
      }),
    })
    render(<HomePage />)
    expect(await screen.findByText(/not yet rated/)).toBeInTheDocument()
  })

  it('flags titles with no known provider as availability unknown', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: async () => ({
        mode: 'FAMILY',
        titles: [{ id: 't3', name: 'Mystery Title', year: 2024, filterReason: 'passes', providers: [] }],
      }),
    })
    render(<HomePage />)
    expect(await screen.findByText(/availability unknown/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/__tests__/page.test.tsx`
Expected: FAIL — current placeholder page has no mode toggle or title list.

- [ ] **Step 3: Implement `src/app/page.tsx`**

```tsx
'use client'
import { useEffect, useState } from 'react'

type Title = {
  id: string
  name: string
  year: number | null
  filterReason: string
  providers: string[]
}

export default function HomePage() {
  const [mode, setMode] = useState<'FAMILY' | 'ADULT'>('FAMILY')
  const [titles, setTitles] = useState<Title[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/recommendations?mode=${mode}`)
      .then((res) => res.json())
      .then((data) => setTitles(data.titles))
      .finally(() => setLoading(false))
  }, [mode])

  return (
    <main>
      <h1>Film Curator</h1>
      <div role="group" aria-label="mode toggle">
        <button aria-pressed={mode === 'FAMILY'} onClick={() => setMode('FAMILY')}>
          Family Mode
        </button>
        <button aria-pressed={mode === 'ADULT'} onClick={() => setMode('ADULT')}>
          Adult Mode
        </button>
      </div>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <ul>
          {titles.map((title) => (
            <li key={title.id}>
              {title.name} {title.year ? `(${title.year})` : ''}
              {' — '}
              {title.providers.length > 0 ? title.providers.join(', ') : 'availability unknown'}
              {title.filterReason === 'unscored' && <span> — not yet rated</span>}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/__tests__/page.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: build dashboard UI with mode toggle and recommendation list"
```

---

## Task 14: "Rate More Movies" UI Page

**Files:**
- Create: `src/app/rate/page.tsx`
- Test: `src/app/rate/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: `GET /api/taste`, `POST /api/taste` (Task 11).

- [ ] **Step 1: Write the failing test**

```tsx
// src/app/rate/__tests__/page.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import RatePage from '../page'

describe('RatePage', () => {
  beforeEach(() => {
    let call = 0
    global.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return Promise.resolve({ json: async () => ({ result: { id: 'r1' } }) })
      }
      call++
      if (call === 1) {
        return Promise.resolve({ json: async () => ({ title: { id: 't1', name: 'Jurassic Park', year: 1993, overview: 'Dinosaurs.' } }) })
      }
      return Promise.resolve({ json: async () => ({ title: null }) })
    }) as unknown as typeof fetch
  })

  it('shows the current title to rate', async () => {
    render(<RatePage />)
    expect(await screen.findByText(/Jurassic Park/)).toBeInTheDocument()
  })

  it('submits a rating and loads the next title', async () => {
    render(<RatePage />)
    await screen.findByText(/Jurassic Park/)
    fireEvent.click(screen.getByRole('button', { name: 'Loved' }))
    await waitFor(() => expect(screen.getByText(/No more titles to rate/)).toBeInTheDocument())
    expect(fetch).toHaveBeenCalledWith(
      '/api/taste',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ titleId: 't1', rating: 'LOVED' }) })
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/rate/__tests__/page.test.tsx`
Expected: FAIL — `../page` does not exist.

- [ ] **Step 3: Implement `src/app/rate/page.tsx`**

```tsx
'use client'
import { useEffect, useState } from 'react'

type Title = { id: string; name: string; year: number | null; overview: string | null }

const RATINGS = [
  { value: 'DISLIKED', label: 'Disliked' },
  { value: 'LIKED', label: 'Liked' },
  { value: 'LOVED', label: 'Loved' },
  { value: 'NOT_SEEN', label: "Didn't see" },
  { value: 'TOO_INAPPROPRIATE', label: 'Too inappropriate' },
]

export default function RatePage() {
  const [title, setTitle] = useState<Title | null>(null)
  const [checked, setChecked] = useState(false)

  async function loadNext() {
    const res = await fetch('/api/taste')
    const data = await res.json()
    setTitle(data.title)
    setChecked(true)
  }

  useEffect(() => {
    loadNext()
  }, [])

  async function rate(rating: string) {
    if (!title) return
    await fetch('/api/taste', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titleId: title.id, rating }),
    })
    loadNext()
  }

  if (!checked) return <main><p>Loading...</p></main>
  if (!title) return <main><p>No more titles to rate right now.</p></main>

  return (
    <main>
      <h1>Rate More Movies</h1>
      <h2>
        {title.name} {title.year ? `(${title.year})` : ''}
      </h2>
      <p>{title.overview}</p>
      <div>
        {RATINGS.map((r) => (
          <button key={r.value} onClick={() => rate(r.value)}>
            {r.label}
          </button>
        ))}
      </div>
    </main>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/rate/__tests__/page.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: build replayable Rate More Movies page"
```

---

## Task 15: Mode Settings API + Settings/Overrides UI Page

**Files:**
- Create: `src/app/api/mode-settings/route.ts`
- Create: `src/app/settings/page.tsx`
- Test: `src/app/api/mode-settings/__tests__/route.test.ts`
- Test: `src/app/settings/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: `prisma` (Task 2), `GET /api/overrides` and `POST /api/overrides` (Task 12).
- Produces: `GET /api/mode-settings?mode=...` → `{ settings }`; `PUT /api/mode-settings` with full threshold body → `{ settings }`.

- [ ] **Step 1: Write the failing test for the API route**

```ts
// src/app/api/mode-settings/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: { modeSettings: { findUniqueOrThrow: vi.fn(), update: vi.fn() } },
}))

import { prisma } from '@/lib/prisma'
import { GET, PUT } from '../route'

describe('mode-settings route', () => {
  beforeEach(() => vi.clearAllMocks())

  it('GET fetches settings for the requested mode', async () => {
    ;(prisma.modeSettings.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({ mode: 'ADULT', maxViolence: 8 })
    const req = new NextRequest('http://localhost/api/mode-settings?mode=ADULT')
    const res = await GET(req)
    const body = await res.json()
    expect(body.settings.mode).toBe('ADULT')
  })

  it('PUT rejects an invalid mode', async () => {
    const req = new NextRequest('http://localhost/api/mode-settings', {
      method: 'PUT',
      body: JSON.stringify({ mode: 'KIDS' }),
    })
    const res = await PUT(req)
    expect(res.status).toBe(400)
  })

  it('PUT updates the thresholds for a valid mode', async () => {
    ;(prisma.modeSettings.update as ReturnType<typeof vi.fn>).mockResolvedValue({ mode: 'FAMILY', maxViolence: 5 })
    const req = new NextRequest('http://localhost/api/mode-settings', {
      method: 'PUT',
      body: JSON.stringify({ mode: 'FAMILY', maxViolence: 5, maxLanguage: 2, maxSexNudity: 1, maxScariness: 5, allowUnrated: false, allowNC17: false }),
    })
    const res = await PUT(req)
    expect(res.status).toBe(200)
    expect(prisma.modeSettings.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { familyId_mode: { familyId: 'default', mode: 'FAMILY' } } })
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/mode-settings/__tests__/route.test.ts`
Expected: FAIL — `../route` does not exist.

- [ ] **Step 3: Implement `src/app/api/mode-settings/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const modeParam = req.nextUrl.searchParams.get('mode')
  const mode = modeParam === 'ADULT' ? 'ADULT' : 'FAMILY'
  const settings = await prisma.modeSettings.findUniqueOrThrow({
    where: { familyId_mode: { familyId: 'default', mode } },
  })
  return NextResponse.json({ settings })
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const { mode, maxViolence, maxLanguage, maxSexNudity, maxScariness, allowUnrated, allowNC17 } = body
  if (!['FAMILY', 'ADULT'].includes(mode)) {
    return NextResponse.json({ error: 'invalid mode' }, { status: 400 })
  }
  const settings = await prisma.modeSettings.update({
    where: { familyId_mode: { familyId: 'default', mode } },
    data: { maxViolence, maxLanguage, maxSexNudity, maxScariness, allowUnrated, allowNC17 },
  })
  return NextResponse.json({ settings })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/mode-settings/__tests__/route.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing test for the settings page**

```tsx
// src/app/settings/__tests__/page.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import SettingsPage from '../page'

describe('SettingsPage', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.startsWith('/api/mode-settings')) {
        return Promise.resolve({
          json: async () => ({ settings: { mode: 'FAMILY', maxViolence: 4, maxLanguage: 2, maxSexNudity: 1, maxScariness: 5, allowUnrated: false, allowNC17: false } }),
        })
      }
      if (url.startsWith('/api/overrides')) {
        return Promise.resolve({ json: async () => ({ overrides: [{ id: 'o1', titleId: 't1', decision: 'APPROVED', title: { name: 'Jurassic Park' } }] }) })
      }
      return Promise.resolve({ json: async () => ({}) })
    }) as unknown as typeof fetch
  })

  it('shows the current thresholds and existing overrides', async () => {
    render(<SettingsPage />)
    expect(await screen.findByDisplayValue('4')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(/Jurassic Park: APPROVED/)).toBeInTheDocument())
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run src/app/settings/__tests__/page.test.tsx`
Expected: FAIL — `../page` does not exist.

- [ ] **Step 7: Implement `src/app/settings/page.tsx`**

```tsx
'use client'
import { useEffect, useState } from 'react'

type Settings = {
  mode: string
  maxViolence: number
  maxLanguage: number
  maxSexNudity: number
  maxScariness: number
  allowUnrated: boolean
  allowNC17: boolean
}

type OverrideRow = { id: string; titleId: string; decision: string; title: { name: string } }

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
    <div>
      <ul>
        {overrides.map((o) => (
          <li key={o.id}>
            {o.title.name}: {o.decision}
          </li>
        ))}
      </ul>
      <input placeholder="Title ID" value={titleId} onChange={(e) => setTitleId(e.target.value)} />
      <select value={decision} onChange={(e) => setDecision(e.target.value as 'APPROVED' | 'REJECTED')}>
        <option value="APPROVED">Approve</option>
        <option value="REJECTED">Reject</option>
      </select>
      <button onClick={add}>Add Override</button>
    </div>
  )
}

export default function SettingsPage() {
  const [mode, setMode] = useState<'FAMILY' | 'ADULT'>('FAMILY')
  const [settings, setSettings] = useState<Settings | null>(null)

  useEffect(() => {
    fetch(`/api/mode-settings?mode=${mode}`)
      .then((res) => res.json())
      .then((data) => setSettings(data.settings))
  }, [mode])

  async function save() {
    if (!settings) return
    await fetch('/api/mode-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, ...settings }),
    })
  }

  if (!settings) return <main><p>Loading...</p></main>

  return (
    <main>
      <h1>Content Filter Settings</h1>
      <div role="group" aria-label="mode toggle">
        <button aria-pressed={mode === 'FAMILY'} onClick={() => setMode('FAMILY')}>Family Mode</button>
        <button aria-pressed={mode === 'ADULT'} onClick={() => setMode('ADULT')}>Adult Mode</button>
      </div>
      {(['maxViolence', 'maxLanguage', 'maxSexNudity', 'maxScariness'] as const).map((field) => (
        <label key={field}>
          {field}
          <input
            type="number"
            value={settings[field]}
            onChange={(e) => setSettings({ ...settings, [field]: Number(e.target.value) })}
          />
        </label>
      ))}
      <button onClick={save}>Save</button>
      <section>
        <h2>Overrides</h2>
        <OverridesManager />
      </section>
    </main>
  )
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run src/app/settings/__tests__/page.test.tsx`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add mode settings API and settings/overrides UI page"
```

---

## Task 16: Deploy to Vercel

**Files:** none (infrastructure/configuration task — no new source files).

**Interfaces:** none new; exercises every route built in Tasks 7, 8, 10, 11, 12, 15 against a live deployment.

- [ ] **Step 1: Run the full test suite one more time before deploying**

Run: `npm test`
Expected: all tests from Tasks 1–15 PASS.

- [ ] **Step 2: Push the repository to GitHub**

```bash
gh repo create film-curator --private --source=. --remote=origin
git push -u origin main
```

- [ ] **Step 3: Create the Vercel project**

In the Vercel dashboard: New Project → Import the `film-curator` GitHub repo → accept the detected Next.js framework preset.

- [ ] **Step 4: Provision Vercel Postgres and link it**

In the Vercel dashboard: Storage → Create Database → Postgres → connect it to the `film-curator` project. This automatically sets `DATABASE_URL` in the project's environment variables.

- [ ] **Step 5: Set the remaining environment variables**

In the Vercel project's Settings → Environment Variables, add: `TMDB_API_KEY`, `ANTHROPIC_API_KEY`, `CRON_SECRET` (generate a random value, e.g. `openssl rand -hex 32`).

- [ ] **Step 6: Run the production migration and seed**

```bash
DATABASE_URL="<value from the Vercel dashboard>" npx prisma migrate deploy
DATABASE_URL="<value from the Vercel dashboard>" npm run prisma:seed
```

Expected: migration applies cleanly; `ModeSettings` rows for FAMILY and ADULT exist in production.

- [ ] **Step 7: Deploy and verify**

Trigger a deploy (push to `main`, or Deployments → Redeploy in the dashboard). Once live:

```bash
curl https://<your-app>.vercel.app/
curl -H "Authorization: Bearer <CRON_SECRET value>" https://<your-app>.vercel.app/api/ingest
```

Expected: first command returns the dashboard HTML; second returns `{"ingested": <n>, "failed": <n>}` with `n > 0`.

- [ ] **Step 8: Confirm the weekly cron is registered**

In the Vercel dashboard: project → Cron Jobs tab. Expected: one job for `/api/ingest` on schedule `0 6 * * 1`.

---
