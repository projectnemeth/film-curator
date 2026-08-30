import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import HomePage from '../page'

function title(overrides: Record<string, unknown> = {}) {
  return {
    id: 't1',
    name: 'Jurassic Park',
    year: 1993,
    providers: ['netflix'],
    posterPath: '/poster.jpg',
    mpaaRating: 'PG-13',
    contentScore: null,
    ...overrides,
  }
}

function mockRecommendations(notSeen: unknown[], loved: unknown[] = [], mode: 'FAMILY' | 'ADULT' = 'FAMILY') {
  ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, init?: RequestInit) => {
    if (init?.method === 'POST' && url.includes('/rate-content')) {
      return Promise.resolve({ ok: true, json: async () => ({ score: {} }) })
    }
    if (init?.method === 'POST') return Promise.resolve({ ok: true, json: async () => ({ result: { id: 'r1' } }) })
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ mode, notSeen, loved }) })
  })
}

describe('HomePage', () => {
  beforeEach(() => {
    global.fetch = vi.fn() as unknown as typeof fetch
    mockRecommendations([title()])
  })

  it('renders not-seen titles for the default mode', async () => {
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
    mockRecommendations([
      title({ overview: 'Dinosaurs run amok.', director: 'Steven Spielberg', topCast: ['Sam Neill', 'Laura Dern'] }),
    ])
    render(<HomePage />)
    expect(await screen.findByText('Dinosaurs run amok.')).toBeInTheDocument()
    expect(await screen.findByText(/Directed by Steven Spielberg/)).toBeInTheDocument()
    expect(await screen.findByText(/Starring Sam Neill, Laura Dern/)).toBeInTheDocument()
  })

  it('omits director and cast lines when there is nothing to show', async () => {
    mockRecommendations([title({ id: 't9', name: 'Obscure Title', mpaaRating: 'G', overview: null, director: null, topCast: [] })])
    render(<HomePage />)
    await screen.findByText(/Obscure Title/)
    expect(screen.queryByText(/Directed by/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Starring/)).not.toBeInTheDocument()
  })

  it('flags titles with no known provider as availability unknown', async () => {
    mockRecommendations([title({ id: 't3', name: 'Mystery Title', providers: [], mpaaRating: 'G' })])
    render(<HomePage />)
    expect(await screen.findByText(/availability unknown/)).toBeInTheDocument()
  })

  it('renders a poster image when posterPath is present', async () => {
    render(<HomePage />)
    const img = await screen.findByAltText(/Jurassic Park poster/i)
    expect(img).toHaveAttribute('src', expect.stringContaining('/poster.jpg'))
  })

  it('shows a placeholder when posterPath is null', async () => {
    mockRecommendations([title({ id: 't4', name: 'No Poster Movie', posterPath: null, mpaaRating: 'PG' })])
    render(<HomePage />)
    expect(await screen.findByText(/No Poster Movie/)).toBeInTheDocument()
    expect(screen.queryByAltText(/No Poster Movie poster/i)).not.toBeInTheDocument()
  })

  it('shows a message when the Not Seen section is empty', async () => {
    mockRecommendations([])
    render(<HomePage />)
    expect(await screen.findByText(/Nothing left to watch/)).toBeInTheDocument()
  })

  it('shows an error message instead of an empty state when the recommendations fetch fails', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => Promise.resolve({ ok: false, status: 500, json: async () => ({}) }))
    render(<HomePage />)
    expect(await screen.findByText(/Couldn't load your movies/)).toBeInTheDocument()
    expect(screen.queryByText(/Nothing left to watch/)).not.toBeInTheDocument()
  })

  it('redirects to /login when the recommendations fetch returns 401', async () => {
    const originalLocation = window.location
    Object.defineProperty(window, 'location', { value: { ...originalLocation, href: '' }, writable: true })
    ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => Promise.resolve({ ok: false, status: 401, json: async () => ({}) }))

    render(<HomePage />)
    await waitFor(() => expect(window.location.href).toBe('/login'))

    Object.defineProperty(window, 'location', { value: originalLocation, writable: true })
  })

  it('removes a title from Not Seen immediately after quick-rating it', async () => {
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
    await waitFor(() => expect(screen.queryByText(/Jurassic Park/)).not.toBeInTheDocument())
  })

  it('moves a title to the Loved section immediately after rating it Loved', async () => {
    render(<HomePage />)
    await screen.findByText(/Jurassic Park/)
    fireEvent.click(screen.getByRole('button', { name: "I've seen this" }))
    fireEvent.click(screen.getByRole('button', { name: 'Loved' }))

    expect(await screen.findByText(/Loved — Worth a Rewatch/)).toBeInTheDocument()
    expect(await screen.findByText(/Jurassic Park/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: "I've seen this" })).not.toBeInTheDocument()
  })

  it('renders titles already in the Loved section on initial load, with no quick-rate controls', async () => {
    mockRecommendations([], [title({ id: 't11', name: 'Already Loved Movie' })])
    render(<HomePage />)
    expect(await screen.findByText(/Already Loved Movie/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: "I've seen this" })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: "I don't want to see this" })).not.toBeInTheDocument()
  })

  it('removes a title from Not Seen after marking it not-interested, without adding it to Loved', async () => {
    render(<HomePage />)
    await screen.findByText(/Jurassic Park/)
    fireEvent.click(screen.getByRole('button', { name: "I don't want to see this" }))
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/taste',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ titleId: 't1', rating: 'NOT_INTERESTED', mode: 'FAMILY' }) })
      )
    )
    await waitFor(() => expect(screen.queryByText(/Jurassic Park/)).not.toBeInTheDocument())
    expect(screen.queryByText(/Loved — Worth a Rewatch/)).not.toBeInTheDocument()
  })

  it('keeps the title in Not Seen and shows an error when saving a quick rating fails', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && url === '/api/taste') return Promise.resolve({ ok: false, status: 500, json: async () => ({}) })
      if (init?.method === 'POST') return Promise.resolve({ ok: true, json: async () => ({ result: { id: 'r1' } }) })
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ mode: 'FAMILY', notSeen: [title()], loved: [] }) })
    })

    render(<HomePage />)
    await screen.findByText(/Jurassic Park/)
    fireEvent.click(screen.getByRole('button', { name: "I've seen this" }))
    fireEvent.click(screen.getByRole('button', { name: 'Liked' }))

    expect(await screen.findByText(/Couldn't save that rating/)).toBeInTheDocument()
    expect(screen.getByText(/Jurassic Park/)).toBeInTheDocument()
  })

  it('shows a "Rate this" button for an unscored title in Adult Mode, and renders the report once scored', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && url.includes('/rate-content')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ score: { violence: 6, language: 3, sexNudity: 1, scariness: 4, sourceNotes: 'Found on Common Sense Media.' } }),
        })
      }
      if (init?.method === 'POST') return Promise.resolve({ ok: true, json: async () => ({ result: { id: 'r1' } }) })
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ mode: 'ADULT', notSeen: [title({ id: 't5', name: 'An R Movie', posterPath: null, mpaaRating: 'R' })], loved: [] }),
      })
    })

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

  it('does not show a "Rate this" button in Adult Mode for a title with no MPAA rating', async () => {
    mockRecommendations([title({ id: 't7', name: 'Manually Approved Title', posterPath: null, mpaaRating: null })], [], 'ADULT')

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
      if (init?.method === 'POST') return Promise.resolve({ ok: true, json: async () => ({ result: { id: 'r1' } }) })
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ mode: 'ADULT', notSeen: [title({ id: 't6', name: 'A Slow Movie', providers: [], posterPath: null, mpaaRating: 'PG-13' })], loved: [] }),
      })
    })

    render(<HomePage />)
    fireEvent.click(screen.getByRole('button', { name: 'Adult Mode' }))
    const button = await screen.findByRole('button', { name: /Why is this rated PG-13/ })
    fireEvent.click(button)

    expect(await screen.findByRole('button', { name: /Try again/ })).toBeInTheDocument()
  })
})
