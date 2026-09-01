type ModeToggleProps = {
  mode: 'FAMILY' | 'ADULT'
  onChange: (mode: 'FAMILY' | 'ADULT') => void
}

export function ModeToggle({ mode, onChange }: ModeToggleProps) {
  return (
    <div role="group" aria-label="mode toggle" className="inline-flex bg-surface border border-border rounded-full p-1 mb-8">
      <button
        aria-pressed={mode === 'FAMILY'}
        onClick={() => onChange('FAMILY')}
        className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
          mode === 'FAMILY' ? 'bg-accent text-bg' : 'text-textSecondary'
        }`}
      >
        Family Mode
      </button>
      <button
        aria-pressed={mode === 'ADULT'}
        onClick={() => onChange('ADULT')}
        className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
          mode === 'ADULT' ? 'bg-accent text-bg' : 'text-textSecondary'
        }`}
      >
        Adult Mode
      </button>
    </div>
  )
}
