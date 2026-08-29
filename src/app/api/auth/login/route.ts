import { NextRequest, NextResponse } from 'next/server'
import { signSession } from '@/lib/session'

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

export async function POST(req: NextRequest) {
  const passcode = process.env.FAMILY_PASSCODE
  const secret = process.env.SESSION_SECRET
  if (!passcode || !secret) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const body = await req.json()
  const submitted = typeof body.passcode === 'string' ? body.passcode : ''

  if (!constantTimeEqual(submitted, passcode)) {
    return NextResponse.json({ error: 'Incorrect passcode' }, { status: 401 })
  }

  const sessionValue = await signSession(secret)
  const response = NextResponse.json({ ok: true })
  response.cookies.set('familyAuth', sessionValue, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 90 * 24 * 60 * 60,
    path: '/',
  })
  return response
}
