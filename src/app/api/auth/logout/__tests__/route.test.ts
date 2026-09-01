import { describe, it, expect } from 'vitest'
import { POST } from '../route'

describe('POST /api/auth/logout', () => {
  it('clears the session cookie', async () => {
    const res = await POST()
    expect(res.status).toBe(200)
    const cookie = res.cookies.get('familyAuth')
    expect(cookie?.value).toBe('')
    expect(cookie?.maxAge).toBe(0)
  })
})
