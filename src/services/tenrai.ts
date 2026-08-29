import type { AnimeDetail, AnimeEpisode, AnimeSummary, CachedPayload } from '../types/anime';
import { getStoredValue, setStoredValue } from './store';
import { getCurrentSeasonYear, inferSeasonFromDate, normalizeSeasonKey, type SeasonKey } from '../utils/season';

const BASE_URL = 'https://api.tenrai.org/v1';
const HOUR = 60 * 60 * 1000;
const RATE_LIMIT_RETRY_ATTEMPTS = 3;
const RATE_LIMIT_BASE_DELAY_MS = 1200;
const RATE_LIMIT_MAX_DELAY_MS = 10_000;
const EPISODE_ENDPOINT_TIMEOUT_MS = 3500;
const HOME_BACKGROUND_REFRESH_KEY = 'homeShelvesLastRefreshAt';
const HOME_BACKGROUND_REFRESH_INTERVAL_MS = 60 * 1000;
const ANIME_ENTITY_CACHE_KEY = 'tenrai:anime:entities';
const ANIME_ENTITY_TTL = 30 * 24 * HOUR;

export type TenraiApiHealthEvent = {
  service: 'tenrai';
  status: 'success' | 'failure' | 'rate-limited';
  path: string;
  occurredAt: number;
  statusCode?: number;
};

type TenraiApiHealthListener = (event: TenraiApiHealthEvent) => void;

type CacheFetchOptions<T> = {
  onUpdate?: (value: T) => void;
  forceRefresh?: boolean;
  cacheContext?: string;
  useDailyCacheKey?: boolean;
  upcomingSeasonFilter?: UpcomingSeasonFilter;
  upcomingRating?: 'g' | 'pg' | 'pg13' | 'r17' | 'r' | 'rx';
  topAnimeType?: 'TV' | 'OVA' | 'Movie' | 'Special' | 'ONA' | 'Music' | 'CM' | 'PV' | 'TV Special';
  topAnimeRating?: 'g' | 'pg' | 'pg13' | 'r17' | 'r' | 'rx';
  seasonYear?: number;
  season?: SeasonKey;
  seasonFilter?: UpcomingSeasonFilter;
  seasonContinuing?: boolean;
  seasonPageLimit?: number;
  seasonPageCount?: number;
};

type TopAnimeType = 'TV' | 'OVA' | 'Movie' | 'Special' | 'ONA' | 'Music' | 'CM' | 'PV' | 'TV Special';
type TopAnimeRating = 'g' | 'pg' | 'pg13' | 'r17' | 'r' | 'rx';
type TopAnimeFilter = 'bypopularity' | 'upcoming' | 'airing';

type UpcomingSeasonFilter = 'all' | 'tv' | 'movie' | 'ova' | 'special' | 'ona' | 'music';

export type AnimeSearchQueryType = 'TV' | 'OVA' | 'Movie' | 'Special' | 'ONA' | 'Music' | 'CM' | 'PV' | 'TV Special';
export type AnimeSearchQueryStatus = 'airing' | 'complete' | 'upcoming';
export type AnimeSearchQueryRating = 'g' | 'pg' | 'pg13' | 'r17' | 'r' | 'rx';
export type AnimeSearchQueryOrderBy =
  | 'mal_id'
  | 'title'
  | 'start_date'
  | 'end_date'
  | 'episodes'
  | 'score'
  | 'scored_by'
  | 'rank'
  | 'popularity'
  | 'members'
  | 'favorites';
export type SearchQuerySort = 'desc' | 'asc';
export type AnimeGenreFilterType = 'genres' | 'explicit_genres' | 'themes' | 'demographics';
export type ProducerOrderBy = 'mal_id' | 'count' | 'favorites' | 'established';

export type AnimeSearchQuery = {
  q: string;
  unapproved?: boolean;
  page?: number;
  limit?: number;
  type?: AnimeSearchQueryType;
  score?: number;
  min_score?: number;
  max_score?: number;
  status?: AnimeSearchQueryStatus;
  rating?: AnimeSearchQueryRating;
  sfw?: boolean;
  genres?: number[];
  genres_exclude?: number[];
  order_by?: AnimeSearchQueryOrderBy;
  sort?: SearchQuerySort;
  letter?: string;
  producers?: number[];
  start_date?: string;
  end_date?: string;
};

export type AnimeSearchResult = {
  data: AnimeSummary[];
  pagination: {
    currentPage: number;
    lastVisiblePage: number;
    hasNextPage: boolean;
  };
};

export type AnimeGenre = {
  mal_id: number;
  name: string;
  count: number;
};

export type ProducerSummary = {
  mal_id: number;
  title: string;
  favorites?: number;
  count?: number;
};

export type ProducerSearchQuery = {
  page?: number;
  limit?: number;
  q?: string;
  order_by?: ProducerOrderBy;
  sort?: SearchQuerySort;
  letter?: string;
};

export type ProducerSearchResult = {
  data: ProducerSummary[];
  pagination: {
    currentPage: number;
    lastVisiblePage: number;
    hasNextPage: boolean;
  };
};

type HomeRefreshCallbacks = {
  onSeasonal?: (value: AnimeSummary[]) => void;
  onPopular?: (value: AnimeSummary[]) => void;
  onLatestUpdated?: (value: AnimeSummary[]) => void;
  onLatestPromo?: (value: AnimeSummary[]) => void;
  onTopAiring?: (value: AnimeSummary[]) => void;
  onTopUpcoming?: (value: AnimeSummary[]) => void;
};

const inFlightRequests = new Map<string, Promise<unknown>>();
const tenraiApiHealthListeners = new Set<TenraiApiHealthListener>();

function notifyTenraiApiHealth(status: TenraiApiHealthEvent['status'], path: string, statusCode?: number) {
  if (!tenraiApiHealthListeners.size) return;

  const event: TenraiApiHealthEvent = {
    service: 'tenrai',
    status,
    path,
    occurredAt: Date.now(),
    ...(typeof statusCode === 'number' ? { statusCode } : {}),
  };

  for (const listener of tenraiApiHealthListeners) {
    listener(event);
  }
}

export function onTenraiApiHealth(listener: TenraiApiHealthListener) {
  tenraiApiHealthListeners.add(listener);
  return () => {
    tenraiApiHealthListeners.delete(listener);
  };
}

