'use client'
import { useState, useEffect } from 'react'
import { ModeToggle } from '@/components/ModeToggle'
import { SectionNav } from '@/components/SectionNav'

type ContentScore = { violence: number; language: number; sexNudity: number; scariness: number; sourceNotes: string | null } | null

type Title = {
  id: string
  name: string
  year: number | null
  providers: string[]
  posterPath: string | null
  mpaaRating: string | null
  contentScore: ContentScore
  overview?: string | null
  director?: string | null
  writer?: string | null
  topCast?: string[]
  studio?: string | null
  tasteRating?: string | null
}

// One button vocabulary for every card action. All weights share the 44px
// target and the same radius; only how loudly they read changes. The point
// of giving each one a visible surface is that the tap area then IS the
// button — as bare text links, the 44px target rendered as dead space
// around a few small words.
const BTN_BASE =
  'min-h-[44px] inline-flex items-center justify-center rounded-md px-3 text-xs font-medium transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface'
const BTN_PRIMARY = `${BTN_BASE} w-full bg-accent text-bg hover:bg-accentGlow`
const BTN_SECONDARY = `${BTN_BASE} w-full border border-accent text-accent hover:bg-accent hover:text-bg`
const BTN_QUIET = `${BTN_BASE} w-full border border-border text-textSecondary hover:border-danger hover:text-danger`
// The mode move is a different kind of action from rating a film — a
// filing decision, used rarely — so it sits under a rule and stays quiet.
const BTN_UTILITY = `${BTN_BASE} w-full border border-transparent text-textSecondary hover:text-accent`
// Quick ratings share one row. min-w-0 is load-bearing: flex items default
// to min-width:auto, which refuses to shrink below the label's own width and
// pushed "Loved" outside the card on a ~164px-wide column. Tighter padding
// and a slightly smaller label buy the rest of the room.
const BTN_RATING =
  `${BTN_BASE} flex-1 min-w-0 !px-1 text-[11px] border border-accent text-accent hover:bg-accent hover:text-bg`

const QUICK_RATINGS = [
  { value: 'DISLIKED', label: 'Disliked' },
  { value: 'LIKED', label: 'Liked' },
  { value: 'LOVED', label: 'Loved' },
]

