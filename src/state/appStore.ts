import { create } from 'zustand';
import type { AnimeSummary, PlayableItem, PlayableKind, Playlist, RightPanelView, TitleLanguage, UserSession, WatchProgress } from '../types/anime';
import type { ImportedSourcePluginDefinition, SourceAudioLanguage } from '../types/plugin';
import type { BaseCatalogSource } from '../services/catalogSource';
import { DEFAULT_BASE_CATALOG_SOURCE, getAnimeTrailerUrl } from '../services/catalogSource';
import { clearAnimeScheduleDataCache, DEFAULT_ANIMESCHEDULE_TOKEN } from '../services/animeSchedule';
import { clearJikanDataCache } from '../services/jikan';
import { getStoredValue, removeStoredValue, setStoredValue } from '../services/store';
import { importSourcePluginFromPicker } from '../services/pluginImport';
import { getAvailableSourcePlugins, getDefaultPluginPriority } from '../services/sourceResolver';
import { clearSourceResolveCache } from '../services/sourceCache';
import { clearAniSkipDataCache } from '../services/aniSkip';
import { clearPluginResolverCaches } from '../services/pluginExecutor';

const WATCH_HISTORY_PROFILE_KEY = 'watchHistoryByProfile';
const WATCH_PROGRESS_PROFILE_KEY = 'watchProgressByProfile';
const LEGACY_PLAYBACK_MIGRATED_KEY = 'legacyPlaybackMigrated';
const WATCH_COMPLETE_THRESHOLD_PERCENT = 90;

export type PlaybackSupportMode = 'fully-supported' | 'fullscreen-only' | 'fully-unsupported';
export type AnimeSkipType = 'op' | 'ed' | 'recap';

export type AnimeSkipButtonSegment = {
  type: AnimeSkipType;
  startTime: number;
  endTime: number;
  skipId: string;
};

function hashString(input: string) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function createProfileIdFromEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  return `local-${hashString(normalized)}`;
}

interface AppState {
  hydrated: boolean;
  session: UserSession | null;
  isSidebarCompact: boolean;
  isRightPanelHidden: boolean;
  isRightPanelFullpage: boolean;
  rightPanelView: RightPanelView;
  rightPanelWidth: number;
  titleLanguage: TitleLanguage;
  isTrailerMuted: boolean;
  isProfilePopupOpen: boolean;
  isSettingsOpen: boolean;
  selectedAnime: AnimeSummary | null;
  currentlyPlayingItem: PlayableItem | null;
  queue: PlayableItem[];
  queueCursor: number;
  playlists: Playlist[];
  watchHistory: WatchProgress[];
  favorites: number[];
  watchProgress: Record<number, WatchProgress>;
  homeRefreshVersion: number;
  isPlaying: boolean;
  playbackTime: number;
  playbackDuration: number;
  trailerVolume: number;
  activePlaybackUrl: string | null;
  shuffleEnabled: boolean;
  repeatMode: 'off' | 'one';
  importedSourcePlugins: ImportedSourcePluginDefinition[];
  pluginPriority: string[];
  pluginEnabled: Record<string, boolean>;
  preferredSourcePluginId: string | null;
  preferredAudioLanguage: SourceAudioLanguage;
  autoSkipOpening: boolean;
  autoSkipEnding: boolean;
  autoSkipRecap: boolean;
  animeSkipButtonSegment: AnimeSkipButtonSegment | null;
  baseCatalogSource: BaseCatalogSource;
  animeScheduleApiToken: string;
  playbackSupportMode: PlaybackSupportMode;
  isResolvingPlaybackSource: boolean;
  selectedSourceOptionId: string | null;
  pendingSeekTo: number | null;
  isTrailerPlayerReady: boolean;
  episodeMetadata: { title?: string; titleJapanese?: string; titleRomanji?: string; episodeNumber: number } | null;
  initialize: () => Promise<void>;
  continueAsGuest: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  selectAnime: (anime: AnimeSummary) => Promise<void>;
  playAnimeSeries: (anime: AnimeSummary) => Promise<void>;
  playEpisode: (anime: AnimeSummary, episodeNumber: number) => Promise<void>;
  playTrailer: (anime: AnimeSummary) => Promise<void>;
  addAnimeSeriesToQueue: (anime: AnimeSummary) => Promise<void>;
  addEpisodeToQueue: (anime: AnimeSummary, episodeNumber: number) => Promise<void>;
  addTrailerToQueue: (anime: AnimeSummary) => Promise<void>;
  replaceQueueAndPlay: (items: PlayableItem[], startIndex: number) => Promise<void>;
  startPlayingAnime: (anime: AnimeSummary) => Promise<void>;
  addToQueue: (anime: AnimeSummary) => Promise<void>;
  removeFromQueue: (queueItemId: string) => Promise<void>;
  clearQueue: () => Promise<void>;
  playFromQueue: (queueItemId: string) => Promise<void>;
  playNextInQueue: (fromEnded?: boolean) => Promise<void>;
  playPreviousInQueue: () => Promise<void>;
  updateWatchProgress: (
    anime: AnimeSummary,
    progress?: number,
    episodeNumber?: number,
    details?: { elapsedSeconds?: number; durationSeconds?: number },
  ) => Promise<void>;
  toggleFavorite: (animeId: number) => Promise<void>;
  setPlaying: (playing: boolean) => void;
  setPlaybackTime: (seconds: number) => void;
  setPlaybackDuration: (seconds: number) => void;
  setTrailerVolume: (volume: number) => void;
  setActivePlaybackUrl: (url: string | null) => void;
  toggleShuffle: () => Promise<void>;
  cycleRepeatMode: () => Promise<void>;
  importSourcePluginFromFile: () => Promise<void>;
  removeSourcePlugin: (pluginId: string) => Promise<void>;
  setPluginPriority: (priority: string[]) => Promise<void>;
  setPluginEnabled: (pluginId: string, enabled: boolean) => Promise<void>;
  setPreferredSourcePluginId: (pluginId: string | null) => Promise<void>;
  setPreferredAudioLanguage: (language: SourceAudioLanguage) => Promise<void>;
  setAutoSkipOpening: (enabled: boolean) => Promise<void>;
  setAutoSkipEnding: (enabled: boolean) => Promise<void>;
  setAutoSkipRecap: (enabled: boolean) => Promise<void>;
  setAnimeSkipButtonSegment: (segment: AnimeSkipButtonSegment | null) => void;
  setBaseCatalogSource: (source: BaseCatalogSource) => Promise<void>;
  setAnimeScheduleApiToken: (token: string) => Promise<void>;
  setPlaybackSupportMode: (mode: PlaybackSupportMode) => void;
  setResolvingPlaybackSource: (resolving: boolean) => void;
  setSelectedSourceOptionId: (optionId: string | null) => void;
  requestSeekTo: (seconds: number) => void;
  clearPendingSeekTo: () => void;
  setTrailerPlayerReady: (ready: boolean) => void;
  setEpisodeMetadata: (meta: { title?: string; titleJapanese?: string; titleRomanji?: string; episodeNumber: number } | null) => void;
  setCurrentlyPlayingTypeLabel: (typeLabel: string) => void;
  resetPlaybackTransport: () => void;
  toggleSidebarCompact: () => Promise<void>;
  toggleRightPanelHidden: () => Promise<void>;
  setRightPanelHidden: (hidden: boolean) => Promise<void>;
  setRightPanelFullpage: (fullpage: boolean) => Promise<void>;
  toggleRightPanelFullpage: () => Promise<void>;
  setRightPanelView: (view: RightPanelView) => Promise<void>;
  openRightPanelWithView: (view: RightPanelView) => Promise<void>;
  setRightPanelWidth: (width: number) => Promise<void>;
  toggleTitleLanguage: () => Promise<void>;
  setTrailerMuted: (muted: boolean) => Promise<void>;
  setProfilePopupOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  removeHistoryItem: (animeId: number) => Promise<void>;
  clearHistory: () => Promise<void>;
  clearJikanCache: () => Promise<void>;
  exportUserData: () => Promise<Record<string, unknown>>;
  factoryReset: () => Promise<void>;
}

