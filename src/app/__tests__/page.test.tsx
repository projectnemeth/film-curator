import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import HomePage from '../page'

describe('HomePage', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && url.includes('/rate-content')) {
        return Promise.resolve({ ok: true, json: async () => ({ score: {} }) })
      }
      if (init?.method === 'POST') {
        return Promise.resolve({ json: async () => ({ result: { id: 'r1' } }) })
      }
      return Promise.resolve({
        json: async () => ({
          mode: 'FAMILY',
          titles: [{ id: 't1', name: 'Jurassic Park', year: 1993, providers: ['netflix'], posterPath: '/poster.jpg', mpaaRating: 'PG-13', contentScore: null }],
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

  it('shows the MPAA rating on every card', async () => {
    render(<HomePage />)
    expect(await screen.findByText('PG-13')).toBeInTheDocument()
  })

  it('shows the plot overview, director, and top cast when present', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return Promise.resolve({ json: async () => ({ result: { id: 'r1' } }) })
      return Promise.resolve({
        json: async () => ({
          mode: 'FAMILY',
          titles: [
            {
              id: 't8',
              name: 'Jurassic Park',
              year: 1993,
              providers: ['netflix'],
              posterPath: '/poster.jpg',
              mpaaRating: 'PG-13',
              contentScore: null,
              overview: 'Dinosaurs run amok.',
              director: 'Steven Spielberg',
              topCast: ['Sam Neill', 'Laura Dern'],
            },
          ],
        }),
      })
    })
    render(<HomePage />)
    expect(await screen.findByText('Dinosaurs run amok.')).toBeInTheDocument()
    expect(await screen.findByText(/Directed by Steven Spielberg/)).toBeInTheDocument()
    expect(await screen.findByText(/Starring Sam Neill, Laura Dern/)).toBeInTheDocument()
  })

  it('omits director and cast lines when there is nothing to show', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return Promise.resolve({ json: async () => ({ result: { id: 'r1' } }) })
      return Promise.resolve({
        json: async () => ({
          mode: 'FAMILY',
          titles: [
            {
              id: 't9',
              name: 'Obscure Title',
              year: 2024,
              providers: [],
              posterPath: null,
              mpaaRating: 'G',
              contentScore: null,
              overview: null,
              director: null,
              topCast: [],
            },
          ],
        }),
      })
    })
    render(<HomePage />)
    await screen.findByText(/Obscure Title/)
    expect(screen.queryByText(/Directed by/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Starring/)).not.toBeInTheDocument()
  })

  it('flags titles with no known provider as availability unknown', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return Promise.resolve({ json: async () => ({ result: { id: 'r1' } }) })
      return Promise.resolve({
        json: async () => ({
          mode: 'FAMILY',
          titles: [{ id: 't3', name: 'Mystery Title', year: 2024, providers: [], posterPath: '/poster.jpg', mpaaRating: 'G', contentScore: null }],
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
      if (init?.method === 'POST') return Promise.resolve({ json: async () => ({ result: { id: 'r1' } }) })
      return Promise.resolve({
        json: async () => ({
          mode: 'FAMILY',
          titles: [{ id: 't4', name: 'No Poster Movie', year: 2024, providers: ['netflix'], posterPath: null, mpaaRating: 'PG', contentScore: null }],
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
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ titleId: 't1', rating: 'LIKED', mode: 'FAMILY' }) })
      )
    )
    expect(await screen.findByText(/Rated: LIKED/)).toBeInTheDocument()
  })

  it('shows a previously-submitted rating on initial load, before any click — survives a refresh', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return Promise.resolve({ json: async () => ({ result: { id: 'r1' } }) })
      return Promise.resolve({
        json: async () => ({
          mode: 'FAMILY',
          titles: [{ id: 't10', name: 'Already Rated Movie', year: 2020, providers: ['netflix'], posterPath: null, mpaaRating: 'PG', contentScore: null, tasteRating: 'LOVED' }],
        }),
      })
    })
    render(<HomePage />)
    expect(await screen.findByText(/Rated: LOVED/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: "I've seen this" })).not.toBeInTheDocument()
  })

  it('marks a title not-interested with a single click, scoped to the active mode', async () => {
    render(<HomePage />)
    await screen.findByText(/Jurassic Park/)
    fireEvent.click(screen.getByRole('button', { name: "I don't want to see this" }))
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/taste',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ titleId: 't1', rating: 'NOT_INTERESTED', mode: 'FAMILY' }) })
      )
    )
    expect(await screen.findByText(/Rated: NOT_INTERESTED/)).toBeInTheDocument()
  })

  it('shows a "Rate this" button for an unscored title in Adult Mode, and renders the report once scored', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && url.includes('/rate-content')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ score: { violence: 6, language: 3, sexNudity: 1, scariness: 4, sourceNotes: 'Found on Common Sense Media.' } }),
        })
      }
      if (init?.method === 'POST') return Promise.resolve({ json: async () => ({ result: { id: 'r1' } }) })
      return Promise.resolve({
        json: async () => ({
          mode: 'ADULT',
          titles: [{ id: 't5', name: 'An R Movie', year: 2024, providers: ['netflix'], posterPath: null, mpaaRating: 'R', contentScore: null }],
        }),
      })
    }) as unknown as typeof fetch

    render(<HomePage />)
    fireEvent.click(screen.getByRole('button', { name: 'Adult Mode' }))
    const button = await screen.findByRole('button', { name: /Why is this rated R/ })
    fireEvent.click(button)

    expect(await screen.findByText(/Found on Common Sense Media/)).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith('/api/titles/t5/rate-content', expect.objectContaining({ method: 'POST' }))
  })

  it('does not show a "Rate this" button in Family Mode', async () => {
    render(<HomePage />)
    await screen.findByText(/Jurassic Park/)
    expect(screen.queryByRole('button', { name: /Why is this rated/ })).not.toBeInTheDocument()
  })

  it('does not show a "Rate this" button in Adult Mode for a title with no MPAA rating (e.g. admitted via manual override)', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return Promise.resolve({ json: async () => ({ result: { id: 'r1' } }) })
      return Promise.resolve({
        json: async () => ({
          mode: 'ADULT',
          titles: [{ id: 't7', name: 'Manually Approved Title', year: 2024, providers: ['netflix'], posterPath: null, mpaaRating: null, contentScore: null }],
        }),
      })
    }) as unknown as typeof fetch

    render(<HomePage />)
    fireEvent.click(screen.getByRole('button', { name: 'Adult Mode' }))
    await screen.findByText(/Manually Approved Title/)
    expect(screen.queryByRole('button', { name: /Why is this rated/ })).not.toBeInTheDocument()
  })

  it('shows a retry option when rating content fails', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && url.includes('/rate-content')) {
        return Promise.resolve({ ok: false, json: async () => ({ error: 'timed out' }) })
      }
      if (init?.method === 'POST') return Promise.resolve({ json: async () => ({ result: { id: 'r1' } }) })
      return Promise.resolve({
        json: async () => ({
          mode: 'ADULT',
          titles: [{ id: 't6', name: 'A Slow Movie', year: 2024, providers: [], posterPath: null, mpaaRating: 'PG-13', contentScore: null }],
        }),
      })
    }) as unknown as typeof fetch

    render(<HomePage />)
    fireEvent.click(screen.getByRole('button', { name: 'Adult Mode' }))
    const button = await screen.findByRole('button', { name: /Why is this rated PG-13/ })
    fireEvent.click(button)

    expect(await screen.findByRole('button', { name: /Try again/ })).toBeInTheDocument()
  })
})
