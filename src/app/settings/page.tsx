'use client'
import { useEffect, useState } from 'react'
import { ModeToggle } from '@/components/ModeToggle'

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
            <span className={`text-sm ${o.decision === 'REJECTED' ? 'text-danger' : 'text-textPrimary'}`}>
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
          className="bg-surface border border-border rounded px-3 py-1.5 text-sm text-textPrimary focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <select
          value={decision}
          onChange={(e) => setDecision(e.target.value as 'APPROVED' | 'REJECTED')}
          className="bg-surface border border-border rounded px-3 py-1.5 text-sm text-textPrimary focus:outline-none focus:ring-2 focus:ring-accent"
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
      <ModeToggle mode={mode} onChange={setMode} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="flex flex-col gap-4">
          {(['maxViolence', 'maxLanguage', 'maxSexNudity', 'maxScariness'] as const).map((field) => (
            <label key={field} className="flex items-center justify-between gap-4 text-sm text-textSecondary">
              {field}
              <input
                type="number"
                value={settings[field]}
                onChange={(e) => setSettings({ ...settings, [field]: Number(e.target.value) })}
                className="font-mono bg-surface border border-border rounded px-3 py-1.5 w-20 text-textPrimary focus:outline-none focus:ring-2 focus:ring-accent"
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
