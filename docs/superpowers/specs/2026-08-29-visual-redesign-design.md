# Visual Redesign (Wave D + Wave E) — Design Spec

Date: 2026-08-29

## Purpose

The app was built functionality-first with zero styling — bare unstyled
HTML across every page. This spec applies a real visual identity across the
whole app, and folds in Wave E (enriching the login page with an explanation
of what the app does, since right now an unauthenticated visitor sees a bare
passcode box with no context).

Design direction was established through a visual brainstorming session
(mockup comparisons for overall mood, accent color, dashboard layout, and
the mode toggle's treatment) — this spec records the outcome, not a fresh
exploration.

## Subject and audience

A private, single-family movie-night tool. Two adults use it directly;
its whole purpose is curating what's safe and appealing for their three
kids (ages 2–10). The visual language draws from cinema — but a boutique
film distributor's sensibility (Criterion, MUBI: dark, poster-forward,
confident restrained type) rather than a movie-theater-marquee pastiche.
That distinction was reached directly through user feedback: an earlier
marquee-sign treatment for the Family/Adult mode toggle (the app's single
most safety-critical, most-used control) was rejected in favor of a plain,
quiet pill toggle — restraint on functional controls, personality carried
by typography and poster art instead.

## Design tokens

**Color:**
- `--bg`: `#14151A` (page background)
- `--surface`: `#1D1F29` (cards, panels)
- `--border`: `#2A2C38`
- `--accent`: `#E5A34A` (gold — badges, active states, primary actions)
- `--accent-glow`: `#F2C078` (hover/focus states on accent elements)
- `--danger`: `#D65A50` (rejected overrides, "too inappropriate" rating, form
  errors — revised from the original `#C7443A` after a post-implementation
  accessibility review found the original failed WCAG AA contrast (3.75:1)
  against `--bg`; this value passes at 4.72:1)
- `--text-primary`: `#F2F2F2`
- `--text-secondary`: `#8B8FA5` (revised from the original `#7A7F94` after the
  same review found it failed AA contrast (4.13:1) against `--surface`; this
  value passes at 5.13:1 on `--surface` and 5.70:1 on `--bg`)

**Type:**
- Display: Bebas Neue — used sparingly, for page titles, section labels, and
  content-status chips (e.g. "not yet rated") only. Never for body copy,
  buttons, or the Family/Adult mode toggle itself — the toggle's own labels
  stay in the body face (Inter), consistent with the "plain, quiet toggle"
  decision below; "FAMILY"/"ADULT" as a display-face badge refers only to a
  future per-title content-rating badge, not the toggle control.
- Body/UI: Inter — everything else (labels, buttons, form fields, list text).
- Data/mono: a monospace face (e.g. IBM Plex Mono) for the numeric threshold
  values on the Settings page only — gives that page a deliberately more
  precise, "control panel" feel that's distinct from the browsing pages.
- Loaded via `next/font/google` (no external `<link>` tags, no CDN — this is
  a real Next.js app, not a sandboxed artifact).

**Signature/personality:** confident, restrained typography plus poster art
carrying the visual weight — not a decorative widget. The mode toggle,
buttons, and form controls stay plain and quiet by deliberate choice; the
one place gold does more than function as a plain accent color is the
content-rating badge (FAMILY/ADULT chips, using the display face), since
that badge is the one UI element that's actually about the app's core
value (a title has been vetted).

## Page treatments

- **Dashboard** (`src/app/page.tsx`): poster grid (confirmed layout choice
  over a detail-row alternative), plain pill mode toggle, poster cards with
  a gold rating badge and the existing two-step "I've seen this" quick-rate
  flow restyled to match but functionally unchanged.
- **Rate page** (`src/app/rate/page.tsx`): a single large centered card, one
  title at a time — the existing one-at-a-time flow, restyled.
- **Settings page** (`src/app/settings/page.tsx`): two-column layout —
  per-category threshold controls (using the mono data face for the numeric
  values) on one side, the overrides list on the other.
- **Nav** (`src/components/Nav.tsx`): quiet, already hides on `/login`
  (existing behavior, unchanged) — just restyled to match the palette.
- **Login page** (`src/app/login/page.tsx`, Wave E content + Wave D style):
  add a short explanation above the passcode form. Exact copy:

  > **Tonight's movie, already figured out.**
  >
  > Film Curator searches Netflix, Disney+, Prime Video, and Peacock for
  > what's actually available, filters it against content you're
  > comfortable with, and ranks it by your family's taste. It's a private
  > app for one family — this one.

  No separate public route is introduced — this content lives on the
  existing `/login` page, above the existing passcode form, matching the
  decision recorded when Wave E was scoped (a second public front door
  would be confusing, not helpful).

## Tailwind setup

No styling infrastructure exists yet. Add Tailwind CSS (the standard
Next.js App Router integration: `tailwind.config.ts`, `postcss.config.js`,
a global stylesheet imported once in `src/app/layout.tsx`), with the design
tokens above configured as Tailwind theme colors (`bg`, `surface`, `border`,
`accent`, `accentGlow`, `danger`, `textPrimary`, `textSecondary`) rather than
hardcoded hex values scattered through component files.

## Explicitly out of scope

- No dark/light mode toggle — the app is dark-themed only, by design
  choice, not an oversight.
- No animation/motion system beyond ordinary CSS transitions on
  hover/focus states — the "boutique, restrained" direction argues against
  an orchestrated motion sequence.
- No changes to any page's functional behavior, data flow, or API calls —
  this is styling and the login page's added copy only.
