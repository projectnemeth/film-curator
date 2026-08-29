'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function Nav() {
  const pathname = usePathname()
  if (pathname === '/login') return null

  return (
    <nav className="flex gap-6 items-center px-6 py-4 border-b border-border bg-surface">
      <Link href="/" className="text-sm font-medium text-textPrimary hover:text-accent transition-colors">
        Dashboard
      </Link>
      <Link href="/rate" className="text-sm font-medium text-textPrimary hover:text-accent transition-colors">
        Rate More Movies
      </Link>
      <Link href="/settings" className="text-sm font-medium text-textPrimary hover:text-accent transition-colors">
        Settings
      </Link>
    </nav>
  )
}
