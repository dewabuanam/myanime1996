import type { AnimeDetail, AnimeSummary, CachedPayload } from '../types/anime';
import { getStoredValue, setStoredValue } from './store';

const BASE_URL = 'https://api.jikan.moe/v4';
const HOUR = 60 * 60 * 1000;
const RATE_LIMIT_RETRY_ATTEMPTS = 3;
const RATE_LIMIT_BASE_DELAY_MS = 1200;
const RATE_LIMIT_MAX_DELAY_MS = 10_000;
const HOME_BACKGROUND_REFRESH_KEY = 'homeShelvesLastRefreshAt';
const HOME_BACKGROUND_REFRESH_INTERVAL_MS = 60 * 1000;
const ANIME_ENTITY_CACHE_KEY = 'jikan:anime:entities';
const ANIME_ENTITY_TTL = 30 * 24 * HOUR;

type CacheFetchOptions<T> = {
  onUpdate?: (value: T) => void;
  forceRefresh?: boolean;
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

export async function clearJikanDataCache() {
  inFlightRequests.clear();
  await Promise.all([
    setStoredValue('jikanCache', {} as Record<string, CachedPayload<unknown>>),
    setStoredValue('jikanMeta', {} as Record<string, string | number | boolean>),
  ]);
}

interface JikanNamedResource {
  name: string;
}

interface JikanTitleVariant {
  type?: string;
  title?: string;
}

interface JikanAnime {
  mal_id: number;
  title: string;
  title_english?: string;
  title_japanese?: string;
  titles?: JikanTitleVariant[];
  title_synonyms?: string[];
  images?: { jpg?: { large_image_url?: string; image_url?: string }; webp?: { large_image_url?: string; image_url?: string } };
  trailer?: { url?: string; embed_url?: string; images?: { maximum_image_url?: string; large_image_url?: string } };
  synopsis?: string;
  score?: number;
  year?: number;
  episodes?: number;
  type?: string;
  status?: string;
  studios?: JikanNamedResource[];
  genres?: JikanNamedResource[];
  rating?: string;
  duration?: string;
  source?: string;
  rank?: number;
  popularity?: number;
  aired?: { from?: string; to?: string; string?: string };
}

interface JikanListResponse {
  data: JikanAnime[];
}

interface JikanDetailResponse {
  data: JikanAnime;
}

interface JikanWatchEpisode {
  mal_id?: number;
  title?: string;
}

interface JikanWatchEpisodeItem {
  entry: JikanAnime;
  episodes?: JikanWatchEpisode[];
  date?: string;
}

interface JikanWatchEpisodeListResponse {
  data: JikanWatchEpisodeItem[];
}

interface JikanTrailerImages {
  image_url?: string;
  small_image_url?: string;
  medium_image_url?: string;
  large_image_url?: string;
  maximum_image_url?: string;
}

interface JikanWatchTrailer {
  url?: string;
  embed_url?: string;
  images?: JikanTrailerImages;
}

interface JikanWatchPromoItem {
  title?: string;
  entry: JikanAnime;
  trailer?: JikanWatchTrailer;
}

interface JikanWatchPromoListResponse {
  data: JikanWatchPromoItem[];
}

const cacheKey = (path: string) => `jikan:${path}`;

const isSamePayload = <T>(a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);

const isFilled = (value?: string) => !!value?.trim();

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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

async function fetchJikanJson(path: string) {
  let lastStatus = 0;

  for (let attempt = 0; attempt <= RATE_LIMIT_RETRY_ATTEMPTS; attempt += 1) {
    const response = await fetch(`${BASE_URL}${path}`);
    lastStatus = response.status;

    if (response.ok) {
      return response.json();
    }

    if (response.status === 429 && attempt < RATE_LIMIT_RETRY_ATTEMPTS) {
      const retryAfterMs = parseRetryAfterMs(response);
      await wait(retryAfterMs ?? buildBackoffMs(attempt));
      continue;
    }

    throw new Error(`Jikan request failed: ${response.status}`);
  }

  throw new Error(`Jikan request failed: ${lastStatus || 'unknown'}`);
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
    year: incoming.year ?? existing.year,
    airingDate: isFilled(incoming.airingDate) ? incoming.airingDate : existing.airingDate,
    episodes: incoming.episodes ?? existing.episodes,
    status: isFilled(incoming.status) ? incoming.status : existing.status,
    studios: incoming.studios.length ? incoming.studios : existing.studios,
    genres: incoming.genres.length ? incoming.genres : existing.genres,
    trailerUrl: isFilled(incoming.trailerUrl) ? incoming.trailerUrl : existing.trailerUrl,
    mediaType: isFilled(incoming.mediaType) ? incoming.mediaType : existing.mediaType,
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

function selectJikanTitle(anime: JikanAnime, type: string): string | undefined {
  const variants = anime.titles ?? [];
  const match = variants.find((entry) => entry.type?.toLowerCase() === type.toLowerCase());
  const value = match?.title?.trim();
  return value ? value : undefined;
}

function normalizeJikanSynonyms(anime: JikanAnime): string[] | undefined {
  const fromVariants = (anime.titles ?? [])
    .map((entry) => entry.title?.trim() ?? '')
    .filter((entry) => entry.length > 0);
  const fromSynonyms = (anime.title_synonyms ?? [])
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  const merged = Array.from(new Set([...fromSynonyms, ...fromVariants]));
  return merged.length ? merged : undefined;
}

function normalizeAnime(anime: JikanAnime): AnimeSummary {
  const image =
    anime.images?.webp?.large_image_url ||
    anime.images?.jpg?.large_image_url ||
    anime.images?.webp?.image_url ||
    anime.images?.jpg?.image_url ||
    '/assets/logo.png';

  return {
    id: anime.mal_id,
    title: anime.title || selectJikanTitle(anime, 'Default') || selectJikanTitle(anime, 'Romaji') || selectJikanTitle(anime, 'English') || 'Unknown title',
    titleEnglish: anime.title_english || selectJikanTitle(anime, 'English'),
    titleJapanese: anime.title_japanese || selectJikanTitle(anime, 'Japanese'),
    titleSynonyms: normalizeJikanSynonyms(anime),
    duration: anime.duration,
    durationMinutes: parseDurationMinutes(anime.duration),
    image,
    banner: anime.trailer?.images?.maximum_image_url || anime.trailer?.images?.large_image_url || image,
    synopsis: anime.synopsis || 'No synopsis has been recorded on this tape yet.',
    score: anime.score,
    year: anime.year,
    airingDate: anime.aired?.from || anime.aired?.to || anime.aired?.string,
    episodes: anime.episodes,
    mediaType: anime.type,
    status: anime.status,
    studios: anime.studios?.map((studio) => studio.name) ?? [],
    genres: anime.genres?.map((genre) => genre.name) ?? [],
    trailerUrl: anime.trailer?.embed_url || anime.trailer?.url,
  };
}

function normalizeDetail(anime: JikanAnime): AnimeDetail {
  return {
    ...normalizeAnime(anime),
    rating: anime.rating,
    duration: anime.duration,
    source: anime.source,
    rank: anime.rank,
    popularity: anime.popularity,
    aired: anime.aired?.string,
  };
}

function parseLatestEpisodeNumber(episodes?: JikanWatchEpisode[]) {
  const latest = episodes?.[0];
  if (!latest) return undefined;

  if (latest.title) {
    const match = latest.title.match(/(\d+)\s*$/);
    if (match) {
      const parsed = Number(match[1]);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }

  if (typeof latest.mal_id === 'number' && latest.mal_id > 0) {
    return latest.mal_id;
  }

  return undefined;
}

function normalizeWatchEpisodeItem(item: JikanWatchEpisodeItem): AnimeSummary {
  const anime = normalizeAnime(item.entry);
  return {
    ...anime,
    airingDate: item.date || anime.airingDate,
    episodes: parseLatestEpisodeNumber(item.episodes) ?? anime.episodes,
    status: anime.status ?? 'Latest update',
  };
}

function normalizeWatchPromoItem(item: JikanWatchPromoItem, fallbackStatus: string): AnimeSummary {
  const anime = normalizeAnime(item.entry);
  const promoImage =
    item.trailer?.images?.maximum_image_url ||
    item.trailer?.images?.large_image_url ||
    item.trailer?.images?.medium_image_url ||
    item.trailer?.images?.image_url;

  return {
    ...anime,
    trailerUrl: item.trailer?.embed_url || item.trailer?.url || anime.trailerUrl,
    banner: promoImage || anime.banner,
    status: anime.status ?? fallbackStatus,
  };
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
    const value = mapper(await fetchJikanJson(path));
    const now = Date.now();
    const currentCache = await getStoredValue('jikanCache', {});
    await setStoredValue('jikanCache', {
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
  const key = cacheKey(path);
  const cache = await getStoredValue('jikanCache', {});
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
    const rawList = mapper(await fetchJikanJson(path));

    const now = Date.now();
    const cache = await getStoredValue('jikanCache', {});
    const mergedMap = mergeEntityMap(readAnimeEntityMap(cache), rawList);
    const ids = rawList.map((anime) => anime.id);

    await setStoredValue('jikanCache', {
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
  const key = cacheKey(path);
  const cache = await getStoredValue('jikanCache', {});
  const cached = cache[key] as CachedPayload<unknown> | undefined;
  const now = Date.now();

  if (cached) {
    // Migrate old list caches that stored full anime objects into ID-only caches.
    if (isAnimeSummaryArray(cached.value)) {
      const mergedMap = mergeEntityMap(readAnimeEntityMap(cache), cached.value);
      const ids = cached.value.map((anime) => anime.id);
      await setStoredValue('jikanCache', {
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

export function getTopAnime(limit = 10, options?: CacheFetchOptions<AnimeSummary[]>) {
  return cachedAnimeListFetch(`/top/anime?limit=${limit}`, 6 * HOUR, (json) =>
    (json as JikanListResponse).data.map(normalizeAnime),
    options,
  ).catch(() => []);
}

export function getSeasonalAnime(limit = 10, options?: CacheFetchOptions<AnimeSummary[]>) {
  return cachedAnimeListFetch(`/seasons/now?limit=${limit}`, 6 * HOUR, (json) =>
    (json as JikanListResponse).data.map(normalizeAnime),
    options,
  ).catch(() => []);
}

export function getLatestUpdatedAnime(limit = 10, options?: CacheFetchOptions<AnimeSummary[]>) {
  return cachedAnimeListFetch(`/watch/episodes?limit=${limit}`, 2 * HOUR, (json) =>
    (json as JikanWatchEpisodeListResponse).data.map(normalizeWatchEpisodeItem),
    options,
  ).catch(() => []);
}

export function getLatestPromoAnime(limit = 10, options?: CacheFetchOptions<AnimeSummary[]>) {
  return cachedAnimeListFetch(`/watch/promos?limit=${limit}`, 2 * HOUR, (json) =>
    (json as JikanWatchPromoListResponse).data.map((item) => normalizeWatchPromoItem(item, 'Latest promo')),
    options,
  ).catch(() => []);
}

export function getTopAiringAnime(limit = 10, options?: CacheFetchOptions<AnimeSummary[]>) {
  return cachedAnimeListFetch(`/top/anime?filter=airing&limit=${limit}`, 6 * HOUR, (json) =>
    (json as JikanListResponse).data.map(normalizeAnime),
    options,
  ).catch(() => []);
}

export function getTopUpcomingAnime(limit = 10, options?: CacheFetchOptions<AnimeSummary[]>) {
  return cachedAnimeListFetch(`/top/anime?filter=upcoming&limit=${limit}`, 6 * HOUR, (json) =>
    (json as JikanListResponse).data.map(normalizeAnime),
    options,
  ).catch(() => []);
}

export function searchAnime(query: string) {
  const encoded = encodeURIComponent(query.trim());
  return cachedAnimeListFetch(`/anime?q=${encoded}&limit=16`, HOUR, (json) =>
    (json as JikanListResponse).data.map(normalizeAnime),
  ).catch(() => []);
}

export function getAnimeDetails(id: string | number) {
  return cachedFetch(`/anime/${id}/full`, HOUR, (json) => normalizeDetail((json as JikanDetailResponse).data))
    .then(async (detail) => {
      const cache = await getStoredValue('jikanCache', {});
      const now = Date.now();
      const mergedMap = mergeEntityMap(readAnimeEntityMap(cache), [detail]);
      await setStoredValue('jikanCache', {
        ...cache,
        [ANIME_ENTITY_CACHE_KEY]: { value: mergedMap, savedAt: now, expiresAt: now + ANIME_ENTITY_TTL },
      });
      return detail;
    })
    .catch(() => {
      throw new Error('Anime details unavailable');
    });
}

export function getAnimeGenres() {
  return cachedFetch('/genres/anime', 24 * HOUR, (json) =>
    (json as { data: JikanNamedResource[] }).data.map((genre) => genre.name),
  );
}

export async function refreshHomeShelvesIfNeeded(limit = 20, callbacks: HomeRefreshCallbacks = {}) {
  const now = Date.now();
  const meta = await getStoredValue('jikanMeta', {});
  const lastRefresh = Number(meta[HOME_BACKGROUND_REFRESH_KEY] ?? 0);
  if (Number.isFinite(lastRefresh) && now - lastRefresh < HOME_BACKGROUND_REFRESH_INTERVAL_MS) return;

  const requests = [
    getLatestUpdatedAnime(limit, { forceRefresh: true, onUpdate: callbacks.onLatestUpdated }),
    getLatestPromoAnime(limit, { forceRefresh: true, onUpdate: callbacks.onLatestPromo }),
  ];

  void Promise.allSettled(requests).then(async (results) => {
    const hasSuccess = results.some((result) => result.status === 'fulfilled');
    if (!hasSuccess) return;

    const latestMeta = await getStoredValue('jikanMeta', {});
    await setStoredValue('jikanMeta', {
      ...latestMeta,
      [HOME_BACKGROUND_REFRESH_KEY]: now,
    });
  });
}
