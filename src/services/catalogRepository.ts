import type { AnimeDetail, AnimeSummary } from '../types/anime';
import { sortByScoreThenPopularity } from '../utils/animeRanking';
import { parseReleaseTimestamp } from '../utils/releaseTime';
import { getStoredValue } from './store';
import { animeScheduleCatalogProvider } from './providers/animeScheduleCatalogProvider';
import type { CacheFetchOptions, HomeRefreshCallbacks } from './providers/catalogProviderTypes';
import { tenraiCatalogProvider } from './providers/tenraiCatalogProvider';
import { resolveAnimeScheduleBridgeTenraiId } from './animeSchedule';
import {
  getAnimeGenres,
  searchAnimeWithQuery,
  searchProducers,
  type AnimeGenre,
  type AnimeGenreFilterType,
  type AnimeSearchQuery,
  type AnimeSearchResult,
  type ProducerSearchQuery,
  type ProducerSearchResult,
} from './tenrai';

export type BaseCatalogSource = 'animeschedule' | 'tenrai';

export const DEFAULT_BASE_CATALOG_SOURCE: BaseCatalogSource = 'animeschedule';
const LATEST_FETCH_MINIMUM = 60;
const MAX_REASONABLE_MAL_ID = 2_000_000;

function isValidMalId(value?: number): value is number {
  return Boolean(Number.isFinite(value) && value && value > 0 && value <= MAX_REASONABLE_MAL_ID);
}

async function getAnimeScheduleDetailWithBridge(id: string | number): Promise<AnimeDetail> {
  const detail = await animeScheduleCatalogProvider.getAnimeDetails(id);
  if (isValidMalId(detail.tenraiId) && detail.tenraiId !== detail.id) {
    return detail;
  }

  const bridgeTenraiId = await resolveAnimeScheduleBridgeTenraiId(id);
  if (!isValidMalId(bridgeTenraiId)) {
    return detail;
  }

  return {
    ...detail,
    id: Math.floor(bridgeTenraiId),
    tenraiId: Math.floor(bridgeTenraiId),
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

function shapeLatestPromoList(items: AnimeSummary[]) {
  const deduped = dedupeAnimeList(items);
  return deduped.sort((a, b) => getAiringTimestamp(b) - getAiringTimestamp(a));
}

// A store written before the Tenrai cutover still holds 'jikan' here; both spellings
// resolve to the Tenrai provider.
const isTenraiSourceValue = (value: unknown) => value === 'tenrai' || value === 'jikan';

async function getPreferredProvider() {
  const value = await getStoredValue('baseCatalogSource', DEFAULT_BASE_CATALOG_SOURCE);
  return isTenraiSourceValue(value) ? tenraiCatalogProvider : animeScheduleCatalogProvider;
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
  return isTenraiSourceValue(value) ? 'tenrai' : 'animeschedule';
}

export async function getTopAnime(limit = 10, options?: CacheFetchOptions<AnimeSummary[]>) {
  const safeLimit = Math.max(1, Math.floor(limit));
  const preferred = await getPreferredProvider();
  const hasPopularFilters = Boolean(options?.topAnimeType || options?.topAnimeRating);

  const primary = dedupeAnimeList(await tenraiCatalogProvider.getTopAnime(limit, options).catch(() => []));
  if (primary.length >= Math.max(3, Math.floor(safeLimit / 2))) {
    return primary.slice(0, safeLimit);
  }

  if (hasPopularFilters) {
    return primary.slice(0, safeLimit);
  }

  if (preferred === tenraiCatalogProvider) {
    return primary.slice(0, safeLimit);
  }

  const fallback = dedupeAnimeList(await preferred.getTopAnime(limit, options).catch(() => []));
  return dedupeAnimeList([...primary, ...fallback]).slice(0, safeLimit);
}

export async function getSeasonalAnime(limit = 10, options?: CacheFetchOptions<AnimeSummary[]>) {
  const isSeasonTargetedRequest = Boolean(
    options?.season ||
    options?.seasonYear ||
    options?.seasonFilter ||
    options?.seasonContinuing !== undefined,
  );

  if (isSeasonTargetedRequest) {
    const targeted = dedupeAnimeList(await runWithFallback(
      () => tenraiCatalogProvider.getSeasonalAnime(limit, options),
      () => animeScheduleCatalogProvider.getSeasonalAnime(limit, options),
    ));
    return targeted.slice(0, Math.max(1, Math.floor(limit)));
  }

  const preferred = await getPreferredProvider();
  const [animeScheduleSeasonal, providerSeasonal, tenraiSeasonal] = await Promise.all([
    animeScheduleCatalogProvider.getSeasonalAnime(limit, options).catch(() => []),
    preferred.getSeasonalAnime(limit, options).catch(() => []),
    tenraiCatalogProvider.getSeasonalAnime(limit, options).catch(() => []),
  ]);

  const merged = dedupeAnimeList([
    ...animeScheduleSeasonal,
    ...providerSeasonal,
    ...tenraiSeasonal,
  ]);

  if (merged.length > 0) {
    return merged.slice(0, Math.max(1, Math.floor(limit)));
  }

  return dedupeAnimeList(await runWithFallback(
    () => preferred.getSeasonalAnime(limit, options),
    () => tenraiCatalogProvider.getSeasonalAnime(limit, options),
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
    () => tenraiCatalogProvider.getLatestUpdatedAnime(fetchLimit, latestOptions),
  ));

  if (data.length > 0) return shapeLatestUpdatedList(data);
  return shapeLatestUpdatedList(await tenraiCatalogProvider.getLatestUpdatedAnime(fetchLimit, latestOptions));
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
    () => tenraiCatalogProvider.getUpcomingUpdatedAnime(fetchLimit, upcomingOptions),
  ));

  if (data.length > 0) return shapeUpcomingUpdatedList(data);
  return shapeUpcomingUpdatedList(await tenraiCatalogProvider.getUpcomingUpdatedAnime(fetchLimit, upcomingOptions));
}

