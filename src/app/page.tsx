'use client'
import { useState, useEffect } from 'react'
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
  overview?: string | null
  director?: string | null
  topCast?: string[]
  tasteRating?: string | null
}

const QUICK_RATINGS = [
  { value: 'DISLIKED', label: 'Disliked' },
  { value: 'LIKED', label: 'Liked' },
  { value: 'LOVED', label: 'Loved' },
]

export default function HomePage() {
  const [mode, setMode] = useState<'FAMILY' | 'ADULT'>('FAMILY')
  const [notSeen, setNotSeen] = useState<Title[]>([])
  const [loved, setLoved] = useState<Title[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [scores, setScores] = useState<Record<string, ContentScore>>({})
  const [ratingStatus, setRatingStatus] = useState<Record<string, 'loading' | 'error' | undefined>>({})

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
    await fetch('/api/taste', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titleId, rating, mode }),
    })
    const ratedTitle = notSeen.find((t) => t.id === titleId)
    setNotSeen((prev) => prev.filter((t) => t.id !== titleId))
    if (rating === 'LOVED' && ratedTitle) {
      setLoved((prev) => [{ ...ratedTitle, tasteRating: 'LOVED' }, ...prev])
    }
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

  function renderCard(title: Title, { showQuickRate }: { showQuickRate: boolean }) {
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
          {title.overview && <p className="text-xs text-textSecondary">{title.overview}</p>}
          {title.director && <p className="text-xs text-textSecondary">Directed by {title.director}</p>}
          {title.topCast && title.topCast.length > 0 && (
            <p className="text-xs text-textSecondary">Starring {title.topCast.join(', ')}</p>
          )}

          {mode === 'ADULT' && title.mpaaRating && !score && status !== 'loading' && status !== 'error' && (
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

          {showQuickRate && (
            <div className="mt-auto pt-2">
              {expanded[title.id] ? (
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
          )}
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
          <section>
            <h2 className="font-display text-xl tracking-wide text-textPrimary mt-6 mb-4">Not Seen</h2>
            {notSeen.length === 0 ? (
              <p className="text-textSecondary text-sm">Nothing left to watch right now.</p>
            ) : (
              <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6 list-none p-0">
                {notSeen.map((title) => renderCard(title, { showQuickRate: true }))}
              </ul>
            )}
          </section>

          {loved.length > 0 && (
            <section>
              <h2 className="font-display text-xl tracking-wide text-textPrimary mt-10 mb-4">Loved — Worth a Rewatch</h2>
              <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6 list-none p-0">
                {loved.map((title) => renderCard(title, { showQuickRate: false }))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  )
}