const UPCOMING_ALLOWED_FILTERS = new Set(['tv', 'movie', 'ova', 'special', 'ona', 'music']);

function mapUpcomingFilterToTopAnimeType(filter: UpcomingSeasonFilter): TopAnimeType | null {
  switch (filter) {
    case 'tv':
      return 'TV';
    case 'movie':
      return 'Movie';
    case 'ova':
      return 'OVA';
    case 'special':
      return 'Special';
    case 'ona':
      return 'ONA';
    case 'music':
      return 'Music';
    case 'all':
    default:
      return null;
  }
}

function normalizeUpcomingSeasonFilter(value: unknown): UpcomingSeasonFilter {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (UPCOMING_ALLOWED_FILTERS.has(normalized)) {
      return normalized as Exclude<UpcomingSeasonFilter, 'all'>;
    }
  }
  return 'all';
}

async function readGlobalCatalogContentPrefs() {
  const [allowNsfwRaw, upcomingSeasonFilterRaw] = await Promise.all([
    getStoredValue('allowNsfw', false),
    getStoredValue('upcomingSeasonFilter', 'all'),
  ]);

  return {
    allowNsfw: Boolean(allowNsfwRaw),
    upcomingSeasonFilter: normalizeUpcomingSeasonFilter(upcomingSeasonFilterRaw),
  };
}

function withTenraiContentFlags(
  path: string,
  options: {
    allowNsfw: boolean;
    page?: number;
    limit?: number;
    upcomingFilter?: UpcomingSeasonFilter;
  },
) {
  const [pathname, rawQuery = ''] = path.split('?');
  const params = new URLSearchParams(rawQuery);

  if (typeof options.page === 'number' && Number.isFinite(options.page)) {
    params.set('page', String(Math.max(1, Math.floor(options.page))));
  }

  if (typeof options.limit === 'number' && Number.isFinite(options.limit)) {
    params.set('limit', String(Math.max(1, Math.floor(options.limit))));
  }

  if (options.upcomingFilter && options.upcomingFilter !== 'all') {
    params.set('filter', options.upcomingFilter);
  }

  if (!options.allowNsfw) {
    params.set('sfw', 'true');
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export async function clearTenraiDataCache() {
  inFlightRequests.clear();
  await Promise.all([
    setStoredValue('tenraiCache', {} as Record<string, CachedPayload<unknown>>),
    setStoredValue('tenraiMeta', {} as Record<string, string | number | boolean>),
  ]);
}

interface TenraiNamedResource {
  mal_id?: number;
  name: string;
  count?: number;
}

interface TenraiTitleVariant {
  type?: string;
  title?: string;
}

interface TenraiAnime {
  mal_id: number;
  title: string;
  title_english?: string;
  title_japanese?: string;
  titles?: TenraiTitleVariant[];
  title_synonyms?: string[];
  images?: { jpg?: { large_image_url?: string; image_url?: string }; webp?: { large_image_url?: string; image_url?: string } };
  trailer?: { url?: string; embed_url?: string; images?: { maximum_image_url?: string; large_image_url?: string } };
  synopsis?: string;
  score?: number;
  year?: number;
  episodes?: number;
  type?: string;
  status?: string;
  studios?: TenraiNamedResource[];
  genres?: TenraiNamedResource[];
  explicit_genres?: TenraiNamedResource[];
  themes?: TenraiNamedResource[];
  demographics?: TenraiNamedResource[];
  producers?: TenraiNamedResource[];
  rating?: string;
  duration?: string;
  source?: string;
  rank?: number;
  popularity?: number;
  members?: number;
  aired?: { from?: string; to?: string; string?: string };
  season?: string;
}

interface TenraiListResponse {
  data: TenraiAnime[];
}

interface TenraiPagedListResponse extends TenraiListResponse {
  pagination?: {
    last_visible_page?: number;
    has_next_page?: boolean;
    current_page?: number;
  };
}

interface TenraiGenresResponse {
  data: TenraiNamedResource[];
}

interface TenraiProducer {
  mal_id: number;
  titles?: Array<{ title?: string; type?: string }>;
  favorites?: number;
  count?: number;
}

interface TenraiProducerListResponse {
  data: TenraiProducer[];
  pagination?: {
    current_page?: number;
    last_visible_page?: number;
    has_next_page?: boolean;
  };
}

interface TenraiDetailResponse {
  data: TenraiAnime;
}

interface TenraiEpisodeListItem {
  mal_id?: number;
  url?: string;
  title?: string;
  title_japanese?: string;
  title_romanji?: string;
  aired?: string;
  score?: number | null;
  filler?: boolean;
  recap?: boolean;
  forum_url?: string;
}

interface TenraiEpisodeListResponse {
  data: TenraiEpisodeListItem[];
  pagination?: {
    last_visible_page?: number;
    has_next_page?: boolean;
  };
}

interface TenraiEpisodeDetailItem {
  mal_id?: number;
  url?: string;
  title?: string;
  title_japanese?: string;
  title_romanji?: string;
  duration?: number;
  aired?: string;
  filler?: boolean;
  recap?: boolean;
  synopsis?: string;
}

interface TenraiEpisodeDetailResponse {
  data: TenraiEpisodeDetailItem;
}

function getLocalDateBucket() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const cacheKey = (path: string, options: { cacheContext?: string; useDailyCacheKey?: boolean } = {}) => {
  const base = `tenrai:${path}`;
  const withContext = options.cacheContext ? `${base}|ctx:${options.cacheContext}` : base;
  if (!options.useDailyCacheKey) return withContext;
  return `${withContext}|day:${getLocalDateBucket()}`;
};

const isSamePayload = <T>(a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);

const isFilled = (value?: string) => !!value?.trim();

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  return Promise.race([
    promise,
    wait(timeoutMs).then(() => {
      throw new Error(errorMessage);
    }),
  ]);
}

function parseRetryAfterMs(response: Response): number | null {
  const header = response.headers.get('Retry-After');
  if (!header) return null;

  const asSeconds = Number(header);
  if (!Number.isNaN(asSeconds)) return Math.max(0, asSeconds * 1000);

  const asDate = Date.parse(header);
  if (Number.isNaN(asDate)) return null;
  return Math.max(0, asDate - Date.now());
}

function buildBackoffMs(attempt: number) {
  const exponential = RATE_LIMIT_BASE_DELAY_MS * 2 ** attempt;
  const jitter = Math.floor(Math.random() * 400);
  return Math.min(RATE_LIMIT_MAX_DELAY_MS, exponential + jitter);
}

async function fetchTenraiJson(path: string) {
  let lastStatus = 0;
  let hadRateLimit = false;

  for (let attempt = 0; attempt <= RATE_LIMIT_RETRY_ATTEMPTS; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(`${BASE_URL}${path}`);
    } catch {
      notifyTenraiApiHealth('failure', path);
      throw new Error('Tenrai request failed: network');
    }

    lastStatus = response.status;

    if (response.ok) {
      notifyTenraiApiHealth('success', path, response.status);
      return response.json();
    }

    if (response.status === 429 && attempt < RATE_LIMIT_RETRY_ATTEMPTS) {
      hadRateLimit = true;
      const retryAfterMs = parseRetryAfterMs(response);
      await wait(retryAfterMs ?? buildBackoffMs(attempt));
      continue;
    }

    if (response.status === 429 || hadRateLimit) {
      notifyTenraiApiHealth('rate-limited', path, response.status);
    } else {
      notifyTenraiApiHealth('failure', path, response.status);
    }

    throw new Error(`Tenrai request failed: ${response.status}`);
  }

  if (lastStatus === 429 || hadRateLimit) {
    notifyTenraiApiHealth('rate-limited', path, lastStatus || 429);
  } else {
    notifyTenraiApiHealth('failure', path, lastStatus || undefined);
  }

  throw new Error(`Tenrai request failed: ${lastStatus || 'unknown'}`);
}

