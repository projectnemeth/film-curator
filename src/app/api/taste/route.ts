import { NextRequest, NextResponse } from 'next/server'
import { getNextTitleToRate, recordTasteRating } from '@/lib/tasteInterview'

const VALID_RATINGS = ['DISLIKED', 'LIKED', 'LOVED', 'NOT_SEEN', 'TOO_INAPPROPRIATE', 'NOT_INTERESTED']

export async function GET(req: NextRequest) {
  const modeParam = req.nextUrl.searchParams.get('mode')
  const mode: 'FAMILY' | 'ADULT' = modeParam === 'ADULT' ? 'ADULT' : 'FAMILY'
  const title = await getNextTitleToRate('default', mode)
  return NextResponse.json({ title })
}

export async function POST(req: NextRequest) {
  const { titleId, rating, mode } = await req.json()
  const resolvedMode: 'FAMILY' | 'ADULT' = mode === 'ADULT' ? 'ADULT' : 'FAMILY'
  if (!titleId || !VALID_RATINGS.includes(rating)) {
    return NextResponse.json({ error: 'invalid input' }, { status: 400 })
  }
  const result = await recordTasteRating('default', titleId, resolvedMode, rating)
  return NextResponse.json({ result })
}
