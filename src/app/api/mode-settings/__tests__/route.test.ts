import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: { modeSettings: { findUniqueOrThrow: vi.fn(), update: vi.fn() } },
}))

import { prisma } from '@/lib/prisma'
import { GET, PUT } from '../route'

describe('mode-settings route', () => {
  beforeEach(() => vi.clearAllMocks())

  it('GET fetches settings for the requested mode', async () => {
    ;(prisma.modeSettings.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({ mode: 'ADULT', maxViolence: 8 })
    const req = new NextRequest('http://localhost/api/mode-settings?mode=ADULT')
    const res = await GET(req)
    const body = await res.json()
    expect(body.settings.mode).toBe('ADULT')
  })

  it('PUT rejects an invalid mode', async () => {
    const req = new NextRequest('http://localhost/api/mode-settings', {
      method: 'PUT',
      body: JSON.stringify({ mode: 'KIDS' }),
    })
    const res = await PUT(req)
    expect(res.status).toBe(400)
  })

  it('PUT updates the thresholds for a valid mode', async () => {
    ;(prisma.modeSettings.update as ReturnType<typeof vi.fn>).mockResolvedValue({ mode: 'FAMILY', maxViolence: 5 })
    const req = new NextRequest('http://localhost/api/mode-settings', {
      method: 'PUT',
      body: JSON.stringify({ mode: 'FAMILY', maxViolence: 5, maxLanguage: 2, maxSexNudity: 1, maxScariness: 5, allowUnrated: false, allowNC17: false }),
    })
    const res = await PUT(req)
    expect(res.status).toBe(200)
    expect(prisma.modeSettings.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { familyId_mode: { familyId: 'default', mode: 'FAMILY' } } })
    )
  })
})
