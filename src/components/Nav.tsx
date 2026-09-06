'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function Nav() {
  const pathname = usePathname()
  if (pathname === '/login') return null

  return (
    <nav className="sticky top-0 z-30 h-14 flex gap-6 items-center px-6 border-b border-border bg-surface">
      <Link href="/" className="flex items-center self-stretch text-sm font-medium text-textPrimary hover:text-accent transition-colors">
        Dashboard
      </Link>
      <Link href="/rate" className="flex items-center self-stretch text-sm font-medium text-textPrimary hover:text-accent transition-colors">
        Rate More Movies
      </Link>
    </nav>
  )
}