export async function probeTenraiApiHealth() {
  await fetchTenraiJson('/top/anime?limit=1&page=1');
}

function mergeAnimeSummary(existing: AnimeSummary | undefined, incoming: AnimeSummary): AnimeSummary {
  if (!existing) return incoming;

  const mergedSynonyms = [
    ...(existing.titleSynonyms ?? []),
    ...(incoming.titleSynonyms ?? []),
  ].filter((entry) => isFilled(entry));
  const titleSynonyms = mergedSynonyms.length ? Array.from(new Set(mergedSynonyms)) : undefined;

  return {
    id: incoming.id,
    title: isFilled(incoming.title) ? incoming.title : existing.title,
    titleEnglish: isFilled(incoming.titleEnglish) ? incoming.titleEnglish : existing.titleEnglish,
    titleJapanese: isFilled(incoming.titleJapanese) ? incoming.titleJapanese : existing.titleJapanese,
    titleSynonyms,
    duration: isFilled(incoming.duration) ? incoming.duration : existing.duration,
    durationMinutes: incoming.durationMinutes ?? existing.durationMinutes,
    image: isFilled(incoming.image) ? incoming.image : existing.image,
    banner: isFilled(incoming.banner) ? incoming.banner : existing.banner,
    synopsis: isFilled(incoming.synopsis) ? incoming.synopsis : existing.synopsis,
    score: incoming.score ?? existing.score,
    rank: incoming.rank ?? existing.rank,
    popularity: incoming.popularity ?? existing.popularity,
    members: incoming.members ?? existing.members,
    year: incoming.year ?? existing.year,
    season: incoming.season ?? existing.season,
    seasonYear: incoming.seasonYear ?? existing.seasonYear,
    airingDate: isFilled(incoming.airingDate) ? incoming.airingDate : existing.airingDate,
    episodes: incoming.episodes ?? existing.episodes,
    status: isFilled(incoming.status) ? incoming.status : existing.status,
    studios: incoming.studios.length ? incoming.studios : existing.studios,
    genres: incoming.genres.length ? incoming.genres : existing.genres,
    trailerUrl: isFilled(incoming.trailerUrl) ? incoming.trailerUrl : existing.trailerUrl,
    mediaType: isFilled(incoming.mediaType) ? incoming.mediaType : existing.mediaType,
    animeScheduleRoute: isFilled(incoming.animeScheduleRoute)
      ? incoming.animeScheduleRoute
      : existing.animeScheduleRoute,
  };
}

const isAnimeSummaryLike = (value: unknown): value is AnimeSummary =>
  !!value && typeof value === 'object' && 'id' in (value as Record<string, unknown>) && 'title' in (value as Record<string, unknown>);

const isIdArray = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'number');

const isAnimeSummaryArray = (value: unknown): value is AnimeSummary[] =>
  Array.isArray(value) && value.every((item) => isAnimeSummaryLike(item));

const readAnimeEntityMap = (cache: Record<string, unknown>) => {
  const payload = cache[ANIME_ENTITY_CACHE_KEY] as CachedPayload<Record<string, AnimeSummary>> | undefined;
  return payload?.value ?? {};
};

function hydrateFromEntityMap(ids: number[], map: Record<string, AnimeSummary>) {
  return ids
    .map((id) => map[String(id)])
    .filter((anime): anime is AnimeSummary => !!anime);
}

function mergeEntityMap(
  currentMap: Record<string, AnimeSummary>,
  animeList: AnimeSummary[],
) {
  const nextMap = { ...currentMap };
  for (const anime of animeList) {
    const key = String(anime.id);
    nextMap[key] = mergeAnimeSummary(nextMap[key], anime);
  }
  return nextMap;
}

function parseDurationMinutes(rawDuration?: string): number | undefined {
  if (!rawDuration) return undefined;

  const text = rawDuration.toLowerCase();
  const hourMatch = text.match(/(\d+)\s*hr/);
  const minuteMatch = text.match(/(\d+)\s*min/);

  const hours = hourMatch ? Number(hourMatch[1]) : 0;
  const minutes = minuteMatch ? Number(minuteMatch[1]) : 0;
  const total = hours * 60 + minutes;

  return Number.isFinite(total) && total > 0 ? total : undefined;
}

function selectTenraiTitle(anime: TenraiAnime, type: string): string | undefined {
  const variants = anime.titles ?? [];
  const match = variants.find((entry) => entry.type?.toLowerCase() === type.toLowerCase());
  const value = match?.title?.trim();
  return value ? value : undefined;
}

