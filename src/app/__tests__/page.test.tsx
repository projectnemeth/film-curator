import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import HomePage from '../page'

describe('HomePage', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({
        mode: 'FAMILY',
        titles: [{ id: 't1', name: 'Jurassic Park', year: 1993, filterReason: 'override_approved', providers: ['netflix'] }],
      }),
    }) as unknown as typeof fetch
  })

  it('renders recommended titles for the default mode', async () => {
    render(<HomePage />)
    expect(await screen.findByText(/Jurassic Park/)).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith('/api/recommendations?mode=FAMILY')
  })

  it('refetches with mode=ADULT when the Adult Mode button is clicked', async () => {
    render(<HomePage />)
    await screen.findByText(/Jurassic Park/)
    fireEvent.click(screen.getByRole('button', { name: 'Adult Mode' }))
    await waitFor(() => expect(fetch).toHaveBeenLastCalledWith('/api/recommendations?mode=ADULT'))
  })

  it('flags unscored titles as not yet rated', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: async () => ({
        mode: 'ADULT',
        titles: [{ id: 't2', name: 'New Release', year: 2026, filterReason: 'unscored', providers: ['peacock'] }],
      }),
    })
    render(<HomePage />)
    expect(await screen.findByText(/not yet rated/)).toBeInTheDocument()
  })

  it('flags titles with no known provider as availability unknown', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: async () => ({
        mode: 'FAMILY',
        titles: [{ id: 't3', name: 'Mystery Title', year: 2024, filterReason: 'passes', providers: [] }],
      }),
    })
    render(<HomePage />)
    expect(await screen.findByText(/availability unknown/)).toBeInTheDocument()
  })
})
