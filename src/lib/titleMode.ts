import { prisma } from './prisma'
import { isRatingVisibleInMode } from './filtering'

type Mode = 'FAMILY' | 'ADULT'

function otherMode(mode: Mode): Mode {
  return mode === 'FAMILY' ? 'ADULT' : 'FAMILY'
}

// Moves a title into the given mode, overriding the MPAA bucketing in
// src/lib/filtering.ts. A PG film can be age-appropriate for the children
// and still be no fun for them; this is how it gets out of Family Mode.
//
// The move is exclusive — Title.modeOverride names one mode, so the title
// leaves the mode it came from — and it takes any taste rating with it, so
// a film rated LOVED before the move is still LOVED after it.
export async function moveTitleToMode(familyId: string, titleId: string, mode: Mode): Promise<void> {
  const title = await prisma.title.findUnique({
    where: { id: titleId },
    select: { id: true, mpaaRating: true, modeOverride: true },
  })
  if (!title) throw new Error(`Title not found: ${titleId}`)

  // No override is stored when the target is simply where the MPAA rating
  // would have put it anyway. Moving a title back therefore restores default
  // behaviour rather than pinning it, so later rule changes still reach it.
  const override = isRatingVisibleInMode(title.mpaaRating, mode) ? null : mode

  await prisma.title.update({ where: { id: titleId }, data: { modeOverride: override } })

  const from = otherMode(mode)
  const existing = await prisma.tasteRating.findUnique({
    where: { familyId_titleId_mode: { familyId, titleId, mode: from } },
  })
  if (!existing) return

  // The carried rating wins over anything stale already sitting in the
  // destination — only reachable by moving a title back and forth, but the
  // (familyId, titleId, mode) unique constraint makes a blind create unsafe.
  await prisma.tasteRating.upsert({
    where: { familyId_titleId_mode: { familyId, titleId, mode } },
    update: { rating: existing.rating },
    create: { familyId, titleId, mode, rating: existing.rating },
  })
  await prisma.tasteRating.delete({
    where: { familyId_titleId_mode: { familyId, titleId, mode: from } },
  })
}