function normalizeTenraiSynonyms(anime: TenraiAnime): string[] | undefined {
  const fromVariants = (anime.titles ?? [])
    .map((entry) => entry.title?.trim() ?? '')
    .filter((entry) => entry.length > 0);
  const fromSynonyms = (anime.title_synonyms ?? [])
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  const merged = Array.from(new Set([...fromSynonyms, ...fromVariants]));
  return merged.length ? merged : undefined;
}

function normalizeAnime(anime: TenraiAnime): AnimeSummary {
  const normalizedSeason = normalizeSeasonKey(anime.season);
  const inferredSeason = inferSeasonFromDate(anime.aired?.from || anime.aired?.to || anime.aired?.string);

  const image =
    anime.images?.webp?.large_image_url ||
    anime.images?.jpg?.large_image_url ||
    anime.images?.webp?.image_url ||
    anime.images?.jpg?.image_url ||
    '/assets/logo.png';

  return {
    id: anime.mal_id,
    tenraiId: anime.mal_id,
    title: anime.title || selectTenraiTitle(anime, 'Default') || selectTenraiTitle(anime, 'Romaji') || selectTenraiTitle(anime, 'English') || 'Unknown title',
    titleEnglish: anime.title_english || selectTenraiTitle(anime, 'English'),
    titleJapanese: anime.title_japanese || selectTenraiTitle(anime, 'Japanese'),
    titleSynonyms: normalizeTenraiSynonyms(anime),
    duration: anime.duration,
    durationMinutes: parseDurationMinutes(anime.duration),
    image,
    banner: anime.trailer?.images?.maximum_image_url || anime.trailer?.images?.large_image_url || image,
    synopsis: anime.synopsis || 'No synopsis has been recorded on this tape yet.',
    score: anime.score,
    rank: anime.rank,
    popularity: anime.popularity,
    members: anime.members,
    year: anime.year,
    season: normalizedSeason ?? inferredSeason?.season ?? undefined,
    seasonYear: anime.year ?? inferredSeason?.year,
    airingDate: anime.aired?.from || anime.aired?.to || anime.aired?.string,
    episodes: anime.episodes,
    mediaType: anime.type,
    status: anime.status,
    studios: anime.studios?.map((studio) => studio.name) ?? [],
    genres: anime.genres?.map((genre) => genre.name) ?? [],
    trailerUrl: anime.trailer?.embed_url || anime.trailer?.url,
  };
}

function normalizeDetail(anime: TenraiAnime): AnimeDetail {
  const toTaxonomyItems = (items?: TenraiNamedResource[]) =>
    (items ?? [])
      .filter((item) => typeof item.mal_id === 'number' && item.mal_id > 0 && typeof item.name === 'string' && item.name.trim().length > 0)
      .map((item) => ({ id: Math.floor(item.mal_id as number), name: item.name.trim() }));

  return {
    ...normalizeAnime(anime),
    rating: anime.rating,
    duration: anime.duration,
    source: anime.source,
    rank: anime.rank,
    popularity: anime.popularity,
    members: anime.members,
    aired: anime.aired?.string,
    genreItems: toTaxonomyItems(anime.genres),
    explicitGenreItems: toTaxonomyItems(anime.explicit_genres),
    themeItems: toTaxonomyItems(anime.themes),
    demographicItems: toTaxonomyItems(anime.demographics),
    producerItems: toTaxonomyItems(anime.producers),
  };
}

function toEpisodeDurationMinutes(duration?: number) {
  if (!Number.isFinite(duration) || !duration || duration <= 0) return undefined;
  if (duration <= 90) return Math.round(duration);
  return Math.max(1, Math.round(duration / 60));
}

function normalizeEpisodeListItem(item: TenraiEpisodeListItem, fallbackIndex: number): AnimeEpisode {
  const malId = typeof item.mal_id === 'number' && item.mal_id > 0 ? item.mal_id : undefined;
  return {
    episodeNumber: malId ?? fallbackIndex,
    malId,
    url: item.url?.trim() || undefined,
    title: item.title?.trim() || undefined,
    titleJapanese: item.title_japanese?.trim() || undefined,
    titleRomanji: item.title_romanji?.trim() || undefined,
    aired: item.aired?.trim() || undefined,
    score: typeof item.score === 'number' ? item.score : null,
    filler: item.filler === true,
    recap: item.recap === true,
    forumUrl: item.forum_url?.trim() || undefined,
  };
}

function normalizeEpisodeDetailItem(item: TenraiEpisodeDetailItem, fallbackEpisodeNumber: number): AnimeEpisode {
  const malId = typeof item.mal_id === 'number' && item.mal_id > 0 ? item.mal_id : undefined;
  return {
    episodeNumber: malId ?? fallbackEpisodeNumber,
    malId,
    url: item.url?.trim() || undefined,
    title: item.title?.trim() || undefined,
    titleJapanese: item.title_japanese?.trim() || undefined,
    titleRomanji: item.title_romanji?.trim() || undefined,
    durationMinutes: toEpisodeDurationMinutes(item.duration),
    aired: item.aired?.trim() || undefined,
    filler: item.filler === true,
    recap: item.recap === true,
    synopsis: item.synopsis?.trim() || undefined,
  };
}

function mergeEpisodeDetail(existing: AnimeEpisode, incoming: AnimeEpisode): AnimeEpisode {
  return {
    ...existing,
    ...incoming,
    episodeNumber: existing.episodeNumber,
    score: incoming.score ?? existing.score ?? null,
    forumUrl: incoming.forumUrl || existing.forumUrl,
    synopsis: incoming.synopsis || existing.synopsis,
  };
}

