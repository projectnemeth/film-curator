import { prisma } from '../src/lib/prisma'

async function main() {
  await prisma.modeSettings.upsert({
    where: { familyId_mode: { familyId: 'default', mode: 'FAMILY' } },
    update: {},
    create: {
      familyId: 'default',
      mode: 'FAMILY',
      maxViolence: 4,
      maxLanguage: 2,
      maxSexNudity: 1,
      maxScariness: 5,
      allowUnrated: false,
      allowNC17: false,
    },
  })
  await prisma.modeSettings.upsert({
    where: { familyId_mode: { familyId: 'default', mode: 'ADULT' } },
    update: {},
    create: {
      familyId: 'default',
      mode: 'ADULT',
      maxViolence: 8,
      maxLanguage: 8,
      maxSexNudity: 3,
      maxScariness: 10,
      allowUnrated: false,
      allowNC17: false,
    },
  })
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
