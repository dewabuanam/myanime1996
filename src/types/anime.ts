export type SessionMode = 'guest' | 'email';
export type TitleLanguage = 'japanese' | 'english';
export type RightPanelView = 'now-playing' | 'detail' | 'playlist' | 'plugins';
export type PlayableKind = 'episode' | 'movie' | 'ova' | 'ona' | 'special' | 'trailer';
export type PlayableSourceKind = 'anime-card' | 'episode-card' | 'trailer-card';
export type LibraryStatus = 'plan-to-watch' | 'watching' | 'on-hold' | 'dropped' | 'completed';
export type PlaylistType = 'anime' | 'video';
export type PlaylistConvertStrategy = 'to-anime' | 'to-video' | 'clear-all';

export interface PlaylistAnimeEntry {
  animeId: number;
  tenraiId?: number;
  animeScheduleRoute?: string;
  title: string;
  titleEnglish?: string;
  titleJapanese?: string;
  image: string;
  mediaType?: string;
  currentEpisode?: number;
}

export interface AnimeTaxonomyItem {
  id: number;
  name: string;
}

export interface UserSession {
  mode: SessionMode;
  id: string;
  email?: string;
  createdAt: string;
}

export interface AnimeSummary {
  // Source-local id. Use tenraiId as canonical cross-source identity when present.
  id: number;
  // Canonical MAL id used for detail, episodes, and cross-source resolution.
  tenraiId?: number;
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
  genreItems?: AnimeTaxonomyItem[];
  explicitGenreItems?: AnimeTaxonomyItem[];
  themeItems?: AnimeTaxonomyItem[];
  demographicItems?: AnimeTaxonomyItem[];
  producerItems?: AnimeTaxonomyItem[];
  relations?: AnimeRelationGroup[];
}

/** One related title as the catalogue reports it (Sequel, Prequel, Side Story, ...). */
export interface AnimeRelationEntry {
  id: number;
  name: string;
  type: string;
}

export interface AnimeRelationGroup {
  relation: string;
  entries: AnimeRelationEntry[];
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
  description: string;
  image: string;
  type: PlaylistType;
  animeIds: number[];
  animeItems: PlaylistAnimeEntry[];
  videoItems: PlayableItem[];
  createdAt: string;
  updatedAt: string;
}

export interface WatchProgress {
  animeId: number;
  tenraiId?: number;
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

export interface LibraryAnimeItem {
  animeId: number;
  tenraiId?: number;
  animeScheduleRoute?: string;
  title: string;
  titleEnglish?: string;
  titleJapanese?: string;
  image: string;
  mediaType?: string;
  year?: number;
  episodes?: number;
  currentEpisode?: number;
  status: LibraryStatus;
  /**
   * Airing status as the catalogue reports it ("Finished Airing", "Currently Airing",
   * "Not yet aired"). Kept separate from `status`, which is where the user filed the
   * title in their own library.
   */
  airingStatus?: string;
  /**
   * Which round of catalogue metadata this item was last filled in from. Bumping
   * LIBRARY_ITEM_METADATA_VERSION re-runs the backfill once over the whole library,
   * which is how items saved with stale fields get corrected in place.
   */
  metadataVersion?: number;
  addedAt: string;
  updatedAt: string;
}

export type LibraryStatusNotificationSettings = Record<LibraryStatus, boolean>;

export interface LibraryNotificationFeedItem {
  id: string;
  animeId: number;
  episode: number;
  title: string;
  image?: string;
  message: string;
  createdAt: string;
  channel: 'in-app' | 'os';
  read: boolean;
}

export interface CachedPayload<T> {
  value: T;
  expiresAt: number;
  savedAt: number;
}

export interface RecentSearchEntry {
  query: string;
  updatedAt: string;
}

export interface SearchGenreCacheEntry {
  malId: number;
  name: string;
  count: number;
}

export interface SearchProducerCacheEntry {
  malId: number;
  title: string;
  favorites?: number;
  count?: number;
}

/** One entry from an /pictures endpoint. Anime, character, and person all share it. */
export interface MediaPicture {
  imageUrl: string;
  largeImageUrl?: string;
  smallImageUrl?: string;
}

export interface VoiceActorRef {
  personId: number;
  name: string;
  image?: string;
  language: string;
}

export interface AnimeCharacterEntry {
  characterId: number;
  name: string;
  image?: string;
  role?: string;
  favorites?: number;
  voiceActors: VoiceActorRef[];
}

export interface AnimeStaffEntry {
  personId: number;
  name: string;
  image?: string;
  positions: string[];
}

export interface CharacterDetail {
  id: number;
  name: string;
  nameKanji?: string;
  nicknames: string[];
  favorites?: number;
  about?: string;
  image?: string;
  /** Who voices this character, one entry per dub language. */
  voiceActors: VoiceActorRef[];
}

/** One role a person voiced, as listed on their own page. */
export interface VoiceActingRole {
  role?: string;
  animeId: number;
  animeTitle: string;
  animeImage?: string;
  characterId: number;
  characterName: string;
  characterImage?: string;
}

export interface PersonDetail {
  id: number;
  name: string;
  givenName?: string;
  familyName?: string;
  alternateNames: string[];
  birthday?: string;
  favorites?: number;
  about?: string;
  image?: string;
  websiteUrl?: string;
  voiceActingRoles: VoiceActingRole[];
}
