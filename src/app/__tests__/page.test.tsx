import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import HomePage from '../page'

describe('HomePage', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return Promise.resolve({ json: async () => ({ result: { id: 'r1' } }) })
      }
      return Promise.resolve({
        json: async () => ({
          mode: 'FAMILY',
          titles: [{ id: 't1', name: 'Jurassic Park', year: 1993, filterReason: 'override_approved', providers: ['netflix'], posterPath: '/poster.jpg' }],
        }),
      })
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
    ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return Promise.resolve({ json: async () => ({ result: { id: 'r1' } }) })
      }
      return Promise.resolve({
        json: async () => ({
          mode: 'ADULT',
          titles: [{ id: 't2', name: 'New Release', year: 2026, filterReason: 'unscored', providers: ['peacock'], posterPath: '/poster.jpg' }],
        }),
      })
    })
    render(<HomePage />)
    expect(await screen.findByText(/not yet rated/)).toBeInTheDocument()
  })

  it('flags titles with no known provider as availability unknown', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return Promise.resolve({ json: async () => ({ result: { id: 'r1' } }) })
      }
      return Promise.resolve({
        json: async () => ({
          mode: 'FAMILY',
          titles: [{ id: 't3', name: 'Mystery Title', year: 2024, filterReason: 'passes', providers: [], posterPath: '/poster.jpg' }],
        }),
      })
    })
    render(<HomePage />)
    expect(await screen.findByText(/availability unknown/)).toBeInTheDocument()
  })

  it('renders a poster image when posterPath is present', async () => {
    render(<HomePage />)
    const img = await screen.findByAltText(/Jurassic Park poster/i)
    expect(img).toHaveAttribute('src', expect.stringContaining('/poster.jpg'))
  })

  it('shows a placeholder when posterPath is null', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return Promise.resolve({ json: async () => ({ result: { id: 'r1' } }) })
      }
      return Promise.resolve({
        json: async () => ({
          mode: 'FAMILY',
          titles: [{ id: 't4', name: 'No Poster Movie', year: 2024, filterReason: 'passes', providers: ['netflix'], posterPath: null }],
        }),
      })
    })
    render(<HomePage />)
    expect(await screen.findByText(/No Poster Movie/)).toBeInTheDocument()
    expect(screen.queryByAltText(/No Poster Movie poster/i)).not.toBeInTheDocument()
  })

  it('quick-rates a title through the two-step seen/rating flow', async () => {
    render(<HomePage />)
    await screen.findByText(/Jurassic Park/)
    fireEvent.click(screen.getByRole('button', { name: "I've seen this" }))
    fireEvent.click(screen.getByRole('button', { name: 'Liked' }))
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/taste',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ titleId: 't1', rating: 'LIKED' }) })
      )
    )
    expect(await screen.findByText(/Rated: LIKED/)).toBeInTheDocument()
  })
})
