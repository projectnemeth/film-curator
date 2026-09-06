import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
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

function mockRecommendations(
  notSeen: unknown[],
  loved: unknown[] = [],
  mode: 'FAMILY' | 'ADULT' = 'FAMILY',
  watchlist: unknown[] = []
) {
  ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, init?: RequestInit) => {
    if (init?.method === 'POST' && url.includes('/rate-content')) {
      return Promise.resolve({ ok: true, json: async () => ({ score: {} }) })
    }
    if (init?.method === 'POST') return Promise.resolve({ ok: true, json: async () => ({ result: { id: 'r1' } }) })
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ mode, notSeen, watchlist, loved }) })
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

  it('shows the plot overview, director, writer, top cast, and studio when present', async () => {
    mockRecommendations([
      title({
        overview: 'Dinosaurs run amok.',
        director: 'Steven Spielberg',
        writer: 'David Koepp',
        topCast: ['Sam Neill', 'Laura Dern'],
        studio: 'Universal Pictures',
      }),
    ])
    render(<HomePage />)
    expect(await screen.findByText('Dinosaurs run amok.')).toBeInTheDocument()
    expect(await screen.findByText(/Directed by Steven Spielberg/)).toBeInTheDocument()
    expect(await screen.findByText(/Written by David Koepp/)).toBeInTheDocument()
    expect(await screen.findByText(/Starring Sam Neill, Laura Dern/)).toBeInTheDocument()
    expect(await screen.findByText('Universal Pictures')).toBeInTheDocument()
  })

  it('omits director, writer, cast, and studio lines when there is nothing to show', async () => {
    mockRecommendations([
      title({ id: 't9', name: 'Obscure Title', mpaaRating: 'G', overview: null, director: null, writer: null, topCast: [], studio: null }),
    ])
    render(<HomePage />)
    await screen.findByText(/Obscure Title/)
    expect(screen.queryByText(/Directed by/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Written by/)).not.toBeInTheDocument()
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

  it('shows a "Save this!" button on Not Seen cards, and saving moves the title to Watchlist', async () => {
    render(<HomePage />)
    await screen.findByText(/Jurassic Park/)
    fireEvent.click(screen.getByRole('button', { name: 'Save this!' }))

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/taste',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ titleId: 't1', rating: 'WATCHLISTED', mode: 'FAMILY' }) })
      )
    )
    expect(await screen.findByText('Watchlist')).toBeInTheDocument()
    expect(screen.getByText(/Jurassic Park/)).toBeInTheDocument()
    expect(screen.queryByText(/Nothing left to watch/)).toBeInTheDocument()
  })

  it('shows quick-rate buttons directly (no expand step) and a Remove link on Watchlist cards', async () => {
    mockRecommendations([], [], 'FAMILY', [title({ id: 't7', name: 'Saved Movie' })])
    render(<HomePage />)
    await screen.findByText(/Saved Movie/)

    expect(screen.getByRole('button', { name: 'Loved' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Liked' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Disliked' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove from Watchlist' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: "I've seen this" })).not.toBeInTheDocument()
  })

  it('moves a watchlisted title to Loved when rated Loved from the Watchlist section', async () => {
    mockRecommendations([], [], 'FAMILY', [title({ id: 't7', name: 'Saved Movie' })])
    render(<HomePage />)
    await screen.findByText(/Saved Movie/)
    fireEvent.click(screen.getByRole('button', { name: 'Loved' }))

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/taste',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ titleId: 't7', rating: 'LOVED', mode: 'FAMILY' }) })
      )
    )
    expect(await screen.findByText(/Loved — Worth a Rewatch/)).toBeInTheDocument()
    expect(screen.getByText(/Saved Movie/)).toBeInTheDocument()
    expect(screen.queryByText('Watchlist')).not.toBeInTheDocument()
  })

  it('moves a watchlisted title back to Not Seen when removed from the Watchlist', async () => {
    mockRecommendations([], [], 'FAMILY', [title({ id: 't7', name: 'Saved Movie' })])
    render(<HomePage />)
    await screen.findByText(/Saved Movie/)
    fireEvent.click(screen.getByRole('button', { name: 'Remove from Watchlist' }))

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/taste',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ titleId: 't7', rating: 'NOT_SEEN', mode: 'FAMILY' }) })
      )
    )
    await waitFor(() => expect(screen.queryByText('Watchlist')).not.toBeInTheDocument())
    expect(screen.getByText(/Saved Movie/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: "I've seen this" })).toBeInTheDocument()
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
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ mode: 'FAMILY', notSeen: [title()], watchlist: [], loved: [] }) })
    })

    render(<HomePage />)
    await screen.findByText(/Jurassic Park/)
    fireEvent.click(screen.getByRole('button', { name: "I've seen this" }))
    fireEvent.click(screen.getByRole('button', { name: 'Liked' }))

    expect(await screen.findByText(/Couldn't save that rating/)).toBeInTheDocument()
    expect(screen.getByText(/Jurassic Park/)).toBeInTheDocument()
  })

  it('shows a note instead of a button for an unscored title in Adult Mode, and never requests scoring', async () => {
    mockRecommendations([title({ id: 't5', name: 'An R Movie', posterPath: null, mpaaRating: 'R' })], [], 'ADULT')

    render(<HomePage />)
    fireEvent.click(screen.getByRole('button', { name: 'Adult Mode' }))

    expect(await screen.findByText(/Content details are added during the catalog refresh/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Why is this rated/ })).not.toBeInTheDocument()
    // The app must never ask anything to generate a score on demand.
    expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining('/rate-content'), expect.anything())
  })

  it('renders the stored content report for a title that already has one', async () => {
    mockRecommendations(
      [
        title({
          id: 't5',
          name: 'An R Movie',
          posterPath: null,
          mpaaRating: 'R',
          contentScore: { violence: 6, language: 3, sexNudity: 1, scariness: 4, sourceNotes: 'Found on Common Sense Media.' },
        }),
      ],
      [],
      'ADULT'
    )

    render(<HomePage />)
    fireEvent.click(screen.getByRole('button', { name: 'Adult Mode' }))

    expect(await screen.findByText(/Found on Common Sense Media/)).toBeInTheDocument()
    expect(screen.getByText(/Violence 6\/10/)).toBeInTheDocument()
    expect(screen.queryByText(/added during the catalog refresh/)).not.toBeInTheDocument()
  })

  it('does not show the content-details note in Family Mode', async () => {
    render(<HomePage />)
    await screen.findByText(/Jurassic Park/)
    expect(screen.queryByText(/added during the catalog refresh/)).not.toBeInTheDocument()
  })

  it('does not show the content-details note for a title with no MPAA rating', async () => {
    mockRecommendations([title({ id: 't7', name: 'Manually Approved Title', posterPath: null, mpaaRating: null })], [], 'ADULT')

    render(<HomePage />)
    fireEvent.click(screen.getByRole('button', { name: 'Adult Mode' }))
    await screen.findByText(/Manually Approved Title/)
    expect(screen.queryByText(/added during the catalog refresh/)).not.toBeInTheDocument()
  })

  it('gives each section the id its jump link points at', async () => {
    mockRecommendations([title()], [title({ id: 't8', name: 'The Iron Giant' })], 'FAMILY', [
      title({ id: 't9', name: 'Arrival' }),
    ])

    const { container } = render(<HomePage />)
    await screen.findByText(/Jurassic Park/)

    expect(container.querySelector('section#not-seen')).not.toBeNull()
    expect(container.querySelector('section#watchlist')).not.toBeNull()
    expect(container.querySelector('section#loved')).not.toBeNull()
  })

  it('renders the section jump nav with counts once the dashboard loads', async () => {
    mockRecommendations([title()], [title({ id: 't8', name: 'The Iron Giant' })], 'FAMILY', [
      title({ id: 't9', name: 'Arrival' }),
    ])

    render(<HomePage />)
    await screen.findByText(/Jurassic Park/)

    const jumpNav = screen.getByRole('navigation', { name: 'dashboard sections' })
    expect(jumpNav).toBeInTheDocument()
    expect(within(jumpNav).getByRole('link', { name: 'Watchlist (1)' })).toHaveAttribute('href', '#watchlist')
    expect(within(jumpNav).getByRole('link', { name: 'Loved (1)' })).toHaveAttribute('href', '#loved')
  })

  it('does not render the section jump nav while recommendations are loading', async () => {
    render(<HomePage />)
    expect(screen.queryByRole('navigation', { name: 'dashboard sections' })).toBeNull()
    // let the in-flight load settle so the pending state update lands inside the test
    await screen.findByText(/Jurassic Park/)
    expect(screen.getByRole('navigation', { name: 'dashboard sections' })).toBeInTheDocument()
  })

  it('lazy-loads poster images so a phone does not fetch every poster up front', async () => {
    const { container } = render(<HomePage />)
    await screen.findByText(/Jurassic Park/)
    const posters = container.querySelectorAll('img')
    expect(posters.length).toBeGreaterThan(0)
    posters.forEach((img) => expect(img).toHaveAttribute('loading', 'lazy'))
  })

  it('gives the card action controls a 44px minimum touch target', async () => {
    render(<HomePage />)
    await screen.findByText(/Jurassic Park/)
    // 44px is the Apple/Android minimum; these sit inches apart on a phone
    // and one of them is destructive, so mis-taps matter.
    for (const name of ["I've seen this", 'Save this!', "I don't want to see this"]) {
      expect(screen.getByRole('button', { name }).className).toContain('min-h-[44px]')
    }
  })

  it('gives the quick-rating buttons a 44px minimum touch target', async () => {
    mockRecommendations([], [], 'FAMILY', [title({ id: 't10', name: 'Arrival' })])
    render(<HomePage />)
    await screen.findByText(/Arrival/)
    for (const name of ['Disliked', 'Liked', 'Loved']) {
      expect(screen.getByRole('button', { name }).className).toContain('min-h-[44px]')
    }
  })
})
