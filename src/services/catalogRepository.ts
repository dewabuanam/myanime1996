import type { AnimeDetail, AnimeSummary } from '../types/anime';
import { parseReleaseTimestamp } from '../utils/releaseTime';
import { getStoredValue } from './store';
import { animeScheduleCatalogProvider } from './providers/animeScheduleCatalogProvider';
import type { CacheFetchOptions, HomeRefreshCallbacks } from './providers/catalogProviderTypes';
import { jikanCatalogProvider } from './providers/jikanCatalogProvider';

export type BaseCatalogSource = 'animeschedule' | 'jikan';

export const DEFAULT_BASE_CATALOG_SOURCE: BaseCatalogSource = 'animeschedule';
const LATEST_FETCH_MINIMUM = 60;

function dedupeAnimeList(list: AnimeSummary[]) {
  const unique = new Map<number, AnimeSummary>();
  for (const anime of list) {
    if (!unique.has(anime.id)) {
      unique.set(anime.id, anime);
    }
  }
  return Array.from(unique.values());
}

function getAiringTimestamp(anime: AnimeSummary) {
  const parsed = parseReleaseTimestamp(anime.airingDate);
  if (parsed !== null) return parsed;
  if (typeof anime.year === 'number' && Number.isFinite(anime.year)) {
    return Date.UTC(anime.year, 0, 1);
  }
  return 0;
}

function shapeLatestUpdatedList(items: AnimeSummary[]) {
  const deduped = dedupeAnimeList(items);
  return deduped.sort((a, b) => getAiringTimestamp(b) - getAiringTimestamp(a));
}

function shapeUpcomingUpdatedList(items: AnimeSummary[]) {
  const deduped = dedupeAnimeList(items);
  return deduped.sort((a, b) => getAiringTimestamp(a) - getAiringTimestamp(b));
}

async function getPreferredProvider() {
  const value = await getStoredValue('baseCatalogSource', DEFAULT_BASE_CATALOG_SOURCE);
  return value === 'jikan' ? jikanCatalogProvider : animeScheduleCatalogProvider;
}

async function runWithFallback<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
): Promise<T> {
  try {
    return await primary();
  } catch {
    return fallback();
  }
}

export async function getBaseCatalogSourceSetting(): Promise<BaseCatalogSource> {
  const value = await getStoredValue('baseCatalogSource', DEFAULT_BASE_CATALOG_SOURCE);
  return value === 'jikan' ? 'jikan' : 'animeschedule';
}

export async function getTopAnime(limit = 10, options?: CacheFetchOptions<AnimeSummary[]>) {
  const preferred = await getPreferredProvider();
  if (preferred === jikanCatalogProvider) {
    return dedupeAnimeList(await jikanCatalogProvider.getTopAnime(limit, options));
  }
  return dedupeAnimeList(await runWithFallback(
    () => preferred.getTopAnime(limit, options),
    () => jikanCatalogProvider.getTopAnime(limit, options),
  ));
}

export async function getSeasonalAnime(limit = 10, options?: CacheFetchOptions<AnimeSummary[]>) {
  const preferred = await getPreferredProvider();
  if (preferred === jikanCatalogProvider) {
    return dedupeAnimeList(await jikanCatalogProvider.getSeasonalAnime(limit, options));
  }
  return dedupeAnimeList(await runWithFallback(
    () => preferred.getSeasonalAnime(limit, options),
    () => jikanCatalogProvider.getSeasonalAnime(limit, options),
  ));
}

export async function getLatestUpdatedAnime(limit = 10, options?: CacheFetchOptions<AnimeSummary[]>) {
  const safeLimit = Math.max(1, Math.floor(limit));
  const fetchLimit = Math.max(safeLimit, LATEST_FETCH_MINIMUM);
  const latestOptions: CacheFetchOptions<AnimeSummary[]> | undefined = options
    ? {
        ...options,
        onUpdate: (value) => {
          options.onUpdate?.(shapeLatestUpdatedList(value));
        },
      }
    : undefined;

  const data = dedupeAnimeList(await runWithFallback(
    () => animeScheduleCatalogProvider.getLatestUpdatedAnime(fetchLimit, latestOptions),
    () => jikanCatalogProvider.getLatestUpdatedAnime(fetchLimit, latestOptions),
  ));

  if (data.length > 0) return shapeLatestUpdatedList(data);
  return shapeLatestUpdatedList(await jikanCatalogProvider.getLatestUpdatedAnime(fetchLimit, latestOptions));
}

