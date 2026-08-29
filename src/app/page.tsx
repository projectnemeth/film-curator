'use client'
import { useEffect, useState } from 'react'
import { ModeToggle } from '@/components/ModeToggle'

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
      <ModeToggle mode={mode} onChange={setMode} />
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
