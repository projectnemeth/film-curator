'use client'
import { useEffect, useState } from 'react'
import { ModeToggle } from '@/components/ModeToggle'

type Title = { id: string; name: string; year: number | null; overview: string | null; posterPath: string | null }

const RATINGS = [
  { value: 'DISLIKED', label: 'Disliked' },
  { value: 'LIKED', label: 'Liked' },
  { value: 'LOVED', label: 'Loved' },
  { value: 'NOT_SEEN', label: "Didn't see" },
  { value: 'TOO_INAPPROPRIATE', label: 'Too inappropriate' },
]

export default function RatePage() {
  const [mode, setMode] = useState<'FAMILY' | 'ADULT'>('FAMILY')
  const [title, setTitle] = useState<Title | null>(null)
  const [checked, setChecked] = useState(false)

  async function loadNext(currentMode: 'FAMILY' | 'ADULT') {
    const res = await fetch(`/api/taste?mode=${currentMode}`)
    const data = await res.json()
    setTitle(data.title)
    setChecked(true)
  }

  useEffect(() => {
    setChecked(false)
    loadNext(mode)
  }, [mode])

  async function rate(rating: string) {
    if (!title) return
    await fetch('/api/taste', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titleId: title.id, rating, mode }),
    })
    loadNext(mode)
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 px-6 py-8 bg-bg">
      <h1 className="font-display text-2xl tracking-wide text-textPrimary">Rate More Movies</h1>
      <ModeToggle mode={mode} onChange={setMode} />
      {!checked ? (
        <p className="text-textSecondary">Loading...</p>
      ) : !title ? (
        <p className="text-textSecondary">No more titles to rate right now.</p>
      ) : (
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
                className={
                  r.value === 'TOO_INAPPROPRIATE'
                    ? 'text-sm border border-danger text-danger rounded px-3 py-1.5 hover:bg-danger hover:text-bg transition-colors'
                    : 'text-sm border border-accent text-accent rounded px-3 py-1.5 hover:bg-accent hover:text-bg transition-colors'
                }
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </main>
  )
}
