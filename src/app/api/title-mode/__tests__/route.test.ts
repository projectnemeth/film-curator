import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/titleMode', () => ({ moveTitleToMode: vi.fn() }))

import { moveTitleToMode } from '@/lib/titleMode'
import { POST } from '../route'

function post(body: unknown) {
  return new NextRequest('http://localhost/api/title-mode', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('POST /api/title-mode', () => {
  beforeEach(() => vi.clearAllMocks())

  it('moves a title into the requested mode', async () => {
    const res = await POST(post({ titleId: 't1', mode: 'ADULT' }))
    expect(res.status).toBe(200)
    expect(moveTitleToMode).toHaveBeenCalledWith('default', 't1', 'ADULT')
  })

  it('moves a title into Family Mode', async () => {
    const res = await POST(post({ titleId: 't1', mode: 'FAMILY' }))
    expect(res.status).toBe(200)
    expect(moveTitleToMode).toHaveBeenCalledWith('default', 't1', 'FAMILY')
  })

  it('rejects a missing titleId', async () => {
    const res = await POST(post({ mode: 'ADULT' }))
    expect(res.status).toBe(400)
    expect(moveTitleToMode).not.toHaveBeenCalled()
  })

  it('rejects an unrecognised mode rather than defaulting to one', async () => {
    // Unlike /api/taste, a bad mode here must not silently pick a default:
    // guessing would move the film somewhere the user did not ask for.
    const res = await POST(post({ titleId: 't1', mode: 'nonsense' }))
    expect(res.status).toBe(400)
    expect(moveTitleToMode).not.toHaveBeenCalled()
  })

  it('returns 404 when the title does not exist', async () => {
    ;(moveTitleToMode as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Title not found: t9'))
    const res = await POST(post({ titleId: 't9', mode: 'ADULT' }))
    expect(res.status).toBe(404)
  })
})
