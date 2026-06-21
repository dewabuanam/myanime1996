import type { CachedPayload, RecentSearchEntry, SearchGenreCacheEntry, SearchProducerCacheEntry } from '../types/anime';
import { getStoredValue, setStoredValue } from './store';

const SEARCH_GENRE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SEARCH_PRODUCER_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_RECENT_SEARCHES = 30;

type SearchGenreCacheMap = Record<string, CachedPayload<SearchGenreCacheEntry[]>>;
type SearchProducerCacheMap = Record<string, CachedPayload<SearchProducerCacheEntry[]>>;

function normalizeCacheKey(key: string) {
  return key.trim().toLowerCase();
}

export async function getRecentSearches(): Promise<RecentSearchEntry[]> {
  const raw = await getStoredValue('recentSearches', [] as RecentSearchEntry[]);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry) => typeof entry?.query === 'string' && typeof entry?.updatedAt === 'string')
    .map((entry) => ({ query: entry.query.trim(), updatedAt: entry.updatedAt }))
    .filter((entry) => entry.query.length > 0)
    .slice(0, MAX_RECENT_SEARCHES);
}

export async function addRecentSearch(query: string): Promise<RecentSearchEntry[]> {
  const normalized = query.trim();
  if (!normalized) return getRecentSearches();

  const recent = await getRecentSearches();
  const next: RecentSearchEntry[] = [
    { query: normalized, updatedAt: new Date().toISOString() },
    ...recent.filter((entry) => entry.query.toLowerCase() !== normalized.toLowerCase()),
  ].slice(0, MAX_RECENT_SEARCHES);

  await setStoredValue('recentSearches', next);
  return next;
}

export async function clearRecentSearches(): Promise<void> {
  await setStoredValue('recentSearches', []);
}

export async function readSearchGenreCache(key: string): Promise<SearchGenreCacheEntry[] | null> {
  const normalizedKey = normalizeCacheKey(key);
  if (!normalizedKey) return null;

  const cache = await getStoredValue('searchGenreCache', {} as SearchGenreCacheMap);
  const payload = cache[normalizedKey];
  if (!payload) return null;
  if (payload.expiresAt <= Date.now()) return null;
  return Array.isArray(payload.value) ? payload.value : null;
}

export async function writeSearchGenreCache(key: string, value: SearchGenreCacheEntry[]): Promise<void> {
  const normalizedKey = normalizeCacheKey(key);
  if (!normalizedKey) return;

  const cache = await getStoredValue('searchGenreCache', {} as SearchGenreCacheMap);
  const now = Date.now();
  const next: SearchGenreCacheMap = {
    ...cache,
    [normalizedKey]: {
      value,
      savedAt: now,
      expiresAt: now + SEARCH_GENRE_CACHE_TTL_MS,
    },
  };

  await setStoredValue('searchGenreCache', next);
}

export async function readSearchProducerCache(key: string): Promise<SearchProducerCacheEntry[] | null> {
  const normalizedKey = normalizeCacheKey(key);
  if (!normalizedKey) return null;

  const cache = await getStoredValue('searchProducerCache', {} as SearchProducerCacheMap);
  const payload = cache[normalizedKey];
  if (!payload) return null;
  if (payload.expiresAt <= Date.now()) return null;
  return Array.isArray(payload.value) ? payload.value : null;
}

export async function writeSearchProducerCache(key: string, value: SearchProducerCacheEntry[]): Promise<void> {
  const normalizedKey = normalizeCacheKey(key);
  if (!normalizedKey) return;

  const cache = await getStoredValue('searchProducerCache', {} as SearchProducerCacheMap);
  const now = Date.now();
  const next: SearchProducerCacheMap = {
    ...cache,
    [normalizedKey]: {
      value,
      savedAt: now,
      expiresAt: now + SEARCH_PRODUCER_CACHE_TTL_MS,
    },
  };

  await setStoredValue('searchProducerCache', next);
}

export async function clearSearchFilterCaches(): Promise<void> {
  await Promise.all([
    setStoredValue('searchGenreCache', {} as SearchGenreCacheMap),
    setStoredValue('searchProducerCache', {} as SearchProducerCacheMap),
  ]);
}
