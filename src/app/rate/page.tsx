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

  if (!checked) return <main><p>Loading...</p></main>
  if (!title) return <main><p>No more titles to rate right now.</p></main>

  return (
    <main>
      <h1>Rate More Movies</h1>
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
