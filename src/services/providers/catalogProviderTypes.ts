import type { AnimeDetail, AnimeSummary } from '../../types/anime';

export type CacheFetchOptions<T> = {
  onUpdate?: (value: T) => void;
  forceRefresh?: boolean;
};

export type HomeRefreshCallbacks = {
  onSeasonal?: (value: AnimeSummary[]) => void;
  onPopular?: (value: AnimeSummary[]) => void;
  onLatestUpdated?: (value: AnimeSummary[]) => void;
  onUpcomingUpdated?: (value: AnimeSummary[]) => void;
  onLatestPromo?: (value: AnimeSummary[]) => void;
  onTopAiring?: (value: AnimeSummary[]) => void;
  onTopUpcoming?: (value: AnimeSummary[]) => void;
};

export interface CatalogProvider {
  getTopAnime(limit?: number, options?: CacheFetchOptions<AnimeSummary[]>): Promise<AnimeSummary[]>;
  getSeasonalAnime(limit?: number, options?: CacheFetchOptions<AnimeSummary[]>): Promise<AnimeSummary[]>;
  getLatestUpdatedAnime(limit?: number, options?: CacheFetchOptions<AnimeSummary[]>): Promise<AnimeSummary[]>;
  getUpcomingUpdatedAnime(limit?: number, options?: CacheFetchOptions<AnimeSummary[]>): Promise<AnimeSummary[]>;
  getLatestPromoAnime(limit?: number, options?: CacheFetchOptions<AnimeSummary[]>): Promise<AnimeSummary[]>;
  getTopAiringAnime(limit?: number, options?: CacheFetchOptions<AnimeSummary[]>): Promise<AnimeSummary[]>;
  getTopUpcomingAnime(limit?: number, options?: CacheFetchOptions<AnimeSummary[]>): Promise<AnimeSummary[]>;
  searchAnime(query: string): Promise<AnimeSummary[]>;
  getAnimeDetails(id: string | number): Promise<AnimeDetail>;
  refreshHomeShelvesIfNeeded(limit?: number, callbacks?: HomeRefreshCallbacks): Promise<void>;
}
