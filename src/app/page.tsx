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
              {title.posterPath ? (
                <img
                  src={`https://image.tmdb.org/t/p/w200${title.posterPath}`}
                  alt={`${title.name} poster`}
                  width={92}
                  height={138}
                />
              ) : (
                <div style={{ width: 92, height: 138, background: '#ccc' }} aria-hidden="true" />
              )}
              {title.name} {title.year ? `(${title.year})` : ''}
              {' — '}
              {title.providers.length > 0 ? title.providers.join(', ') : 'availability unknown'}
              {title.filterReason === 'unscored' && <span> — not yet rated</span>}

              {rated[title.id] ? (
                <span> ✓ Rated: {rated[title.id]}</span>
              ) : expanded[title.id] ? (
                <span>
                  {QUICK_RATINGS.map((r) => (
                    <button key={r.value} onClick={() => submitRating(title.id, r.value)}>
                      {r.label}
                    </button>
                  ))}
                </span>
              ) : (
                <button onClick={() => setExpanded((prev) => ({ ...prev, [title.id]: true }))}>
                  I've seen this
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