export async function getLatestPromoAnime(limit = 10, options?: CacheFetchOptions<AnimeSummary[]>) {
  const preferred = await getPreferredProvider();
  const promoOptions: CacheFetchOptions<AnimeSummary[]> | undefined = options
    ? {
        ...options,
        onUpdate: (value) => {
          options.onUpdate?.(shapeLatestPromoList(value));
        },
      }
    : undefined;

  if (preferred === tenraiCatalogProvider) {
    return shapeLatestPromoList(dedupeAnimeList(await tenraiCatalogProvider.getLatestPromoAnime(limit, promoOptions)));
  }
  const primary = dedupeAnimeList(await runWithFallback(
    () => preferred.getLatestPromoAnime(limit, promoOptions),
    () => tenraiCatalogProvider.getLatestPromoAnime(limit, promoOptions),
  ));
  if (primary.length >= Math.max(3, Math.floor(limit / 2))) return shapeLatestPromoList(primary);
  const fallback = dedupeAnimeList(await tenraiCatalogProvider.getLatestPromoAnime(limit, promoOptions).catch(() => []));
  return shapeLatestPromoList(dedupeAnimeList([...primary, ...fallback])).slice(0, Math.max(1, Math.floor(limit)));
}

export async function getTopAiringAnime(limit = 10, options?: CacheFetchOptions<AnimeSummary[]>) {
  const preferred = await getPreferredProvider();
  if (preferred === tenraiCatalogProvider) {
    const primary = dedupeAnimeList(await tenraiCatalogProvider.getTopAiringAnime(limit, options));
    if (primary.length >= Math.max(3, Math.floor(limit / 2))) {
      return sortByScoreThenPopularity(primary).slice(0, Math.max(1, Math.floor(limit)));
    }
    const fallback = dedupeAnimeList(await animeScheduleCatalogProvider.getTopAiringAnime(limit, options).catch(() => []));
    return sortByScoreThenPopularity(dedupeAnimeList([...primary, ...fallback])).slice(0, Math.max(1, Math.floor(limit)));
  }
  const primary = dedupeAnimeList(await runWithFallback(
    () => preferred.getTopAiringAnime(limit, options),
    () => tenraiCatalogProvider.getTopAiringAnime(limit, options),
  ));
  if (primary.length >= Math.max(3, Math.floor(limit / 2))) {
    return sortByScoreThenPopularity(primary).slice(0, Math.max(1, Math.floor(limit)));
  }
  const fallback = dedupeAnimeList(await tenraiCatalogProvider.getTopAiringAnime(limit, options).catch(() => []));
  return sortByScoreThenPopularity(dedupeAnimeList([...primary, ...fallback])).slice(0, Math.max(1, Math.floor(limit)));
}