export default function HomePage() {
  const [mode, setMode] = useState<'FAMILY' | 'ADULT'>('FAMILY')
  const [notSeen, setNotSeen] = useState<Title[]>([])
  const [watchlist, setWatchlist] = useState<Title[]>([])
  const [loved, setLoved] = useState<Title[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [rateError, setRateError] = useState<Record<string, boolean>>({})
  const [moveError, setMoveError] = useState<Record<string, boolean>>({})

  async function load(currentMode: 'FAMILY' | 'ADULT') {
    setLoading(true)
    setLoadError(false)
    try {
      const res = await fetch(`/api/recommendations?mode=${currentMode}`)
      if (res.status === 401) {
        window.location.href = '/login'
        return
      }
      if (!res.ok) throw new Error('failed to load recommendations')
      const data = await res.json()
      setNotSeen(data.notSeen)
      setWatchlist(data.watchlist)
      setLoved(data.loved)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(mode)
  }, [mode])

  async function submitRating(titleId: string, rating: string) {
    setRateError((prev) => ({ ...prev, [titleId]: false }))
    try {
      const res = await fetch('/api/taste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titleId, rating, mode }),
      })
      if (!res.ok) throw new Error('failed to save rating')
      const ratedTitle =
        notSeen.find((t) => t.id === titleId) ?? watchlist.find((t) => t.id === titleId) ?? loved.find((t) => t.id === titleId)
      setNotSeen((prev) => prev.filter((t) => t.id !== titleId))
      setWatchlist((prev) => prev.filter((t) => t.id !== titleId))
      setLoved((prev) => prev.filter((t) => t.id !== titleId))
      if (ratedTitle) {
        if (rating === 'LOVED') setLoved((prev) => [{ ...ratedTitle, tasteRating: 'LOVED' }, ...prev])
        if (rating === 'WATCHLISTED') setWatchlist((prev) => [{ ...ratedTitle, tasteRating: 'WATCHLISTED' }, ...prev])
        if (rating === 'NOT_SEEN') setNotSeen((prev) => [{ ...ratedTitle, tasteRating: 'NOT_SEEN' }, ...prev])
      }
      setExpanded((prev) => ({ ...prev, [titleId]: false }))
    } catch {
      setRateError((prev) => ({ ...prev, [titleId]: true }))
    }
  }

  // Moves a title into the other mode. A PG film can be fine for the kids to
  // watch and still be one they'd hate; this takes it out of their list
  // without touching the exclusion rule. The server carries any taste rating
  // across, so nothing is lost by moving a film you've already rated.
  async function submitMove(titleId: string) {
    const target = mode === 'FAMILY' ? 'ADULT' : 'FAMILY'
    setMoveError((prev) => ({ ...prev, [titleId]: false }))
    try {
      const res = await fetch('/api/title-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titleId, mode: target }),
      })
      if (!res.ok) throw new Error('failed to move title')
      // It belongs to the other mode now, so it leaves every list here.
      setNotSeen((prev) => prev.filter((t) => t.id !== titleId))
      setWatchlist((prev) => prev.filter((t) => t.id !== titleId))
      setLoved((prev) => prev.filter((t) => t.id !== titleId))
    } catch {
      setMoveError((prev) => ({ ...prev, [titleId]: true }))
    }
  }

  function renderCard(title: Title, variant: 'notSeen' | 'watchlist' | 'loved') {
    const score = title.contentScore
    return (
      <li key={title.id} className="bg-surface border border-border rounded-lg overflow-hidden flex flex-col">
        {title.posterPath ? (
          <img
            src={`https://image.tmdb.org/t/p/w200${title.posterPath}`}
            alt={`${title.name} poster`}
            width={200}
            height={300}
            loading="lazy"
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
          {title.overview && <p className="text-xs text-textSecondary">{title.overview}</p>}
          {title.director && <p className="text-xs text-textSecondary">Directed by {title.director}</p>}
          {title.writer && <p className="text-xs text-textSecondary">Written by {title.writer}</p>}
          {title.topCast && title.topCast.length > 0 && (
            <p className="text-xs text-textSecondary">Starring {title.topCast.join(', ')}</p>
          )}
          {title.studio && <p className="text-xs text-textSecondary">{title.studio}</p>}

          {/* Scores are written during the catalog refresh, never generated
              on demand — so a missing one is a note, not an action. */}
          {mode === 'ADULT' && title.mpaaRating && !score && (
            <p className="text-xs text-textSecondary italic">Content details are added during the catalog refresh.</p>
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

          <div className="mt-auto pt-2 flex flex-col gap-1.5">
            {variant === 'notSeen' &&
              (expanded[title.id] ? (
                <>
                  {rateError[title.id] && (
                    <p className="text-xs text-danger">Couldn&apos;t save that rating — try again.</p>
                  )}
                  <div className="flex gap-1.5">
                    {QUICK_RATINGS.map((r) => (
                      <button key={r.value} onClick={() => submitRating(title.id, r.value)} className={BTN_RATING}>
                        {r.label}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  {rateError[title.id] && (
                    <p className="text-xs text-danger">Couldn&apos;t save that rating — try again.</p>
                  )}
                  <button
                    onClick={() => setExpanded((prev) => ({ ...prev, [title.id]: true }))}
                    className={BTN_PRIMARY}
                  >
                    I&apos;ve seen this
                  </button>
                  <button onClick={() => submitRating(title.id, 'WATCHLISTED')} className={BTN_SECONDARY}>
                    Save this!
                  </button>
                  <button onClick={() => submitRating(title.id, 'NOT_INTERESTED')} className={BTN_QUIET}>
                    Not interested
                  </button>
                </>
              ))}

            {variant === 'watchlist' && (
              <>
                {rateError[title.id] && (
                  <p className="text-xs text-danger">Couldn&apos;t save that rating — try again.</p>
                )}
                <div className="flex gap-1.5">
                  {QUICK_RATINGS.map((r) => (
                    <button key={r.value} onClick={() => submitRating(title.id, r.value)} className={BTN_RATING}>
                      {r.label}
                    </button>
                  ))}
                </div>
                <button onClick={() => submitRating(title.id, 'NOT_SEEN')} className={BTN_QUIET}>
                  Remove from Watchlist
                </button>
              </>
            )}

            <div className="pt-1.5 border-t border-border flex flex-col gap-1.5">
              {moveError[title.id] && (
                <p className="text-xs text-danger">Couldn&apos;t move that title — try again.</p>
              )}
              <button onClick={() => submitMove(title.id)} className={BTN_UTILITY}>
                Move to {mode === 'FAMILY' ? 'Adult' : 'Family'} Mode
              </button>
            </div>
          </div>
        </div>
      </li>
    )
  }

  return (
    <main className="max-w-6xl mx-auto px-6 py-8">
      <h1 className="font-display text-3xl tracking-wide text-textPrimary mb-6">Film Curator</h1>
      <ModeToggle mode={mode} onChange={setMode} />
      {loading ? (
        <p className="text-textSecondary">Loading...</p>
      ) : loadError ? (
        <p className="text-danger">Couldn&apos;t load your movies — try refreshing.</p>
      ) : (
        <>
          <SectionNav counts={{ watchlist: watchlist.length, loved: loved.length }} />

          <section id="not-seen" className="scroll-mt-32">
            <h2 className="font-display text-xl tracking-wide text-textPrimary mt-6 mb-4">Not Seen</h2>
            {notSeen.length === 0 ? (
              <p className="text-textSecondary text-sm">Nothing left to watch right now.</p>
            ) : (
              <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6 list-none p-0">
                {notSeen.map((title) => renderCard(title, 'notSeen'))}
              </ul>
            )}
          </section>

          {watchlist.length > 0 && (
            <section id="watchlist" className="scroll-mt-32">
              <h2 className="font-display text-xl tracking-wide text-textPrimary mt-10 mb-4">Watchlist</h2>
              <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6 list-none p-0">
                {watchlist.map((title) => renderCard(title, 'watchlist'))}
              </ul>
            </section>
          )}

          {loved.length > 0 && (
            <section id="loved" className="scroll-mt-32">
              <h2 className="font-display text-xl tracking-wide text-textPrimary mt-10 mb-4">Loved — Worth a Rewatch</h2>
              <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6 list-none p-0">
                {loved.map((title) => renderCard(title, 'loved'))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  )
}
