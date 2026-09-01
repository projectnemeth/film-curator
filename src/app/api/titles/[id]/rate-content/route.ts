import { NextRequest, NextResponse } from 'next/server'
import { getOrCreateContentScore } from '@/lib/contentScoring'

export const maxDuration = 300
const REQUEST_TIMEOUT_MS = 270_000

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const score = await getOrCreateContentScore(id, controller.signal)
    return NextResponse.json({ score })
  } catch (err) {
    console.error(`Failed to score title ${id}:`, err)
    return NextResponse.json({ error: 'scoring failed or timed out' }, { status: 504 })
  } finally {
    clearTimeout(timer)
  }
}