async function patchCachedEpisodeListEntries(id: string | number, episode: AnimeEpisode) {
  const cache = await getStoredValue('tenraiCache', {} as Record<string, CachedPayload<unknown>>);
  const animePrefix = `tenrai:/anime/${id}/episodes?page=`;
  let changed = false;
  let sawEpisodeListCache = false;
  let matchedEpisodeInCache = false;
  const nextCache: Record<string, CachedPayload<unknown>> = { ...cache };

  for (const [key, payload] of Object.entries(cache)) {
    if (!key.startsWith(animePrefix)) continue;
    sawEpisodeListCache = true;
    const value = payload?.value as { data?: AnimeEpisode[] } | undefined;
    if (!value || !Array.isArray(value.data)) continue;

    let matched = false;
    const nextData = value.data.map((entry) => {
      if (entry.episodeNumber !== episode.episodeNumber) return entry;
      matched = true;
      return mergeEpisodeDetail(entry, episode);
    });

    if (!matched) continue;
    matchedEpisodeInCache = true;
    changed = true;
    nextCache[key] = {
      ...payload,
      value: {
        ...(value as Record<string, unknown>),
        data: nextData,
      },
    };
  }

  // If detail exists for an episode but no cached list page contains it,
  // expire list pages so next read refreshes and picks up newly aired episodes.
  if (sawEpisodeListCache && !matchedEpisodeInCache) {
    const now = Date.now();
    for (const [key, payload] of Object.entries(nextCache)) {
      if (!key.startsWith(animePrefix)) continue;
      nextCache[key] = {
        ...payload,
        expiresAt: now - 1,
      };
    }
    changed = true;
  }

  if (!changed) return;
  await setStoredValue('tenraiCache', nextCache);
}

async function fetchAndStore<T>(
  key: string,
  path: string,
  ttl: number,
  mapper: (json: unknown) => T,
): Promise<T> {
  const existing = inFlightRequests.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const request = (async () => {
    const value = mapper(await fetchTenraiJson(path));
    const now = Date.now();
    const currentCache = await getStoredValue('tenraiCache', {});
    await setStoredValue('tenraiCache', {
      ...currentCache,
      [key]: { value, savedAt: now, expiresAt: now + ttl },
    });
    return value;
  })();

  inFlightRequests.set(key, request);
  try {
    return await request;
  } finally {
    inFlightRequests.delete(key);
  }
}

async function cachedFetch<T>(
  path: string,
  ttl: number,
  mapper: (json: unknown) => T,
  options: CacheFetchOptions<T> = {},
): Promise<T> {
  const key = cacheKey(path, options);
  const cache = await getStoredValue('tenraiCache', {});
  const cached = cache[key] as CachedPayload<T> | undefined;
  const now = Date.now();

  if (cached) {
    const shouldRevalidate = options.forceRefresh || cached.expiresAt <= now;
    if (shouldRevalidate) {
      void fetchAndStore(key, path, ttl, mapper)
        .then((nextValue) => {
          if (!isSamePayload(cached.value, nextValue)) {
            options.onUpdate?.(nextValue);
          }
        })
        .catch(() => {
          // Ignore background refresh errors when serving stale cache first.
        });
    }
    return cached.value;
  }

  return fetchAndStore(key, path, ttl, mapper);
}

async function fetchAndStoreAnimeList(
  key: string,
  path: string,
  ttl: number,
  mapper: (json: unknown) => AnimeSummary[],
) {
  const existing = inFlightRequests.get(key) as Promise<AnimeSummary[]> | undefined;
  if (existing) return existing;

  const request = (async () => {
    const rawList = mapper(await fetchTenraiJson(path));

    const now = Date.now();
    const cache = await getStoredValue('tenraiCache', {});
    const mergedMap = mergeEntityMap(readAnimeEntityMap(cache), rawList);
    const ids = rawList.map((anime) => anime.id);

    await setStoredValue('tenraiCache', {
      ...cache,
      [ANIME_ENTITY_CACHE_KEY]: { value: mergedMap, savedAt: now, expiresAt: now + ANIME_ENTITY_TTL },
      [key]: { value: ids, savedAt: now, expiresAt: now + ttl },
    });

    return hydrateFromEntityMap(ids, mergedMap);
  })();

  inFlightRequests.set(key, request);
  try {
    return await request;
  } finally {
    inFlightRequests.delete(key);
  }
}

async function cachedAnimeListFetch(
  path: string,
  ttl: number,
  mapper: (json: unknown) => AnimeSummary[],
  options: CacheFetchOptions<AnimeSummary[]> = {},
) {
  const key = cacheKey(path, options);
  const cache = await getStoredValue('tenraiCache', {});
  const cached = cache[key] as CachedPayload<unknown> | undefined;
  const now = Date.now();

  if (cached) {
    // Migrate old list caches that stored full anime objects into ID-only caches.
    if (isAnimeSummaryArray(cached.value)) {
      const mergedMap = mergeEntityMap(readAnimeEntityMap(cache), cached.value);
      const ids = cached.value.map((anime) => anime.id);
      await setStoredValue('tenraiCache', {
        ...cache,
        [ANIME_ENTITY_CACHE_KEY]: { value: mergedMap, savedAt: now, expiresAt: now + ANIME_ENTITY_TTL },
        [key]: { value: ids, savedAt: cached.savedAt, expiresAt: cached.expiresAt },
      });
      return hydrateFromEntityMap(ids, mergedMap);
    }

    if (isIdArray(cached.value)) {
      const entityMap = readAnimeEntityMap(cache);
      const hydrated = hydrateFromEntityMap(cached.value, entityMap);

      if (hydrated.length !== cached.value.length) {
        try {
          return await fetchAndStoreAnimeList(key, path, ttl, mapper);
        } catch {
          return hydrated;
        }
      }

      const shouldRevalidate = options.forceRefresh || cached.expiresAt <= now;
      if (shouldRevalidate) {
        void fetchAndStoreAnimeList(key, path, ttl, mapper)
          .then((nextValue) => {
            if (!isSamePayload(hydrated, nextValue)) {
              options.onUpdate?.(nextValue);
            }
          })
          .catch(() => {
            // Ignore background refresh errors when serving stale cache first.
          });
      }

      return hydrated;
    }
  }

  return fetchAndStoreAnimeList(key, path, ttl, mapper);
}

export async function getTopAnime(limit = 10, options?: CacheFetchOptions<AnimeSummary[]>) {
  const prefs = await readGlobalCatalogContentPrefs();
  const result = await getTopAnimeByFilterPaged({
    limit,
    filter: 'bypopularity',
    allowNsfw: prefs.allowNsfw,
    topAnimeType: options?.topAnimeType,
    topAnimeRating: options?.topAnimeRating,
    cachePrefix: 'top-popular',
    forceRefresh: options?.forceRefresh,
  });
  options?.onUpdate?.(result);
  return result;
}

