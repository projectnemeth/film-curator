// Taste ratings recorded by hand, 2026-10-17 (second set).
//
// Both were hand-ranked into the Adult top order earlier the same day, on
// the strength of The Gray Man and Extraction going LOVED. The family has
// in fact already seen them, so they become history rather than
// recommendations — which is the better outcome: two more Guy Ritchie
// data points confirming the vein, and two freed slots in the order.

import { prisma } from '../src/lib/prisma'

const LIKED_ADULT: { id: string; name: string }[] = [
  { id: 'cmuaw1qgi00he132gv8288v0n', name: 'The Ministry of Ungentlemanly Warfare' },
  { id: 'cmuuw82xs00jdf329ggo6q1xc', name: "Guy Ritchie's The Covenant" },
]

async function main() {
  for (const { id, name } of LIKED_ADULT) {
    const r = await prisma.tasteRating.upsert({
      where: { familyId_titleId_mode: { familyId: 'default', titleId: id, mode: 'ADULT' } },
      update: { rating: 'LIKED', ratedAt: new Date() },
      create: { familyId: 'default', titleId: id, mode: 'ADULT', rating: 'LIKED' },
      include: { title: { select: { name: true } } },
    })
    if (r.title.name !== name) throw new Error(`id ${id} is ${r.title.name}, expected ${name}`)
    console.log(`${r.title.name} -> ${r.rating}`)
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
