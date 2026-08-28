import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const overrides = await prisma.override.findMany({ where: { familyId: 'default' }, include: { title: true } })
  return NextResponse.json({ overrides })
}

export async function POST(req: NextRequest) {
  const { titleId, decision, note } = await req.json()
  if (!titleId || !['APPROVED', 'REJECTED'].includes(decision)) {
    return NextResponse.json({ error: 'invalid input' }, { status: 400 })
  }
  const override = await prisma.override.upsert({
    where: { familyId_titleId: { familyId: 'default', titleId } },
    update: { decision, note },
    create: { familyId: 'default', titleId, decision, note },
  })
  return NextResponse.json({ override })
}

export async function DELETE(req: NextRequest) {
  const titleId = req.nextUrl.searchParams.get('titleId')
  if (!titleId) return NextResponse.json({ error: 'titleId required' }, { status: 400 })
  await prisma.override.delete({ where: { familyId_titleId: { familyId: 'default', titleId } } })
  return NextResponse.json({ ok: true })
}
