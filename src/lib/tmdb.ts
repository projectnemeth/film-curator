const TMDB_BASE = 'https://api.themoviedb.org/3'

export type TmdbSearchResult = {
  id: number
  title?: string
  name?: string
  release_date?: string
  first_air_date?: string
  overview: string
  poster_path: string | null
}

type TmdbWatchProvider = {
  provider_id: number
  provider_name: string
}

const PROVIDER_NAME_MAP: Record<string, string> = {
  Netflix: 'netflix',
  'Disney Plus': 'disney_plus',
  'Amazon Prime Video': 'prime_video',
  Peacock: 'peacock',
}

export const PROVIDER_IDS = {
  netflix: 8,
  disney_plus: 337,
  prime_video: 9,
  peacock: 386,
}

async function tmdbFetch(path: string, params: Record<string, string> = {}) {
  const apiKey = process.env.TMDB_API_KEY
  if (!apiKey) throw new Error('TMDB_API_KEY is not set')
  const url = new URL(TMDB_BASE + path)
  url.searchParams.set('api_key', apiKey)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`TMDB request failed: ${res.status}`)
  return res.json()
}

export async function searchTitle(query: string): Promise<TmdbSearchResult[]> {
  const data = await tmdbFetch('/search/multi', { query })
  return data.results
}

export async function getWatchProviders(tmdbId: number, mediaType: 'movie' | 'tv'): Promise<string[]> {
  const data = await tmdbFetch(`/${mediaType}/${tmdbId}/watch/providers`)
  const flatrate: TmdbWatchProvider[] = data.results?.US?.flatrate ?? []
  return flatrate.map((p) => PROVIDER_NAME_MAP[p.provider_name]).filter((slug): slug is string => Boolean(slug))
}

export async function discoverByProvider(providerId: number, mediaType: 'movie' | 'tv', page: number = 1): Promise<TmdbSearchResult[]> {
  const data = await tmdbFetch(`/discover/${mediaType}`, {
    with_watch_providers: String(providerId),
    watch_region: 'US',
    sort_by: 'popularity.desc',
    page: String(page),
  })
  return data.results
}

// TMDB release_dates `type`: 1=Premiere, 2=Limited theatrical, 3=Theatrical,
// 4=Digital, 5=Physical, 6=TV. A single US block can list several of these,
// each with its own crowd-sourced certification, and they don't always
// agree (a digital/TV re-release entry can carry a different value than the
// original theatrical release). Wide theatrical (3) is treated as the
// canonical MPAA source; other types are only a fallback when no theatrical
// entry exists at all.
type TmdbMovieReleaseDate = { certification: string; type: number }
type TmdbMovieReleaseDatesResult = { iso_3166_1: string; release_dates: TmdbMovieReleaseDate[] }
type TmdbTvContentRatingsResult = { iso_3166_1: string; rating: string }
const THEATRICAL_RELEASE_TYPE = 3

export async function getCertification(tmdbId: number, mediaType: 'movie' | 'tv'): Promise<string | null> {
  if (mediaType === 'movie') {
    const data = await tmdbFetch(`/movie/${tmdbId}/release_dates`)
    const results: TmdbMovieReleaseDatesResult[] = data.results ?? []
    const us = results.find((r) => r.iso_3166_1 === 'US')
    const withCerts = (us?.release_dates ?? []).filter((rd) => rd.certification)
    if (withCerts.length === 0) return null
    const theatrical = withCerts.find((rd) => rd.type === THEATRICAL_RELEASE_TYPE)
    return (theatrical ?? withCerts[0]).certification
  }
  const data = await tmdbFetch(`/tv/${tmdbId}/content_ratings`)
  const results: TmdbTvContentRatingsResult[] = data.results ?? []
  const us = results.find((r) => r.iso_3166_1 === 'US')
  return us?.rating || null
}

const TOP_CAST_COUNT = 3

type TmdbCastMember = { name: string; order: number }
type TmdbCrewMember = { name: string; job: string }

export type Credits = { director: string | null; topCast: string[] }

export async function getCredits(tmdbId: number, mediaType: 'movie' | 'tv'): Promise<Credits> {
  const data = await tmdbFetch(`/${mediaType}/${tmdbId}/credits`)
  const cast: TmdbCastMember[] = data.cast ?? []
  const crew: TmdbCrewMember[] = data.crew ?? []

  const topCast = [...cast]
    .sort((a, b) => a.order - b.order)
    .slice(0, TOP_CAST_COUNT)
    .map((c) => c.name)

  const director = crew.find((c) => c.job === 'Director')?.name ?? null

  return { director, topCast }
}
