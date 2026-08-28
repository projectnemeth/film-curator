import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { searchTitle, getWatchProviders, discoverByProvider, PROVIDER_IDS } from '../tmdb'

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
  it('requests discover sorted by popularity for the given provider', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) })
    global.fetch = fetchMock as unknown as typeof fetch

    await discoverByProvider(PROVIDER_IDS.netflix, 'movie')
    const calledUrl = fetchMock.mock.calls[0][0] as string
    expect(calledUrl).toContain('/discover/movie')
    expect(calledUrl).toContain(`with_watch_providers=${PROVIDER_IDS.netflix}`)
    expect(calledUrl).toContain('sort_by=popularity.desc')
  })
})