async function getTopAnimeByFilterPaged(params: {
  limit: number;
  filter: TopAnimeFilter;
  allowNsfw: boolean;
  topAnimeType?: TopAnimeType;
  topAnimeRating?: TopAnimeRating;
  cachePrefix: string;
  forceRefresh?: boolean;
}) {
  const safeLimit = Math.max(1, Math.floor(params.limit));
  const pageLimit = 25;
  const maxPages = 2;
  const merged: AnimeSummary[] = [];
  const seen = new Set<number>();

  for (let page = 1; page <= maxPages; page += 1) {
    const baseParams = new URLSearchParams({ filter: params.filter });
    if (params.topAnimeType) {
      baseParams.set('type', params.topAnimeType);
    }
    if (params.topAnimeRating) {
      baseParams.set('rating', params.topAnimeRating);
    }

    const path = withTenraiContentFlags(`/top/anime?${baseParams.toString()}`, {
      allowNsfw: params.allowNsfw,
      page,
      limit: pageLimit,
    });

    const pagePayload = await cachedFetch<{ items: AnimeSummary[]; hasNextPage: boolean }>(
      path,
      6 * HOUR,
      (json) => {
        const payload = json as TenraiPagedListResponse;
        return {
          items: (payload.data ?? []).map(normalizeAnime),
          hasNextPage: payload.pagination?.has_next_page === true,
        };
      },
      {
        forceRefresh: params.forceRefresh,
        cacheContext: `${params.cachePrefix}:type:${params.topAnimeType ?? 'none'}:rating:${params.topAnimeRating ?? 'none'}:page:${page}`,
        useDailyCacheKey: true,
      },
    ).catch(() => ({ items: [] as AnimeSummary[], hasNextPage: false }));

    for (const anime of pagePayload.items) {
      if (seen.has(anime.id)) continue;
      seen.add(anime.id);
      merged.push(anime);
    }

    if (!pagePayload.hasNextPage) break;
  }

  return merged.slice(0, safeLimit);
}

export async function getSeasonalAnime(limit = 10, options?: CacheFetchOptions<AnimeSummary[]>) {
  const prefs = await readGlobalCatalogContentPrefs();
  const nowSeason = getCurrentSeasonYear();
  const selectedSeason = options?.season ?? nowSeason.season;
  const selectedYear = options?.seasonYear ?? nowSeason.year;
  const safeLimit = Math.max(1, Math.floor(limit));
  const pageLimit = Math.max(1, Math.min(25, Math.floor(options?.seasonPageLimit ?? 10)));
  const pageCount = Math.max(1, Math.min(4, Math.floor(options?.seasonPageCount ?? 2)));
  const seasonFilter = options?.seasonFilter && options.seasonFilter !== 'all' ? options.seasonFilter : null;
  const seasonContinuing = options?.seasonContinuing ?? true;

  const merged: AnimeSummary[] = [];
  const seen = new Set<number>();

  for (let page = 1; page <= pageCount; page += 1) {
    const seasonParams = new URLSearchParams();
    if (seasonFilter) {
      seasonParams.set('filter', seasonFilter);
    }
    if (seasonContinuing) {
      seasonParams.set('continuing', 'true');
    }

    const seasonPath = `/seasons/${selectedYear}/${selectedSeason}${seasonParams.toString() ? `?${seasonParams.toString()}` : ''}`;
    const path = withTenraiContentFlags(seasonPath, {
      allowNsfw: prefs.allowNsfw,
      page,
      limit: pageLimit,
    });

    const pagePayload = await cachedFetch<{ items: AnimeSummary[]; hasNextPage: boolean }>(
      path,
      6 * HOUR,
      (json) => {
        const payload = json as TenraiPagedListResponse;
        return {
          items: (payload.data ?? []).map(normalizeAnime),
          hasNextPage: payload.pagination?.has_next_page === true,
        };
      },
      {
        forceRefresh: options?.forceRefresh,
        cacheContext: `seasonal:${selectedYear}:${selectedSeason}:filter:${seasonFilter ?? 'all'}:continuing:${seasonContinuing ? '1' : '0'}:limit:${pageLimit}:page:${page}`,
        useDailyCacheKey: true,
      },
    ).catch(() => ({ items: [] as AnimeSummary[], hasNextPage: false }));

    for (const anime of pagePayload.items) {
      if (seen.has(anime.id)) continue;
      seen.add(anime.id);
      merged.push({
        ...anime,
        season: anime.season ?? selectedSeason,
        seasonYear: anime.seasonYear ?? selectedYear,
      });
    }

    if (!pagePayload.hasNextPage) break;
  }

  const result = merged.slice(0, safeLimit);
  options?.onUpdate?.(result);
  return result;
}

// Tenrai does not serve Jikan's /watch/episodes and /watch/promos endpoints, so both
// shelves are rebuilt from the season endpoints: newest premieres of the running season
// for "latest updated", and upcoming titles that already have a promo for "latest promo".
export async function getLatestUpdatedAnime(limit = 10, options?: CacheFetchOptions<AnimeSummary[]>) {
  const prefs = await readGlobalCatalogContentPrefs();
  const path = withTenraiContentFlags('/seasons/now?order_by=start_date&sort=desc', {
    allowNsfw: prefs.allowNsfw,
    limit,
  });

  return cachedAnimeListFetch(path, 2 * HOUR, (json) =>
    (json as TenraiPagedListResponse).data.map((anime) => {
      const normalized = normalizeAnime(anime);
      return { ...normalized, status: normalized.status ?? 'Latest update' };
    }),
    { ...options, cacheContext: 'latest-updated', useDailyCacheKey: true },
  ).catch(() => []);
}

export async function getLatestPromoAnime(limit = 10, options?: CacheFetchOptions<AnimeSummary[]>) {
  const prefs = await readGlobalCatalogContentPrefs();
  // Over-fetch, because only a fraction of upcoming entries carry a trailer.
  const path = withTenraiContentFlags('/seasons/upcoming?order_by=start_date&sort=asc', {
    allowNsfw: prefs.allowNsfw,
    limit: Math.min(25, Math.max(limit * 2, limit)),
  });

  return cachedAnimeListFetch(path, 2 * HOUR, (json) =>
    (json as TenraiPagedListResponse).data
      .map((anime) => normalizeAnime(anime))
      .filter((anime) => isFilled(anime.trailerUrl))
      .slice(0, limit)
      .map((anime) => ({ ...anime, status: anime.status ?? 'Latest promo' })),
    { ...options, cacheContext: 'latest-promo', useDailyCacheKey: true },
  ).catch(() => []);
}

