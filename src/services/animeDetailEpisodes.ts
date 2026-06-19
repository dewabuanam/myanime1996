import { getAnimeDetails } from './catalogSource';
import { getLatestReleasedTimetableAnime, getUpcomingTimetableAnime } from './animeSchedule';
import { getAnimeDetails as getJikanAnimeDetails, getAnimeEpisodes, getAnimeEpisodesAll } from './jikan';
import { getStoredValue, setStoredValue } from './store';
import type { AnimeDetailEpisodeBundle, AnimeEpisode, AnimeEpisodePagination, CachedPayload } from '../types/anime';

export const FALLBACK_PAGE_SIZE = 100;
const RECENT_TIMETABLE_SCAN_LIMIT = 2500;
const NEXT_WEEK_EPISODE_CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_REASONABLE_MAL_ID = 2_000_000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function toJikanAnimeId(detail: { id: number; jikanId?: number }) {
  const candidates = [detail.jikanId];
  for (const candidate of candidates) {
    if (!Number.isFinite(candidate) || !candidate || candidate <= 0) continue;
    if (candidate > MAX_REASONABLE_MAL_ID) continue;
    return Math.floor(candidate);
  }
  return undefined;
}

function toEpisodeCount(value?: number) {
  if (!Number.isFinite(value) || !value || value <= 0) return 0;
  return Math.max(0, Math.floor(value));
}

function getIsoWeekAndYear(date: Date) {
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utcDate.getTime() - yearStart.getTime()) / (24 * 60 * 60 * 1000)) + 1) / 7);
  return { week, year: utcDate.getUTCFullYear() };
}

function getNextIsoWeekAndYear(now = new Date()) {
  const nextWeekDate = new Date(now);
  nextWeekDate.setDate(nextWeekDate.getDate() + 7);
  return getIsoWeekAndYear(nextWeekDate);
}

function getPreviousIsoWeekAndYear(now = new Date()) {
  const previousWeekDate = new Date(now);
  previousWeekDate.setDate(previousWeekDate.getDate() - 7);
  return getIsoWeekAndYear(previousWeekDate);
}

function isInIsoWeek(timestamp: number, target: { week: number; year: number }) {
  if (!Number.isFinite(timestamp)) return false;
  const entry = getIsoWeekAndYear(new Date(timestamp));
  return entry.week === target.week && entry.year === target.year;
}

function isInIsoWeeks(timestamp: number, targets: Array<{ week: number; year: number }>) {
  for (const target of targets) {
    if (isInIsoWeek(timestamp, target)) return true;
  }
  return false;
}

function toNextWeekEpisodeCacheKey(
  detail: Awaited<ReturnType<typeof getAnimeDetails>>,
  weeks: Array<{ week: number; year: number }>,
) {
  const weekTag = weeks.map((entry) => `${entry.year}W${String(entry.week).padStart(2, '0')}`).join('_');
  const route = detail.animeScheduleRoute?.trim().toLowerCase();
  if (route) return `episode-fallback:upcoming:${weekTag}:${route}`;

  const jikanId = toEpisodeCount(detail.jikanId);
  if (jikanId > 0) return `episode-fallback:upcoming:${weekTag}:mal:${jikanId}`;

  const id = toEpisodeCount(detail.id);
  return `episode-fallback:upcoming:${weekTag}:id:${id}`;
}

async function readCachedEpisodeCount(cacheKey: string): Promise<number | null> {
  const now = Date.now();
  const cache = await getStoredValue('animeScheduleCache', {} as Record<string, CachedPayload<unknown>>);
  const cached = cache[cacheKey];
  if (!cached || !Number.isFinite(cached.expiresAt) || (cached.expiresAt as number) <= now) return null;

  const value = toEpisodeCount(cached.value as number | undefined);
  return value > 0 ? value : 0;
}

async function writeCachedEpisodeCount(cacheKey: string, value: number): Promise<void> {
  const safeValue = Math.max(0, toEpisodeCount(value));
  if (safeValue <= 0) return;
  const now = Date.now();
  const cache = await getStoredValue('animeScheduleCache', {} as Record<string, CachedPayload<unknown>>);
  await setStoredValue('animeScheduleCache', {
    ...cache,
    [cacheKey]: {
      value: safeValue,
      savedAt: now,
      expiresAt: now + NEXT_WEEK_EPISODE_CACHE_TTL_MS,
    },
  });
}

function isNsfwGenres(genres: string[]) {
  for (const genre of genres) {
    const normalized = genre.trim().toLowerCase();
    if (!normalized) continue;
    if (normalized === 'hentai' || normalized === 'adult') return true;
  }
  return false;
}

function normalizeTitleToken(value?: string) {
  if (!value) return '';
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]+/g, ' ')
    .trim();
}

