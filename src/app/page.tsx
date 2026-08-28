'use client'
import { useEffect, useState } from 'react'

type Title = {
  id: string
  name: string
  year: number | null
  filterReason: string
  providers: string[]
}

export default function HomePage() {
  const [mode, setMode] = useState<'FAMILY' | 'ADULT'>('FAMILY')
  const [titles, setTitles] = useState<Title[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/recommendations?mode=${mode}`)
      .then((res) => res.json())
      .then((data) => setTitles(data.titles))
      .finally(() => setLoading(false))
  }, [mode])

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
              {title.name} {title.year ? `(${title.year})` : ''}
              {' — '}
              {title.providers.length > 0 ? title.providers.join(', ') : 'availability unknown'}
              {title.filterReason === 'unscored' && <span> — not yet rated</span>}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
