import { NextRequest, NextResponse } from 'next/server'
import { getNextTitleToRate, recordTasteRating } from '@/lib/tasteInterview'

const VALID_RATINGS = ['DISLIKED', 'LIKED', 'LOVED', 'NOT_SEEN', 'TOO_INAPPROPRIATE']

export async function GET(req: NextRequest) {
  const modeParam = req.nextUrl.searchParams.get('mode')
  const mode: 'FAMILY' | 'ADULT' = modeParam === 'ADULT' ? 'ADULT' : 'FAMILY'
  const title = await getNextTitleToRate('default', mode)
  return NextResponse.json({ title })
}

export async function POST(req: NextRequest) {
  const { titleId, rating } = await req.json()
  if (!titleId || !VALID_RATINGS.includes(rating)) {
    return NextResponse.json({ error: 'invalid input' }, { status: 400 })
  }
  const result = await recordTasteRating('default', titleId, rating)
  return NextResponse.json({ result })
}
