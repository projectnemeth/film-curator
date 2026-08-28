import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import RatePage from '../page'

describe('RatePage', () => {
  beforeEach(() => {
    let call = 0
    global.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return Promise.resolve({ json: async () => ({ result: { id: 'r1' } }) })
      }
      call++
      if (call === 1) {
        return Promise.resolve({ json: async () => ({ title: { id: 't1', name: 'Jurassic Park', year: 1993, overview: 'Dinosaurs.' } }) })
      }
      return Promise.resolve({ json: async () => ({ title: null }) })
    }) as unknown as typeof fetch
  })

  it('shows the current title to rate', async () => {
    render(<RatePage />)
    expect(await screen.findByText(/Jurassic Park/)).toBeInTheDocument()
  })

  it('submits a rating and loads the next title', async () => {
    render(<RatePage />)
    await screen.findByText(/Jurassic Park/)
    fireEvent.click(screen.getByRole('button', { name: 'Loved' }))
    await waitFor(() => expect(screen.getByText(/No more titles to rate/)).toBeInTheDocument())
    expect(fetch).toHaveBeenCalledWith(
      '/api/taste',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ titleId: 't1', rating: 'LOVED' }) })
    )
  })
})
