import Link from 'next/link'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav>
          <Link href="/">Dashboard</Link>
          {' | '}
          <Link href="/rate">Rate More Movies</Link>
          {' | '}
          <Link href="/settings">Settings</Link>
        </nav>
        {children}
      </body>
    </html>
  )
}
