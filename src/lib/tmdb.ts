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

export async function getWatchProviders(tmdbId: number): Promise<string[]> {
  const data = await tmdbFetch(`/movie/${tmdbId}/watch/providers`)
  const flatrate: TmdbWatchProvider[] = data.results?.US?.flatrate ?? []
  return flatrate.map((p) => PROVIDER_NAME_MAP[p.provider_name]).filter((slug): slug is string => Boolean(slug))
}

export async function discoverByProvider(providerId: number, page: number = 1): Promise<TmdbSearchResult[]> {
  const data = await tmdbFetch('/discover/movie', {
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
const THEATRICAL_RELEASE_TYPE = 3

const TOP_CAST_COUNT = 3

type TmdbCastMember = { name: string; order: number }
type TmdbCrewMember = { name: string; job: string }
type TmdbProductionCompany = { name: string }

export type MovieDetails = {
  certification: string | null
  director: string | null
  writer: string | null
  topCast: string[]
  studio: string | null
}

// The writer credit isn't a single standardized TMDB job — a screenplay-only
// writer, an original-story writer, and a novelist-adapted-from are all
// separate crew entries. Prefer the closest to "wrote this movie" first.
const WRITER_JOB_PRIORITY = ['Screenplay', 'Writer', 'Story']

// Consolidates what used to be two separate TMDB calls (release_dates,
// credits) into one, and picks up studio (production_companies, native to
// the base movie-details response) for free in the same request.
export async function getMovieDetails(tmdbId: number): Promise<MovieDetails> {
  const data = await tmdbFetch(`/movie/${tmdbId}`, { append_to_response: 'credits,release_dates' })

  const releaseResults: TmdbMovieReleaseDatesResult[] = data.release_dates?.results ?? []
  const us = releaseResults.find((r) => r.iso_3166_1 === 'US')
  const withCerts = (us?.release_dates ?? []).filter((rd) => rd.certification)
  const theatrical = withCerts.find((rd) => rd.type === THEATRICAL_RELEASE_TYPE)
  const certification = withCerts.length === 0 ? null : (theatrical ?? withCerts[0]).certification

  const cast: TmdbCastMember[] = data.credits?.cast ?? []
  const crew: TmdbCrewMember[] = data.credits?.crew ?? []

  const topCast = [...cast]
    .sort((a, b) => a.order - b.order)
    .slice(0, TOP_CAST_COUNT)
    .map((c) => c.name)

  const director = crew.find((c) => c.job === 'Director')?.name ?? null
  const writer = WRITER_JOB_PRIORITY.map((job) => crew.find((c) => c.job === job)?.name).find(Boolean) ?? null

  const companies: TmdbProductionCompany[] = data.production_companies ?? []
  const studio = companies[0]?.name ?? null

  return { certification, director, writer, topCast, studio }
}
