// One-time backfill: TasteRating rows created before the content-rating
// redesign were all stamped mode=FAMILY regardless of what was actually
// rated. Since Family Mode now only ever shows G/PG titles, any FAMILY-mode
// rating on a PG-13/R title necessarily predates the redesign and belongs
// in ADULT mode instead.
//
// Usage:
//   npx tsx scripts/backfill-adult-mode-ratings.ts           # report only, no writes
//   npx tsx scripts/backfill-adult-mode-ratings.ts --apply   # actually re-stamp the rows

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const apply = process.argv.includes('--apply')

  const misclassified = await prisma.tasteRating.findMany({
    where: { mode: 'FAMILY', title: { mpaaRating: { in: ['PG-13', 'R'] } } },
    select: { id: true, familyId: true, titleId: true, rating: true, title: { select: { name: true, mpaaRating: true } } },
  })

  if (misclassified.length === 0) {
    console.log('No FAMILY-mode ratings found on PG-13/R titles. Nothing to do.')
    return
  }

  const existingAdultByTitle = new Set(
    (
      await prisma.tasteRating.findMany({
        where: {
          mode: 'ADULT',
          titleId: { in: misclassified.map((r) => r.titleId) },
        },
        select: { familyId: true, titleId: true },
      })
    ).map((r) => `${r.familyId}:${r.titleId}`)
  )

  const safeToFlip = misclassified.filter((r) => !existingAdultByTitle.has(`${r.familyId}:${r.titleId}`))
  const conflicts = misclassified.filter((r) => existingAdultByTitle.has(`${r.familyId}:${r.titleId}`))

  console.log(`Found ${misclassified.length} FAMILY-mode rating(s) on a PG-13/R title.`)
  console.log(`  ${safeToFlip.length} can be safely re-stamped to ADULT mode.`)
  console.log(`  ${conflicts.length} already have a separate ADULT-mode rating for the same title (left untouched):`)
  for (const c of conflicts) {
    console.log(`    - "${c.title.name}" (${c.title.mpaaRating}), titleId=${c.titleId}, FAMILY rating=${c.rating}`)
  }

  if (!apply) {
    console.log('\nDry run only — no rows were changed. Re-run with --apply to perform the update.')
    return
  }

  const { count } = await prisma.tasteRating.updateMany({
    where: { id: { in: safeToFlip.map((r) => r.id) } },
    data: { mode: 'ADULT' },
  })
  console.log(`\nRe-stamped ${count} row(s) from FAMILY to ADULT.`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