function buildTitleCandidates(value: {
  title?: string;
  titleEnglish?: string;
  titleJapanese?: string;
}) {
  const set = new Set<string>();
  const candidates = [value.title, value.titleEnglish, value.titleJapanese];
  for (const candidate of candidates) {
    const normalized = normalizeTitleToken(candidate);
    if (normalized) set.add(normalized);
  }
  return set;
}

function isSameAnimeCandidate(
  detail: Awaited<ReturnType<typeof getAnimeDetails>>,
  candidate: { id: number; jikanId?: number; animeScheduleRoute?: string; title?: string; titleEnglish?: string; titleJapanese?: string },
) {
  const detailId = toEpisodeCount(detail.id);
  const detailJikanId = toEpisodeCount(detail.jikanId);
  const candidateId = toEpisodeCount(candidate.id);
  const candidateJikanId = toEpisodeCount(candidate.jikanId);

  if (detailJikanId > 0 && (candidateJikanId === detailJikanId || candidateId === detailJikanId)) return true;
  if (detailId > 0 && (candidateId === detailId || candidateJikanId === detailId)) return true;

  const detailRoute = detail.animeScheduleRoute?.trim().toLowerCase();
  const candidateRoute = candidate.animeScheduleRoute?.trim().toLowerCase();
  if (detailRoute && candidateRoute && detailRoute === candidateRoute) return true;

  const detailTitles = buildTitleCandidates(detail);
  const candidateTitles = buildTitleCandidates(candidate);
  if (detailTitles.size > 0 && candidateTitles.size > 0) {
    for (const token of detailTitles) {
      if (candidateTitles.has(token)) return true;
    }
  }

  return false;
}

async function findLatestEpisodeCountFromRecentTimetable(
  detail: Awaited<ReturnType<typeof getAnimeDetails>>,
): Promise<number> {
  const allowNsfw = Boolean(await getStoredValue('allowNsfw', false));
  const latestReleased = await getLatestReleasedTimetableAnime(RECENT_TIMETABLE_SCAN_LIMIT).catch(() => []);

  let maxEpisode = 0;
  for (const item of latestReleased) {
    if (!allowNsfw && isNsfwGenres(item.genres)) continue;
    if (!isSameAnimeCandidate(detail, item)) continue;
    const currentEpisode = toEpisodeCount(item.episodes);
    if (currentEpisode > maxEpisode) {
      maxEpisode = currentEpisode;
    }
  }

  return maxEpisode;
}

async function findLatestEpisodeCountFromNextWeekTimetable(
  detail: Awaited<ReturnType<typeof getAnimeDetails>>,
): Promise<number> {
  const previousWeek = getPreviousIsoWeekAndYear(new Date());
  const currentWeek = getIsoWeekAndYear(new Date());
  const nextWeek = getNextIsoWeekAndYear();
  const targetWeeks = [previousWeek, currentWeek, nextWeek];
  const cacheKey = toNextWeekEpisodeCacheKey(detail, targetWeeks);
  const cached = await readCachedEpisodeCount(cacheKey);
  if (cached !== null) return cached;

  const allowNsfw = Boolean(await getStoredValue('allowNsfw', false));
  const latestReleased = await getLatestReleasedTimetableAnime(RECENT_TIMETABLE_SCAN_LIMIT).catch(() => []);
  const upcoming = await getUpcomingTimetableAnime(RECENT_TIMETABLE_SCAN_LIMIT).catch(() => []);
  const now = Date.now();

  let releasedMax = 0;
  for (const item of latestReleased) {
    if (!allowNsfw && isNsfwGenres(item.genres)) continue;
    if (!isSameAnimeCandidate(detail, item)) continue;

    const releaseTimestamp = Date.parse(item.airingDate ?? '');
    if (!isInIsoWeeks(releaseTimestamp, targetWeeks)) continue;

    const releasedEpisode = toEpisodeCount(item.episodes);
    if (releasedEpisode > releasedMax) {
      releasedMax = releasedEpisode;
    }
  }

  let releasedFromUpcomingMax = 0;
  let nearestNextReleaseTimestamp = Number.POSITIVE_INFINITY;
  let nearestNextReleaseEpisode = 0;

  for (const item of upcoming) {
    if (!allowNsfw && isNsfwGenres(item.genres)) continue;
    if (!isSameAnimeCandidate(detail, item)) continue;

    const releaseTimestamp = Date.parse(item.airingDate ?? '');
    if (!Number.isFinite(releaseTimestamp)) continue;
    if (!isInIsoWeeks(releaseTimestamp, targetWeeks)) continue;

    const episodeNumber = toEpisodeCount(item.episodes);
    if (episodeNumber <= 0) continue;

    if (releaseTimestamp <= now) {
      if (episodeNumber > releasedFromUpcomingMax) {
        releasedFromUpcomingMax = episodeNumber;
      }
      continue;
    }

    if (releaseTimestamp < nearestNextReleaseTimestamp) {
      nearestNextReleaseTimestamp = releaseTimestamp;
      nearestNextReleaseEpisode = episodeNumber;
    }
  }

  const upcomingDerived = releasedFromUpcomingMax > 0
    ? releasedFromUpcomingMax
    : Math.max(0, nearestNextReleaseEpisode - 1);
  const resolvedLatest = releasedMax > 0 ? releasedMax : upcomingDerived;
  await writeCachedEpisodeCount(cacheKey, resolvedLatest);
  return resolvedLatest;
}

