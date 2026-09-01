import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import LoginPage from '../page'

const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams('next=/settings'),
}))

describe('LoginPage', () => {
  beforeEach(() => {
    pushMock.mockClear()
  })

  it('shows an error on an incorrect passcode and does not navigate', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Incorrect passcode' }),
    }) as unknown as typeof fetch

    render(<LoginPage />)
    fireEvent.change(screen.getByLabelText(/Family Passcode/i), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enter' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect passcode')
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('navigates to the next param on a correct passcode', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    }) as unknown as typeof fetch

    render(<LoginPage />)
    fireEvent.change(screen.getByLabelText(/Family Passcode/i), { target: { value: 'right' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enter' }))

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/settings'))
  })
})
