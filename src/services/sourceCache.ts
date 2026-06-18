import type { CachedPayload } from '../types/anime';
import type { ResolvedSource } from '../types/plugin';
import { getStoredValue, setStoredValue } from './store';

const SOURCE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const SOURCE_CACHE_UPDATED_EVENT = 'myanime1996:source-cache-updated';

function emitSourceCacheUpdated() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SOURCE_CACHE_UPDATED_EVENT));
}

export type SourceCacheIdentity = {
  pluginId: string;
  provider: 'jikan' | 'animeschedule';
  animeId: number;
  title: string;
  episodeNumber: number;
  language?: string;
  sourceOptionId?: string;
};

export type SourceCacheEpisodeIdentity = {
  provider: 'jikan' | 'animeschedule';
  animeId: number;
  title: string;
  episodeNumber: number;
};

function normalizeTitle(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function makeSourceCacheKey(identity: SourceCacheIdentity) {
  const normalizedLanguage = normalizeTitle(identity.language ?? 'auto');
  const normalizedSourceOptionId = normalizeTitle(identity.sourceOptionId ?? 'auto');
  return `${identity.provider}::${identity.pluginId}::${identity.animeId}::${normalizeTitle(identity.title)}::${identity.episodeNumber}::${normalizedLanguage}::${normalizedSourceOptionId}`;
}

function isSameEpisodeIdentity(key: string, identity: SourceCacheEpisodeIdentity) {
  const providerPrefix = `${identity.provider}::`;
  const episodeFragment = `::${identity.animeId}::${normalizeTitle(identity.title)}::${identity.episodeNumber}::`;
  return key.startsWith(providerPrefix) && key.includes(episodeFragment);
}

export async function getCachedResolvedSource(identity: SourceCacheIdentity): Promise<ResolvedSource | null> {
  const cache = await getStoredValue('sourceResolveCache', {} as Record<string, CachedPayload<ResolvedSource>>);
  const key = makeSourceCacheKey(identity);
  const cached = cache[key];

  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    const next = { ...cache };
    delete next[key];
    await setStoredValue('sourceResolveCache', next);
    return null;
  }

  return cached.value;
}

export async function setCachedResolvedSource(identity: SourceCacheIdentity, source: ResolvedSource): Promise<void> {
  const cache = await getStoredValue('sourceResolveCache', {} as Record<string, CachedPayload<ResolvedSource>>);
  const key = makeSourceCacheKey(identity);
  const now = Date.now();

  await setStoredValue('sourceResolveCache', {
    ...cache,
    [key]: {
      value: source,
      savedAt: now,
      expiresAt: now + SOURCE_CACHE_TTL_MS,
    },
  });
  emitSourceCacheUpdated();
}

export async function clearSourceResolveCache() {
  inFlightResolves.clear();
  await setStoredValue('sourceResolveCache', {} as Record<string, CachedPayload<ResolvedSource>>);
  emitSourceCacheUpdated();
}

export async function clearCachedResolvedSourceForEpisode(identity: SourceCacheEpisodeIdentity): Promise<void> {
  const cache = await getStoredValue('sourceResolveCache', {} as Record<string, CachedPayload<ResolvedSource>>);
  const nextCache = { ...cache };
  let changed = false;

  for (const key of Object.keys(nextCache)) {
    if (!isSameEpisodeIdentity(key, identity)) continue;
    delete nextCache[key];
    changed = true;
  }

  for (const key of Array.from(inFlightResolves.keys())) {
    if (!isSameEpisodeIdentity(key, identity)) continue;
    inFlightResolves.delete(key);
    changed = true;
  }

  if (!changed) return;

  await setStoredValue('sourceResolveCache', nextCache);
  emitSourceCacheUpdated();
}

const inFlightResolves = new Map<string, Promise<ResolvedSource | null>>();

export async function resolveWithSourceCache(
  identity: SourceCacheIdentity,
  resolver: () => Promise<ResolvedSource | null>,
): Promise<ResolvedSource | null> {
  const key = makeSourceCacheKey(identity);
  const cached = await getCachedResolvedSource(identity);
  if (cached) return cached;

  const existing = inFlightResolves.get(key);
  if (existing) {
    return existing;
  }

  const pending = (async () => {
    const resolved = await resolver();
    if (resolved) {
      await setCachedResolvedSource(identity, resolved);
    }
    return resolved;
  })().finally(() => {
    inFlightResolves.delete(key);
  });

  inFlightResolves.set(key, pending);
  return pending;
}