function toEstimatedWeeklyEpisodeCount(airingDate?: string): number {
  if (!airingDate) return 0;
  const start = Date.parse(airingDate);
  if (!Number.isFinite(start)) return 0;

  const now = Date.now();
  if (start > now) return 1;

  const weeksElapsed = Math.floor((now - start) / WEEK_MS);
  const estimated = weeksElapsed + 1;
  if (!Number.isFinite(estimated) || estimated <= 0) return 0;
  return estimated;
}

async function resolveKnownEpisodeCount(detail: Awaited<ReturnType<typeof getAnimeDetails>>, known: number): Promise<number> {
  const airingTimestamp = Date.parse(detail.airingDate ?? '');
  if (!Number.isFinite(airingTimestamp) || airingTimestamp <= Date.now()) {
    return known;
  }

  const timetableDerived = await findLatestEpisodeCountFromNextWeekTimetable(detail);
  if (timetableDerived > 0) {
    return Math.min(known, timetableDerived);
  }

  return Math.max(0, known - 1);
}

async function resolveFallbackEpisodeCount(detail: Awaited<ReturnType<typeof getAnimeDetails>>): Promise<number> {
  const known = toEpisodeCount(detail.episodes);
  if (known > 0) return await resolveKnownEpisodeCount(detail, known);

  const nextWeekDerived = await findLatestEpisodeCountFromNextWeekTimetable(detail);
  if (nextWeekDerived > 0) return nextWeekDerived;

  const timetableLatest = await findLatestEpisodeCountFromRecentTimetable(detail);
  if (timetableLatest > 0) return timetableLatest;

  const assumeFromReleaseDate = Boolean(await getStoredValue('assumeEpisodeCountFromReleaseDate', false));
  if (!assumeFromReleaseDate) return 0;

  return toEstimatedWeeklyEpisodeCount(detail.airingDate);
}

function buildFallbackEpisode(episodeNumber: number): AnimeEpisode {
  const padded = String(episodeNumber).padStart(2, '0');
  return {
    episodeNumber,
    title: `Episode ${padded}`,
    titleJapanese: `第${padded}話`,
    aired: 'TBA',
  };
}

function toFallbackPagination(totalEpisodes: number, page: number): AnimeEpisodePagination {
  const lastVisiblePage = Math.max(1, Math.ceil(totalEpisodes / FALLBACK_PAGE_SIZE));
  const safePage = Math.max(1, Math.min(page, lastVisiblePage));
  return {
    page: safePage,
    lastVisiblePage,
    hasNextPage: safePage < lastVisiblePage,
    hasPrevPage: safePage > 1,
  };
}

function buildFallbackEpisodesPage(totalEpisodes: number, page = 1): { episodes: AnimeEpisode[]; pagination: AnimeEpisodePagination } {
  const safeTotalEpisodes = toEpisodeCount(totalEpisodes);
  const pagination = toFallbackPagination(safeTotalEpisodes, page);
  const start = (pagination.page - 1) * FALLBACK_PAGE_SIZE;
  const endExclusive = Math.min(safeTotalEpisodes, start + FALLBACK_PAGE_SIZE);
  const episodes: AnimeEpisode[] = [];

  for (let offset = start; offset < endExclusive; offset += 1) {
    episodes.push(buildFallbackEpisode(offset + 1));
  }

  return {
    episodes,
    pagination,
  };
}

function mergeEpisodeLists(primary: AnimeEpisode[], fallback: AnimeEpisode[]): AnimeEpisode[] {
  const byEpisode = new Map<number, AnimeEpisode>();

  for (const item of fallback) {
    byEpisode.set(item.episodeNumber, item);
  }

  for (const item of primary) {
    const existing = byEpisode.get(item.episodeNumber);
    byEpisode.set(item.episodeNumber, {
      ...existing,
      ...item,
      episodeNumber: item.episodeNumber,
    });
  }

  return Array.from(byEpisode.values()).sort((a, b) => a.episodeNumber - b.episodeNumber);
}

