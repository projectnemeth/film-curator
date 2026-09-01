import { Bebas_Neue, Inter, IBM_Plex_Mono } from 'next/font/google'
import { Nav } from '@/components/Nav'
import './globals.css'

const bebasNeue = Bebas_Neue({ weight: '400', subsets: ['latin'], variable: '--font-bebas' })
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const plexMono = IBM_Plex_Mono({ weight: ['400', '500'], subsets: ['latin'], variable: '--font-mono' })

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bebasNeue.variable} ${inter.variable} ${plexMono.variable}`}>
      <body className="font-body bg-bg text-textPrimary min-h-screen">
        <Nav />
        {children}
      </body>
    </html>
  )
}
