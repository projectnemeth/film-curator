import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { searchTitle, getWatchProviders, discoverByProvider, getMovieDetails, PROVIDER_IDS } from '../tmdb'

const originalFetch = global.fetch
const originalEnv = process.env.TMDB_API_KEY

beforeEach(() => {
  process.env.TMDB_API_KEY = 'test-key'
})

afterEach(() => {
  global.fetch = originalFetch
  process.env.TMDB_API_KEY = originalEnv
})

describe('searchTitle', () => {
  it('returns results from the TMDB multi-search endpoint', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ id: 1, title: 'Jurassic Park', overview: '...', poster_path: '/x.jpg', release_date: '1993-06-11' }] }),
    }) as unknown as typeof fetch

    const results = await searchTitle('Jurassic Park')
    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('Jurassic Park')
  })
})

describe('getWatchProviders', () => {
  it('maps TMDB provider names to internal slugs, US region only', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: {
          US: { flatrate: [{ provider_id: 8, provider_name: 'Netflix' }, { provider_id: 337, provider_name: 'Disney Plus' }] },
        },
      }),
    }) as unknown as typeof fetch

    const providers = await getWatchProviders(1)
    expect(providers).toEqual(['netflix', 'disney_plus'])
  })

  it('returns an empty array when there is no US flatrate data', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: {} }) }) as unknown as typeof fetch
    const providers = await getWatchProviders(1)
    expect(providers).toEqual([])
  })
})

describe('discoverByProvider', () => {
  it('requests discover sorted by popularity for the given provider, defaulting to page 1', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) })
    global.fetch = fetchMock as unknown as typeof fetch

    await discoverByProvider(PROVIDER_IDS.netflix)
    const calledUrl = fetchMock.mock.calls[0][0] as string
    expect(calledUrl).toContain('/discover/movie')
    expect(calledUrl).toContain(`with_watch_providers=${PROVIDER_IDS.netflix}`)
    expect(calledUrl).toContain('sort_by=popularity.desc')
    expect(calledUrl).toContain('page=1')
  })

  it('requests a specific page when given one', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) })
    global.fetch = fetchMock as unknown as typeof fetch

    await discoverByProvider(PROVIDER_IDS.netflix, 3)
    const calledUrl = fetchMock.mock.calls[0][0] as string
    expect(calledUrl).toContain('page=3')
  })
})

describe('getMovieDetails', () => {
  it('requests append_to_response=credits,release_dates from the movie details endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    global.fetch = fetchMock as unknown as typeof fetch

    await getMovieDetails(1)
    const calledUrl = fetchMock.mock.calls[0][0] as string
    expect(calledUrl).toContain('/movie/1')
    expect(calledUrl).toContain('append_to_response=credits%2Crelease_dates')
  })

  it('returns the US certification for a movie', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        release_dates: {
          results: [
            { iso_3166_1: 'FR', release_dates: [{ certification: '', type: 3 }] },
            { iso_3166_1: 'US', release_dates: [{ certification: 'PG-13', type: 3 }] },
          ],
        },
      }),
    }) as unknown as typeof fetch

    expect((await getMovieDetails(1)).certification).toBe('PG-13')
  })

  it('prefers the wide theatrical release (type 3) when the US block has conflicting certifications', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        release_dates: {
          results: [
            {
              iso_3166_1: 'US',
              release_dates: [
                { certification: 'PG', type: 6 }, // an edited-for-TV re-release, listed first
                { certification: 'R', type: 3 }, // the actual wide theatrical release
                { certification: 'PG-13', type: 4 }, // a digital release
              ],
            },
          ],
        },
      }),
    }) as unknown as typeof fetch

    expect((await getMovieDetails(1)).certification).toBe('R')
  })

  it('falls back to the first available certification when no theatrical (type 3) entry exists', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        release_dates: {
          results: [
            {
              iso_3166_1: 'US',
              release_dates: [
                { certification: 'PG-13', type: 4 },
                { certification: 'R', type: 5 },
              ],
            },
          ],
        },
      }),
    }) as unknown as typeof fetch

    expect((await getMovieDetails(1)).certification).toBe('PG-13')
  })

  it('returns a null certification when there is no US entry or no release_dates block at all', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch
    expect((await getMovieDetails(1)).certification).toBeNull()
  })

  it('returns the director and top 3 billed cast, sorted by billing order', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        credits: {
          cast: [
            { name: 'Jeff Goldblum', order: 2 },
            { name: 'Sam Neill', order: 0 },
            { name: 'Laura Dern', order: 1 },
            { name: 'Richard Attenborough', order: 3 },
          ],
          crew: [
            { name: 'Kathleen Kennedy', job: 'Producer' },
            { name: 'Steven Spielberg', job: 'Director' },
          ],
        },
      }),
    }) as unknown as typeof fetch

    const result = await getMovieDetails(1)
    expect(result.director).toBe('Steven Spielberg')
    expect(result.topCast).toEqual(['Sam Neill', 'Laura Dern', 'Jeff Goldblum'])
  })

  it('returns a null director when no crew member has the Director job', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        credits: {
          cast: [
            { name: 'Winona Ryder', order: 0 },
            { name: 'David Harbour', order: 1 },
          ],
          crew: [{ name: 'A. Producer', job: 'Executive Producer' }],
        },
      }),
    }) as unknown as typeof fetch

    const result = await getMovieDetails(1)
    expect(result.director).toBeNull()
    expect(result.topCast).toEqual(['Winona Ryder', 'David Harbour'])
  })

  it('returns null director, null writer, and empty cast when credits are missing entirely', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch
    const result = await getMovieDetails(1)
    expect(result.director).toBeNull()
    expect(result.writer).toBeNull()
    expect(result.topCast).toEqual([])
  })

  it('prefers a Screenplay writer over a Story-only credit', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        credits: {
          cast: [],
          crew: [
            { name: 'Story Person', job: 'Story' },
            { name: 'Screenplay Person', job: 'Screenplay' },
          ],
        },
      }),
    }) as unknown as typeof fetch

    expect((await getMovieDetails(1)).writer).toBe('Screenplay Person')
  })

  it('falls back to a Writer-job or Story-job credit when no Screenplay credit exists', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        credits: { cast: [], crew: [{ name: 'Story Person', job: 'Story' }] },
      }),
    }) as unknown as typeof fetch

    expect((await getMovieDetails(1)).writer).toBe('Story Person')
  })

  it('returns the primary studio from production_companies', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ production_companies: [{ name: 'A24' }, { name: 'Some Co-Financier' }] }),
    }) as unknown as typeof fetch

    expect((await getMovieDetails(1)).studio).toBe('A24')
  })

  it('returns a null studio when there are no production companies listed', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ production_companies: [] }) }) as unknown as typeof fetch
    expect((await getMovieDetails(1)).studio).toBeNull()
  })
})