function getMaxEpisodeNumber(episodes: AnimeEpisode[]) {
  let maxEpisode = 0;
  for (const episode of episodes) {
    const episodeNumber = toEpisodeCount(episode.episodeNumber);
    if (episodeNumber > maxEpisode) {
      maxEpisode = episodeNumber;
    }
  }
  return maxEpisode;
}

async function resolveCurrentEpisodeCount(
  detail: Awaited<ReturnType<typeof getAnimeDetails>>,
  fallbackEpisodeCount: number,
  jikanId?: number,
  jikanPayload?: Awaited<ReturnType<typeof getAnimeEpisodes>> | null,
) {
  const existingCurrent = toEpisodeCount(detail.currentEpisode);
  if (existingCurrent > 0) return existingCurrent;

  const safeJikanId = toEpisodeCount(jikanId);
  if (safeJikanId > 0) {
    const maxPagesFromPayload = Math.max(1, toEpisodeCount(jikanPayload?.pagination.lastVisiblePage));
    const maxPages = maxPagesFromPayload > 0 ? maxPagesFromPayload : 8;
    const allEpisodes = await getAnimeEpisodesAll(safeJikanId, maxPages).catch(() => [] as AnimeEpisode[]);
    const jikanTotal = getMaxEpisodeNumber(allEpisodes);
    if (jikanTotal > 0) return jikanTotal;
  }

  const payloadTotal = getMaxEpisodeNumber(jikanPayload?.data ?? []);
  if (payloadTotal > 0) return payloadTotal;

  if (fallbackEpisodeCount > 0) return fallbackEpisodeCount;
  return toEpisodeCount(detail.episodes);
}

async function toBundleFromDetail(
  detail: Awaited<ReturnType<typeof getAnimeDetails>>,
  jikanPayload: Awaited<ReturnType<typeof getAnimeEpisodes>> | null,
  safePage: number,
  jikanId?: number,
): Promise<AnimeDetailEpisodeBundle> {
  const fallbackEpisodeCount = await resolveFallbackEpisodeCount(detail);
  const fallback = buildFallbackEpisodesPage(fallbackEpisodeCount, safePage);
  const jikanEpisodes = jikanPayload?.data ?? [];
  const currentEpisode = await resolveCurrentEpisodeCount(detail, fallbackEpisodeCount, jikanId, jikanPayload);
  const detailWithEpisodeTotal = detail.episodes && detail.episodes > 0
    ? {
        ...detail,
        currentEpisode,
      }
    : {
        ...detail,
        episodes: detail.episodes,
        currentEpisode: fallbackEpisodeCount,
      };

  if (!jikanEpisodes.length) {
    return {
      detail: detailWithEpisodeTotal,
      episodes: fallback.episodes,
      hasEpisodeData: false,
      pagination: fallback.pagination,
    };
  }

  const episodes = mergeEpisodeLists(jikanEpisodes, fallback.episodes);
  const lastVisiblePage = Math.max(
    fallback.pagination.lastVisiblePage,
    jikanPayload?.pagination.lastVisiblePage ?? safePage,
  );
  const pagination: AnimeEpisodePagination = {
    page: safePage,
    lastVisiblePage,
    hasNextPage: safePage < lastVisiblePage || jikanPayload?.pagination.hasNextPage === true,
    hasPrevPage: safePage > 1,
  };

  return {
    detail: detailWithEpisodeTotal,
    episodes,
    hasEpisodeData: true,
    pagination,
  };
}

export async function getJikanDetailEpisodeBundle(jikanId: number, page = 1): Promise<AnimeDetailEpisodeBundle> {
  const safeJikanId = Math.floor(jikanId);
  const safePage = Math.max(1, Math.floor(page));
  const detail = await getJikanAnimeDetails(safeJikanId);
  const payload = await getAnimeEpisodes(safeJikanId, safePage).catch(() => null);
  return await toBundleFromDetail(detail, payload, safePage, safeJikanId);
}

export async function getAnimeDetailEpisodeBundle(id: string | number, page = 1): Promise<AnimeDetailEpisodeBundle> {
  const safePage = Math.max(1, Math.floor(page));
  const detail = await getAnimeDetails(id);
  const canonicalId = toJikanAnimeId(detail);
  const uniqueIds = canonicalId ? [canonicalId] : [];

  let effectivePayload: Awaited<ReturnType<typeof getAnimeEpisodes>> | null = null;
  let effectiveJikanId: number | undefined;
  for (const candidateId of uniqueIds) {
    const payload = await getAnimeEpisodes(candidateId, safePage).catch(() => null);
    if (!payload) continue;

    effectivePayload = payload;
    effectiveJikanId = candidateId;
    if (payload.data.length > 0) break;
  }

  return await toBundleFromDetail(detail, effectivePayload, safePage, effectiveJikanId ?? canonicalId);
}
