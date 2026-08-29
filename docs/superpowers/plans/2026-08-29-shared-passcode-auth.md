# Shared Passcode Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate the whole Film Curator app behind a single shared family passcode, so a stranger who obtains the public URL can't view or change anything.

**Architecture:** Next.js Edge Middleware checks a stateless, HMAC-signed session cookie on every request except the login page and its API route; a small login page collects the passcode and exchanges it for that cookie via one API route. No database, no per-user identity.

**Tech Stack:** Next.js 15 (App Router, Edge Middleware), Web Crypto API (`crypto.subtle`) for HMAC signing — no new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-29-shared-passcode-auth-design.md`

## Global Constraints

- `FAMILY_PASSCODE` (what the family types in) and `SESSION_SECRET` (signs cookies) are separate secrets — never reuse one for the other.
- Missing `FAMILY_PASSCODE` or `SESSION_SECRET` at runtime → fail closed (500), never treat it as "allow everyone."
- No lockout or rate-limiting on wrong-passcode attempts — deliberate scope decision, not an oversight.
- Session cookie: `httpOnly`, `secure`, `sameSite=lax`, 90-day `maxAge`.
- Middleware must bypass exactly: `/login`, `/api/auth/login`, and Next.js's own static asset paths (`/_next/*`, favicon) — every other route is gated.
- No per-user accounts, no database changes.

---

## Task 1: Session Signing (`src/lib/session.ts`)

**Files:**
- Create: `src/lib/session.ts`
- Test: `src/lib/__tests__/session.test.ts`

**Interfaces:**
- Produces: `signSession(secret: string, issuedAt?: number): Promise<string>` and `verifySession(cookieValue: string, secret: string, maxAgeMs: number): Promise<boolean>` — Task 2 and Task 4 import both by these exact names.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/__tests__/session.test.ts
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { signSession, verifySession } from '../session'

const SECRET = 'test-session-secret'
const DAY_MS = 24 * 60 * 60 * 1000

describe('signSession / verifySession', () => {
  it('a freshly signed session verifies true', async () => {
    const cookie = await signSession(SECRET)
    expect(await verifySession(cookie, SECRET, 90 * DAY_MS)).toBe(true)
  })

  it('rejects a session signed with a different secret', async () => {
    const cookie = await signSession(SECRET)
    expect(await verifySession(cookie, 'wrong-secret', 90 * DAY_MS)).toBe(false)
  })

  it('rejects a tampered payload', async () => {
    const cookie = await signSession(SECRET)
    const [payload, signature] = cookie.split('.')
    const tampered = `${payload}x.${signature}`
    expect(await verifySession(tampered, SECRET, 90 * DAY_MS)).toBe(false)
  })

  it('rejects a tampered signature', async () => {
    const cookie = await signSession(SECRET)
    const [payload, signature] = cookie.split('.')
    const tampered = `${payload}.${signature}x`
    expect(await verifySession(tampered, SECRET, 90 * DAY_MS)).toBe(false)
  })

  it('rejects an expired session', async () => {
    const oldIssuedAt = Date.now() - 100 * DAY_MS
    const cookie = await signSession(SECRET, oldIssuedAt)
    expect(await verifySession(cookie, SECRET, 90 * DAY_MS)).toBe(false)
  })

  it('rejects a session issued in the future', async () => {
    const futureIssuedAt = Date.now() + DAY_MS
    const cookie = await signSession(SECRET, futureIssuedAt)
    expect(await verifySession(cookie, SECRET, 90 * DAY_MS)).toBe(false)
  })

  it('rejects a malformed cookie value without throwing', async () => {
    expect(await verifySession('not-a-valid-cookie', SECRET, 90 * DAY_MS)).toBe(false)
    expect(await verifySession('', SECRET, 90 * DAY_MS)).toBe(false)
    expect(await verifySession('a.b.c', SECRET, 90 * DAY_MS)).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/session.test.ts`
Expected: FAIL — `../session` has no exports yet.

- [ ] **Step 3: Implement `src/lib/session.ts`**

```ts
const encoder = new TextEncoder()
const decoder = new TextDecoder()

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBytes(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function hmacSign(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
  return bytesToBase64Url(new Uint8Array(signature))
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

export async function signSession(secret: string, issuedAt: number = Date.now()): Promise<string> {
  const payload = JSON.stringify({ issuedAt })
  const payloadB64 = bytesToBase64Url(encoder.encode(payload))
  const signatureB64 = await hmacSign(secret, payloadB64)
  return `${payloadB64}.${signatureB64}`
}

export async function verifySession(cookieValue: string, secret: string, maxAgeMs: number): Promise<boolean> {
  const parts = cookieValue.split('.')
  if (parts.length !== 2) return false
  const [payloadB64, signatureB64] = parts

  const expectedSignatureB64 = await hmacSign(secret, payloadB64)
  if (!constantTimeEqual(signatureB64, expectedSignatureB64)) return false

  let payload: unknown
  try {
    payload = JSON.parse(decoder.decode(base64UrlToBytes(payloadB64)))
  } catch {
    return false
  }
  if (
    typeof payload !== 'object' ||
    payload === null ||
    typeof (payload as { issuedAt?: unknown }).issuedAt !== 'number'
  ) {
    return false
  }

  const age = Date.now() - (payload as { issuedAt: number }).issuedAt
  return age >= 0 && age <= maxAgeMs
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/session.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/session.ts src/lib/__tests__/session.test.ts
git commit -m "feat: add HMAC session signing for shared passcode auth"
```

---

## Task 2: Auth API Routes (Login + Logout)

**Files:**
- Create: `src/app/api/auth/login/route.ts`
- Create: `src/app/api/auth/logout/route.ts`
- Test: `src/app/api/auth/login/__tests__/route.test.ts`
- Test: `src/app/api/auth/logout/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `signSession` from `@/lib/session` (Task 1).
- Produces: `POST /api/auth/login` with body `{ passcode: string }` → `{ ok: true }` (200, sets `familyAuth` cookie) or `{ error: string }` (401 wrong passcode, 500 misconfigured); `POST /api/auth/logout` → `{ ok: true }` (200, clears `familyAuth` cookie). Task 3's login page consumes the login route's exact request/response shape.

- [ ] **Step 1: Write the failing tests**

```ts
// src/app/api/auth/login/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/session', () => ({
  signSession: vi.fn().mockResolvedValue('signed-session-value'),
}))

import { signSession } from '@/lib/session'
import { POST } from '../route'

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  vi.clearAllMocks()
  process.env.FAMILY_PASSCODE = 'correct-horse'
  process.env.SESSION_SECRET = 'test-secret'
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

function jsonRequest(body: unknown) {
  return new NextRequest('http://localhost/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('POST /api/auth/login', () => {
  it('returns 500 when FAMILY_PASSCODE is unset', async () => {
    delete process.env.FAMILY_PASSCODE
    const res = await POST(jsonRequest({ passcode: 'anything' }))
    expect(res.status).toBe(500)
  })

  it('returns 500 when SESSION_SECRET is unset', async () => {
    delete process.env.SESSION_SECRET
    const res = await POST(jsonRequest({ passcode: 'anything' }))
    expect(res.status).toBe(500)
  })

  it('returns 401 on an incorrect passcode', async () => {
    const res = await POST(jsonRequest({ passcode: 'wrong' }))
    expect(res.status).toBe(401)
    expect(signSession).not.toHaveBeenCalled()
  })

  it('sets a session cookie and returns 200 on the correct passcode', async () => {
    const res = await POST(jsonRequest({ passcode: 'correct-horse' }))
    expect(res.status).toBe(200)
    expect(signSession).toHaveBeenCalledWith('test-secret')
    const cookie = res.cookies.get('familyAuth')
    expect(cookie?.value).toBe('signed-session-value')
    expect(cookie?.httpOnly).toBe(true)
  })
})
```

```ts
// src/app/api/auth/logout/__tests__/route.test.ts
import { describe, it, expect } from 'vitest'
import { POST } from '../route'

describe('POST /api/auth/logout', () => {
  it('clears the session cookie', async () => {
    const res = await POST()
    expect(res.status).toBe(200)
    const cookie = res.cookies.get('familyAuth')
    expect(cookie?.value).toBe('')
    expect(cookie?.maxAge).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/api/auth/login/__tests__/route.test.ts src/app/api/auth/logout/__tests__/route.test.ts`
Expected: FAIL — neither route exists yet.

- [ ] **Step 3: Implement `src/app/api/auth/login/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { signSession } from '@/lib/session'

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

export async function POST(req: NextRequest) {
  const passcode = process.env.FAMILY_PASSCODE
  const secret = process.env.SESSION_SECRET
  if (!passcode || !secret) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const body = await req.json()
  const submitted = typeof body.passcode === 'string' ? body.passcode : ''

  if (!constantTimeEqual(submitted, passcode)) {
    return NextResponse.json({ error: 'Incorrect passcode' }, { status: 401 })
  }

  const sessionValue = await signSession(secret)
  const response = NextResponse.json({ ok: true })
  response.cookies.set('familyAuth', sessionValue, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 90 * 24 * 60 * 60,
    path: '/',
  })
  return response
}
```

- [ ] **Step 4: Implement `src/app/api/auth/logout/route.ts`**

```ts
import { NextResponse } from 'next/server'

export async function POST() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set('familyAuth', '', { maxAge: 0, path: '/' })
  return response
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/app/api/auth/login/__tests__/route.test.ts src/app/api/auth/logout/__tests__/route.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add src/app/api/auth/login/route.ts src/app/api/auth/logout/route.ts src/app/api/auth/login/__tests__/route.test.ts src/app/api/auth/logout/__tests__/route.test.ts
git commit -m "feat: add login/logout API routes for shared passcode auth"
```

---

## Task 3: Login Page

**Files:**
- Create: `src/app/login/page.tsx`
- Test: `src/app/login/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: `POST /api/auth/login` (Task 2) with body `{ passcode: string }`, response `{ ok: true }` or `{ error: string }`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/app/login/__tests__/page.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import LoginPage from '../page'

const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams('next=/settings'),
}))

describe('LoginPage', () => {
  beforeEach(() => {
    pushMock.mockClear()
  })

  it('shows an error on an incorrect passcode and does not navigate', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Incorrect passcode' }),
    }) as unknown as typeof fetch

    render(<LoginPage />)
    fireEvent.change(screen.getByLabelText(/Family Passcode/i), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enter' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect passcode')
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('navigates to the next param on a correct passcode', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    }) as unknown as typeof fetch

    render(<LoginPage />)
    fireEvent.change(screen.getByLabelText(/Family Passcode/i), { target: { value: 'right' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enter' }))

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/settings'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/login/__tests__/page.test.tsx`
Expected: FAIL — `../page` does not exist.

- [ ] **Step 3: Implement `src/app/login/page.tsx`**

Note: `useSearchParams` requires a `<Suspense>` boundary around the component that calls it, or `next build` fails with "should be wrapped in a suspense boundary." Structure it that way from the start.

```tsx
'use client'
import { Suspense, useState, type FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [passcode, setPasscode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode }),
    })
    if (res.ok) {
      router.push(searchParams.get('next') || '/')
    } else {
      const data = await res.json()
      setError(data.error || 'Incorrect passcode')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label>
        Family Passcode
        <input
          type="password"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
        />
      </label>
      <button type="submit" disabled={submitting}>Enter</button>
      {error && <p role="alert">{error}</p>}
    </form>
  )
}

export default function LoginPage() {
  return (
    <main>
      <h1>Film Curator</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <LoginForm />
      </Suspense>
    </main>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/login/__tests__/page.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/login/page.tsx src/app/login/__tests__/page.test.tsx
git commit -m "feat: add login page for shared passcode auth"
```

---

## Task 4: Middleware, Env Vars, and End-to-End Verification

**Files:**
- Create: `src/middleware.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `verifySession` from `@/lib/session` (Task 1).
- Produces: the actual request-level gate — every other task's routes/pages are reached only after this passes.

- [ ] **Step 1: Add `FAMILY_PASSCODE` and `SESSION_SECRET` to `.env.example`**

```
DATABASE_URL="postgres://user:password@host:5432/dbname"
TMDB_API_KEY=""
ANTHROPIC_API_KEY=""
CRON_SECRET=""
FAMILY_PASSCODE=""
SESSION_SECRET=""
```

- [ ] **Step 2: Implement `src/middleware.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/session'

const SESSION_COOKIE = 'familyAuth'
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (
    pathname === '/login' ||
    pathname === '/api/auth/login' ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next()
  }

  const cookie = req.cookies.get(SESSION_COOKIE)?.value
  const secret = process.env.SESSION_SECRET

  if (!cookie || !secret || !(await verifySession(cookie, secret, MAX_AGE_MS))) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including every test from Tasks 1-3 and every pre-existing test in the project.

- [ ] **Step 4: Manual end-to-end verification**

Add `FAMILY_PASSCODE=test-passcode-123` and `SESSION_SECRET=$(openssl rand -hex 32 | tr -d '\n')` to your local `.env` (do not commit `.env`), then:

Run: `npm run dev`
- Visit `http://localhost:3000/` in a browser with no cookies — expect a redirect to `http://localhost:3000/login?next=%2F`.
- Enter the wrong passcode — expect an "Incorrect passcode" message, still on the login page.
- Enter `test-passcode-123` — expect navigation to `/` and the dashboard to load.
- Reload `/` — expect it to load directly without redirecting back to `/login` (the cookie persists).

Stop the dev server once verified.

- [ ] **Step 5: Commit**

```bash
git add src/middleware.ts .env.example
git commit -m "feat: add middleware gating every route behind the shared passcode"
```

---
