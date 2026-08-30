import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { searchTitle, getWatchProviders, discoverByProvider, getCertification, getCredits, PROVIDER_IDS } from '../tmdb'

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

    const providers = await getWatchProviders(1, 'movie')
    expect(providers).toEqual(['netflix', 'disney_plus'])
  })

  it('returns an empty array when there is no US flatrate data', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: {} }) }) as unknown as typeof fetch
    const providers = await getWatchProviders(1, 'movie')
    expect(providers).toEqual([])
  })
})

describe('discoverByProvider', () => {
  it('requests discover sorted by popularity for the given provider, defaulting to page 1', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) })
    global.fetch = fetchMock as unknown as typeof fetch

    await discoverByProvider(PROVIDER_IDS.netflix, 'movie')
    const calledUrl = fetchMock.mock.calls[0][0] as string
    expect(calledUrl).toContain('/discover/movie')
    expect(calledUrl).toContain(`with_watch_providers=${PROVIDER_IDS.netflix}`)
    expect(calledUrl).toContain('sort_by=popularity.desc')
    expect(calledUrl).toContain('page=1')
  })

  it('requests a specific page when given one', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) })
    global.fetch = fetchMock as unknown as typeof fetch

    await discoverByProvider(PROVIDER_IDS.netflix, 'movie', 3)
    const calledUrl = fetchMock.mock.calls[0][0] as string
    expect(calledUrl).toContain('page=3')
  })
})

describe('getCertification', () => {
  it('returns the US certification for a movie', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { iso_3166_1: 'FR', release_dates: [{ certification: '', type: 3 }] },
          { iso_3166_1: 'US', release_dates: [{ certification: 'PG-13', type: 3 }] },
        ],
      }),
    }) as unknown as typeof fetch

    expect(await getCertification(1, 'movie')).toBe('PG-13')
  })

  it('prefers the wide theatrical release (type 3) when the US block has conflicting certifications', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
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
      }),
    }) as unknown as typeof fetch

    expect(await getCertification(1, 'movie')).toBe('R')
  })

  it('falls back to the first available certification when no theatrical (type 3) entry exists', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            iso_3166_1: 'US',
            release_dates: [
              { certification: 'PG-13', type: 4 },
              { certification: 'R', type: 5 },
            ],
          },
        ],
      }),
    }) as unknown as typeof fetch

    expect(await getCertification(1, 'movie')).toBe('PG-13')
  })

  it('returns the US rating for a TV show', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ iso_3166_1: 'GB', rating: '15' }, { iso_3166_1: 'US', rating: 'TV-14' }] }),
    }) as unknown as typeof fetch

    expect(await getCertification(1, 'tv')).toBe('TV-14')
  })

  it('returns null when there is no US entry', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) }) as unknown as typeof fetch
    expect(await getCertification(1, 'movie')).toBeNull()
  })

  it('returns null when the US entry has no certification value set', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ iso_3166_1: 'US', release_dates: [{ certification: '' }] }] }),
    }) as unknown as typeof fetch
    expect(await getCertification(1, 'movie')).toBeNull()
  })
})

describe('getCredits', () => {
  it('returns the director and top 3 billed cast for a movie, sorted by billing order', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
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
      }),
    }) as unknown as typeof fetch

    const result = await getCredits(1, 'movie')
    expect(result.director).toBe('Steven Spielberg')
    expect(result.topCast).toEqual(['Sam Neill', 'Laura Dern', 'Jeff Goldblum'])
  })

  it('returns null director and top cast for a TV show with no Director-credited crew', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        cast: [
          { name: 'Winona Ryder', order: 0 },
          { name: 'David Harbour', order: 1 },
        ],
        crew: [{ name: 'The Duffer Brothers', job: 'Executive Producer' }],
      }),
    }) as unknown as typeof fetch

    const result = await getCredits(1, 'tv')
    expect(result.director).toBeNull()
    expect(result.topCast).toEqual(['Winona Ryder', 'David Harbour'])
  })

  it('returns null director and empty cast when the response has neither', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ cast: [], crew: [] }) }) as unknown as typeof fetch
    const result = await getCredits(1, 'movie')
    expect(result.director).toBeNull()
    expect(result.topCast).toEqual([])
  })
})
