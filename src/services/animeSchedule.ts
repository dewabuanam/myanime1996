import type { AnimeDetail, AnimeSummary } from '../types/anime';
import type { CachedPayload } from '../types/anime';
import { getStoredValue, setStoredValue } from './store';
import {
  getAnimeDetails as getJikanAnimeDetails,
  getLatestPromoAnime as getJikanLatestPromoAnime,
  getTopUpcomingAnime as getJikanTopUpcomingAnime,
} from './jikan';

const BASE_URL = 'https://animeschedule.net/api/v3';
const IMAGE_BASE_URL = 'https://img.animeschedule.net/production/assets/public/img/';
const HOUR = 60 * 60 * 1000;
const DEFAULT_LIMIT = 20;
const DAY = 24 * HOUR;
const SEARCH_SCAN_PAGES = 8;
const DEFAULT_LIST_PAGE_SIZE = 60;
const HOME_BACKGROUND_REFRESH_INTERVAL_MS = 60 * 1000;
const MAX_REASONABLE_MAL_ID = 2_000_000;

export const DEFAULT_ANIMESCHEDULE_TOKEN = 'kBPuq6vdcUS3pXtzzhtbrjItLZ3U4y';

type CacheFetchOptions<T> = {
  onUpdate?: (value: T) => void;
  forceRefresh?: boolean;
};

type AnimeScheduleNormalizeOptions = {
  includeDonghua?: boolean;
};

const inFlightRequests = new Map<string, Promise<unknown>>();
const routeByNumericId = new Map<number, string>();

function indexRouteFromCachedSummary(value: unknown) {
  if (!value || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === 'number' && Number.isFinite(record.id) ? Math.floor(record.id) : undefined;
  if (!id) return;

  const route =
    (typeof record.animeScheduleRoute === 'string' && record.animeScheduleRoute.trim()) ||
    (typeof record.route === 'string' && record.route.trim()) ||
    undefined;
  if (!route) return;

  routeByNumericId.set(id, route);
}

function indexRoutesFromCachedValue(value: unknown) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      indexRouteFromCachedSummary(entry);
    }
    return;
  }

  indexRouteFromCachedSummary(value);
}

export async function clearAnimeScheduleDataCache() {
  inFlightRequests.clear();
  routeByNumericId.clear();
  await Promise.all([
    setStoredValue('animeScheduleCache', {} as Record<string, CachedPayload<unknown>>),
    setStoredValue('animeScheduleMeta', {} as Record<string, string | number | boolean>),
  ]);
}

const cacheKey = (path: string) => `animeschedule:${path}`;

const isSamePayload = <T>(a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);

const isFilled = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

const isTauriRuntime = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const toRequestHeaders = (token: string) => ({
  Accept: 'application/json',
  Authorization: `Bearer ${token}`,
  'X-API-Key': token,
  'X-Token': token,
});

