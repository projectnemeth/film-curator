# Visual Redesign (Wave D + Wave E) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the confirmed "Modern Cinema" dark/gold visual identity across every page of the film-curator app via Tailwind CSS, and add the confirmed explanatory copy to the login page — with zero change to any page's functional behavior.

**Architecture:** Add Tailwind CSS as the app's first styling infrastructure (currently there is none — every page is bare unstyled JSX), configure the confirmed design tokens as Tailwind theme colors, load three Google Fonts via `next/font/google`, then restyle each page's existing JSX in place, preserving every accessible name, role, and text pattern the existing test suite already asserts on.

**Tech Stack:** Tailwind CSS 3, `next/font/google` (Bebas Neue, Inter, IBM Plex Mono) — no other new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-29-visual-redesign-design.md`

## Global Constraints

- Design tokens (exact hex values, from the spec): `bg` #14151A, `surface` #1D1F29, `border` #2A2C38, `accent` #E5A34A, `accentGlow` #F2C078, `danger` #C7443A, `textPrimary` #F2F2F2, `textSecondary` #7A7F94.
- Bebas Neue is a display face used ONLY for page titles, section labels, and rating badges — never for body copy or multi-word buttons.
- IBM Plex Mono is used ONLY for the numeric threshold values on the Settings page.
- No functional behavior changes anywhere — every existing accessible name (button text, `aria-label`, `role`), every text pattern an existing test asserts on (`getByText`/`findByText` regexes, `getByLabelText`, `getByDisplayValue`), and every `aria-pressed`/`role="alert"`/`role="group"` attribute must be preserved exactly. This is a styling-only pass.
- No dark/light mode toggle, no motion/animation system beyond ordinary CSS transitions on hover/focus.
- The login page's added copy is exact, from the spec — do not paraphrase it.

---

## Task 1: Tailwind Setup, Fonts, and Nav Restyle

**Files:**
- Create: `tailwind.config.ts`
- Create: `postcss.config.js`
- Create: `src/app/globals.css`
- Modify: `package.json`
- Modify: `src/app/layout.tsx`
- Modify: `src/components/Nav.tsx`

**Interfaces:**
- Produces: Tailwind theme colors (`bg`, `surface`, `border`, `accent`, `accentGlow`, `danger`, `textPrimary`, `textSecondary`) and font families (`font-display`, `font-body`, `font-mono` via CSS variables `--font-bebas`/`--font-inter`/`--font-mono`) that every later task's `className` strings reference by these exact names.

- [ ] **Step 1: Add Tailwind dependencies to `package.json`**

Add to the existing `devDependencies` object (keep every existing entry unchanged):

```json
"autoprefixer": "^10.4.0",
"postcss": "^8.4.0",
"tailwindcss": "^3.4.0",
```

- [ ] **Step 2: Create `tailwind.config.ts`**

```ts
import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        bg: '#14151A',
        surface: '#1D1F29',
        border: '#2A2C38',
        accent: '#E5A34A',
        accentGlow: '#F2C078',
        danger: '#C7443A',
        textPrimary: '#F2F2F2',
        textSecondary: '#7A7F94',
      },
      fontFamily: {
        display: ['var(--font-bebas)'],
        body: ['var(--font-inter)'],
        mono: ['var(--font-mono)'],
      },
    },
  },
  plugins: [],
}

export default config
```

- [ ] **Step 3: Create `postcss.config.js`**

```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 4: Create `src/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  background-color: #14151A;
  color: #F2F2F2;
}
```

- [ ] **Step 5: Modify `src/app/layout.tsx`** to load the fonts and import the stylesheet

