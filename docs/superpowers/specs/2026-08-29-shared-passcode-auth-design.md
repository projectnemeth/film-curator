# Shared Family Passcode — Design Spec

Date: 2026-08-29

## Purpose

Film Curator is now deployed at a public Vercel URL. Anyone who obtains that
URL can currently view recommendations and — more importantly — change
content-filter thresholds or add overrides via the settings page, with no
authentication at all. This spec adds a single shared passcode gate across
the whole app: enough to keep strangers out, without building real per-user
identity (explicitly out of scope — the family shares one taste profile and
one set of filters already, so per-person accounts would solve a problem
this household doesn't have).

## Scope

- Gate every route behind one shared secret.
- No database changes, no per-user sessions, no user table.
- Session persists across visits (long-lived) so the family doesn't
  re-enter the passcode often.

## Architecture

- **`FAMILY_PASSCODE`** (secret env var) — the passcode the family types in.
- **`SESSION_SECRET`** (secret env var, separate from the passcode) — used
  only to sign session cookies. Kept separate so the passcode can be
  rotated without invalidating every existing session, and so
  `SESSION_SECRET` can be rotated independently to force-invalidate every
  session immediately (e.g. if the passcode leaks) without changing what
  the family types in.
- **`src/lib/session.ts`** — two pure functions, unit-testable without any
  Next.js request/response objects:
  - `signSession(secret: string, issuedAt?: number): string` — builds a
    payload (`{ issuedAt }`), HMAC-SHA256-signs it with `SESSION_SECRET`
    using the Web Crypto API (`crypto.subtle`, available in both Node and
    Edge runtimes — no new dependency), and returns
    `base64(payload).base64(signature)`.
  - `verifySession(cookieValue: string, secret: string, maxAgeMs: number): boolean`
    — recomputes the expected signature for the payload half, compares it
    to the signature half in constant time, and additionally checks
    `issuedAt` is within `maxAgeMs` of now. Returns `false` on any
    malformed input rather than throwing.
- **`src/middleware.ts`** — Next.js Edge Middleware. Runs on every request
  except `/login`, `/api/auth/login`, and Next.js's own static asset paths
  (`/_next/*`, favicon). Reads the session cookie; if missing or
  `verifySession` returns `false`, redirects to
  `/login?next=<original path>`. This is the only place request-level
  gating happens — individual pages and API routes don't need their own
  auth checks.
- **`src/app/login/page.tsx`** — a single passcode input and a submit
  button. On submit, `POST`s to `/api/auth/login` with the passcode and the
  `next` query param; on success the browser is redirected (the API route
  issues the redirect after setting the cookie); on failure, shows
  "Incorrect passcode."
- **`src/app/api/auth/login/route.ts`** — `POST` only. Reads
  `FAMILY_PASSCODE` and `SESSION_SECRET` from the environment; if either is
  unset, returns 500 (fail closed — never treat a missing secret as "allow
  everyone"). Compares the submitted passcode to `FAMILY_PASSCODE` in
  constant time. On match: calls `signSession`, sets the result as an
  `httpOnly`, `secure`, `sameSite=lax` cookie with a 90-day `maxAge`, and
  redirects to `next` (defaulting to `/`). On mismatch: returns 401 with an
  error the login page displays. No lockout or rate-limiting — this gate
  keeps casual strangers out, it isn't guarding a high-value target, and
  added complexity here isn't worth it for a five-person household.
- **`src/app/api/auth/logout/route.ts`** — `POST` only, clears the cookie,
  redirects to `/login`. Small and cheap enough to include even though
  it's not the primary use case (a family sharing one passcode rarely
  needs to log out).

## Data flow

1. Request arrives at middleware for any path other than the login
   page/API/static assets.
2. Middleware reads the session cookie. No cookie, or `verifySession`
   returns `false` → redirect to `/login?next=<path>`.
3. Valid cookie → request proceeds untouched; every existing route
   (dashboard, `/rate`, `/settings`, all `/api/*` routes) is reached
   exactly as it is today, with no changes to any of that code.
4. On the login page, submitting the correct passcode gets a signed cookie
   and a redirect back to wherever the user was headed.

## Error handling

- Wrong passcode: generic "Incorrect passcode" message, no attempt
  counting.
- Missing `FAMILY_PASSCODE` or `SESSION_SECRET` at runtime: the login route
  returns 500 rather than silently accepting any input — a misconfigured
  deployment should be loudly broken, not silently open.
- Tampered or expired cookie: `verifySession` returns `false`, treated
  identically to "no cookie" — redirect to login. No distinction is drawn
  between "never logged in" and "session expired" in the UI; both just
  land back on the login page.

## Testing

- `signSession`/`verifySession` are pure functions — unit tests cover: a
  freshly signed session verifies true; a tampered payload (one byte
  changed) verifies false; a tampered signature verifies false; a session
  older than `maxAgeMs` verifies false; a malformed cookie value (wrong
  format, not base64, etc.) verifies false without throwing.
- `/api/auth/login`: unit tests with `FAMILY_PASSCODE`/`SESSION_SECRET` set
  via `process.env` — correct passcode sets a cookie and redirects; wrong
  passcode returns 401 and sets no cookie; missing env vars return 500.
- `/api/auth/logout`: unit test confirms the cookie is cleared.
- Middleware itself is a thin wrapper around `verifySession` and is not
  unit-tested directly (Next.js middleware is awkward to unit test in
  isolation) — its correctness rests on `verifySession`'s test coverage
  plus a manual check during implementation that an unauthenticated
  request to `/` actually redirects to `/login` in a real dev server.

## Explicitly out of scope

- Per-person accounts or identity (deferred indefinitely — no active need).
- Rate limiting / lockout on repeated wrong passcodes.
- Password reset flows (there's one passcode; rotating it is an env var
  change).
- Any authentication on the `/api/ingest` cron route — it already has its
  own, unrelated `CRON_SECRET` bearer-token gate from the MVP build, which
  this spec does not change.
