import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const modeParam = req.nextUrl.searchParams.get('mode')
  const mode = modeParam === 'ADULT' ? 'ADULT' : 'FAMILY'
  const settings = await prisma.modeSettings.findUniqueOrThrow({
    where: { familyId_mode: { familyId: 'default', mode } },
  })
  return NextResponse.json({ settings })
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const { mode, maxViolence, maxLanguage, maxSexNudity, maxScariness, allowUnrated, allowNC17 } = body
  if (!['FAMILY', 'ADULT'].includes(mode)) {
    return NextResponse.json({ error: 'invalid mode' }, { status: 400 })
  }
  const settings = await prisma.modeSettings.update({
    where: { familyId_mode: { familyId: 'default', mode } },
    data: { maxViolence, maxLanguage, maxSexNudity, maxScariness, allowUnrated, allowNC17 },
  })
  return NextResponse.json({ settings })
}