```tsx
import { Bebas_Neue, Inter, IBM_Plex_Mono } from 'next/font/google'
import { Nav } from '@/components/Nav'
import './globals.css'

const bebasNeue = Bebas_Neue({ weight: '400', subsets: ['latin'], variable: '--font-bebas' })
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const plexMono = IBM_Plex_Mono({ weight: ['400', '500'], subsets: ['latin'], variable: '--font-mono' })

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bebasNeue.variable} ${inter.variable} ${plexMono.variable}`}>
      <body className="font-body bg-bg text-textPrimary min-h-screen">
        <Nav />
        {children}
      </body>
    </html>
  )
}
```

- [ ] **Step 6: Modify `src/components/Nav.tsx`** to restyle (same links, same hide-on-`/login` logic — do not change the component's logic, only its `className`s)

```tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function Nav() {
  const pathname = usePathname()
  if (pathname === '/login') return null

  return (
    <nav className="flex gap-6 items-center px-6 py-4 border-b border-border bg-surface">
      <Link href="/" className="text-sm font-medium text-textPrimary hover:text-accent transition-colors">
        Dashboard
      </Link>
      <Link href="/rate" className="text-sm font-medium text-textPrimary hover:text-accent transition-colors">
        Rate More Movies
      </Link>
      <Link href="/settings" className="text-sm font-medium text-textPrimary hover:text-accent transition-colors">
        Settings
      </Link>
    </nav>
  )
}
```

- [ ] **Step 7: Install dependencies and run the full test suite**

Run: `npm install && npm test`
Expected: all existing tests pass unchanged, including `src/components/__tests__/Nav.test.tsx` (the hide-on-`/login` and shows-elsewhere tests query by `container.querySelector('nav')` and link text, both unaffected by the new `className`s).

- [ ] **Step 8: Run the production build**

Run: `npm run build`
Expected: compiles successfully — this confirms Tailwind's PostCSS pipeline and the Google Fonts loader both work correctly.

- [ ] **Step 9: Commit**

```bash
git add package.json tailwind.config.ts postcss.config.js src/app/globals.css src/app/layout.tsx src/components/Nav.tsx
git commit -m "feat: add Tailwind CSS, fonts, and restyle nav for the Modern Cinema redesign"
```

---

## Task 2: Login Page — Copy and Restyle

**Files:**
- Modify: `src/app/login/page.tsx`

**Interfaces:**
- No change to `POST /api/auth/login`'s request/response shape — this task only changes JSX/`className`s and adds static copy above the existing form.

- [ ] **Step 1: Replace `src/app/login/page.tsx`**

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
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full max-w-sm">
      <label className="flex flex-col gap-2 text-sm text-textSecondary">
        Family Passcode
        <input
          type="password"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          className="bg-surface border border-border rounded px-3 py-2 text-textPrimary focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </label>
      <button
        type="submit"
        disabled={submitting}
        className="bg-accent text-bg font-medium rounded px-4 py-2 hover:bg-accentGlow transition-colors disabled:opacity-50"
      >
        Enter
      </button>
      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
    </form>
  )
}

export default function LoginPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 px-6 bg-bg">
      <div className="max-w-md text-center">
        <h1 className="font-display text-4xl tracking-wide text-accent mb-4">
          Tonight&apos;s movie, already figured out.
        </h1>
        <p className="text-textSecondary text-sm leading-relaxed">
          Film Curator searches Netflix, Disney+, Prime Video, and Peacock for what&apos;s
          actually available, filters it against content you&apos;re comfortable with, and
          ranks it by your family&apos;s taste. It&apos;s a private app for one family — this one.
        </p>
      </div>
      <Suspense fallback={<p className="text-textSecondary">Loading...</p>}>
        <LoginForm />
      </Suspense>
    </main>
  )
}
```

- [ ] **Step 2: Run the login page's existing tests**

Run: `npx vitest run src/app/login/__tests__/page.test.tsx`
Expected: PASS (2/2) — the tests query by `getByLabelText(/Family Passcode/i)` and `getByRole('button', { name: 'Enter' })`, both unchanged.

- [ ] **Step 3: Run the full test suite and build**

Run: `npm test && npm run build`
Expected: all tests pass, build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/login/page.tsx
git commit -m "feat: add explanatory copy and restyle the login page"
```

---

## Task 3: Dashboard Restyle (Poster Grid)

**Files:**
- Modify: `src/app/page.tsx`

**Interfaces:**
- No change to `GET /api/recommendations` or `POST /api/taste` usage — this task only changes JSX/`className`s and the grid layout.

- [ ] **Step 1: Replace `src/app/page.tsx`**

```tsx
'use client'
import { useEffect, useState } from 'react'

