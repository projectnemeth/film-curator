import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/session'

const SESSION_COOKIE = 'familyAuth'
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (
    pathname === '/login' ||
    pathname === '/api/auth/login' ||
    pathname === '/api/ingest' ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next()
  }

  const cookie = req.cookies.get(SESSION_COOKIE)?.value
  const secret = process.env.SESSION_SECRET

  if (!cookie || !secret || !(await verifySession(cookie, secret, MAX_AGE_MS))) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