const createId = (prefix: string) => `${prefix}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;

function normalizeTitleLanguage(value: unknown): TitleLanguage {
  if (value === 'english') return 'english';
  return 'japanese';
}

function normalizeRightPanelView(value: unknown): RightPanelView {
  if (value === 'detail') return 'detail';
  if (value === 'plugins') return 'plugins';
  return 'now-playing';
}

function normalizeRepeatMode(value: unknown): 'off' | 'one' {
  if (value === 'one') return value;
  return 'off';
}

function normalizeSourceAudioLanguage(value: unknown): SourceAudioLanguage {
  return value === 'dub' ? 'dub' : 'sub';
}

function normalizeBaseCatalogSource(value: unknown): BaseCatalogSource {
  return value === 'jikan' ? 'jikan' : DEFAULT_BASE_CATALOG_SOURCE;
}

function normalizeAnimeScheduleApiToken(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_ANIMESCHEDULE_TOKEN;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_ANIMESCHEDULE_TOKEN;
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePluginPriority(value: unknown, defaults: string[]) {
  if (!Array.isArray(value)) return defaults;
  const defaultSet = new Set(defaults);
  const unique = value.filter(
    (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0 && defaultSet.has(entry),
  );
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const entry of unique) {
    if (seen.has(entry)) continue;
    seen.add(entry);
    ordered.push(entry);
  }
  for (const id of defaults) {
    if (!seen.has(id)) {
      ordered.push(id);
    }
  }
  return ordered;
}

function normalizePluginEnabled(value: unknown, defaults: Record<string, boolean>) {
  if (!value || typeof value !== 'object') return defaults;
  const merged: Record<string, boolean> = { ...defaults };
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === 'boolean' && key in defaults) {
      merged[key] = raw;
    }
  }
  return merged;
}

function normalizeStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const cleaned = value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  const unique = Array.from(new Set(cleaned));
  return unique.length > 0 ? unique : undefined;
}

function normalizeImportedSourcePlugins(value: unknown): ImportedSourcePluginDefinition[] {
  if (!Array.isArray(value)) return [];
  const normalized: ImportedSourcePluginDefinition[] = [];
  const seen = new Set<string>();

  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const plugin = entry as Partial<ImportedSourcePluginDefinition>;
    if (!plugin.id || typeof plugin.id !== 'string') continue;
    if (plugin.id === 'reanime-source') continue;
    if (!plugin.name || typeof plugin.name !== 'string') continue;
    if (!plugin.version || typeof plugin.version !== 'string') continue;
    if (plugin.compatibilityApiVersion !== '1.0') continue;
    if (!plugin.resolver || typeof plugin.resolver !== 'object') continue;

    const resolver = plugin.resolver as Partial<ImportedSourcePluginDefinition['resolver']>;
    if (resolver.kind !== 'inline-js') continue;
    if (!resolver.code || typeof resolver.code !== 'string' || resolver.code.trim().length === 0) continue;
    if (resolver.timeoutMs !== undefined && (typeof resolver.timeoutMs !== 'number' || resolver.timeoutMs < 500 || resolver.timeoutMs > 25000)) continue;
    if (seen.has(plugin.id)) continue;

    const hostRequirements =
      plugin.hostRequirements && typeof plugin.hostRequirements === 'object'
        ? {
            connectSrcOrigins: normalizeStringList(plugin.hostRequirements.connectSrcOrigins),
            frameSrcOrigins: normalizeStringList(plugin.hostRequirements.frameSrcOrigins),
            httpAllowlist: normalizeStringList(plugin.hostRequirements.httpAllowlist),
          }
        : undefined;

    const normalizedHostRequirements =
      hostRequirements &&
      (hostRequirements.connectSrcOrigins || hostRequirements.frameSrcOrigins || hostRequirements.httpAllowlist)
        ? hostRequirements
        : undefined;

    seen.add(plugin.id);
    normalized.push({
      id: plugin.id,
      name: plugin.name,
      version: plugin.version,
      compatibilityApiVersion: '1.0',
      hostRequirements: normalizedHostRequirements,
      resolver: {
        kind: 'inline-js',
        code: resolver.code,
        timeoutMs: resolver.timeoutMs,
      },
      iconPng:
        plugin.iconPng && plugin.iconPng.mimeType === 'image/png' && typeof plugin.iconPng.dataBase64 === 'string'
          ? {
              mimeType: 'image/png',
              dataBase64: plugin.iconPng.dataBase64,
              width: plugin.iconPng.width,
              height: plugin.iconPng.height,
            }
          : undefined,
    });
  }

  return normalized;
}

function makeDefaultPluginEnabled(importedPlugins: ImportedSourcePluginDefinition[]) {
  return getAvailableSourcePlugins(importedPlugins).reduce<Record<string, boolean>>((map, plugin) => {
    map[plugin.id] = true;
    return map;
  }, {});
}

const mediaKindLabelMap: Record<PlayableKind, string> = {
  episode: 'Episode',
  movie: 'Movie',
  ova: 'OVA',
  ona: 'ONA',
  special: 'Special',
  trailer: 'Trailer',
};

function inferMediaKindFromAnime(anime: AnimeSummary): Exclude<PlayableKind, 'trailer'> {
  const raw = anime.mediaType?.trim().toLowerCase() ?? '';
  if (raw === 'movie') return 'movie';
  if (raw === 'ova') return 'ova';
  if (raw === 'ona') return 'ona';
  if (raw === 'special') return 'special';
  return 'episode';
}

function createPlayableItemId(animeId: number, kind: PlayableKind, marker: string) {
  const nonce = crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${animeId}:${kind}:${marker}:${nonce}`;
}

function getCanonicalAnimeId(anime: Pick<AnimeSummary, 'id' | 'jikanId'>) {
  const preferred = Number(anime.jikanId);
  if (Number.isFinite(preferred) && preferred > 0) {
    return Math.floor(preferred);
  }
  return Math.max(1, Math.floor(Number(anime.id) || 1));
}

function makeEpisodeItem(anime: AnimeSummary, episodeNumber: number, sourceKind: PlayableItem['sourceKind']): PlayableItem {
  const canonicalAnimeId = getCanonicalAnimeId(anime);
  return {
    id: createPlayableItemId(canonicalAnimeId, 'episode', `ep-${episodeNumber}`),
    anime,
    kind: 'episode',
    sourceKind,
    title: anime.title,
    titleJapanese: anime.titleJapanese,
    durationMinutes: anime.durationMinutes,
    episodeNumber,
    typeLabel: `Episode ${episodeNumber}`,
    createdAt: new Date().toISOString(),
  };
}

function makeTrailerItem(anime: AnimeSummary): PlayableItem {
  const canonicalAnimeId = getCanonicalAnimeId(anime);
  return {
    id: createPlayableItemId(canonicalAnimeId, 'trailer', 'trailer'),
    anime,
    kind: 'trailer',
    sourceKind: 'trailer-card',
    title: anime.title,
    titleJapanese: anime.titleJapanese,
    durationMinutes: anime.durationMinutes,
    typeLabel: 'Trailer',
    createdAt: new Date().toISOString(),
  };
}

function makeSingleMediaItem(anime: AnimeSummary, kind: Exclude<PlayableKind, 'episode' | 'trailer'>): PlayableItem {
  const canonicalAnimeId = getCanonicalAnimeId(anime);
  return {
    id: createPlayableItemId(canonicalAnimeId, kind, 'single'),
    anime,
    kind,
    sourceKind: 'anime-card',
    title: anime.title,
    titleJapanese: anime.titleJapanese,
    durationMinutes: anime.durationMinutes,
    typeLabel: mediaKindLabelMap[kind],
    createdAt: new Date().toISOString(),
  };
}

function buildSeriesPlayableItems(anime: AnimeSummary): PlayableItem[] {
  const inferredKind = inferMediaKindFromAnime(anime);
  if (inferredKind !== 'episode') {
    return [makeSingleMediaItem(anime, inferredKind)];
  }

  const totalEpisodes = Math.max(1, anime.episodes ?? 1);
  return Array.from({ length: totalEpisodes }, (_, index) => makeEpisodeItem(anime, index + 1, 'anime-card'));
}