export async function getTopAiringAnime(limit = 10, options?: CacheFetchOptions<AnimeSummary[]>) {
  const prefs = await readGlobalCatalogContentPrefs();
  const result = await getTopAnimeByFilterPaged({
    limit,
    filter: 'airing',
    allowNsfw: prefs.allowNsfw,
    topAnimeType: options?.topAnimeType,
    topAnimeRating: options?.topAnimeRating,
    cachePrefix: 'top-airing',
    forceRefresh: options?.forceRefresh,
  });
  options?.onUpdate?.(result);
  return result;
}

export async function getTopUpcomingAnime(limit = 10, options?: CacheFetchOptions<AnimeSummary[]>) {
  const prefs = await readGlobalCatalogContentPrefs();
  const activeUpcomingFilter = options?.upcomingSeasonFilter ?? prefs.upcomingSeasonFilter;
  const activeUpcomingRating = options?.upcomingRating;
  const topAnimeType = mapUpcomingFilterToTopAnimeType(activeUpcomingFilter);
  const result = await getTopAnimeByFilterPaged({
    limit,
    filter: 'upcoming',
    allowNsfw: prefs.allowNsfw,
    topAnimeType: topAnimeType ?? undefined,
    topAnimeRating: activeUpcomingRating,
    cachePrefix: `top-upcoming:season:${activeUpcomingFilter}`,
    forceRefresh: options?.forceRefresh,
  });
  options?.onUpdate?.(result);
  return result;
}

export async function searchAnime(query: string) {
  const results = await searchAnimeWithQuery({ q: query.trim(), limit: 16 });
  return results.data;
}

export async function searchAnimeWithQuery(query: AnimeSearchQuery): Promise<AnimeSearchResult> {
  const prefs = await readGlobalCatalogContentPrefs();
  const normalizedQuery = query.q.trim();
  const hasFilterCriteria = Boolean(
    query.type ||
    query.status ||
    query.rating ||
    query.order_by ||
    query.sort ||
    query.letter?.trim() ||
    query.start_date ||
    query.end_date ||
    (query.genres && query.genres.length > 0) ||
    (query.genres_exclude && query.genres_exclude.length > 0) ||
    (query.producers && query.producers.length > 0) ||
    (typeof query.min_score === 'number' && Number.isFinite(query.min_score)) ||
    (typeof query.max_score === 'number' && Number.isFinite(query.max_score)) ||
    (typeof query.score === 'number' && Number.isFinite(query.score))
  );

  if (!normalizedQuery && !hasFilterCriteria) {
    return {
      data: [],
      pagination: {
        currentPage: 1,
        lastVisiblePage: 1,
        hasNextPage: false,
      },
    };
  }

  const params = new URLSearchParams();
  if (normalizedQuery) params.set('q', normalizedQuery);
  if (typeof query.page === 'number' && Number.isFinite(query.page)) {
    params.set('page', String(Math.max(1, Math.floor(query.page))));
  }
  if (typeof query.limit === 'number' && Number.isFinite(query.limit)) {
    params.set('limit', String(Math.max(1, Math.floor(query.limit))));
  }
  if (query.type) params.set('type', query.type);
  if (typeof query.score === 'number' && Number.isFinite(query.score)) params.set('score', String(query.score));
  if (typeof query.min_score === 'number' && Number.isFinite(query.min_score)) params.set('min_score', String(query.min_score));
  if (typeof query.max_score === 'number' && Number.isFinite(query.max_score)) params.set('max_score', String(query.max_score));
  if (query.status) params.set('status', query.status);
  if (query.rating) params.set('rating', query.rating);
  if (query.order_by) params.set('order_by', query.order_by);
  if (query.sort) params.set('sort', query.sort);
  if (query.letter) params.set('letter', query.letter.trim());
  if (query.start_date) params.set('start_date', query.start_date);
  if (query.end_date) params.set('end_date', query.end_date);
  if (query.unapproved) params.set('unapproved', 'true');
  if (query.genres && query.genres.length > 0) params.set('genres', query.genres.join(','));
  if (query.genres_exclude && query.genres_exclude.length > 0) params.set('genres_exclude', query.genres_exclude.join(','));
  if (query.producers && query.producers.length > 0) params.set('producers', query.producers.join(','));

  const effectiveAllowNsfw = query.sfw === true ? false : prefs.allowNsfw;
  const path = withTenraiContentFlags(`/anime?${params.toString()}`, {
    allowNsfw: effectiveAllowNsfw,
  });

  return cachedFetch(path, HOUR, (json) => {
    const payload = json as TenraiPagedListResponse;
    return {
      data: (payload.data ?? []).map(normalizeAnime),
      pagination: {
        currentPage: payload.pagination?.current_page ?? 1,
        lastVisiblePage: payload.pagination?.last_visible_page ?? 1,
        hasNextPage: payload.pagination?.has_next_page === true,
      },
    };
  }, {
    cacheContext: `search-advanced:${params.toString()}`,
    useDailyCacheKey: true,
  }).catch(() => ({
    data: [],
    pagination: {
      currentPage: 1,
      lastVisiblePage: 1,
      hasNextPage: false,
    },
  }));
}

export function getAnimeDetails(id: string | number) {
  const normalizedId = String(id).trim();
  return cachedFetch(
    `/anime/${id}/full`,
    HOUR,
    (json) => normalizeDetail((json as TenraiDetailResponse).data),
    { cacheContext: `anime-detail:${normalizedId}`, useDailyCacheKey: true },
  )
    .then(async (detail) => {
      const cache = await getStoredValue('tenraiCache', {});
      const now = Date.now();
      const mergedMap = mergeEntityMap(readAnimeEntityMap(cache), [detail]);
      await setStoredValue('tenraiCache', {
        ...cache,
        [ANIME_ENTITY_CACHE_KEY]: { value: mergedMap, savedAt: now, expiresAt: now + ANIME_ENTITY_TTL },
      });
      return detail;
    })
    .catch(() => {
      throw new Error('Anime details unavailable');
    });
}