export async function getUpcomingUpdatedAnime(limit = 10, options?: CacheFetchOptions<AnimeSummary[]>) {
  const safeLimit = Math.max(1, Math.floor(limit));
  const fetchLimit = Math.max(safeLimit, LATEST_FETCH_MINIMUM);
  const upcomingOptions: CacheFetchOptions<AnimeSummary[]> | undefined = options
    ? {
        ...options,
        onUpdate: (value) => {
          options.onUpdate?.(shapeUpcomingUpdatedList(value));
        },
      }
    : undefined;

  const data = dedupeAnimeList(await runWithFallback(
    () => animeScheduleCatalogProvider.getUpcomingUpdatedAnime(fetchLimit, upcomingOptions),
    () => jikanCatalogProvider.getUpcomingUpdatedAnime(fetchLimit, upcomingOptions),
  ));

  if (data.length > 0) return shapeUpcomingUpdatedList(data);
  return shapeUpcomingUpdatedList(await jikanCatalogProvider.getUpcomingUpdatedAnime(fetchLimit, upcomingOptions));
}

export async function getLatestPromoAnime(limit = 10, options?: CacheFetchOptions<AnimeSummary[]>) {
  const preferred = await getPreferredProvider();
  if (preferred === jikanCatalogProvider) {
    return dedupeAnimeList(await jikanCatalogProvider.getLatestPromoAnime(limit, options));
  }
  return dedupeAnimeList(await runWithFallback(
    () => preferred.getLatestPromoAnime(limit, options),
    () => jikanCatalogProvider.getLatestPromoAnime(limit, options),
  ));
}

export async function getTopAiringAnime(limit = 10, options?: CacheFetchOptions<AnimeSummary[]>) {
  const preferred = await getPreferredProvider();
  if (preferred === jikanCatalogProvider) {
    return dedupeAnimeList(await jikanCatalogProvider.getTopAiringAnime(limit, options));
  }
  return dedupeAnimeList(await runWithFallback(
    () => preferred.getTopAiringAnime(limit, options),
    () => jikanCatalogProvider.getTopAiringAnime(limit, options),
  ));
}

export async function getTopUpcomingAnime(limit = 10, options?: CacheFetchOptions<AnimeSummary[]>) {
  const preferred = await getPreferredProvider();
  if (preferred === jikanCatalogProvider) {
    return dedupeAnimeList(await jikanCatalogProvider.getTopUpcomingAnime(limit, options));
  }
  return dedupeAnimeList(await runWithFallback(
    () => preferred.getTopUpcomingAnime(limit, options),
    () => jikanCatalogProvider.getTopUpcomingAnime(limit, options),
  ));
}

export async function searchAnime(query: string): Promise<AnimeSummary[]> {
  const preferred = await getPreferredProvider();
  if (preferred === jikanCatalogProvider) {
    return dedupeAnimeList(await jikanCatalogProvider.searchAnime(query));
  }

  const data = dedupeAnimeList(await runWithFallback(
    () => preferred.searchAnime(query),
    () => jikanCatalogProvider.searchAnime(query),
  ));

  if (data.length > 0) return data;
  return dedupeAnimeList(await jikanCatalogProvider.searchAnime(query));
}

export async function getAnimeDetails(id: string | number): Promise<AnimeDetail> {
  const preferred = await getPreferredProvider();
  if (preferred === jikanCatalogProvider) {
    return jikanCatalogProvider.getAnimeDetails(id);
  }
  return runWithFallback(
    () => preferred.getAnimeDetails(id),
    () => jikanCatalogProvider.getAnimeDetails(id),
  );
}

export async function getAnimeTrailerUrl(id: string | number): Promise<string | undefined> {
  const preferred = await getPreferredProvider();

  const readTrailer = async (read: () => Promise<AnimeDetail>) => {
    try {
      const detail = await read();
      const trailer = detail.trailerUrl?.trim();
      return trailer && trailer.length > 0 ? trailer : undefined;
    } catch {
      return undefined;
    }
  };

  if (preferred === jikanCatalogProvider) {
    return readTrailer(() => jikanCatalogProvider.getAnimeDetails(id));
  }

  const preferredTrailer = await readTrailer(() => preferred.getAnimeDetails(id));
  if (preferredTrailer) return preferredTrailer;

  return readTrailer(() => jikanCatalogProvider.getAnimeDetails(id));
}

export async function refreshHomeShelvesIfNeeded(limit = 20, callbacks: HomeRefreshCallbacks = {}) {
  const shapedCallbacks: HomeRefreshCallbacks = {
    ...callbacks,
    onLatestUpdated: callbacks.onLatestUpdated
      ? (value) => {
          callbacks.onLatestUpdated?.(shapeLatestUpdatedList(value));
        }
      : undefined,
    onUpcomingUpdated: callbacks.onUpcomingUpdated
      ? (value) => {
          callbacks.onUpcomingUpdated?.(shapeUpcomingUpdatedList(value));
        }
      : undefined,
  };

  try {
    await animeScheduleCatalogProvider.refreshHomeShelvesIfNeeded(limit, shapedCallbacks);
  } catch {
    await jikanCatalogProvider.refreshHomeShelvesIfNeeded(limit, shapedCallbacks);
  }
}
