import type { CachedPayload } from '../types/anime';
import { getStoredValue, setStoredValue } from './store';

// Nothing ever removed expired entries from the response caches, so they only grew:
// a store observed in the wild held ~19 MB across three caches, 95-98% of it already
// expired. Every read of those caches paid for that dead weight. This sweep drops
// entries that are past their TTL by more than the stale-serve grace period, then caps
// what is left so a long-lived install cannot creep back up.

// Expired entries are still served while a refresh runs in the background, so they are
// kept for a while after expiry rather than dropped the moment they go stale.
const STALE_GRACE_MS = 2 * 24 * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 30 * 60 * 1000;

const MAX_ENTRIES_PER_CACHE = 300;
const MAX_ANIME_ENTITIES = 800;

// Holds the id -> AnimeSummary map that the list caches point into, so it is capped by
// entity count rather than being treated as one oversized cache entry.
const ANIME_ENTITY_CACHE_KEY = 'tenrai:anime:entities';

type CacheRecord = Record<string, CachedPayload<unknown>>;

const SWEPT_CACHE_KEYS = ['tenraiCache', 'animeScheduleCache', 'sourceResolveCache', 'aniSkipCache'] as const;

type SweptCacheKey = (typeof SWEPT_CACHE_KEYS)[number];

function isCachedPayload(value: unknown): value is CachedPayload<unknown> {
  return typeof value === 'object' && value !== null && 'expiresAt' in value;
}

function savedAtOf(entry: CachedPayload<unknown>) {
  return typeof entry.savedAt === 'number' ? entry.savedAt : 0;
}

function pruneAnimeEntities(entry: CachedPayload<unknown>): CachedPayload<unknown> {
  const map = entry.value;
  if (typeof map !== 'object' || map === null) return entry;

  const ids = Object.keys(map as Record<string, unknown>);
  if (ids.length <= MAX_ANIME_ENTITIES) return entry;

  // No per-entity timestamps exist, so keep the highest ids: MAL ids climb over time,
  // which makes them a reasonable stand-in for recency. Dropped entities simply cause
  // their list cache to refetch, which the hydration path already handles.
  const kept = ids
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id))
    .sort((a, b) => b - a)
    .slice(0, MAX_ANIME_ENTITIES);

  const next: Record<string, unknown> = {};
  for (const id of kept) next[String(id)] = (map as Record<string, unknown>)[String(id)];

  return { ...entry, value: next };
}

function pruneCache(cache: CacheRecord, now: number) {
  const next: CacheRecord = {};
  let removed = 0;

  for (const [key, entry] of Object.entries(cache)) {
    if (!isCachedPayload(entry)) {
      removed += 1;
      continue;
    }

    if (key === ANIME_ENTITY_CACHE_KEY) {
      next[key] = pruneAnimeEntities(entry);
      continue;
    }

    const expiresAt = typeof entry.expiresAt === 'number' ? entry.expiresAt : 0;
    if (expiresAt <= now - STALE_GRACE_MS) {
      removed += 1;
      continue;
    }

    next[key] = entry;
  }

  const keys = Object.keys(next).filter((key) => key !== ANIME_ENTITY_CACHE_KEY);
  if (keys.length > MAX_ENTRIES_PER_CACHE) {
    const doomed = keys
      .sort((a, b) => savedAtOf(next[b]) - savedAtOf(next[a]))
      .slice(MAX_ENTRIES_PER_CACHE);

    for (const key of doomed) {
      delete next[key];
      removed += 1;
    }
  }

  return { cache: next, removed };
}

async function sweepCacheKey(key: SweptCacheKey, now: number) {
  const cache = await getStoredValue(key, {} as CacheRecord);
  const entryCount = Object.keys(cache).length;
  if (entryCount === 0) return 0;

  const { cache: pruned, removed } = pruneCache(cache, now);
  if (removed === 0) return 0;

  await setStoredValue(key, pruned);
  return removed;
}

export async function pruneStoredCaches() {
  const now = Date.now();
  let removed = 0;

  for (const key of SWEPT_CACHE_KEYS) {
    try {
      removed += await sweepCacheKey(key, now);
    } catch (error) {
      console.warn(`Cache sweep failed for "${key}".`, error);
    }
  }

  return removed;
}

let sweepTimer: ReturnType<typeof setInterval> | null = null;

export function startCacheMaintenance() {
  void pruneStoredCaches();

  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    void pruneStoredCaches();
  }, SWEEP_INTERVAL_MS);
}