type Title = {
  id: string
  name: string
  year: number | null
  filterReason: string
  providers: string[]
  posterPath: string | null
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

  useEffect(() => {
    setLoading(true)
    fetch(`/api/recommendations?mode=${mode}`)
      .then((res) => res.json())
      .then((data) => setTitles(data.titles))
      .finally(() => setLoading(false))
  }, [mode])

  async function submitRating(titleId: string, rating: string) {
    await fetch('/api/taste', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titleId, rating }),
    })
    setRated((prev) => ({ ...prev, [titleId]: rating }))
    setExpanded((prev) => ({ ...prev, [titleId]: false }))
  }

  return (
    <main className="max-w-6xl mx-auto px-6 py-8">
      <h1 className="font-display text-3xl tracking-wide text-textPrimary mb-6">Film Curator</h1>
      <div role="group" aria-label="mode toggle" className="inline-flex bg-surface border border-border rounded-full p-1 mb-8">
        <button
          aria-pressed={mode === 'FAMILY'}
          onClick={() => setMode('FAMILY')}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
            mode === 'FAMILY' ? 'bg-accent text-bg' : 'text-textSecondary'
          }`}
        >
          Family Mode
        </button>
        <button
          aria-pressed={mode === 'ADULT'}
          onClick={() => setMode('ADULT')}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
            mode === 'ADULT' ? 'bg-accent text-bg' : 'text-textSecondary'
          }`}
        >
          Adult Mode
        </button>
      </div>
      {loading ? (
        <p className="text-textSecondary">Loading...</p>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6 list-none p-0">
          {titles.map((title) => (
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
                {title.filterReason === 'unscored' && (
                  <span className="font-display text-xs tracking-wide text-accent">not yet rated</span>
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
                    <button
                      onClick={() => setExpanded((prev) => ({ ...prev, [title.id]: true }))}
                      className="text-xs text-textSecondary underline hover:text-accent transition-colors"
                    >
                      I&apos;ve seen this
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
```

- [ ] **Step 2: Run the dashboard's existing tests**

Run: `npx vitest run src/app/__tests__/page.test.tsx`
Expected: PASS (all cases — mode toggle names, poster alt text, "availability unknown", "not yet rated", the two-step quick-rate flow and its "I've seen this"/rating-label buttons, and the "Rated: LIKED" confirmation text are all preserved verbatim).

- [ ] **Step 3: Run the full test suite and build**

Run: `npm test && npm run build`
Expected: all tests pass, build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: restyle dashboard as a poster grid"
```

---

## Task 4: Rate Page Restyle

**Files:**
- Modify: `src/app/rate/page.tsx`

**Interfaces:**
- No change to `GET`/`POST /api/taste` usage.

- [ ] **Step 1: Replace `src/app/rate/page.tsx`**

```tsx
'use client'
import { useEffect, useState } from 'react'

type Title = { id: string; name: string; year: number | null; overview: string | null; posterPath: string | null }

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

  if (!checked) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-bg">
        <p className="text-textSecondary">Loading...</p>
      </main>
    )
  }
  if (!title) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-bg">
        <p className="text-textSecondary">No more titles to rate right now.</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 px-6 py-8 bg-bg">
      <h1 className="font-display text-2xl tracking-wide text-textPrimary">Rate More Movies</h1>
      <div className="bg-surface border border-border rounded-lg overflow-hidden max-w-sm w-full flex flex-col items-center p-6 gap-4">
        {title.posterPath ? (
          <img
            src={`https://image.tmdb.org/t/p/w200${title.posterPath}`}
            alt={`${title.name} poster`}
            width={160}
            height={240}
            className="rounded aspect-[2/3] object-cover"
          />
        ) : (
          <div className="w-40 aspect-[2/3] bg-border rounded" aria-hidden="true" />
        )}
        <h2 className="text-lg font-medium text-textPrimary text-center">
          {title.name} {title.year ? `(${title.year})` : ''}
        </h2>
        <p className="text-sm text-textSecondary text-center">{title.overview}</p>
        <div className="flex flex-wrap justify-center gap-2">
          {RATINGS.map((r) => (
            <button
              key={r.value}
              onClick={() => rate(r.value)}
              className="text-sm border border-accent text-accent rounded px-3 py-1.5 hover:bg-accent hover:text-bg transition-colors"
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Run the rate page's existing tests**

Run: `npx vitest run src/app/rate/__tests__/page.test.tsx`
Expected: PASS (title display, poster rendering, and the rate-then-load-next flow all preserved).

- [ ] **Step 3: Run the full test suite and build**

Run: `npm test && npm run build`
Expected: all tests pass, build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/rate/page.tsx
git commit -m "feat: restyle the rate page"
```

---

## Task 5: Settings Page Restyle (Two-Column, Mono Data)

**Files:**
- Modify: `src/app/settings/page.tsx`

**Interfaces:**
- No change to `GET`/`PUT /api/mode-settings` or `GET`/`POST /api/overrides` usage.

- [ ] **Step 1: Replace `src/app/settings/page.tsx`**

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
            <span className="text-sm text-textPrimary">
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
          className="bg-surface border border-border rounded px-3 py-1.5 text-sm text-textPrimary"
        />
        <select
          value={decision}
          onChange={(e) => setDecision(e.target.value as 'APPROVED' | 'REJECTED')}
          className="bg-surface border border-border rounded px-3 py-1.5 text-sm text-textPrimary"
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
      body: JSON.stringify({ ...settings, mode }),
    })
  }

  if (!settings) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-bg">
        <p className="text-textSecondary">Loading...</p>
      </main>
    )
  }

  return (
    <main className="max-w-4xl mx-auto px-6 py-8">
      <h1 className="font-display text-3xl tracking-wide text-textPrimary mb-6">Content Filter Settings</h1>
      <div role="group" aria-label="mode toggle" className="inline-flex bg-surface border border-border rounded-full p-1 mb-8">
        <button
          aria-pressed={mode === 'FAMILY'}
          onClick={() => setMode('FAMILY')}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
            mode === 'FAMILY' ? 'bg-accent text-bg' : 'text-textSecondary'
          }`}
        >
          Family Mode
        </button>
        <button
          aria-pressed={mode === 'ADULT'}
          onClick={() => setMode('ADULT')}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
            mode === 'ADULT' ? 'bg-accent text-bg' : 'text-textSecondary'
          }`}
        >
          Adult Mode
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="flex flex-col gap-4">
          {(['maxViolence', 'maxLanguage', 'maxSexNudity', 'maxScariness'] as const).map((field) => (
            <label key={field} className="flex items-center justify-between gap-4 text-sm text-textSecondary">
              {field}
              <input
                type="number"
                value={settings[field]}
                onChange={(e) => setSettings({ ...settings, [field]: Number(e.target.value) })}
                className="font-mono bg-surface border border-border rounded px-3 py-1.5 w-20 text-textPrimary"
              />
            </label>
          ))}
          <button
            onClick={save}
            className="self-start bg-accent text-bg text-sm font-medium rounded px-4 py-2 hover:bg-accentGlow transition-colors"
          >
            Save
          </button>
        </div>
        <section>
          <h2 className="font-display text-xl tracking-wide text-textPrimary mb-4">Overrides</h2>
          <OverridesManager />
        </section>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Run the settings page's existing tests**

Run: `npx vitest run src/app/settings/__tests__/page.test.tsx`
Expected: PASS — `findByDisplayValue('4')` and `getByText(/Jurassic Park: APPROVED/)` both still match.

- [ ] **Step 3: Run the full test suite and build**

Run: `npm test && npm run build`
Expected: all tests pass, build succeeds.

- [ ] **Step 4: Manual visual spot-check**

Run: `npm run dev`, visit `http://localhost:3000/login`, `http://localhost:3000/` (after logging in with your local `.env`'s `FAMILY_PASSCODE`), `/rate`, and `/settings`. Confirm: dark background with gold accents render, Bebas Neue renders on headings/badges (visibly different, condensed, all-caps-style display face — not falling back to a generic sans-serif), the settings page's threshold numbers render in a monospace face, and the nav bar is absent on `/login` but present elsewhere. Stop the dev server once verified.

- [ ] **Step 5: Commit**

```bash
git add src/app/settings/page.tsx
git commit -m "feat: restyle settings page with two-column layout and mono data face"
```

---
