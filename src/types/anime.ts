export type SessionMode = 'guest' | 'email';
export type TitleLanguage = 'japanese' | 'english';
export type RightPanelView = 'now-playing' | 'detail' | 'plugins';
export type PlayableKind = 'episode' | 'movie' | 'ova' | 'ona' | 'special' | 'trailer';
export type PlayableSourceKind = 'anime-card' | 'episode-card' | 'trailer-card';

export interface UserSession {
  mode: SessionMode;
  id: string;
  email?: string;
  createdAt: string;
}

export interface AnimeSummary {
  // Source-local id. Use jikanId as canonical cross-source identity when present.
  id: number;
  // Canonical MAL id used for detail, episodes, and cross-source resolution.
  jikanId?: number;
  title: string;
  titleEnglish?: string;
  titleJapanese?: string;
  titleSynonyms?: string[];
  duration?: string;
  durationMinutes?: number;
  image: string;
  banner?: string;
  synopsis: string;
  score?: number;
  rank?: number;
  popularity?: number;
  members?: number;
  year?: number;
  season?: 'winter' | 'spring' | 'summer' | 'fall';
  seasonYear?: number;
  airingDate?: string;
  currentEpisode?: number;
  episodes?: number;
  status?: string;
  studios: string[];
  genres: string[];
  trailerUrl?: string;
  mediaType?: string;
  animeScheduleRoute?: string;
}

export interface PlayableItem {
  id: string;
  anime: AnimeSummary;
  kind: PlayableKind;
  sourceKind: PlayableSourceKind;
  title: string;
  titleJapanese?: string;
  durationMinutes?: number;
  episodeNumber?: number;
  typeLabel: string;
  createdAt: string;
}

export interface AnimeDetail extends AnimeSummary {
  rating?: string;
  duration?: string;
  source?: string;
  rank?: number;
  popularity?: number;
  aired?: string;
}

export interface AnimeEpisode {
  episodeNumber: number;
  malId?: number;
  url?: string;
  title?: string;
  titleJapanese?: string;
  titleRomanji?: string;
  aired?: string;
  score?: number | null;
  filler?: boolean;
  recap?: boolean;
  forumUrl?: string;
  durationMinutes?: number;
  synopsis?: string;
}

export interface AnimeEpisodePagination {
  page: number;
  lastVisiblePage: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface AnimeDetailEpisodeBundle {
  detail: AnimeDetail;
  episodes: AnimeEpisode[];
  hasEpisodeData: boolean;
  pagination: AnimeEpisodePagination;
}

export interface Playlist {
  id: string;
  name: string;
  animeIds: number[];
  createdAt: string;
}

export interface WatchProgress {
  animeId: number;
  jikanId?: number;
  animeScheduleRoute?: string;
  title: string;
  titleEnglish?: string;
  titleJapanese?: string;
  image: string;
  progress: number;
  episode: number;
  totalEpisodes?: number;
  lastPlaybackSeconds?: number;
  episodeDurationSeconds?: number;
  completed?: boolean;
  updatedAt: string;
}

export interface CachedPayload<T> {
  value: T;
  expiresAt: number;
  savedAt: number;
}
