// src/lib/__tests__/modeSettings.integration.test.ts
import { describe, it, expect, afterAll } from 'vitest'
import { prisma } from '../prisma'

describe('ModeSettings seed', () => {
  it('has the agreed default thresholds for FAMILY and ADULT', async () => {
    const family = await prisma.modeSettings.findUniqueOrThrow({
      where: { familyId_mode: { familyId: 'default', mode: 'FAMILY' } },
    })
    expect(family.maxSexNudity).toBe(1)
    expect(family.maxViolence).toBe(4)

    const adult = await prisma.modeSettings.findUniqueOrThrow({
      where: { familyId_mode: { familyId: 'default', mode: 'ADULT' } },
    })
    expect(adult.allowNC17).toBe(false)
    expect(adult.allowUnrated).toBe(false)
  })
})

afterAll(async () => {
  await prisma.$disconnect()
})
