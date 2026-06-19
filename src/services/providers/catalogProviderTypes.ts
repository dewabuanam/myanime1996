import type { AnimeDetail, AnimeSummary } from '../../types/anime';

export type CacheFetchOptions<T> = {
  onUpdate?: (value: T) => void;
  forceRefresh?: boolean;
  upcomingSeasonFilter?: 'all' | 'tv' | 'movie' | 'ova' | 'special' | 'ona' | 'music';
  upcomingRating?: 'g' | 'pg' | 'pg13' | 'r17' | 'r' | 'rx';
  topAnimeType?: 'TV' | 'OVA' | 'Movie' | 'Special' | 'ONA' | 'Music' | 'CM' | 'PV' | 'TV Special';
  topAnimeRating?: 'g' | 'pg' | 'pg13' | 'r17' | 'r' | 'rx';
  seasonYear?: number;
  season?: 'winter' | 'spring' | 'summer' | 'fall';
  seasonFilter?: 'all' | 'tv' | 'movie' | 'ova' | 'special' | 'ona' | 'music';
  seasonContinuing?: boolean;
  seasonPageLimit?: number;
  seasonPageCount?: number;
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
