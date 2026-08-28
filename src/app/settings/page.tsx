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

type OverrideRow = { id: string; titleId: string; decision: string; title: { name: string } }

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
    <div>
      <ul>
        {overrides.map((o) => (
          <li key={o.id}>
            {o.title.name}: {o.decision}
          </li>
        ))}
      </ul>
      <input placeholder="Title ID" value={titleId} onChange={(e) => setTitleId(e.target.value)} />
      <select value={decision} onChange={(e) => setDecision(e.target.value as 'APPROVED' | 'REJECTED')}>
        <option value="APPROVED">Approve</option>
        <option value="REJECTED">Reject</option>
      </select>
      <button onClick={add}>Add Override</button>
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
      body: JSON.stringify({ mode, ...settings }),
    })
  }

  if (!settings) return <main><p>Loading...</p></main>

  return (
    <main>
      <h1>Content Filter Settings</h1>
      <div role="group" aria-label="mode toggle">
        <button aria-pressed={mode === 'FAMILY'} onClick={() => setMode('FAMILY')}>Family Mode</button>
        <button aria-pressed={mode === 'ADULT'} onClick={() => setMode('ADULT')}>Adult Mode</button>
      </div>
      {(['maxViolence', 'maxLanguage', 'maxSexNudity', 'maxScariness'] as const).map((field) => (
        <label key={field}>
          {field}
          <input
            type="number"
            value={settings[field]}
            onChange={(e) => setSettings({ ...settings, [field]: Number(e.target.value) })}
          />
        </label>
      ))}
      <button onClick={save}>Save</button>
      <section>
        <h2>Overrides</h2>
        <OverridesManager />
      </section>
    </main>
  )
}
