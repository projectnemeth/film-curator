'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function Nav() {
  const pathname = usePathname()
  if (pathname === '/login') return null

  return (
    <nav>
      <Link href="/">Dashboard</Link>
      {' | '}
      <Link href="/rate">Rate More Movies</Link>
      {' | '}
      <Link href="/settings">Settings</Link>
    </nav>
  )
}
