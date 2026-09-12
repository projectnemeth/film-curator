// Manual mode moves, 2026-09-11 — the first use of Title.modeOverride.
//
// Every title here is rated PG, so the MPAA buckets put it in Family Mode,
// and the rating is not wrong: none of this is inappropriate for the
// children. They are simply films made for adults, which the children would
// not enjoy and which crowd out the Family list. That gap between "allowed"
// and "wanted" is exactly what the override exists for.
//
// Named by the family. Kept as a record of what was moved and why, in the
// same spirit as scripts/manual-batch-*.ts and the VERDICTS map in
// scripts/review-exclusions.ts — not meant to be re-run.
//
// Usage: npx tsx scripts/move-to-adult-2026-09-11.ts

import { prisma } from '../src/lib/prisma'
import { moveTitleToMode } from '../src/lib/titleMode'

const MOVES: { id: string; name: string; why: string }[] = [
  { id: 'cmtqvus3a009qcox7hg3jqtbi', name: 'Lawrence of Arabia (1962)',
    why: 'A four-hour desert epic. Carries a Family WATCHLISTED rating, which moves with it into the Adult watchlist.' },
  { id: 'cmtf5jx0000fxezj8or625wuv', name: 'Monty Python and the Holy Grail (1975)',
    why: 'PG by the standards of 1975; the humour is squarely adult.' },
  { id: 'cmtf5ifqp002mezj8go2hcwuc', name: 'Rocky (1976)', why: 'Adult sports drama, not a children’s film.' },
  { id: 'cmtf5iq660055ezj8qz0cmqgi', name: 'Rocky II (1979)', why: 'Same series.' },
  { id: 'cmtqvuslj009vcox74lor26a1', name: 'Rocky III (1982)', why: 'Same series.' },
  { id: 'cmtf5ioi7004pezj8iicyy7yp', name: 'Rocky IV (1985)', why: 'Same series. Rocky V and Rocky Balboa are not in the catalogue; the Creed films are PG-13 and already in Adult Mode.' },
]

async function main() {
  for (const m of MOVES) {
    await moveTitleToMode('default', m.id, 'ADULT')
    console.log(`moved -> ADULT: ${m.name}`)
  }
  const overridden = await prisma.title.count({ where: { modeOverride: { not: null } } })
  console.log(`\ntitles now carrying a mode override: ${overridden}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
