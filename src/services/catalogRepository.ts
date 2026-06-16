import type { AnimeDetail, AnimeSummary } from '../types/anime';
import { parseReleaseTimestamp } from '../utils/releaseTime';
import { getStoredValue } from './store';
import { animeScheduleCatalogProvider } from './providers/animeScheduleCatalogProvider';
import type { CacheFetchOptions, HomeRefreshCallbacks } from './providers/catalogProviderTypes';
import { jikanCatalogProvider } from './providers/jikanCatalogProvider';
import { resolveAnimeScheduleBridgeJikanId } from './animeSchedule';

export type BaseCatalogSource = 'animeschedule' | 'jikan';

export const DEFAULT_BASE_CATALOG_SOURCE: BaseCatalogSource = 'animeschedule';
const LATEST_FETCH_MINIMUM = 60;
const MAX_REASONABLE_MAL_ID = 2_000_000;

function isValidMalId(value?: number): value is number {
  return Boolean(Number.isFinite(value) && value && value > 0 && value <= MAX_REASONABLE_MAL_ID);
}

async function getAnimeScheduleDetailWithBridge(id: string | number): Promise<AnimeDetail> {
  const detail = await animeScheduleCatalogProvider.getAnimeDetails(id);
  if (isValidMalId(detail.jikanId) && detail.jikanId !== detail.id) {
    return detail;
  }

  const bridgeJikanId = await resolveAnimeScheduleBridgeJikanId(id);
  if (!isValidMalId(bridgeJikanId)) {
    return detail;
  }

  return {
    ...detail,
    id: Math.floor(bridgeJikanId),
    jikanId: Math.floor(bridgeJikanId),
  };
}

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
    const jikanFirst = await jikanCatalogProvider.getAnimeDetails(id).catch(() => null);
    if (jikanFirst) return jikanFirst;

    const animeScheduleDetail = await getAnimeScheduleDetailWithBridge(id);
    if (isValidMalId(animeScheduleDetail.jikanId)) {
      const canonicalJikanId = Math.floor(animeScheduleDetail.jikanId);
      return runWithFallback(
        () => jikanCatalogProvider.getAnimeDetails(canonicalJikanId),
        () => Promise.resolve(animeScheduleDetail),
      );
    }

    return animeScheduleDetail;
  }

  const animeScheduleDetail = await getAnimeScheduleDetailWithBridge(id).catch(() => null);
  if (!animeScheduleDetail) {
    return jikanCatalogProvider.getAnimeDetails(id);
  }

  if (!isValidMalId(animeScheduleDetail.jikanId)) {
    return animeScheduleDetail;
  }

  const canonicalJikanId = Math.floor(animeScheduleDetail.jikanId);

  return runWithFallback(
    () => jikanCatalogProvider.getAnimeDetails(canonicalJikanId),
    () => Promise.resolve(animeScheduleDetail),
  );
}

export async function getAnimeTrailerUrl(id: string | number): Promise<string | undefined> {
  try {
    const detail = await getAnimeDetails(id);
    const trailer = detail.trailerUrl?.trim();
    return trailer && trailer.length > 0 ? trailer : undefined;
  } catch {
    return undefined;
  }
}

export async function resolveCanonicalDetailRouteId(
  anime: Pick<AnimeSummary, 'id' | 'jikanId' | 'animeScheduleRoute'>,
): Promise<number | undefined> {
  const directJikanId = isValidMalId(anime.jikanId) ? Math.floor(anime.jikanId) : undefined;
  const hasAnimeScheduleRoute = Boolean(anime.animeScheduleRoute?.trim());

  // If this already looks like a MAL/Jikan id and no route is available, trust it.
  // This avoids unnecessary bridge requests for rows already keyed by canonical ids.
  if (!directJikanId && !hasAnimeScheduleRoute && isValidMalId(anime.id)) {
    return Math.floor(anime.id);
  }

  // For AnimeSchedule items we can receive source-local ids. Bridge only when
  // direct canonical id is absent and a route is available.
  if (!directJikanId && hasAnimeScheduleRoute) {
    const bridged = await resolveAnimeScheduleBridgeJikanId(anime.id, anime.animeScheduleRoute);
    if (isValidMalId(bridged)) {
      return Math.floor(bridged);
    }
  }

  if (directJikanId) return directJikanId;
  return undefined;
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
