import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    override: { findMany: vi.fn(), upsert: vi.fn(), delete: vi.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import { GET, POST, DELETE } from '../route'

describe('overrides route', () => {
  beforeEach(() => vi.clearAllMocks())

  it('GET lists overrides for the default family', async () => {
    ;(prisma.override.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'o1' }])
    const res = await GET()
    const body = await res.json()
    expect(body.overrides).toEqual([{ id: 'o1' }])
  })

  it('POST rejects an invalid decision', async () => {
    const req = new NextRequest('http://localhost/api/overrides', {
      method: 'POST',
      body: JSON.stringify({ titleId: 't1', decision: 'MAYBE' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('POST upserts a valid override', async () => {
    ;(prisma.override.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'o1', decision: 'APPROVED' })
    const req = new NextRequest('http://localhost/api/overrides', {
      method: 'POST',
      body: JSON.stringify({ titleId: 't1', decision: 'APPROVED', note: 'Mild peril only' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(prisma.override.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { familyId_titleId: { familyId: 'default', titleId: 't1' } } })
    )
  })

  it('DELETE requires titleId', async () => {
    const req = new NextRequest('http://localhost/api/overrides')
    const res = await DELETE(req)
    expect(res.status).toBe(400)
  })

  it('DELETE removes the override', async () => {
    ;(prisma.override.delete as ReturnType<typeof vi.fn>).mockResolvedValue({})
    const req = new NextRequest('http://localhost/api/overrides?titleId=t1')
    const res = await DELETE(req)
    expect(res.status).toBe(200)
  })
})
