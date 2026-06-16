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
  const jikanAnimeId = toJikanAnimeId(detail);

  const listPayload = await getAnimeEpisodes(jikanAnimeId ?? id, safePage).catch(() => null);
  const retriedPayload =
    !listPayload && jikanAnimeId && String(jikanAnimeId) !== String(id)
      ? await getAnimeEpisodes(jikanAnimeId, safePage).catch(() => null)
      : null;
  const effectivePayload = listPayload ?? retriedPayload;
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
