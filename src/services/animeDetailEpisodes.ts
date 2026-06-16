import { getAnimeDetails } from './catalogSource';
import { getAnimeEpisodes } from './jikan';
import type { AnimeDetailEpisodeBundle, AnimeEpisode, AnimeEpisodePagination } from '../types/anime';

const MAX_FALLBACK_EPISODES = 200;
const FALLBACK_PAGE_SIZE = 25;
const MAX_REASONABLE_MAL_ID = 2_000_000;

function toJikanAnimeId(detail: { id: number; jikanId?: number }) {
  const candidates = [detail.jikanId, detail.id];
  for (const candidate of candidates) {
    if (!Number.isFinite(candidate) || !candidate || candidate <= 0) continue;
    if (candidate > MAX_REASONABLE_MAL_ID) continue;
    return Math.floor(candidate);
  }
  return undefined;
}

function toEpisodeCountLimit(value?: number) {
  if (!Number.isFinite(value) || !value || value <= 0) return 0;
  return Math.max(0, Math.min(MAX_FALLBACK_EPISODES, Math.floor(value)));
}

function buildFallbackEpisodes(totalEpisodes?: number): AnimeEpisode[] {
  const count = toEpisodeCountLimit(totalEpisodes);
  return Array.from({ length: count }, (_, index) => {
    const episodeNumber = index + 1;
    return {
      episodeNumber,
      title: `Episode ${String(episodeNumber).padStart(2, '0')}`,
    };
  });
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

function buildFallbackEpisodesPage(totalEpisodes?: number, page = 1): { episodes: AnimeEpisode[]; pagination: AnimeEpisodePagination } {
  const all = buildFallbackEpisodes(totalEpisodes);
  const pagination = toFallbackPagination(all.length, page);
  const start = (pagination.page - 1) * FALLBACK_PAGE_SIZE;
  return {
    episodes: all.slice(start, start + FALLBACK_PAGE_SIZE),
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

export async function getAnimeDetailEpisodeBundle(id: string | number, page = 1): Promise<AnimeDetailEpisodeBundle> {
  const safePage = Math.max(1, Math.floor(page));
  const detail = await getAnimeDetails(id);
  const requestedId = typeof id === 'number' ? id : Number(id);
  const fallbackIds = [toJikanAnimeId(detail), detail.id, Number.isFinite(requestedId) ? requestedId : undefined]
    .filter(
      (candidate): candidate is number =>
        typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0 && candidate <= MAX_REASONABLE_MAL_ID,
    )
    .map((candidate) => Math.floor(candidate));
  const uniqueIds = Array.from(new Set(fallbackIds));

  let effectivePayload: Awaited<ReturnType<typeof getAnimeEpisodes>> | null = null;
  for (const candidateId of uniqueIds) {
    const payload = await getAnimeEpisodes(candidateId, safePage).catch(() => null);
    if (!payload) continue;

    effectivePayload = payload;
    if (payload.data.length > 0) break;
  }

  const jikanEpisodes = effectivePayload?.data ?? [];

  if (!jikanEpisodes.length) {
    const fallback = buildFallbackEpisodesPage(detail.episodes, safePage);
    return {
      detail,
      episodes: fallback.episodes,
      hasEpisodeData: false,
      pagination: fallback.pagination,
    };
  }

  const fallback = buildFallbackEpisodesPage(detail.episodes, safePage);
  const episodes = mergeEpisodeLists(jikanEpisodes, fallback.episodes);
  const pagination: AnimeEpisodePagination = {
    page: safePage,
    lastVisiblePage: Math.max(safePage, effectivePayload?.pagination.lastVisiblePage ?? safePage),
    hasNextPage: effectivePayload?.pagination.hasNextPage === true,
    hasPrevPage: safePage > 1,
  };

  return {
    detail,
    episodes,
    hasEpisodeData: true,
    pagination,
  };
}