function sortHistory(history: WatchProgress[]) {
  return [...history].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

function toSafeNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeWatchProgressEntry(entry: WatchProgress) {
  const animeId = Math.max(1, Math.round(toSafeNumber(entry.animeId)));
  const jikanIdRaw = Math.round(toSafeNumber(entry.jikanId));
  const jikanId = jikanIdRaw > 0 ? jikanIdRaw : undefined;
  const animeScheduleRoute = typeof entry.animeScheduleRoute === 'string' && entry.animeScheduleRoute.trim().length > 0
    ? entry.animeScheduleRoute.trim()
    : undefined;
  const episode = Math.max(1, Math.round(toSafeNumber(entry.episode || 1)));
  const totalEpisodesRaw = Math.round(toSafeNumber(entry.totalEpisodes));
  const totalEpisodes = totalEpisodesRaw > 0 ? totalEpisodesRaw : undefined;
  const episodeDurationRaw = toSafeNumber(entry.episodeDurationSeconds);
  const episodeDurationSeconds = episodeDurationRaw > 0 ? Math.round(episodeDurationRaw) : undefined;
  const elapsedRaw = toSafeNumber(entry.lastPlaybackSeconds);
  const boundedElapsed = Math.max(0, episodeDurationSeconds ? Math.min(elapsedRaw, episodeDurationSeconds) : elapsedRaw);
  const lastPlaybackSeconds = Math.floor(boundedElapsed);
  const derivedFromTime =
    episodeDurationSeconds && episodeDurationSeconds > 0
      ? (lastPlaybackSeconds / episodeDurationSeconds) * 100
      : 0;
  const suppliedProgress = Math.max(0, Math.min(100, toSafeNumber(entry.progress)));
  const mergedProgress = Math.max(suppliedProgress, derivedFromTime);
  const completed = mergedProgress >= WATCH_COMPLETE_THRESHOLD_PERCENT;
  const progress = completed ? 100 : mergedProgress > 0 ? Math.max(1, Math.min(98, mergedProgress)) : 0;

  return {
    animeId,
    jikanId,
    animeScheduleRoute,
    title: String(entry.title || '').trim(),
    titleEnglish: entry.titleEnglish,
    titleJapanese: entry.titleJapanese,
    image: entry.image,
    progress,
    episode,
    totalEpisodes,
    lastPlaybackSeconds,
    episodeDurationSeconds,
    completed,
    updatedAt: entry.updatedAt,
  } as WatchProgress;
}

function normalizeWatchHistoryEntries(entries: WatchProgress[]) {
  return sortHistory(entries.map((entry) => normalizeWatchProgressEntry(entry)));
}

function normalizeWatchProgressMap(map: Record<number, WatchProgress>) {
  const normalized: Record<number, WatchProgress> = {};
  for (const entry of Object.values(map)) {
    const clean = normalizeWatchProgressEntry(entry);
    normalized[clean.animeId] = clean;
  }
  return normalized;
}

function looksLikeAnimeSummary(value: unknown): value is AnimeSummary {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AnimeSummary>;
  return typeof candidate.id === 'number' && typeof candidate.title === 'string' && typeof candidate.image === 'string';
}

function normalizePlayableItemFromUnknown(value: unknown): PlayableItem | null {
  if (!value || typeof value !== 'object') return null;

  const maybeItem = value as Partial<PlayableItem>;
  if (maybeItem.anime && looksLikeAnimeSummary(maybeItem.anime) && typeof maybeItem.id === 'string' && typeof maybeItem.kind === 'string') {
    return {
      id: maybeItem.id,
      anime: maybeItem.anime,
      kind: maybeItem.kind as PlayableKind,
      sourceKind: maybeItem.sourceKind ?? 'anime-card',
      title: maybeItem.title ?? maybeItem.anime.title,
      titleJapanese: maybeItem.titleJapanese ?? maybeItem.anime.titleJapanese,
      durationMinutes: maybeItem.durationMinutes ?? maybeItem.anime.durationMinutes,
      episodeNumber: maybeItem.episodeNumber,
      typeLabel: maybeItem.typeLabel ?? mediaKindLabelMap[maybeItem.kind as PlayableKind] ?? 'Episode',
      createdAt: maybeItem.createdAt ?? new Date().toISOString(),
    };
  }

  if (looksLikeAnimeSummary(value)) {
    return buildSeriesPlayableItems(value)[0] ?? null;
  }

  return null;
}

async function readProfilePlayback(session: UserSession | null) {
  if (!session) return { watchHistory: [], watchProgress: {} as Record<number, WatchProgress> };

  const [watchHistoryByProfile, watchProgressByProfile, legacyHistory, legacyProgress, legacyPlaybackMigrated] = await Promise.all([
    getStoredValue(WATCH_HISTORY_PROFILE_KEY, {} as Record<string, WatchProgress[]>),
    getStoredValue(WATCH_PROGRESS_PROFILE_KEY, {} as Record<string, Record<number, WatchProgress>>),
    getStoredValue('watchHistory', []),
    getStoredValue('watchProgress', {}),
    getStoredValue(LEGACY_PLAYBACK_MIGRATED_KEY, false),
  ]);

  const profileKey = session.id;
  const profileHistory = watchHistoryByProfile[profileKey];
  const profileProgress = watchProgressByProfile[profileKey];

  const hasLegacyPlaybackData = legacyHistory.length > 0 || Object.keys(legacyProgress).length > 0;
  const hasAnyProfilePlaybackData =
    Object.keys(watchHistoryByProfile).length > 0 || Object.keys(watchProgressByProfile).length > 0;

  if (!legacyPlaybackMigrated && !hasAnyProfilePlaybackData && !profileHistory && !profileProgress && hasLegacyPlaybackData) {
    const normalizedLegacyHistory = normalizeWatchHistoryEntries(legacyHistory);
    const normalizedLegacyProgress = normalizeWatchProgressMap(legacyProgress);
    const nextHistoryByProfile = { ...watchHistoryByProfile, [profileKey]: normalizedLegacyHistory };
    const nextProgressByProfile = { ...watchProgressByProfile, [profileKey]: normalizedLegacyProgress };
    await Promise.all([
      setStoredValue(WATCH_HISTORY_PROFILE_KEY, nextHistoryByProfile),
      setStoredValue(WATCH_PROGRESS_PROFILE_KEY, nextProgressByProfile),
      setStoredValue(LEGACY_PLAYBACK_MIGRATED_KEY, true),
      removeStoredValue('watchHistory'),
      removeStoredValue('watchProgress'),
    ]);
    return {
      watchHistory: nextHistoryByProfile[profileKey],
      watchProgress: nextProgressByProfile[profileKey],
    };
  }

  const normalizedHistory = normalizeWatchHistoryEntries(profileHistory ?? []);
  const normalizedProgress = normalizeWatchProgressMap(profileProgress ?? {});

  return {
    watchHistory: normalizedHistory,
    watchProgress: normalizedProgress,
  };
}

async function writeProfilePlayback(session: UserSession | null, watchHistory: WatchProgress[], watchProgress: Record<number, WatchProgress>) {
  if (!session) return;

  const [watchHistoryByProfile, watchProgressByProfile] = await Promise.all([
    getStoredValue(WATCH_HISTORY_PROFILE_KEY, {} as Record<string, WatchProgress[]>),
    getStoredValue(WATCH_PROGRESS_PROFILE_KEY, {} as Record<string, Record<number, WatchProgress>>),
  ]);

  const profileKey = session.id;
  await Promise.all([
    setStoredValue(WATCH_HISTORY_PROFILE_KEY, { ...watchHistoryByProfile, [profileKey]: watchHistory }),
    setStoredValue(WATCH_PROGRESS_PROFILE_KEY, { ...watchProgressByProfile, [profileKey]: watchProgress }),
  ]);
}

export const useAppStore = create<AppState>((set, get) => ({
  hydrated: false,
  session: null,
  isSidebarCompact: false,
  isRightPanelHidden: false,
  isRightPanelFullpage: false,
  rightPanelView: 'now-playing',
  rightPanelWidth: 320,
  titleLanguage: 'japanese',
  isTrailerMuted: false,
  isProfilePopupOpen: false,
  isSettingsOpen: false,
  selectedAnime: null,
  currentlyPlayingItem: null,
  queue: [],
  queueCursor: -1,
  playlists: [],
  watchHistory: [],
  favorites: [],
  watchProgress: {},
  homeRefreshVersion: 0,
  isPlaying: false,
  playbackTime: 0,
  playbackDuration: 0,
  trailerVolume: 72,
  activePlaybackUrl: null,
  shuffleEnabled: false,
  repeatMode: 'off',
  importedSourcePlugins: [],
  pluginPriority: [],
  pluginEnabled: {},
  preferredSourcePluginId: null,
  preferredAudioLanguage: 'sub',
  autoSkipOpening: false,
  autoSkipEnding: false,
  autoSkipRecap: false,
  animeSkipButtonSegment: null,
  baseCatalogSource: DEFAULT_BASE_CATALOG_SOURCE,
  animeScheduleApiToken: DEFAULT_ANIMESCHEDULE_TOKEN,
  playbackSupportMode: 'fully-supported',
  isResolvingPlaybackSource: false,
  selectedSourceOptionId: null,
  pendingSeekTo: null,
  isTrailerPlayerReady: false,
  episodeMetadata: null,

  initialize: async () => {
    try {
      const [
        session,
        isSidebarCompact,
        isRightPanelHidden,
        isRightPanelFullpage,
        rawRightPanelView,
        rightPanelWidth,
        rawTitleLanguage,
        rawShuffleEnabled,
        rawRepeatMode,
        rawImportedSourcePlugins,
        rawPluginPriority,
        rawPluginEnabled,
        rawPreferredSourcePluginId,
        rawPreferredAudioLanguage,
        rawAutoSkipOpening,
        rawAutoSkipEnding,
        rawAutoSkipRecap,
        rawBaseCatalogSource,
        rawAnimeScheduleApiToken,
        isTrailerMuted,
        rawCurrentlyPlayingItem,
        rawQueue,
        rawQueueCursor,
        playlists,
        favorites,
      ] = await Promise.all([
        getStoredValue('session', null),
        getStoredValue('isSidebarCompact', false),
        getStoredValue('isRightPanelHidden', false),
        getStoredValue('isRightPanelFullpage', false),
        getStoredValue('rightPanelView', 'now-playing' as RightPanelView),
        getStoredValue('rightPanelWidth', 320),
        getStoredValue('titleLanguage', 'japanese' as TitleLanguage),
        getStoredValue('shuffleEnabled', false),
        getStoredValue('repeatMode', 'off' as 'off' | 'one'),
        getStoredValue('importedSourcePlugins', []),
        getStoredValue('pluginPriority', []),
        getStoredValue(
          'pluginEnabled',
          {},
        ),
        getStoredValue('preferredSourcePluginId', null),
        getStoredValue('preferredAudioLanguage', 'sub' as SourceAudioLanguage),
        getStoredValue('autoSkipOpening', false),
        getStoredValue('autoSkipEnding', false),
        getStoredValue('autoSkipRecap', false),
        getStoredValue('baseCatalogSource', DEFAULT_BASE_CATALOG_SOURCE),
        getStoredValue('animeScheduleApiToken', DEFAULT_ANIMESCHEDULE_TOKEN),
        getStoredValue('isTrailerMuted', false),
        getStoredValue('currentlyPlayingItem', null),
        getStoredValue('queue', []),
        getStoredValue('queueCursor', -1),
        getStoredValue('playlists', []),
        getStoredValue('favorites', []),
      ]);
      const { watchHistory, watchProgress } = await readProfilePlayback(session);

      const titleLanguage = normalizeTitleLanguage(rawTitleLanguage);
      if (rawTitleLanguage !== titleLanguage) {
        await setStoredValue('titleLanguage', titleLanguage);
      }

      const rightPanelView = normalizeRightPanelView(rawRightPanelView);
      if (rawRightPanelView !== rightPanelView) {
        await setStoredValue('rightPanelView', rightPanelView);
      }

      const repeatMode = normalizeRepeatMode(rawRepeatMode);
      if (rawRepeatMode !== repeatMode) {
        await setStoredValue('repeatMode', repeatMode);
      }

      const importedSourcePlugins = normalizeImportedSourcePlugins(rawImportedSourcePlugins);
      if (JSON.stringify(rawImportedSourcePlugins) !== JSON.stringify(importedSourcePlugins)) {
        await setStoredValue('importedSourcePlugins', importedSourcePlugins);
      }

      const defaultPluginPriority = getDefaultPluginPriority(importedSourcePlugins);
      const defaultPluginEnabled = makeDefaultPluginEnabled(importedSourcePlugins);

      const pluginPriority = normalizePluginPriority(rawPluginPriority, defaultPluginPriority);
      if (JSON.stringify(rawPluginPriority) !== JSON.stringify(pluginPriority)) {
        await setStoredValue('pluginPriority', pluginPriority);
      }

      const pluginEnabled = normalizePluginEnabled(rawPluginEnabled, defaultPluginEnabled);
      if (JSON.stringify(rawPluginEnabled) !== JSON.stringify(pluginEnabled)) {
        await setStoredValue('pluginEnabled', pluginEnabled);
      }

      const preferredSourcePluginId =
        typeof rawPreferredSourcePluginId === 'string' &&
        rawPreferredSourcePluginId.trim().length > 0 &&
        pluginPriority.includes(rawPreferredSourcePluginId) &&
        pluginEnabled[rawPreferredSourcePluginId] !== false
          ? rawPreferredSourcePluginId
          : null;
      if (rawPreferredSourcePluginId !== preferredSourcePluginId) {
        await setStoredValue('preferredSourcePluginId', preferredSourcePluginId);
      }

      const preferredAudioLanguage = normalizeSourceAudioLanguage(rawPreferredAudioLanguage);
      if (rawPreferredAudioLanguage !== preferredAudioLanguage) {
        await setStoredValue('preferredAudioLanguage', preferredAudioLanguage);
      }

      const baseCatalogSource = normalizeBaseCatalogSource(rawBaseCatalogSource);
      if (rawBaseCatalogSource !== baseCatalogSource) {
        await setStoredValue('baseCatalogSource', baseCatalogSource);
      }

      const animeScheduleApiToken = normalizeAnimeScheduleApiToken(rawAnimeScheduleApiToken);
      if (rawAnimeScheduleApiToken !== animeScheduleApiToken) {
        await setStoredValue('animeScheduleApiToken', animeScheduleApiToken);
      }

      const queue = (Array.isArray(rawQueue) ? rawQueue : [])
        .map((item) => normalizePlayableItemFromUnknown(item))
        .filter((item): item is PlayableItem => Boolean(item));

      const currentlyPlayingItem = normalizePlayableItemFromUnknown(rawCurrentlyPlayingItem);

      if (JSON.stringify(rawQueue) !== JSON.stringify(queue)) {
        await setStoredValue('queue', queue);
      }

      if (JSON.stringify(rawCurrentlyPlayingItem) !== JSON.stringify(currentlyPlayingItem)) {
        await setStoredValue('currentlyPlayingItem', currentlyPlayingItem);
      }

      const queueCursor = queue.length > 0 ? Math.max(-1, Math.min(rawQueueCursor, queue.length - 1)) : -1;
      if (queueCursor !== rawQueueCursor) {
        await setStoredValue('queueCursor', queueCursor);
      }

      set({
        hydrated: true,
        session,
        isSidebarCompact,
        isRightPanelHidden,
        isRightPanelFullpage,
        rightPanelView,
        rightPanelWidth,
        titleLanguage,
        shuffleEnabled: Boolean(rawShuffleEnabled),
        repeatMode,
        importedSourcePlugins,
        pluginPriority,
        pluginEnabled,
        preferredSourcePluginId,
        preferredAudioLanguage,
        autoSkipOpening: Boolean(rawAutoSkipOpening),
        autoSkipEnding: Boolean(rawAutoSkipEnding),
        autoSkipRecap: Boolean(rawAutoSkipRecap),
        animeSkipButtonSegment: null,
        baseCatalogSource,
        animeScheduleApiToken,
        playbackSupportMode: 'fully-supported',
        isResolvingPlaybackSource: false,
        selectedSourceOptionId: null,
        isTrailerMuted,
        isProfilePopupOpen: false,
        isSettingsOpen: false,
        currentlyPlayingItem,
        queue,
        queueCursor,
        playlists,
        watchHistory: sortHistory(watchHistory),
        favorites,
        watchProgress,
        homeRefreshVersion: 0,
        playbackTime: 0,
        playbackDuration: 0,
        activePlaybackUrl: null,
        pendingSeekTo: null,
        isTrailerPlayerReady: false,
      });
    } catch (error) {
      console.warn('Initialization failed; starting with defaults.', error);
      set({
        hydrated: true,
        session: null,
        isSidebarCompact: false,
        isRightPanelHidden: false,
        isRightPanelFullpage: false,
        rightPanelView: 'now-playing',
        rightPanelWidth: 320,
        titleLanguage: 'japanese',
        shuffleEnabled: false,
        repeatMode: 'off',
        importedSourcePlugins: [],
        pluginPriority: [],
        pluginEnabled: {},
        preferredSourcePluginId: null,
        preferredAudioLanguage: 'sub',
        autoSkipOpening: false,
        autoSkipEnding: false,
        autoSkipRecap: false,
        episodeMetadata: null,
        animeSkipButtonSegment: null,
        baseCatalogSource: DEFAULT_BASE_CATALOG_SOURCE,
        animeScheduleApiToken: DEFAULT_ANIMESCHEDULE_TOKEN,
        playbackSupportMode: 'fully-supported',
        isResolvingPlaybackSource: false,
        selectedSourceOptionId: null,
        isTrailerMuted: false,
        isProfilePopupOpen: false,
        isSettingsOpen: false,
        currentlyPlayingItem: null,
        queue: [],
        queueCursor: -1,
        playlists: [],
        watchHistory: [],
        favorites: [],
        watchProgress: {},
        homeRefreshVersion: 0,
        playbackTime: 0,
        playbackDuration: 0,
        trailerVolume: 72,
        activePlaybackUrl: null,
        pendingSeekTo: null,
        isTrailerPlayerReady: false,
      });
    }
  },

  continueAsGuest: async () => {
    const session: UserSession = { mode: 'guest', id: createId('guest'), createdAt: new Date().toISOString() };
    await setStoredValue('session', session);
    const { watchHistory, watchProgress } = await readProfilePlayback(session);
    set({ session, watchHistory, watchProgress });
  },

  loginWithEmail: async (email, password) => {
    const session: UserSession = {
      mode: 'email',
      id: createProfileIdFromEmail(email || 'local@myanime1996.invalid'),
      email,
      createdAt: new Date().toISOString(),
    };
    await Promise.all([
      setStoredValue('session', session),
      setStoredValue('localCredentials', { email, passwordHint: password ? 'Stored locally for prototype UI only' : '', updatedAt: new Date().toISOString() }),
    ]);
    const { watchHistory, watchProgress } = await readProfilePlayback(session);
    set({ session, watchHistory, watchProgress });
  },

  logout: async () => {
    await Promise.all([
      removeStoredValue('session'),
      removeStoredValue('watchHistory'),
      removeStoredValue('watchProgress'),
      removeStoredValue('currentlyPlayingItem'),
      removeStoredValue('queue'),
      removeStoredValue('queueCursor'),
    ]);
    set({
      session: null,
      isPlaying: false,
      isProfilePopupOpen: false,
      isSettingsOpen: false,
      selectedAnime: null,
      currentlyPlayingItem: null,
      queue: [],
      queueCursor: -1,
      isRightPanelFullpage: false,
      watchHistory: [],
      watchProgress: {},
      playbackTime: 0,
      playbackDuration: 0,
      activePlaybackUrl: null,
      pendingSeekTo: null,
      isTrailerPlayerReady: false,
      animeSkipButtonSegment: null,
      selectedSourceOptionId: null,
    });
  },

  selectAnime: async (anime) => {
    set({ selectedAnime: anime });
  },

  replaceQueueAndPlay: async (items, startIndex) => {
    if (!items.length) {
      await Promise.all([
        setStoredValue('queue', []),
        setStoredValue('queueCursor', -1),
        setStoredValue('currentlyPlayingItem', null),
      ]);
      set({
        queue: [],
        queueCursor: -1,
        currentlyPlayingItem: null,
        isPlaying: false,
        playbackTime: 0,
        playbackDuration: 0,
        activePlaybackUrl: null,
        episodeMetadata: null,
        pendingSeekTo: null,
        isTrailerPlayerReady: false,
        animeSkipButtonSegment: null,
        selectedSourceOptionId: null,
      });
      return;
    }

    const safeIndex = Math.max(0, Math.min(startIndex, items.length - 1));
    const currentItem = items[safeIndex];

    await Promise.all([
      setStoredValue('queue', items),
      setStoredValue('queueCursor', safeIndex),
      setStoredValue('currentlyPlayingItem', currentItem),
      setStoredValue('isRightPanelHidden', false),
      setStoredValue('rightPanelView', 'now-playing'),
    ]);

    set({
      queue: items,
      queueCursor: safeIndex,
      currentlyPlayingItem: currentItem,
      isRightPanelHidden: false,
      rightPanelView: 'now-playing',
      isPlaying: true,
      playbackTime: 0,
      playbackDuration: 0,
      activePlaybackUrl: null,
      episodeMetadata: null,
      pendingSeekTo: null,
      isTrailerPlayerReady: false,
      animeSkipButtonSegment: null,
      selectedSourceOptionId: null,
    });

    if (currentItem.kind === 'episode' || currentItem.kind === 'movie' || currentItem.kind === 'ova' || currentItem.kind === 'ona' || currentItem.kind === 'special') {
      const animeId = getCanonicalAnimeId(currentItem.anime);
      const existingProgress = get().watchProgress[animeId]?.progress ?? get().watchProgress[currentItem.anime.id]?.progress ?? 12;
      void get().updateWatchProgress(currentItem.anime, existingProgress, currentItem.episodeNumber);
    }
  },

  playAnimeSeries: async (anime) => {
    const canonicalAnimeId = getCanonicalAnimeId(anime);
    const resumeEntry = get().watchProgress[canonicalAnimeId] ?? get().watchProgress[anime.id];
    const hasResume =
      !!resumeEntry &&
      resumeEntry.progress > 0 &&
      resumeEntry.progress < 100 &&
      (Math.max(0, Math.floor(resumeEntry.lastPlaybackSeconds ?? 0)) > 0 || Math.max(1, resumeEntry.episode) > 1);

    if (hasResume && resumeEntry) {
      const resumeAt = Math.max(0, Math.floor(resumeEntry.lastPlaybackSeconds ?? 0));
      const resumeDuration = Math.max(0, Math.floor(resumeEntry.episodeDurationSeconds ?? 0));
      const resumeEpisode = Math.max(1, Math.floor(resumeEntry.episode || 1));
      await get().playEpisode(anime, resumeEpisode);
      if (resumeDuration > 0) {
        get().setPlaybackDuration(resumeDuration);
      }
      if (resumeAt > 0) {
        get().setPlaybackTime(resumeAt);
        get().requestSeekTo(resumeAt);
      }
      return;
    }

    const items = buildSeriesPlayableItems(anime);
    await get().replaceQueueAndPlay(items, 0);
  },

  playEpisode: async (anime, episodeNumber) => {
    const safeEpisode = Math.max(1, Math.round(episodeNumber || 1));
    await get().replaceQueueAndPlay([makeEpisodeItem(anime, safeEpisode, 'episode-card')], 0);
  },

  playTrailer: async (anime) => {
    let trailerAnime = anime;
    const hasTrailer = Boolean(anime.trailerUrl?.trim());

    if (!hasTrailer) {
      const detailAnimeId = anime.jikanId ?? anime.id;
      const resolvedTrailerUrl = await getAnimeTrailerUrl(detailAnimeId);
      if (resolvedTrailerUrl?.trim()) {
        trailerAnime = {
          ...anime,
          trailerUrl: resolvedTrailerUrl,
        };
      }
    }

    await get().replaceQueueAndPlay([makeTrailerItem(trailerAnime)], 0);
  },

  addAnimeSeriesToQueue: async (anime) => {
    const additions = buildSeriesPlayableItems(anime);
    const existingQueue = get().queue;
    const mergedQueue = [...existingQueue, ...additions];
    await setStoredValue('queue', mergedQueue);
    set({ queue: mergedQueue });
  },

  addEpisodeToQueue: async (anime, episodeNumber) => {
    const safeEpisode = Math.max(1, Math.round(episodeNumber || 1));
    const item = makeEpisodeItem(anime, safeEpisode, 'episode-card');
    const existingQueue = get().queue;
    const mergedQueue = [...existingQueue, item];
    await setStoredValue('queue', mergedQueue);
    set({ queue: mergedQueue });
  },

  addTrailerToQueue: async (anime) => {
    const item = makeTrailerItem(anime);
    const existingQueue = get().queue;
    const mergedQueue = [...existingQueue, item];
    await setStoredValue('queue', mergedQueue);
    set({ queue: mergedQueue });
  },

  startPlayingAnime: async (anime) => {
    await get().playAnimeSeries(anime);
  },

  addToQueue: async (anime) => {
    await get().addAnimeSeriesToQueue(anime);
  },

  removeFromQueue: async (queueItemId) => {
    const queue = get().queue;
    const removeIndex = queue.findIndex((item) => item.id === queueItemId);
    if (removeIndex < 0) return;

    const nextQueue = queue.filter((item) => item.id !== queueItemId);
    let nextCursor = get().queueCursor;
    const current = get().currentlyPlayingItem;

    if (removeIndex < nextCursor) {
      nextCursor -= 1;
    } else if (removeIndex === nextCursor) {
      nextCursor = -1;
    }

    if (nextQueue.length === 0) {
      nextCursor = -1;
    } else if (nextCursor >= nextQueue.length) {
      nextCursor = nextQueue.length - 1;
    }

    const nextCurrent = current && current.id === queueItemId ? null : current;

    await Promise.all([
      setStoredValue('queue', nextQueue),
      setStoredValue('queueCursor', nextCursor),
      setStoredValue('currentlyPlayingItem', nextCurrent),
    ]);

    set({
      queue: nextQueue,
      queueCursor: nextCursor,
      currentlyPlayingItem: nextCurrent,
      isPlaying: nextCurrent ? get().isPlaying : false,
      playbackTime: nextCurrent ? get().playbackTime : 0,
      playbackDuration: nextCurrent ? get().playbackDuration : 0,
      activePlaybackUrl: nextCurrent ? get().activePlaybackUrl : null,
      pendingSeekTo: null,
      isTrailerPlayerReady: nextCurrent ? get().isTrailerPlayerReady : false,
    });
  },

  clearQueue: async () => {
    const current = get().currentlyPlayingItem;

    if (current) {
      await Promise.all([
        setStoredValue('queue', [current]),
        setStoredValue('queueCursor', 0),
      ]);
      set({
        queue: [current],
        queueCursor: 0,
      });
      return;
    }

    await Promise.all([
      setStoredValue('queue', []),
      setStoredValue('queueCursor', -1),
    ]);
    set({
      queue: [],
      queueCursor: -1,
      activePlaybackUrl: null,
      isPlaying: false,
      playbackTime: 0,
      playbackDuration: 0,
      pendingSeekTo: null,
      isTrailerPlayerReady: false,
      animeSkipButtonSegment: null,
      selectedSourceOptionId: null,
    });
  },

  playFromQueue: async (queueItemId) => {
    const queue = get().queue;
    const queueIndex = queue.findIndex((item) => item.id === queueItemId);
    if (queueIndex < 0) return;
    await get().replaceQueueAndPlay(queue, queueIndex);
  },

  playNextInQueue: async (fromEnded = false) => {
    const queue = get().queue;
    const currentItem = get().currentlyPlayingItem;

    if (!queue.length) {
      if (currentItem?.kind === 'episode') {
        const nextEpisode = Math.max(1, Math.floor(currentItem.episodeNumber ?? 1) + 1);
        if (!currentItem.anime.episodes || nextEpisode <= currentItem.anime.episodes) {
          await get().playEpisode(currentItem.anime, nextEpisode);
        }
      }
      return;
    }

    const currentCursor = get().queueCursor;
    const currentIndex = currentCursor < 0 ? 0 : currentCursor;
    const { shuffleEnabled, repeatMode } = get();

    if (fromEnded && repeatMode === 'one' && currentItem) {
      await get().replaceQueueAndPlay(queue, currentIndex);
      return;
    }

    if (shuffleEnabled) {
      const remainingQueue = currentItem ? queue.filter((item) => item.id !== currentItem.id) : [...queue];
      if (!remainingQueue.length) return;

      const nextItem = remainingQueue[Math.floor(Math.random() * remainingQueue.length)];
      if (!nextItem) return;

      const nextQueue = remainingQueue.filter((item) => item.id !== nextItem.id);

      await Promise.all([
        setStoredValue('queue', nextQueue),
        setStoredValue('queueCursor', -1),
        setStoredValue('currentlyPlayingItem', nextItem),
        setStoredValue('isRightPanelHidden', false),
        setStoredValue('rightPanelView', 'now-playing'),
      ]);

      set({
        queue: nextQueue,
        queueCursor: -1,
        currentlyPlayingItem: nextItem,
        isRightPanelHidden: false,
        rightPanelView: 'now-playing',
        isPlaying: true,
        playbackTime: 0,
        playbackDuration: 0,
        pendingSeekTo: null,
        isTrailerPlayerReady: false,
        selectedSourceOptionId: null,
      });

      if (nextItem.kind === 'episode' || nextItem.kind === 'movie' || nextItem.kind === 'ova' || nextItem.kind === 'ona' || nextItem.kind === 'special') {
        const animeId = getCanonicalAnimeId(nextItem.anime);
        const existingProgress = get().watchProgress[animeId]?.progress ?? get().watchProgress[nextItem.anime.id]?.progress ?? 12;
        void get().updateWatchProgress(nextItem.anime, existingProgress, nextItem.episodeNumber);
      }
      return;
    }

    let nextIndex = currentCursor < 0 ? 0 : currentIndex + 1;

    if (nextIndex < 0 || nextIndex >= queue.length) {
      if (currentItem?.kind === 'episode') {
        const nextEpisode = Math.max(1, Math.floor(currentItem.episodeNumber ?? 1) + 1);
        if (!currentItem.anime.episodes || nextEpisode <= currentItem.anime.episodes) {
          await get().playEpisode(currentItem.anime, nextEpisode);
        }
      }
      return;
    }

    await get().replaceQueueAndPlay(queue, nextIndex);
  },

  playPreviousInQueue: async () => {
    const queue = get().queue;
    const currentItem = get().currentlyPlayingItem;

    if (!queue.length) {
      if (currentItem?.kind === 'episode') {
        const previousEpisode = Math.max(1, Math.floor(currentItem.episodeNumber ?? 1) - 1);
        if (previousEpisode < (currentItem.episodeNumber ?? 1)) {
          await get().playEpisode(currentItem.anime, previousEpisode);
        }
      }
      return;
    }

    if (get().shuffleEnabled) {
      return;
    }

    const currentCursor = get().queueCursor;
    if (currentCursor <= 0) {
      if (currentItem?.kind === 'episode') {
        const previousEpisode = Math.max(1, Math.floor(currentItem.episodeNumber ?? 1) - 1);
        if (previousEpisode < (currentItem.episodeNumber ?? 1)) {
          await get().playEpisode(currentItem.anime, previousEpisode);
        }
      }
      return;
    }
    await get().replaceQueueAndPlay(queue, currentCursor - 1);
  },

  updateWatchProgress: async (anime, progress = 12, episodeNumber, details) => {
    const existing = get().watchProgress;
    const canonicalAnimeId = getCanonicalAnimeId(anime);
    const existingEntry = existing[canonicalAnimeId] ?? existing[anime.id];
    const currentEpisode = episodeNumber ?? get().currentlyPlayingItem?.episodeNumber;
    const fallbackDuration = Math.max(0, Math.round((anime.durationMinutes ?? 0) * 60));
    const durationFromDetails = Math.max(0, Math.round(toSafeNumber(details?.durationSeconds)));
    const durationFromState = Math.max(0, Math.round(get().playbackDuration));
    const episodeDurationSeconds =
      durationFromDetails > 0
        ? durationFromDetails
        : durationFromState > 0
          ? durationFromState
          : existingEntry?.episodeDurationSeconds && existingEntry.episodeDurationSeconds > 0
            ? existingEntry.episodeDurationSeconds
            : fallbackDuration > 0
              ? fallbackDuration
              : undefined;

    const elapsedFromDetails = Math.max(0, Math.floor(toSafeNumber(details?.elapsedSeconds)));
    const elapsedFromState = Math.max(0, Math.floor(get().playbackTime));
    const elapsedSeconds =
      elapsedFromDetails > 0
        ? elapsedFromDetails
        : elapsedFromState > 0
          ? elapsedFromState
          : Math.max(0, Math.floor(toSafeNumber(existingEntry?.lastPlaybackSeconds)));
    const boundedElapsedSeconds = episodeDurationSeconds ? Math.min(elapsedSeconds, episodeDurationSeconds) : elapsedSeconds;
    const progressFromElapsed = episodeDurationSeconds ? (boundedElapsedSeconds / episodeDurationSeconds) * 100 : 0;
    const baseProgress = Number.isFinite(progress) ? Math.max(0, progress) : 0;
    const mergedProgress = Math.max(baseProgress, progressFromElapsed);
    const completed = mergedProgress >= WATCH_COMPLETE_THRESHOLD_PERCENT;
    const normalizedProgress = completed ? 100 : mergedProgress > 0 ? Math.max(1, Math.min(98, mergedProgress)) : 0;

    const entry: WatchProgress = {
      animeId: canonicalAnimeId,
      jikanId: anime.jikanId,
      animeScheduleRoute: anime.animeScheduleRoute,
      title: anime.title,
      titleEnglish: anime.titleEnglish,
      titleJapanese: anime.titleJapanese,
      image: anime.image,
      episode: currentEpisode ?? existingEntry?.episode ?? 1,
      totalEpisodes: anime.episodes,
      progress: normalizedProgress,
      lastPlaybackSeconds: boundedElapsedSeconds,
      episodeDurationSeconds,
      completed,
      updatedAt: new Date().toISOString(),
    };
    const nextProgress = { ...existing, [canonicalAnimeId]: entry };
    const nextHistory = sortHistory([
      entry,
      ...get().watchHistory.filter((item) => item.animeId !== canonicalAnimeId && item.animeId !== anime.id),
    ]);
    await writeProfilePlayback(get().session, nextHistory, nextProgress);
    set({ watchProgress: nextProgress, watchHistory: nextHistory });
  },

  toggleFavorite: async (animeId) => {
    const favorites = get().favorites.includes(animeId)
      ? get().favorites.filter((id) => id !== animeId)
      : [...get().favorites, animeId];
    await setStoredValue('favorites', favorites);
    set({ favorites });
  },

  setPlaying: (playing) => {
    set({ isPlaying: playing });
    if (!playing) return;

    const currentPlaying = get().currentlyPlayingItem;
    const selectedDetail = get().selectedAnime;

    if (!currentPlaying && selectedDetail) {
      const fallback = buildSeriesPlayableItems(selectedDetail)[0];
      set({ currentlyPlayingItem: fallback });
      void setStoredValue('currentlyPlayingItem', fallback);
    }

    const currentItem = get().currentlyPlayingItem;
    if (!currentItem) return;

    if (currentItem.kind === 'episode' || currentItem.kind === 'movie' || currentItem.kind === 'ova' || currentItem.kind === 'ona' || currentItem.kind === 'special') {
      const animeId = getCanonicalAnimeId(currentItem.anime);
      const existingProgress = get().watchProgress[animeId]?.progress ?? get().watchProgress[currentItem.anime.id]?.progress ?? 12;
      void get().updateWatchProgress(currentItem.anime, existingProgress, currentItem.episodeNumber);
    }
  },

  setPlaybackTime: (seconds) => {
    const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    set({ playbackTime: safe });
  },

  setPlaybackDuration: (seconds) => {
    const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    set({ playbackDuration: safe });
  },

  setTrailerVolume: (volume) => {
    const safe = Math.max(0, Math.min(100, Math.round(volume)));
    set({ trailerVolume: safe });
  },

  setActivePlaybackUrl: (url) => {
    const next = typeof url === 'string' && url.trim().length > 0 ? url.trim() : null;
    set({ activePlaybackUrl: next });
  },

  toggleShuffle: async () => {
    const next = !get().shuffleEnabled;
    await setStoredValue('shuffleEnabled', next);
    set({ shuffleEnabled: next });
  },

  cycleRepeatMode: async () => {
    const order: Array<'off' | 'one'> = ['off', 'one'];
    const current = get().repeatMode;
    const currentIndex = order.indexOf(current);
    const next = order[(currentIndex + 1) % order.length];
    await setStoredValue('repeatMode', next);
    set({ repeatMode: next });
  },

  importSourcePluginFromFile: async () => {
    const imported = await importSourcePluginFromPicker();
    if (!imported) return;

    const current = get();
    const withoutDuplicate = current.importedSourcePlugins.filter((plugin) => plugin.id !== imported.id);
    const importedSourcePlugins = [...withoutDuplicate, imported];

    const defaultPriority = getDefaultPluginPriority(importedSourcePlugins);
    const defaultEnabled = makeDefaultPluginEnabled(importedSourcePlugins);
    const pluginPriority = normalizePluginPriority(current.pluginPriority, defaultPriority);
    const pluginEnabled = normalizePluginEnabled(current.pluginEnabled, defaultEnabled);
    const preferredSourcePluginId =
      current.preferredSourcePluginId && pluginPriority.includes(current.preferredSourcePluginId)
        ? current.preferredSourcePluginId
        : null;

    await Promise.all([
      setStoredValue('importedSourcePlugins', importedSourcePlugins),
      setStoredValue('pluginPriority', pluginPriority),
      setStoredValue('pluginEnabled', pluginEnabled),
      setStoredValue('preferredSourcePluginId', preferredSourcePluginId),
    ]);

    set({ importedSourcePlugins, pluginPriority, pluginEnabled, preferredSourcePluginId, selectedSourceOptionId: null });
  },

  removeSourcePlugin: async (pluginId) => {
    const current = get();
    const importedSourcePlugins = current.importedSourcePlugins.filter((plugin) => plugin.id !== pluginId);

    const defaultPriority = getDefaultPluginPriority(importedSourcePlugins);
    const defaultEnabled = makeDefaultPluginEnabled(importedSourcePlugins);
    const pluginPriority = normalizePluginPriority(current.pluginPriority, defaultPriority);
    const pluginEnabled = normalizePluginEnabled(current.pluginEnabled, defaultEnabled);
    const preferredSourcePluginId =
      current.preferredSourcePluginId &&
      current.preferredSourcePluginId !== pluginId &&
      pluginPriority.includes(current.preferredSourcePluginId) &&
      pluginEnabled[current.preferredSourcePluginId] !== false
        ? current.preferredSourcePluginId
        : null;

    await Promise.all([
      setStoredValue('importedSourcePlugins', importedSourcePlugins),
      setStoredValue('pluginPriority', pluginPriority),
      setStoredValue('pluginEnabled', pluginEnabled),
      setStoredValue('preferredSourcePluginId', preferredSourcePluginId),
    ]);

    set({ importedSourcePlugins, pluginPriority, pluginEnabled, preferredSourcePluginId });
  },

  setPluginPriority: async (priority) => {
    const normalized = normalizePluginPriority(priority, getDefaultPluginPriority(get().importedSourcePlugins));
    await setStoredValue('pluginPriority', normalized);
    set({ pluginPriority: normalized });
  },

  setPluginEnabled: async (pluginId, enabled) => {
    const current = get();
    if (!current.pluginPriority.includes(pluginId)) return;
    const nextEnabled = { ...current.pluginEnabled, [pluginId]: enabled };
    const nextPreferred = !enabled && current.preferredSourcePluginId === pluginId ? null : current.preferredSourcePluginId;
    await Promise.all([
      setStoredValue('pluginEnabled', nextEnabled),
      setStoredValue('preferredSourcePluginId', nextPreferred),
    ]);
    set({ pluginEnabled: nextEnabled, preferredSourcePluginId: nextPreferred, selectedSourceOptionId: null });
  },

  setPreferredSourcePluginId: async (pluginId) => {
    const current = get();
    const next =
      pluginId &&
      pluginId.trim().length > 0 &&
      current.pluginPriority.includes(pluginId) &&
      current.pluginEnabled[pluginId] !== false
        ? pluginId
        : null;
    await setStoredValue('preferredSourcePluginId', next);
    set({ preferredSourcePluginId: next, selectedSourceOptionId: null });
  },

  setPreferredAudioLanguage: async (language) => {
    const next = language === 'dub' ? 'dub' : 'sub';
    await setStoredValue('preferredAudioLanguage', next);
    set({ preferredAudioLanguage: next, selectedSourceOptionId: null });
  },

  setAutoSkipOpening: async (enabled) => {
    const next = Boolean(enabled);
    await setStoredValue('autoSkipOpening', next);
    set({ autoSkipOpening: next });
  },

  setAutoSkipEnding: async (enabled) => {
    const next = Boolean(enabled);
    await setStoredValue('autoSkipEnding', next);
    set({ autoSkipEnding: next });
  },

  setAutoSkipRecap: async (enabled) => {
    const next = Boolean(enabled);
    await setStoredValue('autoSkipRecap', next);
    set({ autoSkipRecap: next });
  },

  setAnimeSkipButtonSegment: (segment) => {
    set({ animeSkipButtonSegment: segment });
  },

  setBaseCatalogSource: async (source) => {
    const next = normalizeBaseCatalogSource(source);
    await setStoredValue('baseCatalogSource', next);
    set({ baseCatalogSource: next });
  },

  setAnimeScheduleApiToken: async (token) => {
    const next = normalizeAnimeScheduleApiToken(token);
    await setStoredValue('animeScheduleApiToken', next);
    set({ animeScheduleApiToken: next });
  },

  setPlaybackSupportMode: (mode) => {
    set({ playbackSupportMode: mode });
  },

  setResolvingPlaybackSource: (resolving) => {
    set({ isResolvingPlaybackSource: Boolean(resolving) });
  },

  setSelectedSourceOptionId: (optionId) => {
    const next = normalizeOptionalText(optionId);
    set({ selectedSourceOptionId: next });
  },

  requestSeekTo: (seconds) => {
    const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    set({ pendingSeekTo: safe });
  },

  clearPendingSeekTo: () => {
    set({ pendingSeekTo: null });
  },

  setTrailerPlayerReady: (ready) => {
    set({ isTrailerPlayerReady: ready });
  },

  setEpisodeMetadata: (meta) => {
    set({ episodeMetadata: meta });
  },

  setCurrentlyPlayingTypeLabel: (typeLabel) => {
    const current = get().currentlyPlayingItem;
    if (!current) return;
    set({ currentlyPlayingItem: { ...current, typeLabel } });
  },

  resetPlaybackTransport: () => {
    set({
      playbackTime: 0,
      playbackDuration: 0,
      activePlaybackUrl: null,
      episodeMetadata: null,
      pendingSeekTo: null,
      isTrailerPlayerReady: false,
      animeSkipButtonSegment: null,
    });
  },

  toggleSidebarCompact: async () => {
    const next = !get().isSidebarCompact;
    await setStoredValue('isSidebarCompact', next);
    set({ isSidebarCompact: next });
  },

  toggleRightPanelHidden: async () => {
    const next = !get().isRightPanelHidden;
    await setStoredValue('isRightPanelHidden', next);
    set({ isRightPanelHidden: next });
  },

  setRightPanelHidden: async (hidden) => {
    await setStoredValue('isRightPanelHidden', hidden);
    set({ isRightPanelHidden: hidden });
  },

  setRightPanelFullpage: async (fullpage) => {
    const allowFullpage = fullpage && get().rightPanelView === 'now-playing';
    await Promise.all([
      setStoredValue('isRightPanelFullpage', allowFullpage),
      setStoredValue('isRightPanelHidden', false),
    ]);
    set({ isRightPanelFullpage: allowFullpage, isRightPanelHidden: false });
  },

  toggleRightPanelFullpage: async () => {
    const next = !get().isRightPanelFullpage && get().rightPanelView === 'now-playing';
    await Promise.all([
      setStoredValue('isRightPanelFullpage', next),
      setStoredValue('isRightPanelHidden', false),
    ]);
    set({ isRightPanelFullpage: next, isRightPanelHidden: false });
  },

  setRightPanelView: async (view) => {
    const shouldExitFullpage = view !== 'now-playing' && get().isRightPanelFullpage;
    await Promise.all([
      setStoredValue('rightPanelView', view),
      ...(shouldExitFullpage ? [setStoredValue('isRightPanelFullpage', false)] : []),
    ]);
    set({
      rightPanelView: view,
      ...(shouldExitFullpage ? { isRightPanelFullpage: false } : {}),
    });
  },

  openRightPanelWithView: async (view) => {
    const shouldExitFullpage = view !== 'now-playing' && get().isRightPanelFullpage;
    await Promise.all([
      setStoredValue('rightPanelView', view),
      setStoredValue('isRightPanelHidden', false),
      ...(shouldExitFullpage ? [setStoredValue('isRightPanelFullpage', false)] : []),
    ]);
    set({
      rightPanelView: view,
      isRightPanelHidden: false,
      ...(shouldExitFullpage ? { isRightPanelFullpage: false } : {}),
    });
  },

  setRightPanelWidth: async (width) => {
    const clamped = Math.max(260, Math.min(560, Math.round(width)));
    await setStoredValue('rightPanelWidth', clamped);
    set({ rightPanelWidth: clamped });
  },

  toggleTitleLanguage: async () => {
    const next: TitleLanguage = get().titleLanguage === 'japanese' ? 'english' : 'japanese';
    await setStoredValue('titleLanguage', next);
    set({ titleLanguage: next });
  },

  setTrailerMuted: async (muted) => {
    await setStoredValue('isTrailerMuted', muted);
    set({ isTrailerMuted: muted });
  },

  setProfilePopupOpen: (open) => set({ isProfilePopupOpen: open }),

  setSettingsOpen: (open) => set({ isSettingsOpen: open }),

  removeHistoryItem: async (animeId) => {
    const nextHistory = get().watchHistory.filter((item) => item.animeId !== animeId);
    const nextProgress = { ...get().watchProgress };
    delete nextProgress[animeId];
    await writeProfilePlayback(get().session, nextHistory, nextProgress);
    set({ watchHistory: nextHistory, watchProgress: nextProgress });
  },

  clearHistory: async () => {
    await writeProfilePlayback(get().session, [], {});
    set({ watchHistory: [], watchProgress: {} });
  },

  clearJikanCache: async () => {
    clearPluginResolverCaches();
    await Promise.all([
      clearJikanDataCache(),
      clearAnimeScheduleDataCache(),
      clearSourceResolveCache(),
      clearAniSkipDataCache(),
    ]);
    set({ homeRefreshVersion: get().homeRefreshVersion + 1 });
  },

  exportUserData: async () => {
    const current = get();
    const [
      session,
      isSidebarCompact,
      isRightPanelHidden,
      isRightPanelFullpage,
      rightPanelWidth,
      titleLanguage,
      isTrailerMuted,
      playlists,
      favorites,
    ] = await Promise.all([
      getStoredValue('session', null),
      getStoredValue('isSidebarCompact', false),
      getStoredValue('isRightPanelHidden', false),
      getStoredValue('isRightPanelFullpage', false),
      getStoredValue('rightPanelWidth', 320),
      getStoredValue('titleLanguage', 'japanese' as TitleLanguage),
      getStoredValue('isTrailerMuted', false),
      getStoredValue('playlists', []),
      getStoredValue('favorites', []),
    ]);

    return {
      exportedAt: new Date().toISOString(),
      exportVersion: 1,
      profile: { session },
      settings: {
        isSidebarCompact,
        isRightPanelHidden,
        isRightPanelFullpage,
        rightPanelWidth,
        titleLanguage,
        shuffleEnabled: current.shuffleEnabled,
        repeatMode: current.repeatMode,
        importedSourcePlugins: current.importedSourcePlugins,
        pluginPriority: current.pluginPriority,
        pluginEnabled: current.pluginEnabled,
        preferredSourcePluginId: current.preferredSourcePluginId,
        preferredAudioLanguage: current.preferredAudioLanguage,
        autoSkipOpening: current.autoSkipOpening,
        autoSkipEnding: current.autoSkipEnding,
        autoSkipRecap: current.autoSkipRecap,
        baseCatalogSource: current.baseCatalogSource,
        animeScheduleApiToken: current.animeScheduleApiToken,
        isTrailerMuted,
      },
      userData: {
        currentlyPlayingItem: current.currentlyPlayingItem,
        queue: current.queue,
        queueCursor: current.queueCursor,
        playlists,
        watchHistory: current.watchHistory,
        favorites,
        watchProgress: current.watchProgress,
      },
    };
  },

  factoryReset: async () => {
    const session = get().session;

    if (session) {
      const [watchHistoryByProfile, watchProgressByProfile] = await Promise.all([
        getStoredValue(WATCH_HISTORY_PROFILE_KEY, {} as Record<string, WatchProgress[]>),
        getStoredValue(WATCH_PROGRESS_PROFILE_KEY, {} as Record<string, Record<number, WatchProgress>>),
      ]);

      const nextHistoryByProfile = { ...watchHistoryByProfile };
      const nextProgressByProfile = { ...watchProgressByProfile };
      delete nextHistoryByProfile[session.id];
      delete nextProgressByProfile[session.id];

      await Promise.all([
        setStoredValue(WATCH_HISTORY_PROFILE_KEY, nextHistoryByProfile),
        setStoredValue(WATCH_PROGRESS_PROFILE_KEY, nextProgressByProfile),
      ]);
    }

    await Promise.all([
      setStoredValue('isSidebarCompact', false),
      setStoredValue('isRightPanelHidden', false),
      setStoredValue('isRightPanelFullpage', false),
      setStoredValue('rightPanelView', 'now-playing' as RightPanelView),
      setStoredValue('rightPanelWidth', 320),
      setStoredValue('titleLanguage', 'japanese' as TitleLanguage),
      setStoredValue('shuffleEnabled', false),
      setStoredValue('repeatMode', 'off' as 'off' | 'one'),
      setStoredValue('importedSourcePlugins', []),
      setStoredValue('pluginPriority', []),
      setStoredValue('pluginEnabled', {}),
      setStoredValue('preferredSourcePluginId', null),
      setStoredValue('preferredAudioLanguage', 'sub' as SourceAudioLanguage),
      setStoredValue('autoSkipOpening', false),
      setStoredValue('autoSkipEnding', false),
      setStoredValue('autoSkipRecap', false),
      setStoredValue('baseCatalogSource', DEFAULT_BASE_CATALOG_SOURCE),
      setStoredValue('animeScheduleApiToken', DEFAULT_ANIMESCHEDULE_TOKEN),
      setStoredValue('isTrailerMuted', false),
      setStoredValue('currentlyPlayingItem', null),
      setStoredValue('queue', []),
      setStoredValue('queueCursor', -1),
      setStoredValue('playlists', []),
      setStoredValue('watchHistory', []),
      setStoredValue('favorites', []),
      setStoredValue('watchProgress', {}),
      setStoredValue('sourceResolveCache', {}),
      setStoredValue('aniSkipCache', {}),
      clearJikanDataCache(),
      clearAnimeScheduleDataCache(),
      clearAniSkipDataCache(),
      removeStoredValue('localCredentials'),
    ]);

    set({
      session,
      isSidebarCompact: false,
      isRightPanelHidden: false,
      isRightPanelFullpage: false,
      rightPanelView: 'now-playing',
      rightPanelWidth: 320,
      titleLanguage: 'japanese',
      shuffleEnabled: false,
      repeatMode: 'off',
      importedSourcePlugins: [],
      pluginPriority: [],
      pluginEnabled: {},
      preferredSourcePluginId: null,
      preferredAudioLanguage: 'sub',
      autoSkipOpening: false,
      autoSkipEnding: false,
      autoSkipRecap: false,
      episodeMetadata: null,
      animeSkipButtonSegment: null,
      baseCatalogSource: DEFAULT_BASE_CATALOG_SOURCE,
      animeScheduleApiToken: DEFAULT_ANIMESCHEDULE_TOKEN,
      playbackSupportMode: 'fully-supported',
      selectedSourceOptionId: null,
      isTrailerMuted: false,
      isProfilePopupOpen: false,
      isSettingsOpen: false,
      selectedAnime: null,
      currentlyPlayingItem: null,
      queue: [],
      queueCursor: -1,
      playlists: [],
      watchHistory: [],
      favorites: [],
      watchProgress: {},
      homeRefreshVersion: 0,
      isPlaying: false,
      playbackTime: 0,
      playbackDuration: 0,
      trailerVolume: 72,
      activePlaybackUrl: null,
      pendingSeekTo: null,
      isTrailerPlayerReady: false,
    });
  },
}));