export function getAnimeEpisodes(id: string | number, page = 1) {
  const safePage = Math.max(1, Math.floor(page));
  return withTimeout(
    cachedFetch(`/anime/${id}/episodes?page=${safePage}`, 2 * HOUR, (json) => {
      const payload = json as TenraiEpisodeListResponse;
      const episodes = (payload.data ?? []).map((item, index) => normalizeEpisodeListItem(item, index + 1));
      return {
        data: episodes,
        pagination: {
          lastVisiblePage: payload.pagination?.last_visible_page ?? safePage,
          hasNextPage: payload.pagination?.has_next_page === true,
        },
      };
    }),
    EPISODE_ENDPOINT_TIMEOUT_MS,
    'Tenrai episode list request timed out',
  ).catch(() => ({
    data: [] as AnimeEpisode[],
    pagination: {
      lastVisiblePage: safePage,
      hasNextPage: false,
    },
  }));
}

export async function getAnimeEpisodesAll(id: string | number, maxPages = 8) {
  const boundedMaxPages = Math.max(1, Math.floor(maxPages));
  const combined: AnimeEpisode[] = [];
  let page = 1;

  while (page <= boundedMaxPages) {
    const payload = await getAnimeEpisodes(id, page);
    combined.push(...payload.data);
    if (!payload.pagination.hasNextPage) break;
    page += 1;
  }

  const byEpisode = new Map<number, AnimeEpisode>();
  for (const episode of combined) {
    if (!byEpisode.has(episode.episodeNumber)) {
      byEpisode.set(episode.episodeNumber, episode);
    }
  }

  return Array.from(byEpisode.values()).sort((a, b) => a.episodeNumber - b.episodeNumber);
}

export function getAnimeEpisodeById(id: string | number, episode: number) {
  const safeEpisode = Math.max(1, Math.floor(episode));
  return withTimeout(
    cachedFetch(`/anime/${id}/episodes/${safeEpisode}`, 2 * HOUR, (json) =>
      normalizeEpisodeDetailItem((json as TenraiEpisodeDetailResponse).data, safeEpisode),
    ),
    EPISODE_ENDPOINT_TIMEOUT_MS,
    'Tenrai episode detail request timed out',
  )
    .then(async (detail) => {
      await patchCachedEpisodeListEntries(id, detail).catch(() => {
        // Ignore cache patch failures; detail response is still valid.
      });
      return detail;
    })
    .catch(() => ({
      episodeNumber: safeEpisode,
    } as AnimeEpisode));
}

export function getAnimeGenres(filter: AnimeGenreFilterType = 'genres') {
  return cachedFetch(`/genres/anime?filter=${encodeURIComponent(filter)}`, 24 * HOUR, (json) =>
    (json as TenraiGenresResponse).data.map((genre) => ({
      mal_id: genre.mal_id ?? 0,
      name: genre.name,
      count: genre.count ?? 0,
    })),
    {
      cacheContext: `genres:${filter}`,
      useDailyCacheKey: true,
    },
  ).catch(() => []);
}

function normalizeProducer(entry: TenraiProducer): ProducerSummary {
  const fromTitles = (entry.titles ?? [])
    .map((titleEntry) => titleEntry.title?.trim() ?? '')
    .find((title) => title.length > 0);
  return {
    mal_id: entry.mal_id,
    title: fromTitles || `Producer ${entry.mal_id}`,
    favorites: entry.favorites,
    count: entry.count,
  };
}

export function searchProducers(query: ProducerSearchQuery = {}): Promise<ProducerSearchResult> {
  const params = new URLSearchParams();
  if (typeof query.page === 'number' && Number.isFinite(query.page)) params.set('page', String(Math.max(1, Math.floor(query.page))));
  if (typeof query.limit === 'number' && Number.isFinite(query.limit)) params.set('limit', String(Math.max(1, Math.floor(query.limit))));
  if (query.q?.trim()) params.set('q', query.q.trim());
  if (query.order_by) params.set('order_by', query.order_by);
  if (query.sort) params.set('sort', query.sort);
  if (query.letter?.trim()) params.set('letter', query.letter.trim());

  const path = `/producers${params.toString() ? `?${params.toString()}` : ''}`;
  return cachedFetch(path, 12 * HOUR, (json) => {
    const payload = json as TenraiProducerListResponse;
    return {
      data: (payload.data ?? []).map(normalizeProducer),
      pagination: {
        currentPage: payload.pagination?.current_page ?? 1,
        lastVisiblePage: payload.pagination?.last_visible_page ?? 1,
        hasNextPage: payload.pagination?.has_next_page === true,
      },
    };
  }, {
    cacheContext: `producers:${params.toString()}`,
    useDailyCacheKey: true,
  }).catch(() => ({
    data: [],
    pagination: {
      currentPage: 1,
      lastVisiblePage: 1,
      hasNextPage: false,
    },
  }));
}

export async function refreshHomeShelvesIfNeeded(limit = 20, callbacks: HomeRefreshCallbacks = {}) {
  const now = Date.now();
  const meta = await getStoredValue('tenraiMeta', {});
  const lastRefresh = Number(meta[HOME_BACKGROUND_REFRESH_KEY] ?? 0);
  if (Number.isFinite(lastRefresh) && now - lastRefresh < HOME_BACKGROUND_REFRESH_INTERVAL_MS) return;

  const requests = [
    getLatestUpdatedAnime(limit, { forceRefresh: true, onUpdate: callbacks.onLatestUpdated }),
    getLatestPromoAnime(limit, { forceRefresh: true, onUpdate: callbacks.onLatestPromo }),
  ];

  void Promise.allSettled(requests).then(async (results) => {
    const hasSuccess = results.some((result) => result.status === 'fulfilled');
    if (!hasSuccess) return;

    const latestMeta = await getStoredValue('tenraiMeta', {});
    await setStoredValue('tenraiMeta', {
      ...latestMeta,
      [HOME_BACKGROUND_REFRESH_KEY]: now,
    });
  });
}
