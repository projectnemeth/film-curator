import { NextRequest, NextResponse } from 'next/server'
import { signSession, constantTimeEqual } from '@/lib/session'

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