async function fetchAnimeScheduleNative(url: string, token: string) {
  const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
  const response = await tauriFetch(url, {
    method: 'GET',
    headers: toRequestHeaders(token),
  });

  if (!response.ok) {
    throw new Error(`AnimeSchedule request failed: ${response.status}`);
  }

  return response.json();
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function getString(source: Record<string, unknown> | null, keys: string[]): string | undefined {
  if (!source) return undefined;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function getNumber(source: Record<string, unknown> | null, keys: string[]): number | undefined {
  if (!source) return undefined;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function getList(source: Record<string, unknown> | null, keys: string[]): string[] {
  if (!source) return [];
  for (const key of keys) {
    const raw = source[key];
    if (!Array.isArray(raw)) continue;
    const values = raw
      .map((entry) => {
        if (typeof entry === 'string') return entry.trim();
        const fromObject = getString(toRecord(entry), ['name', 'title']);
        return fromObject?.trim() ?? '';
      })
      .filter((entry) => entry.length > 0);
    if (values.length > 0) {
      return Array.from(new Set(values));
    }
  }
  return [];
}

function normalizeTitleSynonyms(...inputs: Array<unknown>): string[] | undefined {
  const values: string[] = [];

  for (const input of inputs) {
    if (!Array.isArray(input)) continue;
    for (const entry of input) {
      if (typeof entry === 'string') {
        const trimmed = entry.trim();
        if (trimmed) values.push(trimmed);
        continue;
      }

      const record = toRecord(entry);
      const fromObject = getString(record, ['title', 'name']);
      if (fromObject) values.push(fromObject);
    }
  }

  if (!values.length) return undefined;
  return Array.from(new Set(values));
}

function hashFromTitle(title: string): number {
  let hash = 0;
  for (let i = 0; i < title.length; i += 1) {
    hash = (hash << 5) - hash + title.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function stripHtml(input?: string) {
  if (!input) return '';
  return input
    .replace(/<br\s*\/?>(\s*)/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseMalIdFromUrl(value?: string): number | undefined {
  if (!value) return undefined;
  const direct = value.trim();
  if (/^\d+$/.test(direct)) {
    const parsedDirect = Number(direct);
    return Number.isFinite(parsedDirect) && parsedDirect > 0 && parsedDirect <= MAX_REASONABLE_MAL_ID ? parsedDirect : undefined;
  }

  const animePathMatch = direct.match(/\/anime\/(\d+)/i);
  if (animePathMatch) {
    const parsed = Number(animePathMatch[1]);
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= MAX_REASONABLE_MAL_ID) return parsed;
  }

  const queryMatch = direct.match(/[?&]id=(\d+)/i);
  if (queryMatch) {
    const parsed = Number(queryMatch[1]);
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= MAX_REASONABLE_MAL_ID) return parsed;
  }

  return undefined;
}

function parseMalIdFromWebsiteEntry(entry: unknown): number | undefined {
  if (typeof entry === 'string') {
    return parseMalIdFromUrl(entry);
  }

  const record = toRecord(entry);
  if (!record) return undefined;

  const site = getString(record, ['site', 'name', 'platform', 'provider'])?.toLowerCase() ?? '';
  const directUrl =
    getString(record, ['mal', 'myanimelist', 'url', 'href', 'link', 'value']) ||
    getString(toRecord(record.meta), ['mal', 'myanimelist', 'url']);
  const parsedFromUrl = parseMalIdFromUrl(directUrl);
  if (parsedFromUrl) return parsedFromUrl;

  const directId = getNumber(record, ['malId', 'mal_id', 'idMal']);
  if (directId && directId > 0 && directId <= MAX_REASONABLE_MAL_ID) return Math.floor(directId);

  const genericId = getNumber(record, ['id']);
  if ((site.includes('mal') || site.includes('myanimelist')) && genericId && genericId > 0 && genericId <= MAX_REASONABLE_MAL_ID) {
    return Math.floor(genericId);
  }

  return undefined;
}

function resolveMalIdFromWebsites(value: unknown): number | undefined {
  const direct = parseMalIdFromWebsiteEntry(value);
  if (direct) return direct;

  if (Array.isArray(value)) {
    for (const entry of value) {
      const parsed = parseMalIdFromWebsiteEntry(entry);
      if (parsed) return parsed;
    }
    return undefined;
  }

  const websites = toRecord(value);
  if (!websites) return undefined;

  const directMal = parseMalIdFromUrl(getString(websites, ['mal', 'myanimelist']));
  if (directMal) return directMal;

  for (const [key, entry] of Object.entries(websites)) {
    const lowered = key.toLowerCase();
    const parsed = parseMalIdFromWebsiteEntry(entry);
    if (parsed) {
      if (lowered.includes('mal') || lowered.includes('myanimelist')) return parsed;
      if (Array.isArray(entry) || toRecord(entry)) return parsed;
    }

    if (Array.isArray(entry)) {
      for (const child of entry) {
        const nested = parseMalIdFromWebsiteEntry(child);
        if (nested) return nested;
      }
    }
  }

  return undefined;
}

function parseYearFromText(value?: string) {
  if (!value) return undefined;
  const match = value.match(/(19|20)\d{2}/);
  if (!match) return undefined;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toAbsoluteImageUrl(value?: string) {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const normalized = trimmed.replace(/^\/+/, '');
  if (normalized.startsWith('production/assets/public/img/')) {
    return `https://img.animeschedule.net/${normalized}`;
  }
  return `${IMAGE_BASE_URL}${normalized}`;
}

/**
 * AnimeSchedule timetable timestamps (`episodeDate`, etc.) are returned as
 * ISO-8601 strings WITH a timezone offset (e.g. "2026-06-15T10:00:00+09:00"
 * or with "Z"). However, some fields seen in the wild (and some fallback
 * sources) omit the offset entirely (e.g. "2026-06-15 10:00:00"), which
 * makes `Date.parse` engine-dependent: V8/Node treats space-separated
 * date-times without an offset as LOCAL time, while a "T"-separated string
 * without an offset is treated as UTC per spec (but not all engines agree).
 *
 * To make the "latest released" / "upcoming" split deterministic and
 * independent of the host's local timezone, we normalize any timestamp
 * that lacks an explicit offset to UTC before parsing.
 */
function normalizeTimestampToUtc(value: string): string {
  const trimmed = value.trim();

  // Already has a timezone designator (Z, +HH:MM, -HH:MM, +HHMM) -> leave as-is.
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(trimmed)) {
    return trimmed;
  }

  // "2026-06-15 10:00:00" -> "2026-06-15T10:00:00Z"
  // "2026-06-15T10:00:00" -> "2026-06-15T10:00:00Z"
  const isoLike = trimmed.replace(' ', 'T');
  return `${isoLike}Z`;
}

function normalizeAnimeScheduleId(record: Record<string, unknown>, media: Record<string, unknown>, title: string): number {
  const jikanId = resolveAnimeScheduleJikanId(record, media);
  if (jikanId) return jikanId;

  const route = getString(record, ['route']);
  return Math.max(1, Math.floor(hashFromTitle(route || title)));
}

function resolveAnimeScheduleJikanId(record: Record<string, unknown>, media: Record<string, unknown>): number | undefined {
  console.log('Resolving AnimeSchedule Jikan ID from record and media:', { record, media });
  const malId =
    getNumber(record, ['jikanId', 'jikan_id']) ||
    getNumber(media, ['jikanId', 'jikan_id']) ||
    resolveMalIdFromWebsites(record.websites) ||
    resolveMalIdFromWebsites(media.websites) ||
    parseMalIdFromUrl(getString(record, ['mal'])) ||
    parseMalIdFromUrl(getString(media, ['mal']));
  if (malId && malId > 0 && malId <= MAX_REASONABLE_MAL_ID) return Math.floor(malId);

  const idFromMedia =
    getNumber(record, ['malId', 'mal_id', 'idMal']) ??
    getNumber(media, ['malId', 'mal_id', 'idMal']);
  if (idFromMedia && idFromMedia > 0 && idFromMedia <= MAX_REASONABLE_MAL_ID) return Math.floor(idFromMedia);

  return undefined;
}

function isValidMalId(value?: number): value is number {
  if (!Number.isFinite(value) || !value) return false;
  return value > 0 && value <= MAX_REASONABLE_MAL_ID;
}

function toAnimeSummary(raw: unknown, options: AnimeScheduleNormalizeOptions = {}): AnimeSummary | null {
  const record = toRecord(raw);
  if (!record) return null;

  // AnimeSchedule provides an explicit donghua flag; exclude these entries globally.
  if (!options.includeDonghua && record.donghua === true) return null;

  const media = toRecord(record.media) ?? toRecord(record.anime) ?? record;
  const mediaNames = toRecord(media.names);
  const recordNames = toRecord(record.names);
  const title =
    getString(media, ['title', 'titleRomaji', 'romaji', 'titleEnglish', 'english', 'name']) ??
    getString(mediaNames, ['romaji', 'english', 'native']) ??
    getString(record, ['title', 'titleRomaji', 'romaji', 'name']) ??
    getString(recordNames, ['romaji', 'english', 'native']);

  if (!isFilled(title)) return null;

  const titleEnglish =
    getString(media, ['titleEnglish', 'english']) ??
    getString(mediaNames, ['english']) ??
    getString(record, ['titleEnglish', 'english']) ??
    getString(recordNames, ['english']);
  const titleJapanese =
    getString(media, ['titleNative', 'native', 'titleJapanese', 'japanese']) ??
    getString(mediaNames, ['native']) ??
    getString(record, ['titleNative', 'native', 'titleJapanese', 'japanese']) ??
    getString(recordNames, ['native']);
  const titleSynonyms = normalizeTitleSynonyms(mediaNames?.synonyms, recordNames?.synonyms);

  const jikanId = resolveAnimeScheduleJikanId(record, media);
  const id = normalizeAnimeScheduleId(record, media, title);
  const route =
    getString(record, ['route']) ||
    getString(media, ['route']) ||
    getString(toRecord(record.anime), ['route']);
  if (route) {
    routeByNumericId.set(id, route);
  }

  const image =
    toAbsoluteImageUrl(getString(media, ['imageVersionRoute', 'image', 'coverImage', 'posterImage'])) ||
    getString(toRecord(media.images), ['large', 'medium', 'original']) ||
    '/assets/logo.png';

  const banner =
    getString(media, ['bannerImage']) ||
    getString(toRecord(media.banner), ['large', 'medium']) ||
    image;

  const synopsis =
    stripHtml(getString(media, ['description', 'synopsis'])) ||
    stripHtml(getString(record, ['description', 'synopsis'])) ||
    'No synopsis has been recorded on this tape yet.';

  const episodes = getNumber(record, ['episodeNumber', 'episode', 'airingEpisode']) ?? getNumber(media, ['episodes']);
  const durationMinutes = getNumber(media, ['duration', 'lengthMin']) ?? getNumber(record, ['episodeDuration', 'lengthMin']);
  const score = getNumber(toRecord(record.stats), ['averageScore', 'score']) ?? getNumber(media, ['score', 'averageScore']);

  // For timetable-driven shelves, episodeDate must be the primary release timestamp.
  const startDateText =
    getString(record, ['episodeDate', 'airingAt', 'startDate', 'premier', 'subPremier', 'dubPremier']) ||
    getString(media, ['airingAt', 'startDate']);
  // Normalize to a UTC-anchored string so downstream Date.parse / Date.now()
  // comparisons are timezone-independent regardless of host runtime.
  const normalizedStartDateText = startDateText ? normalizeTimestampToUtc(startDateText) : undefined;
  const startDate = normalizedStartDateText ? new Date(normalizedStartDateText) : null;
  const year =
    getNumber(record, ['year']) ??
    (startDate && Number.isFinite(startDate.getUTCFullYear()) ? startDate.getUTCFullYear() : undefined) ??
    parseYearFromText(getString(toRecord(record.season), ['title']));

  const mediaType = getString(media, ['format', 'type']) || getString(toRecord((record.mediaTypes as unknown[] | undefined)?.[0]), ['name']);
  const status = getString(record, ['status', 'airType']) || getString(media, ['status']) || 'Latest update';

  const websites = toRecord(record.websites);
  const streams = Array.isArray(websites?.streams) ? (websites?.streams as unknown[]) : [];
  const youtube = streams.find((entry) => {
    const stream = toRecord(entry);
    const platform = getString(stream, ['platform'])?.toLowerCase();
    const url = getString(stream, ['url'])?.toLowerCase();
    return platform === 'youtube' || Boolean(url?.includes('youtube.com') || url?.includes('youtu.be'));
  });
  const trailerUrl = getString(toRecord(youtube), ['url']);

  return {
    id,
    jikanId,
    title,
    titleEnglish,
    titleJapanese,
    titleSynonyms,
    durationMinutes: durationMinutes && durationMinutes > 0 ? Math.round(durationMinutes) : undefined,
    image,
    banner,
    synopsis,
    score,
    year,
    // Store the normalized (UTC-anchored) timestamp so all downstream
    // sorting/filtering by airingDate is consistent and timezone-safe.
    airingDate: normalizedStartDateText,
    episodes: episodes && episodes > 0 ? Math.floor(episodes) : undefined,
    status,
    studios: getList(media, ['studios']),
    genres: getList(media, ['genres']),
    trailerUrl,
    mediaType,
    animeScheduleRoute: route,
  };
}

function toAnimeDetail(raw: unknown): AnimeDetail | null {
  const summary = toAnimeSummary(raw);
  if (!summary) return null;

  const record = toRecord(raw);
  const websites = toRecord(record?.websites);
  const source = getString(toRecord((record?.sources as unknown[] | undefined)?.[0]), ['name']);
  const seasonTitle = getString(toRecord(record?.season), ['title']);

  const detail: AnimeDetail = {
    ...summary,
    rating: undefined,
    duration: summary.durationMinutes ? `${summary.durationMinutes} min` : undefined,
    source,
    rank: undefined,
    popularity: getNumber(toRecord(record?.stats), ['trackedCount']),
    aired: seasonTitle || getString(record, ['premier', 'subPremier', 'dubPremier']) || getString(websites, ['official']),
  };

  if (summary.jikanId && summary.jikanId > 0) {
    detail.jikanId = Math.floor(summary.jikanId);
  }

  return detail;
}

async function resolveAnimeScheduleJikanIdByRoute(route: string): Promise<number | undefined> {
  console.log('Resolving AnimeSchedule Jikan ID by route:', route);
  const path = `/anime/${encodeURIComponent(route)}`;
  try {
    const json = await cachedFetch(path, DAY, (raw) => raw);
    const record = toRecord(json);
    if (!record) return undefined;
    const media = toRecord(record.media) ?? toRecord(record.anime) ?? record;
    console.log('Fetched AnimeSchedule record for route resolution:', { record, media });
    return resolveAnimeScheduleJikanId(record, media);
  } catch {
    return undefined;
  }
}

function normalizeList(json: unknown, options: AnimeScheduleNormalizeOptions = {}): AnimeSummary[] {
  const root = toRecord(json);
  const candidates =
    (Array.isArray(root?.timetables) && root?.timetables) ||
    (Array.isArray(root?.data) && root?.data) ||
    (Array.isArray(root?.results) && root?.results) ||
    (Array.isArray(json) ? json : []);

  const normalized = candidates.map((entry) => toAnimeSummary(entry, options)).filter((entry): entry is AnimeSummary => Boolean(entry));

  const unique = new Map<number, AnimeSummary>();
  for (const anime of normalized) {
    if (!unique.has(anime.id)) {
      unique.set(anime.id, anime);
    }
  }
  return Array.from(unique.values());
}

async function fetchAnimeScheduleJson(path: string) {
  const rawToken = await getStoredValue('animeScheduleApiToken', DEFAULT_ANIMESCHEDULE_TOKEN);
  const token = rawToken.trim() || DEFAULT_ANIMESCHEDULE_TOKEN;
  const url = `${BASE_URL}${path}`;

  if (isTauriRuntime()) {
    try {
      return await fetchAnimeScheduleNative(url, token);
    } catch {
      // Fall through to web fetch for environments where plugin-http is unavailable.
    }
  }

  const response = await fetch(url, {
    headers: toRequestHeaders(token),
  });

  if (!response.ok) {
    throw new Error(`AnimeSchedule request failed: ${response.status}`);
  }

  return response.json();
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
    const value = mapper(await fetchAnimeScheduleJson(path));
    const now = Date.now();
    const currentCache = await getStoredValue('animeScheduleCache', {} as Record<string, CachedPayload<unknown>>);
    await setStoredValue('animeScheduleCache', {
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

async function cachedFetchByKey<T>(
  key: string,
  path: string,
  ttl: number,
  mapper: (json: unknown) => T,
  options: CacheFetchOptions<T> = {},
): Promise<T> {
  const cache = await getStoredValue('animeScheduleCache', {} as Record<string, CachedPayload<unknown>>);
  const cached = cache[key] as CachedPayload<T> | undefined;
  const now = Date.now();

  if (cached) {
    indexRoutesFromCachedValue(cached.value);
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

async function cachedFetch<T>(
  path: string,
  ttl: number,
  mapper: (json: unknown) => T,
  options: CacheFetchOptions<T> = {},
): Promise<T> {
  return cachedFetchByKey(cacheKey(path), path, ttl, mapper, options);
}

async function patchAnimeScheduleDetailCache(route: string, detail: AnimeDetail) {
  const key = cacheKey(`/anime/${encodeURIComponent(route)}`);
  const cache = await getStoredValue('animeScheduleCache', {} as Record<string, CachedPayload<unknown>>);
  const existing = cache[key] as CachedPayload<AnimeDetail> | undefined;
  if (!existing) return;

  const now = Date.now();
  const expiresAt = typeof existing.expiresAt === 'number' && Number.isFinite(existing.expiresAt) ? existing.expiresAt : now + DAY;

  await setStoredValue('animeScheduleCache', {
    ...cache,
    [key]: {
      value: detail,
      savedAt: now,
      expiresAt,
    },
  });
}

function ensureAnimeScheduleListEnvelope(json: unknown): unknown[] {
  const root = toRecord(json);
  if (!root) return Array.isArray(json) ? json : [];
  if (Array.isArray(root.anime)) return root.anime as unknown[];
  if (Array.isArray(root.data)) return root.data as unknown[];
  return Array.isArray(json) ? json : [];
}

async function getAnimeScheduleAnimePage(page = 1, pageSize = DEFAULT_LIST_PAGE_SIZE, normalizeOptions: AnimeScheduleNormalizeOptions = {}) {
  const safePage = Math.max(1, Math.floor(page));
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const path = `/anime?page=${safePage}&pageSize=${safePageSize}`;
  const key = normalizeOptions.includeDonghua ? cacheKey(`${path}:includeDonghua`) : cacheKey(path);
  return cachedFetchByKey(key, path, 6 * HOUR, (json) => normalizeList(ensureAnimeScheduleListEnvelope(json), normalizeOptions)).catch(
    () => [],
  );
}

function sortByScore(list: AnimeSummary[]) {
  return [...list].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

function getReleaseTimestamp(value?: string) {
  if (!value) return Number.NEGATIVE_INFINITY;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function currentSeasonName(month: number) {
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'fall';
  return 'winter';
}

function getIsoWeekAndYear(date = new Date()) {
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utcDate.getTime() - yearStart.getTime()) / DAY + 1) / 7);
  return { week, year: utcDate.getUTCFullYear() };
}

export async function getAnimeScheduleTopAnime(limit = 10, options?: CacheFetchOptions<AnimeSummary[]>) {
  const page = await getAnimeScheduleAnimePage(1, Math.max(limit * 3, DEFAULT_LIST_PAGE_SIZE));
  const sorted = sortByScore(page).slice(0, Math.max(1, Math.floor(limit)));
  options?.onUpdate?.(sorted);
  return sorted;
}

export async function getAnimeScheduleSeasonalAnime(limit = 10, options?: CacheFetchOptions<AnimeSummary[]>) {
  const now = new Date();
  const season = currentSeasonName(now.getMonth());
  const year = now.getFullYear();
  const page = await getAnimeScheduleAnimePage(1, Math.max(limit * 4, DEFAULT_LIST_PAGE_SIZE));
  const seasonal = page.filter((anime) => {
    const hasYear = anime.year === year;
    const status = anime.status?.toLowerCase() ?? '';
    const isActive = status.includes('ongoing') || status.includes('air');
    return hasYear || isActive || (anime.synopsis.toLowerCase().includes(season) && anime.year === year);
  });
  const result = seasonal.slice(0, Math.max(1, Math.floor(limit)));
  options?.onUpdate?.(result);
  return result;
}

export async function getAnimeScheduleTopAiringAnime(limit = 10, options?: CacheFetchOptions<AnimeSummary[]>) {
  const page = await getAnimeScheduleAnimePage(1, Math.max(limit * 4, DEFAULT_LIST_PAGE_SIZE));
  const airing = sortByScore(page.filter((anime) => (anime.status?.toLowerCase() ?? '').includes('ongoing'))).slice(0, Math.max(1, Math.floor(limit)));
  options?.onUpdate?.(airing);
  return airing;
}

export async function getAnimeScheduleTopUpcomingAnime(limit = 10, options?: CacheFetchOptions<AnimeSummary[]>) {
  try {
    return await getJikanTopUpcomingAnime(limit, options);
  } catch {
    // Fallback to AnimeSchedule-derived upcoming list when Jikan is unavailable.
  }

  const page = await getAnimeScheduleAnimePage(1, Math.max(limit * 4, DEFAULT_LIST_PAGE_SIZE));
  const now = Date.now();
  const upcoming = page
    .filter((anime) => {
      const status = anime.status?.toLowerCase() ?? '';
      if (status.includes('upcoming') || status.includes('not yet')) return true;
      return Boolean(anime.year && anime.year >= new Date(now).getFullYear());
    })
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, Math.max(1, Math.floor(limit)));
  options?.onUpdate?.(upcoming);
  return upcoming;
}

export async function getAnimeScheduleLatestPromoAnime(limit = 10, options?: CacheFetchOptions<AnimeSummary[]>) {
  const safeLimit = Math.max(1, Math.floor(limit));

  const [jikanPromo, animeSchedulePromo] = await Promise.all([
    getJikanLatestPromoAnime(safeLimit, options).catch(() => []),
    (async () => {
      const page = await getAnimeScheduleAnimePage(1, Math.max(safeLimit * 5, DEFAULT_LIST_PAGE_SIZE), { includeDonghua: true });
      const now = Date.now();
      return page
        .filter((anime) => {
          const status = anime.status?.toLowerCase() ?? '';
          if (status.includes('upcoming') || status.includes('not yet')) return true;
          return Boolean(anime.year && anime.year >= new Date(now).getFullYear());
        })
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        .map((anime) => ({ ...anime, status: anime.status || 'Latest promo' }))
        .slice(0, safeLimit);
    })(),
  ]);

  const merged = new Map<number, AnimeSummary>();
  for (const anime of [...animeSchedulePromo, ...jikanPromo]) {
    if (!merged.has(anime.id)) {
      merged.set(anime.id, anime);
    }
  }

  const result = Array.from(merged.values()).slice(0, safeLimit);
  options?.onUpdate?.(result);
  return result;
}

export async function searchAnimeScheduleAnime(query: string, limit = 16): Promise<AnimeSummary[]> {
  const term = query.trim().toLowerCase();
  if (!term) return [];

  const results: AnimeSummary[] = [];
  const seen = new Set<number>();

  for (let page = 1; page <= SEARCH_SCAN_PAGES; page += 1) {
    const items = await getAnimeScheduleAnimePage(page, DEFAULT_LIST_PAGE_SIZE);
    if (!items.length) break;

    for (const anime of items) {
      const haystack = [anime.title, anime.titleEnglish, anime.titleJapanese, anime.synopsis].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(term)) continue;
      if (seen.has(anime.id)) continue;
      seen.add(anime.id);
      results.push(anime);
      if (results.length >= limit) return results;
    }
  }

  return results;
}

function parseRouteFromInput(input: string | number): string | null {
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) {
      const numericId = Number(trimmed);
      return routeByNumericId.get(numericId) ?? null;
    }
    return trimmed;
  }

  if (typeof input === 'number' && Number.isFinite(input)) {
    return routeByNumericId.get(Math.floor(input)) ?? null;
  }

  return null;
}

export async function getAnimeScheduleAnimeDetails(idOrRoute: string | number): Promise<AnimeDetail> {
  const route = parseRouteFromInput(idOrRoute);
  if (!route) {
    throw new Error('AnimeSchedule detail route unavailable');
  }

  const detail = await cachedFetch(`/anime/${encodeURIComponent(route)}`, DAY, (json) => toAnimeDetail(json))
    .catch(() => null as AnimeDetail | null);

  if (!detail) {
    throw new Error('AnimeSchedule detail unavailable');
  }

  if (!isValidMalId(detail.jikanId)) {
    const recoveredJikanId = await resolveAnimeScheduleJikanIdByRoute(route);
    if (isValidMalId(recoveredJikanId)) {
      const safeRecoveredId = Math.floor(recoveredJikanId);
      detail.jikanId = safeRecoveredId;
      detail.id = safeRecoveredId;
      void patchAnimeScheduleDetailCache(route, detail);
    }
  } else if (detail.id !== detail.jikanId) {
    detail.id = Math.floor(detail.jikanId);
    void patchAnimeScheduleDetailCache(route, detail);
  }

  if (
    isValidMalId(detail.jikanId) &&
    (
      !detail.trailerUrl ||
      !detail.banner ||
      !detail.titleEnglish ||
      !detail.titleJapanese ||
      !detail.rating ||
      !detail.rank ||
      !detail.popularity ||
      !detail.aired ||
      !detail.source
    )
  ) {
    try {
      const jikanDetail = await getJikanAnimeDetails(detail.jikanId!);
      detail.title = detail.title || jikanDetail.title;
      detail.titleEnglish = detail.titleEnglish || jikanDetail.titleEnglish;
      detail.titleJapanese = detail.titleJapanese || jikanDetail.titleJapanese;
      detail.titleSynonyms = (detail.titleSynonyms?.length ? detail.titleSynonyms : jikanDetail.titleSynonyms) || detail.titleSynonyms;
      detail.trailerUrl = jikanDetail.trailerUrl || detail.trailerUrl;
      detail.banner = jikanDetail.banner || detail.banner;
      detail.rating = detail.rating || jikanDetail.rating;
      detail.rank = detail.rank ?? jikanDetail.rank;
      detail.popularity = detail.popularity ?? jikanDetail.popularity;
      detail.aired = detail.aired || jikanDetail.aired;
      detail.source = detail.source || jikanDetail.source;
    } catch {
      // Keep AnimeSchedule detail response even if Jikan enrichment fails.
    }
  }

  routeByNumericId.set(detail.id, route);
  return detail;
}

export async function resolveAnimeScheduleBridgeJikanId(
  idOrRoute: string | number,
  animeScheduleRoute?: string,
): Promise<number | undefined> {
  const explicitRoute = animeScheduleRoute?.trim();
  const route = explicitRoute && explicitRoute.length > 0
    ? explicitRoute
    : parseRouteFromInput(idOrRoute);
  console.log('Resolving AnimeSchedule bridge Jikan ID for input:', {
    idOrRoute,
    animeScheduleRoute,
    parsedRoute: route,
  });
  if (!route) return undefined;

  const jikanId = await resolveAnimeScheduleJikanIdByRoute(route);
  return isValidMalId(jikanId) ? Math.floor(jikanId) : undefined;
}

/**
 * Builds a stable cache key that covers the full 3-week (prev/current/next)
 * timetable window. Previously this was keyed only off the *current* ISO
 * week, which meant the merged 2-hour cache could go stale (covering the
 * wrong prev/next window) right after a week boundary rollover even though
 * `expiresAt` hadn't been reached yet. Including all three week identifiers
 * in the key guarantees a fresh merge is computed whenever the 3-week
 * window itself shifts.
 */
function buildMergedTimetableCacheKey(weeks: Array<{ year: number; week: number }>) {
  const weekIds = weeks.map(({ year, week }) => `${year}-W${String(week).padStart(2, '0')}`).join('_');
  return cacheKey(`/timetables/sub/merged?weeks=${weekIds}`);
}

async function getMergedSubTimetableAnime(limit = DEFAULT_LIMIT, options?: CacheFetchOptions<AnimeSummary[]>) {
  const safeLimit = Math.max(1, Math.floor(limit));
  const now = new Date();
  const anchorDates = [
    new Date(now.getTime() - 7 * DAY),
    now,
    new Date(now.getTime() + 7 * DAY),
  ];
  const targetWeeks = anchorDates.map((date) => getIsoWeekAndYear(date));
  const mergedKey = buildMergedTimetableCacheKey(targetWeeks);
  const nowMs = Date.now();

  const cache = await getStoredValue('animeScheduleCache', {} as Record<string, CachedPayload<unknown>>);
  const cachedMerged = cache[mergedKey] as CachedPayload<AnimeSummary[]> | undefined;
  const hasFreshMergedCache = !options?.forceRefresh && !!cachedMerged && cachedMerged.expiresAt > nowMs;

  const timetableRequests = targetWeeks.map(({ year, week }) => {
    const weekPath = `/timetables/sub?year=${year}&week=${week}`;
    const weekKey = cacheKey(weekPath);
    const cachedWeek = cache[weekKey] as CachedPayload<AnimeSummary[]> | undefined;
    const hasFreshWeekCache = !!cachedWeek && cachedWeek.expiresAt > nowMs;

    if (!options?.forceRefresh && hasFreshWeekCache) {
      return Promise.resolve(cachedWeek.value);
    }

    return fetchAndStore(weekKey, weekPath, 2 * HOUR, normalizeList);
  });

  if (hasFreshMergedCache) {
    const allWeekCachesFresh = targetWeeks.every(({ year, week }) => {
      const weekPath = `/timetables/sub?year=${year}&week=${week}`;
      const cachedWeek = cache[cacheKey(weekPath)] as CachedPayload<AnimeSummary[]> | undefined;
      return !!cachedWeek && cachedWeek.expiresAt > nowMs;
    });

    if (allWeekCachesFresh) {
      options?.onUpdate?.(cachedMerged.value);
      return cachedMerged.value;
    }
  }

  const results = await Promise.allSettled(timetableRequests);

  const merged = new Map<string, AnimeSummary>();
  const resultSets = results
    .filter((entry): entry is PromiseFulfilledResult<AnimeSummary[]> => entry.status === 'fulfilled')
    .map((entry) => entry.value);

  for (const list of resultSets) {
    for (const anime of list) {
      const timestamp = anime.airingDate?.trim() ?? '';
      const key = `${anime.id}:${timestamp}`;
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, anime);
      }
    }
  }

  const mergedList = Array.from(merged.values())
    .sort((a, b) => getReleaseTimestamp(b.airingDate) - getReleaseTimestamp(a.airingDate));

  const latestCache = await getStoredValue('animeScheduleCache', {} as Record<string, CachedPayload<unknown>>);
  await setStoredValue('animeScheduleCache', {
    ...latestCache,
    [mergedKey]: { value: mergedList, savedAt: nowMs, expiresAt: nowMs + 2 * HOUR },
  });

  return mergedList;
}

export async function getUpcomingTimetableAnime(limit = DEFAULT_LIMIT, options?: CacheFetchOptions<AnimeSummary[]>) {
  const safeLimit = Math.max(1, Math.floor(limit));
  const merged = await getMergedSubTimetableAnime(safeLimit, { forceRefresh: options?.forceRefresh });
  const now = Date.now();

  const upcoming = merged
    .filter((anime) => {
      const timestamp = getReleaseTimestamp(anime.airingDate);
      return Number.isFinite(timestamp) && timestamp > now;
    })
    .sort((a, b) => getReleaseTimestamp(a.airingDate) - getReleaseTimestamp(b.airingDate))
    .slice(0, safeLimit);

  options?.onUpdate?.(upcoming);
  return upcoming;
}

export async function getLatestReleasedTimetableAnime(limit = DEFAULT_LIMIT, options?: CacheFetchOptions<AnimeSummary[]>) {
  const safeLimit = Math.max(1, Math.floor(limit));
  const merged = await getMergedSubTimetableAnime(safeLimit, { forceRefresh: options?.forceRefresh });
  const now = Date.now();

  const latest = merged
    .filter((anime) => {
      const timestamp = getReleaseTimestamp(anime.airingDate);
      return Number.isFinite(timestamp) && timestamp <= now;
    })
    .sort((a, b) => getReleaseTimestamp(b.airingDate) - getReleaseTimestamp(a.airingDate))
    .slice(0, safeLimit);

  options?.onUpdate?.(latest);
  return latest;
}

export async function refreshAnimeScheduleHomeIfNeeded(
  limit = DEFAULT_LIMIT,
  onLatestUpdated?: (value: AnimeSummary[]) => void,
  onUpcomingUpdated?: (value: AnimeSummary[]) => void,
  onLatestPromo?: (value: AnimeSummary[]) => void,
) {
  const now = Date.now();
  const refreshIntervalMs = HOME_BACKGROUND_REFRESH_INTERVAL_MS;
  const meta = await getStoredValue('animeScheduleMeta', {} as Record<string, string | number | boolean>);
  const lastRefresh = Number(meta.homeShelvesLastRefreshAt ?? 0);

  if (Number.isFinite(lastRefresh) && now - lastRefresh < refreshIntervalMs) return;

  const results = await Promise.allSettled([
    getLatestReleasedTimetableAnime(limit, { forceRefresh: true, onUpdate: onLatestUpdated }),
    getUpcomingTimetableAnime(limit, { forceRefresh: true, onUpdate: onUpcomingUpdated }),
    getAnimeScheduleLatestPromoAnime(limit, { forceRefresh: true, onUpdate: onLatestPromo }),
  ]);

  const hasSuccess = results.some((entry) => entry.status === 'fulfilled');
  if (!hasSuccess) return;

  const latestMeta = await getStoredValue('animeScheduleMeta', {} as Record<string, string | number | boolean>);
  await setStoredValue('animeScheduleMeta', {
    ...latestMeta,
    homeShelvesLastRefreshAt: now,
  });
}