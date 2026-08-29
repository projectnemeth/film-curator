'use client'
import { Suspense, useState, type FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [passcode, setPasscode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode }),
    })
    if (res.ok) {
      router.push(searchParams.get('next') || '/')
    } else {
      const data = await res.json()
      setError(data.error || 'Incorrect passcode')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full max-w-sm">
      <label className="flex flex-col gap-2 text-sm text-textSecondary">
        Family Passcode
        <input
          type="password"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          className="bg-surface border border-border rounded px-3 py-2 text-textPrimary focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </label>
      <button
        type="submit"
        disabled={submitting}
        className="bg-accent text-bg font-medium rounded px-4 py-2 hover:bg-accentGlow transition-colors disabled:opacity-50"
      >
        Enter
      </button>
      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
    </form>
  )
}

export default function LoginPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 px-6 bg-bg">
      <div className="max-w-md text-center">
        <h1 className="font-display text-4xl tracking-wide text-accent mb-4">
          Tonight&apos;s movie, already figured out.
        </h1>
        <p className="text-textSecondary text-sm leading-relaxed">
          Film Curator searches Netflix, Disney+, Prime Video, and Peacock for what&apos;s
          actually available, filters it against content you&apos;re comfortable with, and
          ranks it by your family&apos;s taste. It&apos;s a private app for one family — this one.
        </p>
      </div>
      <Suspense fallback={<p className="text-textSecondary">Loading...</p>}>
        <LoginForm />
      </Suspense>
    </main>
  )
}
