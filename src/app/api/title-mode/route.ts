import { NextRequest, NextResponse } from 'next/server'
import { moveTitleToMode } from '@/lib/titleMode'

const VALID_MODES = ['FAMILY', 'ADULT'] as const

export async function POST(req: NextRequest) {
  const { titleId, mode } = await req.json()

  // A bad mode is rejected rather than defaulted. /api/taste can safely fall
  // back to FAMILY, but guessing here would move a film somewhere the user
  // never asked for.
  if (!titleId || !VALID_MODES.includes(mode)) {
    return NextResponse.json({ error: 'invalid input' }, { status: 400 })
  }

  try {
    await moveTitleToMode('default', titleId, mode)
  } catch (err) {
    if (err instanceof Error && /not found/i.test(err.message)) {
      return NextResponse.json({ error: 'title not found' }, { status: 404 })
    }
    throw err
  }

  return NextResponse.json({ titleId, mode })
}