export async function getTopUpcomingAnime(limit = 10, options?: CacheFetchOptions<AnimeSummary[]>) {
  const preferred = await getPreferredProvider();
  if (preferred === tenraiCatalogProvider) {
    const primary = dedupeAnimeList(await tenraiCatalogProvider.getTopUpcomingAnime(limit, options));
    if (primary.length >= Math.max(3, Math.floor(limit / 2))) {
      return sortByScoreThenPopularity(primary).slice(0, Math.max(1, Math.floor(limit)));
    }
    const fallback = dedupeAnimeList(await animeScheduleCatalogProvider.getTopUpcomingAnime(limit, options).catch(() => []));
    return sortByScoreThenPopularity(dedupeAnimeList([...primary, ...fallback])).slice(0, Math.max(1, Math.floor(limit)));
  }
  const primary = dedupeAnimeList(await runWithFallback(
    () => preferred.getTopUpcomingAnime(limit, options),
    () => tenraiCatalogProvider.getTopUpcomingAnime(limit, options),
  ));
  if (primary.length >= Math.max(3, Math.floor(limit / 2))) {
    return sortByScoreThenPopularity(primary).slice(0, Math.max(1, Math.floor(limit)));
  }
  const fallback = dedupeAnimeList(await tenraiCatalogProvider.getTopUpcomingAnime(limit, options).catch(() => []));
  return sortByScoreThenPopularity(dedupeAnimeList([...primary, ...fallback])).slice(0, Math.max(1, Math.floor(limit)));
}

export async function searchAnime(query: string): Promise<AnimeSummary[]> {
  const preferred = await getPreferredProvider();
  if (preferred === tenraiCatalogProvider) {
    return dedupeAnimeList(await tenraiCatalogProvider.searchAnime(query));
  }

  const data = dedupeAnimeList(await runWithFallback(
    () => preferred.searchAnime(query),
    () => tenraiCatalogProvider.searchAnime(query),
  ));

  if (data.length > 0) return data;
  return dedupeAnimeList(await tenraiCatalogProvider.searchAnime(query));
}

export function searchAnimeAdvanced(query: AnimeSearchQuery): Promise<AnimeSearchResult> {
  return searchAnimeWithQuery(query);
}

export function getSearchAnimeGenres(filter: AnimeGenreFilterType = 'genres'): Promise<AnimeGenre[]> {
  return getAnimeGenres(filter);
}

export function searchAnimeProducers(query: ProducerSearchQuery = {}): Promise<ProducerSearchResult> {
  return searchProducers(query);
}

export async function getAnimeDetails(id: string | number): Promise<AnimeDetail> {
  const preferred = await getPreferredProvider();
  if (preferred === tenraiCatalogProvider) {
    const tenraiFirst = await tenraiCatalogProvider.getAnimeDetails(id).catch(() => null);
    if (tenraiFirst) return tenraiFirst;

    const animeScheduleDetail = await getAnimeScheduleDetailWithBridge(id);
    if (isValidMalId(animeScheduleDetail.tenraiId)) {
      const canonicalTenraiId = Math.floor(animeScheduleDetail.tenraiId);
      return runWithFallback(
        () => tenraiCatalogProvider.getAnimeDetails(canonicalTenraiId),
        () => Promise.resolve(animeScheduleDetail),
      );
    }

    return animeScheduleDetail;
  }

  const animeScheduleDetail = await getAnimeScheduleDetailWithBridge(id).catch(() => null);
  if (!animeScheduleDetail) {
    return tenraiCatalogProvider.getAnimeDetails(id);
  }

  if (!isValidMalId(animeScheduleDetail.tenraiId)) {
    return animeScheduleDetail;
  }

  const canonicalTenraiId = Math.floor(animeScheduleDetail.tenraiId);

  return runWithFallback(
    () => tenraiCatalogProvider.getAnimeDetails(canonicalTenraiId),
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
  anime: Pick<AnimeSummary, 'id' | 'tenraiId' | 'animeScheduleRoute'>,
): Promise<number | undefined> {
  const directTenraiId = isValidMalId(anime.tenraiId) ? Math.floor(anime.tenraiId) : undefined;
  const hasAnimeScheduleRoute = Boolean(anime.animeScheduleRoute?.trim());

  // If this already looks like a MAL/Tenrai id and no route is available, trust it.
  // This avoids unnecessary bridge requests for rows already keyed by canonical ids.
  if (!directTenraiId && !hasAnimeScheduleRoute && isValidMalId(anime.id)) {
    return Math.floor(anime.id);
  }

  // For AnimeSchedule items we can receive source-local ids. Bridge only when
  // direct canonical id is absent and a route is available.
  if (!directTenraiId && hasAnimeScheduleRoute) {
    const bridged = await resolveAnimeScheduleBridgeTenraiId(anime.id, anime.animeScheduleRoute);
    if (isValidMalId(bridged)) {
      return Math.floor(bridged);
    }
  }

  if (directTenraiId) return directTenraiId;
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
    await tenraiCatalogProvider.refreshHomeShelvesIfNeeded(limit, shapedCallbacks);
  }
}
