import { create } from 'zustand';
import { getJikanDetailEpisodeBundle } from '../services/animeDetailEpisodes';
import type {
  AnimeSummary,
  LibraryAnimeItem,
  LibraryNotificationFeedItem,
  LibraryStatus,
  LibraryStatusNotificationSettings,
  PlayableItem,
  PlayableKind,
  Playlist,
  RightPanelView,
  TitleLanguage,
  UserSession,
  WatchProgress,
} from '../types/anime';
import type { ImportedSourcePluginDefinition, SourceAudioLanguage } from '../types/plugin';
import type { BaseCatalogSource } from '../services/catalogSource';
import { DEFAULT_BASE_CATALOG_SOURCE, getAnimeTrailerUrl, resolveCanonicalDetailRouteId } from '../services/catalogSource';
import { clearAnimeScheduleDataCache, DEFAULT_ANIMESCHEDULE_TOKEN, onAnimeScheduleRateLimit } from '../services/animeSchedule';
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
let animeScheduleRateLimitListenerBound = false;

export type PlaybackSupportMode = 'fully-supported' | 'fullscreen-only' | 'fully-unsupported';
export type AnimeSkipType = 'op' | 'ed' | 'recap';
export type UpcomingSeasonFilter = 'all' | 'tv' | 'movie' | 'ova' | 'special' | 'ona' | 'music';

const LIBRARY_STATUSES: LibraryStatus[] = ['watching', 'plan-to-watch', 'on-hold', 'dropped', 'completed'];
const MAX_LIBRARY_NOTIFICATIONS = 100;
const LIBRARY_EPISODE_POLL_INTERVAL_MS = 60_000;
const OS_NOTIFICATION_DEDUPE_WINDOW_MS = 90_000;
const MAX_ACTION_TOASTS = 4;
const ACTION_TOAST_DURATION_MS = 3600;
export const DEFAULT_NOTIFICATION_POSTER = '/assets/logo.png';
let libraryEpisodePollTimer: ReturnType<typeof setInterval> | null = null;
let libraryEpisodeCheckInFlight = false;
let libraryEpisodeCheckPromise: Promise<void> | null = null;
let libraryNotificationActionListenerBound = false;
const lastOsNotificationSentAtByKey = new Map<string, number>();
const localNotificationAttachmentUrlBySource = new Map<string, string>();
const actionToastTimers = new Map<string, ReturnType<typeof setTimeout>>();

function ensureLibraryEpisodePolling(runCheck: () => void) {
  if (libraryEpisodePollTimer) return;
  libraryEpisodePollTimer = setInterval(() => {
    runCheck();
  }, LIBRARY_EPISODE_POLL_INTERVAL_MS);
}

export type AnimeSkipButtonSegment = {
  type: AnimeSkipType;
  startTime: number;
  endTime: number;
  skipId: string;
};

export type InAppActionToast = {
  id: string;
  kind: 'queue' | 'library';
  message: string;
};

function getLocalDateStamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

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
  isAnimeScheduleRateLimitGuideOpen: boolean;
  animeScheduleRateLimitGuideDismissedDate: string | null;
  animeScheduleRateLimitGuideLastTriggeredAt: number | null;
  selectedAnime: AnimeSummary | null;
  currentlyPlayingItem: PlayableItem | null;
  queue: PlayableItem[];
  queueCursor: number;
  playlists: Playlist[];
  watchHistory: WatchProgress[];
  favorites: number[];
  libraryItems: Record<number, LibraryAnimeItem>;
  libraryStatusNotificationSettings: LibraryStatusNotificationSettings;
  libraryLastNotifiedEpisodeByAnimeId: Record<number, number>;
  libraryNotifications: LibraryNotificationFeedItem[];
  actionToasts: InAppActionToast[];
  libraryLastDailyEpisodeCheckDate: string | null;
  watchProgress: Record<number, WatchProgress>;
  homeRefreshVersion: number;
  isPlaying: boolean;
  playbackTime: number;
  playbackDuration: number;
  trailerVolume: number;
  trailerLastNonZeroVolume: number;
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
  allowNsfw: boolean;
  upcomingSeasonFilter: UpcomingSeasonFilter;
  animeSkipButtonSegment: AnimeSkipButtonSegment | null;
  baseCatalogSource: BaseCatalogSource;
  animeScheduleApiToken: string;
  playbackSupportMode: PlaybackSupportMode;
  isResolvingPlaybackSource: boolean;
  selectedSourceOptionId: string | null;
  selectedSubtitleId: string | null;
  subtitleFontColor: string;
  subtitleFontSizeDocked: number;
  subtitleFontSizeExpanded: number;
  subtitleFontSizeFullscreen: number;
  subtitleDropShadow: boolean;
  subtitleBackgroundHighlight: boolean;
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
  setAnimeLibraryStatus: (anime: AnimeSummary, status: LibraryStatus) => Promise<void>;
  removeAnimeFromLibrary: (animeId: number) => Promise<void>;
  getLibraryStatusForAnime: (animeId: number, jikanId?: number) => LibraryStatus | null;
  setLibraryStatusNotificationEnabled: (status: LibraryStatus, enabled: boolean) => Promise<void>;
  markLibraryNotificationRead: (notificationId: string) => void;
  playLibraryNotification: (notificationId: string) => Promise<void>;
  testWindowsNotification: (animeTitle: string, episode: number, count?: number) => Promise<void>;
  markAllLibraryNotificationsRead: () => void;
  clearLibraryNotifications: () => Promise<void>;
  pushActionToast: (toast: Omit<InAppActionToast, 'id'>) => void;
  dismissActionToast: (toastId: string) => void;
  runLibraryEpisodeDailyCheck: (force?: boolean) => Promise<void>;
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
  setAllowNsfw: (enabled: boolean) => Promise<void>;
  setUpcomingSeasonFilter: (filter: UpcomingSeasonFilter) => Promise<void>;
  setAnimeSkipButtonSegment: (segment: AnimeSkipButtonSegment | null) => void;
  setBaseCatalogSource: (source: BaseCatalogSource) => Promise<void>;
  setAnimeScheduleApiToken: (token: string) => Promise<void>;
  setPlaybackSupportMode: (mode: PlaybackSupportMode) => void;
  setResolvingPlaybackSource: (resolving: boolean) => void;
  setSelectedSourceOptionId: (optionId: string | null) => void;
  setSelectedSubtitleId: (subtitleId: string | null) => void;
  setSubtitleFontColor: (color: string) => Promise<void>;
  setSubtitleFontSizeDocked: (size: number) => Promise<void>;
  setSubtitleFontSizeExpanded: (size: number) => Promise<void>;
  setSubtitleFontSizeFullscreen: (size: number) => Promise<void>;
  setSubtitleDropShadow: (enabled: boolean) => Promise<void>;
  setSubtitleBackgroundHighlight: (enabled: boolean) => Promise<void>;
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
  openAnimeScheduleRateLimitGuide: () => void;
  closeAnimeScheduleRateLimitGuide: () => void;
  dismissAnimeScheduleRateLimitGuideForToday: () => Promise<void>;
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

function normalizeUpcomingSeasonFilter(value: unknown): UpcomingSeasonFilter {
  if (value === 'tv' || value === 'movie' || value === 'ova' || value === 'special' || value === 'ona' || value === 'music') {
    return value;
  }
  return 'all';
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeSubtitleColor(value: unknown): string {
  if (typeof value !== 'string') return '#ffffff';
  const trimmed = value.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(trimmed)) return '#ffffff';
  return trimmed.toLowerCase();
}

function normalizeSubtitleFontSize(value: unknown): number {
  const size = Number(value);
  if (!Number.isFinite(size)) return 22;
  return Math.max(12, Math.min(48, Math.round(size)));
}

function normalizeTrailerVolume(value: unknown): number {
  const volume = Number(value);
  if (!Number.isFinite(volume)) return 72;
  return Math.max(0, Math.min(200, Math.round(volume)));
}

function normalizeTrailerLastNonZeroVolume(value: unknown, fallback = 72): number {
  const volume = Number(value);
  if (!Number.isFinite(volume) || volume <= 0) {
    return Math.max(1, Math.min(200, Math.round(fallback)));
  }
  return Math.max(1, Math.min(200, Math.round(volume)));
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
      iconSvg:
        plugin.iconSvg && plugin.iconSvg.mimeType === 'image/svg+xml' && typeof plugin.iconSvg.dataBase64 === 'string'
          ? {
              mimeType: 'image/svg+xml',
              dataBase64: plugin.iconSvg.dataBase64,
              width: plugin.iconSvg.width,
              height: plugin.iconSvg.height,
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

function normalizeTitleKey(value: string | undefined) {
  return (value ?? '').trim().toLowerCase();
}

function findWatchProgressEntryForAnime(
  anime: AnimeSummary,
  watchProgress: Record<number, WatchProgress>,
) {
  const canonicalId = getCanonicalAnimeId(anime);
  const candidateIds = new Set<number>([
    canonicalId,
    Math.max(1, Math.floor(Number(anime.id) || 1)),
  ]);

  const jikanId = Number(anime.jikanId);
  if (Number.isFinite(jikanId) && jikanId > 0) {
    candidateIds.add(Math.floor(jikanId));
  }

  for (const id of candidateIds) {
    const match = watchProgress[id];
    if (match) {
      return match;
    }
  }

  const routeKey = anime.animeScheduleRoute?.trim().toLowerCase();
  if (routeKey) {
    const byRoute = Object.values(watchProgress).find(
      (entry) => entry.animeScheduleRoute?.trim().toLowerCase() === routeKey,
    );
    if (byRoute) {
      return byRoute;
    }
  }

  const titleKeys = new Set(
    [
      normalizeTitleKey(anime.title),
      normalizeTitleKey(anime.titleEnglish),
      normalizeTitleKey(anime.titleJapanese),
    ].filter((value) => value.length > 0),
  );

  if (titleKeys.size === 0) {
    return null;
  }

  return (
    Object.values(watchProgress).find((entry) => {
      const entryTitleKeys = [
        normalizeTitleKey(entry.title),
        normalizeTitleKey(entry.titleEnglish),
        normalizeTitleKey(entry.titleJapanese),
      ];
      return entryTitleKeys.some((key) => key.length > 0 && titleKeys.has(key));
    }) ?? null
  );
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

function buildQueuePlayableItems(anime: AnimeSummary): PlayableItem[] {
  const inferredKind = inferMediaKindFromAnime(anime);
  if (inferredKind !== 'episode') {
    return [makeSingleMediaItem(anime, inferredKind)];
  }

  const latestEpisode = Math.max(1, anime.currentEpisode ?? 1);
  return Array.from({ length: latestEpisode }, (_, index) => makeEpisodeItem(anime, index + 1, 'anime-card'));
}

async function resolveQueueEpisodeResolution(anime: AnimeSummary): Promise<{ latestEpisode: number; resolvedJikanId?: number }> {
  let latestEpisode = Math.max(1, Math.floor(Number(anime.currentEpisode) || 0));
  let resolvedJikanId = Number.isFinite(anime.jikanId) && Number(anime.jikanId) > 0
    ? Math.floor(Number(anime.jikanId))
    : undefined;

  if (!resolvedJikanId) {
    resolvedJikanId = await resolveCanonicalDetailRouteId(anime).catch(() => undefined);
  }

  if (resolvedJikanId && resolvedJikanId > 0) {
    const bundle = await getJikanDetailEpisodeBundle(resolvedJikanId, 1).catch(() => null);
    latestEpisode = Math.max(latestEpisode, Math.floor(Number(bundle?.detail.currentEpisode) || 0));
  }

  return {
    latestEpisode: Math.max(1, latestEpisode),
    resolvedJikanId,
  };
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

function isLibraryStatus(value: unknown): value is LibraryStatus {
  return value === 'plan-to-watch' || value === 'watching' || value === 'on-hold' || value === 'dropped' || value === 'completed';
}

function getDefaultLibraryStatusNotificationSettings(): LibraryStatusNotificationSettings {
  return {
    'plan-to-watch': false,
    watching: true,
    'on-hold': false,
    dropped: false,
    completed: false,
  };
}

function normalizeLibraryStatusNotificationSettings(value: unknown): LibraryStatusNotificationSettings {
  const defaults = getDefaultLibraryStatusNotificationSettings();
  if (!value || typeof value !== 'object') return defaults;
  const source = value as Record<string, unknown>;
  return {
    'plan-to-watch': typeof source['plan-to-watch'] === 'boolean' ? source['plan-to-watch'] : defaults['plan-to-watch'],
    watching: typeof source.watching === 'boolean' ? source.watching : defaults.watching,
    'on-hold': typeof source['on-hold'] === 'boolean' ? source['on-hold'] : defaults['on-hold'],
    dropped: typeof source.dropped === 'boolean' ? source.dropped : defaults.dropped,
    completed: typeof source.completed === 'boolean' ? source.completed : defaults.completed,
  };
}

function normalizeLibraryLastNotifiedEpisodeMap(value: unknown): Record<number, number> {
  if (!value || typeof value !== 'object') return {};
  const normalized: Record<number, number> = {};
  for (const [key, rawValue] of Object.entries(value as Record<string, unknown>)) {
    const animeId = Math.max(1, Math.floor(Number(key) || 0));
    const episode = Math.max(0, Math.floor(Number(rawValue) || 0));
    if (animeId > 0 && episode >= 0) {
      normalized[animeId] = episode;
    }
  }
  return normalized;
}

function normalizeLibraryNotifications(value: unknown): LibraryNotificationFeedItem[] {
  if (!Array.isArray(value)) return [];
  const cleaned = value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const item = entry as Partial<LibraryNotificationFeedItem>;
      const animeId = Math.max(1, Math.floor(Number(item.animeId) || 0));
      const episode = Math.max(0, Math.floor(Number(item.episode) || 0));
      if (!item.id || typeof item.id !== 'string') return null;
      if (!item.title || typeof item.title !== 'string') return null;
      if (!item.message || typeof item.message !== 'string') return null;
      if (!item.createdAt || typeof item.createdAt !== 'string') return null;
      if (animeId <= 0) return null;
      return {
        id: item.id,
        animeId,
        episode,
        title: item.title,
        image: typeof item.image === 'string' ? item.image : undefined,
        message: item.message,
        createdAt: item.createdAt,
        channel: item.channel === 'os' ? 'os' : 'in-app',
        read: Boolean(item.read),
      } as LibraryNotificationFeedItem;
    })
    .filter((entry): entry is LibraryNotificationFeedItem => Boolean(entry));

  const deduped = new Map<string, LibraryNotificationFeedItem>();
  for (const entry of cleaned) {
    const key = `${entry.animeId}|${entry.episode}|${entry.title.trim().toLowerCase()}|${entry.message.trim().toLowerCase()}`;
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, entry);
      continue;
    }

    const existingCreatedAt = new Date(existing.createdAt).getTime();
    const nextCreatedAt = new Date(entry.createdAt).getTime();
    if (nextCreatedAt >= existingCreatedAt) {
      deduped.set(key, entry);
    }
  }

  return Array.from(deduped.values())
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, MAX_LIBRARY_NOTIFICATIONS);
}

function normalizeLibraryItems(value: unknown): Record<number, LibraryAnimeItem> {
  if (!value || typeof value !== 'object') return {};
  const normalized: Record<number, LibraryAnimeItem> = {};
  for (const entry of Object.values(value as Record<string, unknown>)) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Partial<LibraryAnimeItem>;
    if (!isLibraryStatus(item.status)) continue;
    const animeId = Math.max(1, Math.floor(Number(item.animeId) || 0));
    if (!animeId) continue;
    const jikanIdRaw = Math.floor(Number(item.jikanId) || 0);
    const canonicalAnimeId = jikanIdRaw > 0 ? jikanIdRaw : animeId;
    const nextItem: LibraryAnimeItem = {
      animeId: canonicalAnimeId,
      jikanId: jikanIdRaw > 0 ? jikanIdRaw : undefined,
      animeScheduleRoute: typeof item.animeScheduleRoute === 'string' ? item.animeScheduleRoute : undefined,
      title: typeof item.title === 'string' && item.title.trim().length > 0 ? item.title : 'Unknown Title',
      titleEnglish: typeof item.titleEnglish === 'string' ? item.titleEnglish : undefined,
      titleJapanese: typeof item.titleJapanese === 'string' ? item.titleJapanese : undefined,
      image: typeof item.image === 'string' ? item.image : '',
      mediaType: typeof item.mediaType === 'string' ? item.mediaType : undefined,
      year: Number.isFinite(item.year) ? Number(item.year) : undefined,
      episodes: Number.isFinite(item.episodes) ? Number(item.episodes) : undefined,
      currentEpisode: Number.isFinite(item.currentEpisode) ? Number(item.currentEpisode) : undefined,
      status: item.status,
      addedAt: typeof item.addedAt === 'string' ? item.addedAt : new Date().toISOString(),
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date().toISOString(),
    };

    const existing = normalized[canonicalAnimeId];
    if (!existing) {
      normalized[canonicalAnimeId] = nextItem;
      continue;
    }

    const existingUpdatedAt = new Date(existing.updatedAt).getTime();
    const nextUpdatedAt = new Date(nextItem.updatedAt).getTime();
    if (nextUpdatedAt >= existingUpdatedAt) {
      normalized[canonicalAnimeId] = {
        ...nextItem,
        addedAt: existing.addedAt || nextItem.addedAt,
      };
    }
  }
  return normalized;
}

function buildLibraryItemFromAnime(anime: AnimeSummary, status: LibraryStatus, existing?: LibraryAnimeItem): LibraryAnimeItem {
  const now = new Date().toISOString();
  const canonicalAnimeId = getCanonicalAnimeId(anime);
  return {
    animeId: canonicalAnimeId,
    jikanId: anime.jikanId,
    animeScheduleRoute: anime.animeScheduleRoute,
    title: anime.title,
    titleEnglish: anime.titleEnglish,
    titleJapanese: anime.titleJapanese,
    image: anime.image,
    mediaType: anime.mediaType,
    year: anime.year,
    episodes: anime.episodes,
    currentEpisode: anime.currentEpisode,
    status,
    addedAt: existing?.addedAt ?? now,
    updatedAt: now,
  };
}

function resolveLibraryAnimeId(animeId: number, jikanId: number | undefined) {
  const parsedAnimeId = Math.max(1, Math.floor(Number(animeId) || 0));
  const parsedJikanId = Math.max(1, Math.floor(Number(jikanId) || 0));
  return parsedJikanId > 0 ? parsedJikanId : parsedAnimeId;
}

function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function resolveNotificationIconUrl(image?: string) {
  const candidate = image?.trim() || DEFAULT_NOTIFICATION_POSTER;
  if (typeof window === 'undefined') return candidate;
  try {
    return new URL(candidate, window.location.origin).toString();
  } catch {
    return candidate;
  }
}

function getPosterExtensionFromUrl(urlValue: string) {
  const normalized = urlValue.trim().toLowerCase();
  if (normalized.includes('.webp')) return '.webp';
  if (normalized.includes('.gif')) return '.gif';
  if (normalized.includes('.jpg') || normalized.includes('.jpeg')) return '.jpg';
  return '.png';
}

function toFileProtocolUrl(absolutePath: string) {
  const normalized = absolutePath.replace(/\\/g, '/');
  const prefixed = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return `file://${encodeURI(prefixed)}`;
}

async function resolveTauriAttachmentUrl(posterUrl: string, animeId: number) {
  const source = posterUrl.trim();
  if (!source) return null;

  const cached = localNotificationAttachmentUrlBySource.get(source);
  if (cached) return cached;

  try {
    const response = await fetch(source);
    if (!response.ok) return null;

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.byteLength) return null;

    const [
      { writeFile, BaseDirectory },
      { appLocalDataDir, cacheDir, tempDir, join },
    ] = await Promise.all([
      import('@tauri-apps/plugin-fs'),
      import('@tauri-apps/api/path'),
    ]);

    const fileName = `notification-poster-${animeId}-${hashString(source)}${getPosterExtensionFromUrl(source)}`;
    const candidates: Array<{
      baseDir: (typeof BaseDirectory)[keyof typeof BaseDirectory];
      getRoot: () => Promise<string>;
    }> = [
      { baseDir: BaseDirectory.AppLocalData, getRoot: appLocalDataDir },
      { baseDir: BaseDirectory.Cache, getRoot: cacheDir },
      { baseDir: BaseDirectory.Temp, getRoot: tempDir },
    ];

    for (const candidate of candidates) {
      try {
        await writeFile(fileName, bytes, {
          baseDir: candidate.baseDir,
        });
        const absolutePath = await join(await candidate.getRoot(), fileName);
        const attachmentUrl = toFileProtocolUrl(absolutePath);
        localNotificationAttachmentUrlBySource.set(source, attachmentUrl);
        return attachmentUrl;
      } catch {
        // Try the next writable location.
      }
    }

    return source;
  } catch (error) {
    console.warn('[Notification] Failed to prepare local attachment URL:', error);
    return null;
  }
}

async function sendLibraryEpisodeOsNotification(options: {
  animeId: number;
  episode: number;
  animeTitle: string;
  image?: string;
  skipDedupe?: boolean;
}) {
  const animeId = Math.max(1, Math.floor(Number(options.animeId) || 0));
  const episode = Math.max(1, Math.floor(Number(options.episode) || 0));
  if (animeId <= 0 || episode <= 0) return;

  if (!options.skipDedupe) {
    const now = Date.now();
    const dedupeKey = `${animeId}|${episode}`;
    const lastSentAt = lastOsNotificationSentAtByKey.get(dedupeKey) ?? 0;
    if (now - lastSentAt < OS_NOTIFICATION_DEDUPE_WINDOW_MS) return;
    lastOsNotificationSentAtByKey.set(dedupeKey, now);
  }

  const title = options.animeTitle?.trim() || 'Anime';
  const message = `Episode ${episode} is now available.`;
  const posterUrl = resolveNotificationIconUrl(options.image);

  if (isTauriRuntime()) {
    try {
      const notificationModule = await import('@tauri-apps/plugin-notification');
      const permission = await notificationModule.requestPermission();
      if (permission === 'granted') {
        const mediaUrl = (await resolveTauriAttachmentUrl(posterUrl, animeId)) ?? posterUrl;
        notificationModule.sendNotification({
          title,
          body: message,
          icon: mediaUrl,
          attachments: mediaUrl
            ? [
                {
                  id: `poster-${animeId}`,
                  url: mediaUrl,
                },
              ]
            : undefined,
          extra: {
            animeId,
            episode,
          },
        });
        return;
      }
    } catch {
      // Ignore Tauri notification channel failures and continue.
    }
  }

  try {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        const notification = new Notification(title, {
          body: message,
          icon: posterUrl,
        });
        notification.onclick = () => {
          window.focus();
        };
      } else if (Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          const notification = new Notification(title, {
            body: message,
            icon: posterUrl,
          });
          notification.onclick = () => {
            window.focus();
          };
        }
      }
    }
  } catch {
    // Ignore web notification channel failures and continue.
  }
}

function findLibraryNotificationAnime(
  libraryItems: Record<number, LibraryAnimeItem>,
  notification: LibraryNotificationFeedItem,
): AnimeSummary | null {
  const direct = libraryItems[notification.animeId];
  const byCanonical = Object.values(libraryItems).find(
    (item) => resolveLibraryAnimeId(item.animeId, item.jikanId) === notification.animeId,
  );
  const source = direct ?? byCanonical;
  if (!source) return null;

  return {
    id: source.jikanId ?? source.animeId,
    jikanId: source.jikanId,
    animeScheduleRoute: source.animeScheduleRoute,
    title: source.title,
    titleEnglish: source.titleEnglish,
    titleJapanese: source.titleJapanese,
    image: source.image,
    synopsis: '',
    studios: [],
    genres: [],
    mediaType: source.mediaType,
    year: source.year,
    episodes: source.episodes,
    currentEpisode: source.currentEpisode,
  };
}

function bindLibraryNotificationActionListener(getState: () => AppState) {
  if (libraryNotificationActionListenerBound || !isTauriRuntime()) return;
  libraryNotificationActionListenerBound = true;

  void import('@tauri-apps/plugin-notification')
    .then((notificationModule) =>
      notificationModule.onAction((notification) => {
        const extra = notification.extra as Record<string, unknown> | undefined;
        const animeId = Math.max(1, Math.floor(Number(extra?.animeId) || 0));
        const episode = Math.max(1, Math.floor(Number(extra?.episode) || 0));
        if (animeId <= 0 || episode <= 0) return;

        const current = getState();
        const match = current.libraryNotifications.find(
          (entry) => entry.animeId === animeId && entry.episode === episode,
        );
        if (match) {
          void current.playLibraryNotification(match.id);
        }
      }),
    )
    .catch(() => {
      libraryNotificationActionListenerBound = false;
    });
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
  isAnimeScheduleRateLimitGuideOpen: false,
  animeScheduleRateLimitGuideDismissedDate: null,
  animeScheduleRateLimitGuideLastTriggeredAt: null,
  selectedAnime: null,
  currentlyPlayingItem: null,
  queue: [],
  queueCursor: -1,
  playlists: [],
  watchHistory: [],
  favorites: [],
  libraryItems: {},
  libraryStatusNotificationSettings: getDefaultLibraryStatusNotificationSettings(),
  libraryLastNotifiedEpisodeByAnimeId: {},
  libraryNotifications: [],
  actionToasts: [],
  libraryLastDailyEpisodeCheckDate: null,
  watchProgress: {},
  homeRefreshVersion: 0,
  isPlaying: false,
  playbackTime: 0,
  playbackDuration: 0,
  trailerVolume: 72,
  trailerLastNonZeroVolume: 72,
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
  allowNsfw: false,
  upcomingSeasonFilter: 'all',
  animeSkipButtonSegment: null,
  baseCatalogSource: DEFAULT_BASE_CATALOG_SOURCE,
  animeScheduleApiToken: DEFAULT_ANIMESCHEDULE_TOKEN,
  playbackSupportMode: 'fully-supported',
  isResolvingPlaybackSource: false,
  selectedSourceOptionId: null,
  selectedSubtitleId: null,
  subtitleFontColor: '#ffffff',
  subtitleFontSizeDocked: 19,
  subtitleFontSizeExpanded: 38,
  subtitleFontSizeFullscreen: 45,
  subtitleDropShadow: true,
  subtitleBackgroundHighlight: false,
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
        rawAllowNsfw,
        rawUpcomingSeasonFilter,
        rawBaseCatalogSource,
        rawAnimeScheduleApiToken,
        animeScheduleRateLimitGuideDismissedDate,
        rawSubtitleFontColor,
        rawLegacySubtitleFontSize,
        rawSubtitleFontSizeDocked,
        rawSubtitleFontSizeExpanded,
        rawSubtitleFontSizeFullscreen,
        rawSubtitleDropShadow,
        rawSubtitleBackgroundHighlight,
        isTrailerMuted,
        rawTrailerVolume,
        rawTrailerLastNonZeroVolume,
        rawSelectedSourceOptionId,
        rawSelectedSubtitleId,
        rawCurrentlyPlayingItem,
        rawQueue,
        rawQueueCursor,
        playlists,
        favorites,
        rawLibraryItems,
        rawLibraryStatusNotificationSettings,
        rawLibraryLastNotifiedEpisodeByAnimeId,
        rawLibraryNotifications,
        rawLibraryLastDailyEpisodeCheckDate,
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
        getStoredValue('allowNsfw', false),
        getStoredValue('upcomingSeasonFilter', 'all' as UpcomingSeasonFilter),
        getStoredValue('baseCatalogSource', DEFAULT_BASE_CATALOG_SOURCE),
        getStoredValue('animeScheduleApiToken', DEFAULT_ANIMESCHEDULE_TOKEN),
        getStoredValue('animeScheduleRateLimitGuideDismissedDate', null),
        getStoredValue('subtitleFontColor', '#ffffff'),
        getStoredValue('subtitleFontSize', 22),
        getStoredValue('subtitleFontSizeDocked', 19),
        getStoredValue('subtitleFontSizeExpanded', 38),
        getStoredValue('subtitleFontSizeFullscreen', 45),
        getStoredValue('subtitleDropShadow', true),
        getStoredValue('subtitleBackgroundHighlight', false),
        getStoredValue('isTrailerMuted', false),
        getStoredValue('trailerVolume', 72),
        getStoredValue('trailerLastNonZeroVolume', 72),
        getStoredValue('selectedSourceOptionId', null),
        getStoredValue('selectedSubtitleId', null),
        getStoredValue('currentlyPlayingItem', null),
        getStoredValue('queue', []),
        getStoredValue('queueCursor', -1),
        getStoredValue('playlists', []),
        getStoredValue('favorites', []),
        getStoredValue('libraryItems', {}),
        getStoredValue('libraryStatusNotificationSettings', getDefaultLibraryStatusNotificationSettings()),
        getStoredValue('libraryLastNotifiedEpisodeByAnimeId', {}),
        getStoredValue('libraryNotifications', []),
        getStoredValue('libraryLastDailyEpisodeCheckDate', null),
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

      const allowNsfw = Boolean(rawAllowNsfw);
      if (rawAllowNsfw !== allowNsfw) {
        await setStoredValue('allowNsfw', allowNsfw);
      }

      const upcomingSeasonFilter = normalizeUpcomingSeasonFilter(rawUpcomingSeasonFilter);
      if (rawUpcomingSeasonFilter !== upcomingSeasonFilter) {
        await setStoredValue('upcomingSeasonFilter', upcomingSeasonFilter);
      }

      const animeScheduleApiToken = normalizeAnimeScheduleApiToken(rawAnimeScheduleApiToken);
      if (rawAnimeScheduleApiToken !== animeScheduleApiToken) {
        await setStoredValue('animeScheduleApiToken', animeScheduleApiToken);
      }

      const subtitleFontColor = normalizeSubtitleColor(rawSubtitleFontColor);
      if (rawSubtitleFontColor !== subtitleFontColor) {
        await setStoredValue('subtitleFontColor', subtitleFontColor);
      }

      let subtitleFontSizeDocked = normalizeSubtitleFontSize(rawSubtitleFontSizeDocked);
      let subtitleFontSizeExpanded = normalizeSubtitleFontSize(rawSubtitleFontSizeExpanded);
      let subtitleFontSizeFullscreen = normalizeSubtitleFontSize(rawSubtitleFontSizeFullscreen);

      const legacySubtitleFontSize = normalizeSubtitleFontSize(rawLegacySubtitleFontSize);
      const looksLikeLegacyUniformMigration =
        subtitleFontSizeDocked === subtitleFontSizeExpanded &&
        subtitleFontSizeExpanded === subtitleFontSizeFullscreen &&
        subtitleFontSizeDocked === legacySubtitleFontSize &&
        legacySubtitleFontSize !== 22;

      if (looksLikeLegacyUniformMigration) {
        subtitleFontSizeDocked = 19;
        subtitleFontSizeExpanded = 38;
        subtitleFontSizeFullscreen = 45;
      }

      if (rawSubtitleFontSizeDocked !== subtitleFontSizeDocked) {
        await setStoredValue('subtitleFontSizeDocked', subtitleFontSizeDocked);
      }

      if (rawSubtitleFontSizeExpanded !== subtitleFontSizeExpanded) {
        await setStoredValue('subtitleFontSizeExpanded', subtitleFontSizeExpanded);
      }

      if (rawSubtitleFontSizeFullscreen !== subtitleFontSizeFullscreen) {
        await setStoredValue('subtitleFontSizeFullscreen', subtitleFontSizeFullscreen);
      }

      const subtitleDropShadow = Boolean(rawSubtitleDropShadow);
      if (rawSubtitleDropShadow !== subtitleDropShadow) {
        await setStoredValue('subtitleDropShadow', subtitleDropShadow);
      }

      const subtitleBackgroundHighlight = Boolean(rawSubtitleBackgroundHighlight);
      if (rawSubtitleBackgroundHighlight !== subtitleBackgroundHighlight) {
        await setStoredValue('subtitleBackgroundHighlight', subtitleBackgroundHighlight);
      }

      const trailerVolume = normalizeTrailerVolume(rawTrailerVolume);
      if (rawTrailerVolume !== trailerVolume) {
        await setStoredValue('trailerVolume', trailerVolume);
      }

      const trailerLastNonZeroVolume = normalizeTrailerLastNonZeroVolume(
        rawTrailerLastNonZeroVolume,
        trailerVolume > 0 ? trailerVolume : 72,
      );
      if (rawTrailerLastNonZeroVolume !== trailerLastNonZeroVolume) {
        await setStoredValue('trailerLastNonZeroVolume', trailerLastNonZeroVolume);
      }

      const selectedSourceOptionId = normalizeOptionalText(rawSelectedSourceOptionId);
      if (rawSelectedSourceOptionId !== selectedSourceOptionId) {
        await setStoredValue('selectedSourceOptionId', selectedSourceOptionId);
      }

      const selectedSubtitleId = normalizeOptionalText(rawSelectedSubtitleId);
      if (rawSelectedSubtitleId !== selectedSubtitleId) {
        await setStoredValue('selectedSubtitleId', selectedSubtitleId);
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

      const libraryItems = normalizeLibraryItems(rawLibraryItems);
      if (JSON.stringify(rawLibraryItems) !== JSON.stringify(libraryItems)) {
        await setStoredValue('libraryItems', libraryItems);
      }

      const libraryStatusNotificationSettings = normalizeLibraryStatusNotificationSettings(rawLibraryStatusNotificationSettings);
      if (JSON.stringify(rawLibraryStatusNotificationSettings) !== JSON.stringify(libraryStatusNotificationSettings)) {
        await setStoredValue('libraryStatusNotificationSettings', libraryStatusNotificationSettings);
      }

      const libraryLastNotifiedEpisodeByAnimeId = normalizeLibraryLastNotifiedEpisodeMap(rawLibraryLastNotifiedEpisodeByAnimeId);
      if (JSON.stringify(rawLibraryLastNotifiedEpisodeByAnimeId) !== JSON.stringify(libraryLastNotifiedEpisodeByAnimeId)) {
        await setStoredValue('libraryLastNotifiedEpisodeByAnimeId', libraryLastNotifiedEpisodeByAnimeId);
      }

      const libraryNotifications = normalizeLibraryNotifications(rawLibraryNotifications);
      if (JSON.stringify(rawLibraryNotifications) !== JSON.stringify(libraryNotifications)) {
        await setStoredValue('libraryNotifications', libraryNotifications);
      }

      const libraryLastDailyEpisodeCheckDate =
        typeof rawLibraryLastDailyEpisodeCheckDate === 'string' && rawLibraryLastDailyEpisodeCheckDate.trim().length > 0
          ? rawLibraryLastDailyEpisodeCheckDate
          : null;
      if (rawLibraryLastDailyEpisodeCheckDate !== libraryLastDailyEpisodeCheckDate) {
        await setStoredValue('libraryLastDailyEpisodeCheckDate', libraryLastDailyEpisodeCheckDate);
      }

      const restoredProgressEntry = currentlyPlayingItem
        ? findWatchProgressEntryForAnime(currentlyPlayingItem.anime, watchProgress)
        : null;
      const restoredEpisodeNumber = Math.max(1, Math.round(currentlyPlayingItem?.episodeNumber ?? 1));
      const canResumeRestoredItem =
        Boolean(currentlyPlayingItem) &&
        currentlyPlayingItem?.kind === 'episode' &&
        Boolean(restoredProgressEntry) &&
        Math.max(1, Math.round(restoredProgressEntry?.episode ?? 1)) === restoredEpisodeNumber;
      const restoredPlaybackTime = canResumeRestoredItem
        ? Math.max(0, Math.floor(restoredProgressEntry?.lastPlaybackSeconds ?? 0))
        : 0;
      const restoredPlaybackDuration = canResumeRestoredItem
        ? Math.max(0, Math.floor(restoredProgressEntry?.episodeDurationSeconds ?? 0))
        : 0;

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
        allowNsfw,
        upcomingSeasonFilter,
        animeSkipButtonSegment: null,
        baseCatalogSource,
        animeScheduleApiToken,
        subtitleFontColor,
        subtitleFontSizeDocked,
        subtitleFontSizeExpanded,
        subtitleFontSizeFullscreen,
        subtitleDropShadow,
        subtitleBackgroundHighlight,
        playbackSupportMode: 'fully-supported',
        isResolvingPlaybackSource: false,
        selectedSourceOptionId,
        selectedSubtitleId,
        isTrailerMuted,
        isProfilePopupOpen: false,
        isSettingsOpen: false,
        isAnimeScheduleRateLimitGuideOpen: false,
        animeScheduleRateLimitGuideDismissedDate,
        animeScheduleRateLimitGuideLastTriggeredAt: null,
        currentlyPlayingItem,
        queue,
        queueCursor,
        playlists,
        watchHistory: sortHistory(watchHistory),
        favorites,
        libraryItems,
        libraryStatusNotificationSettings,
        libraryLastNotifiedEpisodeByAnimeId,
        libraryNotifications,
        libraryLastDailyEpisodeCheckDate,
        watchProgress,
        homeRefreshVersion: 0,
        playbackTime: restoredPlaybackTime,
        playbackDuration: restoredPlaybackDuration,
        trailerVolume,
        trailerLastNonZeroVolume,
        activePlaybackUrl: null,
        pendingSeekTo: restoredPlaybackTime > 0 ? restoredPlaybackTime : null,
        isTrailerPlayerReady: false,
      });

      bindLibraryNotificationActionListener(get);

      void get().runLibraryEpisodeDailyCheck();
      ensureLibraryEpisodePolling(() => {
        void get().runLibraryEpisodeDailyCheck();
      });

      if (!animeScheduleRateLimitListenerBound) {
        onAnimeScheduleRateLimit((event) => {
          const current = get();
          const today = getLocalDateStamp();
          if (current.isAnimeScheduleRateLimitGuideOpen) return;
          if (current.animeScheduleRateLimitGuideDismissedDate === today) return;

          set({
            isAnimeScheduleRateLimitGuideOpen: true,
            animeScheduleRateLimitGuideLastTriggeredAt: event.occurredAt,
          });
        });
        animeScheduleRateLimitListenerBound = true;
      }
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
        allowNsfw: false,
        upcomingSeasonFilter: 'all',
        episodeMetadata: null,
        animeSkipButtonSegment: null,
        baseCatalogSource: DEFAULT_BASE_CATALOG_SOURCE,
        animeScheduleApiToken: DEFAULT_ANIMESCHEDULE_TOKEN,
        subtitleFontColor: '#ffffff',
        subtitleFontSizeDocked: 19,
        subtitleFontSizeExpanded: 38,
        subtitleFontSizeFullscreen: 45,
        subtitleDropShadow: true,
        subtitleBackgroundHighlight: false,
        playbackSupportMode: 'fully-supported',
        isResolvingPlaybackSource: false,
        selectedSourceOptionId: null,
        selectedSubtitleId: null,
        isTrailerMuted: false,
        isProfilePopupOpen: false,
        isSettingsOpen: false,
        isAnimeScheduleRateLimitGuideOpen: false,
        animeScheduleRateLimitGuideDismissedDate: null,
        animeScheduleRateLimitGuideLastTriggeredAt: null,
        currentlyPlayingItem: null,
        queue: [],
        queueCursor: -1,
        playlists: [],
        watchHistory: [],
        favorites: [],
        libraryItems: {},
        libraryStatusNotificationSettings: getDefaultLibraryStatusNotificationSettings(),
        libraryLastNotifiedEpisodeByAnimeId: {},
        libraryNotifications: [],
        libraryLastDailyEpisodeCheckDate: null,
        watchProgress: {},
        homeRefreshVersion: 0,
        playbackTime: 0,
        playbackDuration: 0,
        trailerVolume: 72,
        trailerLastNonZeroVolume: 72,
        activePlaybackUrl: null,
        pendingSeekTo: null,
        isTrailerPlayerReady: false,
      });

      bindLibraryNotificationActionListener(get);

      void get().runLibraryEpisodeDailyCheck();
      ensureLibraryEpisodePolling(() => {
        void get().runLibraryEpisodeDailyCheck();
      });

      if (!animeScheduleRateLimitListenerBound) {
        onAnimeScheduleRateLimit((event) => {
          const current = get();
          const today = getLocalDateStamp();
          if (current.isAnimeScheduleRateLimitGuideOpen) return;
          if (current.animeScheduleRateLimitGuideDismissedDate === today) return;

          set({
            isAnimeScheduleRateLimitGuideOpen: true,
            animeScheduleRateLimitGuideLastTriggeredAt: event.occurredAt,
          });
        });
        animeScheduleRateLimitListenerBound = true;
      }
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
      selectedSubtitleId: null,
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
        trailerVolume: 72,
        activePlaybackUrl: null,
        episodeMetadata: null,
        pendingSeekTo: null,
        isTrailerPlayerReady: false,
        animeSkipButtonSegment: null,
        selectedSourceOptionId: null,
        selectedSubtitleId: null,
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
      selectedSubtitleId: null,
    });

  },

  playAnimeSeries: async (anime) => {
    const resumeEntry = findWatchProgressEntryForAnime(anime, get().watchProgress);
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

    const episodeResolution = await resolveQueueEpisodeResolution(anime);
    const queueAnime: AnimeSummary = {
      ...anime,
      jikanId: anime.jikanId ?? episodeResolution.resolvedJikanId,
      currentEpisode: episodeResolution.latestEpisode,
    };
    const items = buildQueuePlayableItems(queueAnime);
    await get().replaceQueueAndPlay(items, 0);
  },

  playEpisode: async (anime, episodeNumber) => {
    const safeEpisode = Math.max(1, Math.round(episodeNumber || 1));
    await get().replaceQueueAndPlay([makeEpisodeItem(anime, safeEpisode, 'episode-card')], 0);
  },

  playTrailer: async (anime) => {
    let trailerAnime = anime;
    const hasTrailer = Boolean(anime.trailerUrl?.trim());
    const currentItem = get().currentlyPlayingItem;
    const currentTrailerUrl = get().activePlaybackUrl?.trim() ?? '';
    const sameAnimeAsCurrent =
      currentItem?.kind === 'trailer' &&
      getCanonicalAnimeId(currentItem.anime) === getCanonicalAnimeId(anime);

    if (!hasTrailer && sameAnimeAsCurrent && currentTrailerUrl) {
      trailerAnime = {
        ...anime,
        trailerUrl: currentTrailerUrl,
      };
    }

    await get().replaceQueueAndPlay([makeTrailerItem(trailerAnime)], 0);

    if (!trailerAnime.trailerUrl?.trim()) {
      const detailAnimeId = anime.jikanId ?? anime.id;
      const resolvedTrailerUrl = await getAnimeTrailerUrl(detailAnimeId);
      if (resolvedTrailerUrl?.trim()) {
        trailerAnime = {
          ...anime,
          trailerUrl: resolvedTrailerUrl,
        };
        await get().replaceQueueAndPlay([makeTrailerItem(trailerAnime)], 0);
      }
    }
  },

  addAnimeSeriesToQueue: async (anime) => {
    const episodeResolution = await resolveQueueEpisodeResolution(anime);
    const queueAnime: AnimeSummary = {
      ...anime,
      jikanId: anime.jikanId ?? episodeResolution.resolvedJikanId,
      currentEpisode: episodeResolution.latestEpisode,
    };
    const additions = buildQueuePlayableItems(queueAnime);
    const existingQueue = get().queue;
    const mergedQueue = [...existingQueue, ...additions];
    await setStoredValue('queue', mergedQueue);
    set({ queue: mergedQueue });
    get().pushActionToast({
      kind: 'queue',
      message: `${anime.title} added to queue (${additions.length}).`,
    });
  },

  addEpisodeToQueue: async (anime, episodeNumber) => {
    const safeEpisode = Math.max(1, Math.round(episodeNumber || 1));
    const item = makeEpisodeItem(anime, safeEpisode, 'episode-card');
    const existingQueue = get().queue;
    const mergedQueue = [...existingQueue, item];
    await setStoredValue('queue', mergedQueue);
    set({ queue: mergedQueue });
    get().pushActionToast({
      kind: 'queue',
      message: `${anime.title} episode ${safeEpisode} added to queue.`,
    });
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
      selectedSubtitleId: null,
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
    const currentIndexFromCursor = currentCursor >= 0 && currentCursor < queue.length ? currentCursor : -1;
    const currentIndexFromItem = currentItem ? queue.findIndex((item) => item.id === currentItem.id) : -1;
    const currentIndex = currentIndexFromItem >= 0 ? currentIndexFromItem : currentIndexFromCursor;
    const { shuffleEnabled, repeatMode } = get();

    if (fromEnded && repeatMode === 'one' && currentItem) {
      const repeatIndex = currentIndex >= 0 ? currentIndex : 0;
      await get().replaceQueueAndPlay(queue, repeatIndex);
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
        selectedSubtitleId: null,
      });

      return;
    }

    const nextIndex = currentIndex >= 0 ? currentIndex + 1 : 0;

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

  setAnimeLibraryStatus: async (anime, status) => {
    if (!isLibraryStatus(status)) return;
    const current = get();
    const initialAnimeId = getCanonicalAnimeId(anime);

    let canonicalJikanId = Number.isFinite(anime.jikanId) && Number(anime.jikanId) > 0
      ? Math.floor(Number(anime.jikanId))
      : undefined;

    if (!canonicalJikanId) {
      canonicalJikanId = await resolveCanonicalDetailRouteId(anime).catch(() => undefined);
    }

    let resolvedAnime: AnimeSummary = canonicalJikanId ? { ...anime, jikanId: canonicalJikanId } : anime;
    let jikanDetailBundle: Awaited<ReturnType<typeof getJikanDetailEpisodeBundle>> | null = null;

    if (canonicalJikanId) {
      jikanDetailBundle = await getJikanDetailEpisodeBundle(canonicalJikanId, 1).catch(() => null);
      const detail = jikanDetailBundle?.detail;
      if (detail) {
        resolvedAnime = {
          ...anime,
          id: canonicalJikanId,
          jikanId: canonicalJikanId,
          title: detail.title || anime.title,
          titleEnglish: detail.titleEnglish ?? anime.titleEnglish,
          titleJapanese: detail.titleJapanese ?? anime.titleJapanese,
          image: detail.image || anime.image,
          synopsis: detail.synopsis || anime.synopsis,
          studios: detail.studios?.length ? detail.studios : anime.studios,
          genres: detail.genres?.length ? detail.genres : anime.genres,
          mediaType: detail.mediaType ?? anime.mediaType,
          year: detail.year ?? anime.year,
          episodes: detail.episodes ?? anime.episodes,
          currentEpisode: detail.currentEpisode ?? anime.currentEpisode,
          status: detail.status ?? anime.status,
          trailerUrl: detail.trailerUrl ?? anime.trailerUrl,
        };
      }
    }

    const animeId = getCanonicalAnimeId(resolvedAnime);
    const existing = Object.values(current.libraryItems).find(
      (item) => resolveLibraryAnimeId(item.animeId, item.jikanId) === animeId,
    );
    const libraryLastNotifiedEpisodeByAnimeId = { ...current.libraryLastNotifiedEpisodeByAnimeId };

    let baselineEpisode = Math.max(
      0,
      Math.floor(Number(existing?.currentEpisode ?? resolvedAnime.currentEpisode ?? 0) || 0),
    );

    if (!existing && baselineEpisode <= 0) {
      const bundle = canonicalJikanId
        ? (jikanDetailBundle ?? await getJikanDetailEpisodeBundle(canonicalJikanId, 1).catch(() => null))
        : null;
      const resolvedLatestEpisode = Math.max(
        0,
        Math.floor(
          Number(
            resolvedAnime.currentEpisode ??
              bundle?.detail?.currentEpisode ??
              0,
          ) || 0,
        ),
      );
      if (resolvedLatestEpisode > 0) {
        baselineEpisode = resolvedLatestEpisode;
      }
    }

    if (!existing && baselineEpisode > 0) {
      libraryLastNotifiedEpisodeByAnimeId[animeId] = baselineEpisode;
      if (resolvedAnime.jikanId && resolvedAnime.jikanId > 0) {
        libraryLastNotifiedEpisodeByAnimeId[Math.floor(resolvedAnime.jikanId)] = baselineEpisode;
      }
    }

    const libraryItems = { ...current.libraryItems };
    const duplicateIds: number[] = [];
    for (const [rawId, item] of Object.entries(libraryItems)) {
      const itemId = Math.max(1, Math.floor(Number(rawId) || 0));
      const itemCanonicalId = resolveLibraryAnimeId(item.animeId, item.jikanId);
      if (itemCanonicalId !== animeId) continue;
      duplicateIds.push(itemId);
      delete libraryItems[itemId];
    }

    libraryItems[animeId] = {
      ...buildLibraryItemFromAnime(resolvedAnime, status, existing),
      currentEpisode: baselineEpisode > 0 ? baselineEpisode : resolvedAnime.currentEpisode,
    };

    for (const duplicateId of duplicateIds) {
      if (duplicateId === animeId) continue;
      delete libraryLastNotifiedEpisodeByAnimeId[duplicateId];
    }

    if (animeId !== initialAnimeId && initialAnimeId in libraryItems) {
      delete libraryItems[initialAnimeId];
      delete libraryLastNotifiedEpisodeByAnimeId[initialAnimeId];
    }

    await Promise.all([
      setStoredValue('libraryItems', libraryItems),
      setStoredValue('libraryLastNotifiedEpisodeByAnimeId', libraryLastNotifiedEpisodeByAnimeId),
    ]);
    set({ libraryItems, libraryLastNotifiedEpisodeByAnimeId });
    get().pushActionToast({
      kind: 'library',
      message: `${resolvedAnime.title} set to ${status.replace(/-/g, ' ')}.`,
    });
  },

  removeAnimeFromLibrary: async (animeId) => {
    const normalizedAnimeId = Math.max(1, Math.floor(Number(animeId) || 0));
    if (normalizedAnimeId <= 0) return;

    const current = get();
    const libraryItems = { ...current.libraryItems };
    const candidateIds = new Set<number>([normalizedAnimeId]);

    const byId = libraryItems[normalizedAnimeId];
    if (byId?.jikanId) {
      candidateIds.add(Math.max(1, Math.floor(byId.jikanId)));
    }

    for (const [itemIdRaw, item] of Object.entries(libraryItems)) {
      const itemId = Math.max(1, Math.floor(Number(itemIdRaw) || 0));
      if (candidateIds.has(itemId) || candidateIds.has(Math.max(1, Math.floor(item.jikanId || 0)))) {
        delete libraryItems[itemId];
      }
    }

    const libraryLastNotifiedEpisodeByAnimeId = { ...current.libraryLastNotifiedEpisodeByAnimeId };
    for (const itemId of candidateIds) {
      delete libraryLastNotifiedEpisodeByAnimeId[itemId];
    }

    await Promise.all([
      setStoredValue('libraryItems', libraryItems),
      setStoredValue('libraryLastNotifiedEpisodeByAnimeId', libraryLastNotifiedEpisodeByAnimeId),
    ]);

    set({ libraryItems, libraryLastNotifiedEpisodeByAnimeId });
  },

  getLibraryStatusForAnime: (animeId, jikanId) => {
    const current = get();
    const targetAnimeId = Math.max(1, Math.floor(Number(animeId) || 0));
    const targetJikanId = Math.max(1, Math.floor(Number(jikanId) || 0));

    const direct = current.libraryItems[targetAnimeId];
    if (direct) return direct.status;

    if (targetJikanId > 0 && current.libraryItems[targetJikanId]) {
      return current.libraryItems[targetJikanId].status;
    }

    const byJikan = Object.values(current.libraryItems).find((item) => item.jikanId && Math.floor(item.jikanId) === targetJikanId);
    return byJikan?.status ?? null;
  },

  setLibraryStatusNotificationEnabled: async (status, enabled) => {
    if (!isLibraryStatus(status)) return;
    const current = get();
    const libraryStatusNotificationSettings = {
      ...current.libraryStatusNotificationSettings,
      [status]: Boolean(enabled),
    };
    await setStoredValue('libraryStatusNotificationSettings', libraryStatusNotificationSettings);
    set({ libraryStatusNotificationSettings });
  },

  markLibraryNotificationRead: (notificationId) => {
    const current = get();
    const libraryNotifications = current.libraryNotifications.map((item) =>
      item.id === notificationId ? { ...item, read: true } : item,
    );
    void setStoredValue('libraryNotifications', libraryNotifications);
    set({ libraryNotifications });
  },

  playLibraryNotification: async (notificationId) => {
    const current = get();
    const notification = current.libraryNotifications.find((item) => item.id === notificationId);
    if (!notification) return;

    const anime = findLibraryNotificationAnime(current.libraryItems, notification);
    if (!anime) {
      current.markLibraryNotificationRead(notificationId);
      return;
    }

    await current.playEpisode(anime, Math.max(1, notification.episode));
    current.markLibraryNotificationRead(notificationId);
  },

  testWindowsNotification: async (animeTitle, episode, count = 1) => {
    const safeEpisode = Math.max(1, Math.floor(Number(episode) || 1));
    const safeCount = Math.min(30, Math.max(1, Math.floor(Number(count) || 1)));

    for (let index = 0; index < safeCount; index += 1) {
      await sendLibraryEpisodeOsNotification({
        animeId: 1996,
        episode: safeEpisode + index,
        animeTitle: animeTitle?.trim() || 'My Anime 1996',
        image: DEFAULT_NOTIFICATION_POSTER,
        skipDedupe: true,
      });
    }
  },

  markAllLibraryNotificationsRead: () => {
    const current = get();
    const libraryNotifications = current.libraryNotifications.map((item) => ({ ...item, read: true }));
    void setStoredValue('libraryNotifications', libraryNotifications);
    set({ libraryNotifications });
  },

  clearLibraryNotifications: async () => {
    await setStoredValue('libraryNotifications', []);
    set({ libraryNotifications: [] });
  },

  pushActionToast: (toast) => {
    const toastId = createId('action-toast');
    const nextToast: InAppActionToast = {
      id: toastId,
      kind: toast.kind,
      message: toast.message,
    };

    const existingTimer = actionToastTimers.get(toastId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      actionToastTimers.delete(toastId);
    }

    set((current) => {
      const nextToasts = [nextToast, ...current.actionToasts].slice(0, MAX_ACTION_TOASTS);

      if (current.actionToasts.length >= MAX_ACTION_TOASTS) {
        const removed = current.actionToasts.slice(MAX_ACTION_TOASTS - 1);
        removed.forEach((entry) => {
          const timer = actionToastTimers.get(entry.id);
          if (timer) {
            clearTimeout(timer);
            actionToastTimers.delete(entry.id);
          }
        });
      }

      return { actionToasts: nextToasts };
    });

    const timer = setTimeout(() => {
      actionToastTimers.delete(toastId);
      set((current) => ({
        actionToasts: current.actionToasts.filter((entry) => entry.id !== toastId),
      }));
    }, ACTION_TOAST_DURATION_MS);

    actionToastTimers.set(toastId, timer);
  },

  dismissActionToast: (toastId) => {
    const timer = actionToastTimers.get(toastId);
    if (timer) {
      clearTimeout(timer);
      actionToastTimers.delete(toastId);
    }
    set((current) => ({ actionToasts: current.actionToasts.filter((entry) => entry.id !== toastId) }));
  },

  runLibraryEpisodeDailyCheck: async (_force = false) => {
    if (libraryEpisodeCheckInFlight) {
      await (libraryEpisodeCheckPromise ?? Promise.resolve());
      return;
    }
    libraryEpisodeCheckInFlight = true;

    libraryEpisodeCheckPromise = (async () => {
      try {
    const current = get();
    if (!current.hydrated) return;

    const today = getLocalDateStamp();

    const candidates = Object.values(current.libraryItems);
    if (candidates.length === 0) {
      await setStoredValue('libraryLastDailyEpisodeCheckDate', today);
      set({ libraryLastDailyEpisodeCheckDate: today });
      return;
    }

    const libraryLastNotifiedEpisodeByAnimeId = { ...current.libraryLastNotifiedEpisodeByAnimeId };
    const nextNotifications = [...current.libraryNotifications];
    const libraryItems = { ...current.libraryItems };

    for (const item of candidates) {
      const detailJikanId = item.jikanId && item.jikanId > 0
        ? Math.floor(item.jikanId)
        : await resolveCanonicalDetailRouteId({
          id: item.animeId,
          jikanId: item.jikanId,
          animeScheduleRoute: item.animeScheduleRoute,
        }).catch(() => undefined);
      if (!detailJikanId || detailJikanId <= 0) continue;

      const episodeBundle = await getJikanDetailEpisodeBundle(detailJikanId, 1).catch(() => null);
      if (!episodeBundle?.detail) continue;

      const latestEpisode = Math.max(
        0,
        Math.floor(
          Number(
            episodeBundle.detail.currentEpisode ??
              item.currentEpisode ??
              0,
          ) || 0,
        ),
      );
      if (latestEpisode <= 0) continue;

      libraryItems[item.animeId] = {
        ...item,
        currentEpisode: latestEpisode,
        updatedAt: new Date().toISOString(),
      };

      const resolvedAnimeId = resolveLibraryAnimeId(item.animeId, item.jikanId);
      const progressEntry = current.watchProgress[resolvedAnimeId] ?? current.watchProgress[item.animeId];
      const lastNotifiedEpisode = Math.max(
        0,
        Math.floor(
          Number(
            libraryLastNotifiedEpisodeByAnimeId[item.animeId] ??
              libraryLastNotifiedEpisodeByAnimeId[resolvedAnimeId] ??
              progressEntry?.episode ??
              0,
          ) || 0,
        ),
      );

      if (latestEpisode <= lastNotifiedEpisode) continue;

      const title =
        episodeBundle.detail.titleEnglish?.trim() ||
        episodeBundle.detail.title?.trim() ||
        item.titleEnglish?.trim() ||
        item.title?.trim() ||
        'Anime';

      for (let episode = lastNotifiedEpisode + 1; episode <= latestEpisode; episode += 1) {
        const message = `Episode ${episode} is now available.`;
        nextNotifications.unshift({
          id: createId('library-notification'),
          animeId: item.animeId,
          episode,
          title,
          image: item.image,
          message,
          createdAt: new Date().toISOString(),
          channel: 'in-app',
          read: false,
        });
        await sendLibraryEpisodeOsNotification({
          animeId: resolvedAnimeId,
          episode,
          animeTitle: title,
          image: episodeBundle.detail.image || item.image,
        });
      }

      libraryLastNotifiedEpisodeByAnimeId[item.animeId] = latestEpisode;
      if (resolvedAnimeId !== item.animeId) {
        libraryLastNotifiedEpisodeByAnimeId[resolvedAnimeId] = latestEpisode;
      }
    }

    const libraryNotifications = normalizeLibraryNotifications(nextNotifications);

    await Promise.all([
      setStoredValue('libraryItems', libraryItems),
      setStoredValue('libraryLastNotifiedEpisodeByAnimeId', libraryLastNotifiedEpisodeByAnimeId),
      setStoredValue('libraryNotifications', libraryNotifications),
      setStoredValue('libraryLastDailyEpisodeCheckDate', today),
    ]);

    set({
      libraryItems,
      libraryLastNotifiedEpisodeByAnimeId,
      libraryNotifications,
      libraryLastDailyEpisodeCheckDate: today,
    });
      } finally {
        libraryEpisodeCheckInFlight = false;
        libraryEpisodeCheckPromise = null;
      }
    })();

    await libraryEpisodeCheckPromise;
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
    const safe = Math.max(0, Math.min(200, Math.round(volume)));
    if (safe > 0) {
      void Promise.all([
        setStoredValue('trailerVolume', safe),
        setStoredValue('trailerLastNonZeroVolume', safe),
      ]);
      set({ trailerVolume: safe, trailerLastNonZeroVolume: safe });
      return;
    }
    void setStoredValue('trailerVolume', safe);
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

    set({ importedSourcePlugins, pluginPriority, pluginEnabled, preferredSourcePluginId, selectedSourceOptionId: null, selectedSubtitleId: null });
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
    set({ pluginEnabled: nextEnabled, preferredSourcePluginId: nextPreferred, selectedSourceOptionId: null, selectedSubtitleId: null });
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
    set({ preferredSourcePluginId: next, selectedSourceOptionId: null, selectedSubtitleId: null });
  },

  setPreferredAudioLanguage: async (language) => {
    const next = language === 'dub' ? 'dub' : 'sub';
    await setStoredValue('preferredAudioLanguage', next);
    set({ preferredAudioLanguage: next, selectedSourceOptionId: null, selectedSubtitleId: null });
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

  setAllowNsfw: async (enabled) => {
    const next = Boolean(enabled);
    await setStoredValue('allowNsfw', next);
    set({ allowNsfw: next, homeRefreshVersion: get().homeRefreshVersion + 1 });
  },

  setUpcomingSeasonFilter: async (filter) => {
    const next = normalizeUpcomingSeasonFilter(filter);
    await setStoredValue('upcomingSeasonFilter', next);
    set({ upcomingSeasonFilter: next, homeRefreshVersion: get().homeRefreshVersion + 1 });
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
    void Promise.all([
      setStoredValue('selectedSourceOptionId', next),
      setStoredValue('selectedSubtitleId', null),
    ]);
    set({ selectedSourceOptionId: next, selectedSubtitleId: null });
  },

  setSelectedSubtitleId: (subtitleId) => {
    const next = normalizeOptionalText(subtitleId);
    void setStoredValue('selectedSubtitleId', next);
    set({ selectedSubtitleId: next });
  },

  setSubtitleFontColor: async (color) => {
    const next = normalizeSubtitleColor(color);
    await setStoredValue('subtitleFontColor', next);
    set({ subtitleFontColor: next });
  },

  setSubtitleFontSizeDocked: async (size) => {
    const next = normalizeSubtitleFontSize(size);
    await setStoredValue('subtitleFontSizeDocked', next);
    set({ subtitleFontSizeDocked: next });
  },

  setSubtitleFontSizeExpanded: async (size) => {
    const next = normalizeSubtitleFontSize(size);
    await setStoredValue('subtitleFontSizeExpanded', next);
    set({ subtitleFontSizeExpanded: next });
  },

  setSubtitleFontSizeFullscreen: async (size) => {
    const next = normalizeSubtitleFontSize(size);
    await setStoredValue('subtitleFontSizeFullscreen', next);
    set({ subtitleFontSizeFullscreen: next });
  },

  setSubtitleDropShadow: async (enabled) => {
    const next = Boolean(enabled);
    await setStoredValue('subtitleDropShadow', next);
    set({ subtitleDropShadow: next });
  },

  setSubtitleBackgroundHighlight: async (enabled) => {
    const next = Boolean(enabled);
    await setStoredValue('subtitleBackgroundHighlight', next);
    set({ subtitleBackgroundHighlight: next });
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

  openAnimeScheduleRateLimitGuide: () => {
    const current = get();
    const today = getLocalDateStamp();
    if (current.isAnimeScheduleRateLimitGuideOpen) return;
    if (current.animeScheduleRateLimitGuideDismissedDate === today) return;

    set({
      isAnimeScheduleRateLimitGuideOpen: true,
      animeScheduleRateLimitGuideLastTriggeredAt: Date.now(),
    });
  },

  closeAnimeScheduleRateLimitGuide: () => {
    set({ isAnimeScheduleRateLimitGuideOpen: false });
  },

  dismissAnimeScheduleRateLimitGuideForToday: async () => {
    const today = getLocalDateStamp();
    await setStoredValue('animeScheduleRateLimitGuideDismissedDate', today);
    set({
      animeScheduleRateLimitGuideDismissedDate: today,
      isAnimeScheduleRateLimitGuideOpen: false,
    });
  },

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
      libraryItems,
      libraryStatusNotificationSettings,
      libraryLastNotifiedEpisodeByAnimeId,
      libraryNotifications,
      libraryLastDailyEpisodeCheckDate,
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
      getStoredValue('libraryItems', {}),
      getStoredValue('libraryStatusNotificationSettings', getDefaultLibraryStatusNotificationSettings()),
      getStoredValue('libraryLastNotifiedEpisodeByAnimeId', {}),
      getStoredValue('libraryNotifications', []),
      getStoredValue('libraryLastDailyEpisodeCheckDate', null),
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
        allowNsfw: current.allowNsfw,
        upcomingSeasonFilter: current.upcomingSeasonFilter,
        baseCatalogSource: current.baseCatalogSource,
        animeScheduleApiToken: current.animeScheduleApiToken,
        subtitleFontColor: current.subtitleFontColor,
        subtitleFontSizeDocked: current.subtitleFontSizeDocked,
        subtitleFontSizeExpanded: current.subtitleFontSizeExpanded,
        subtitleFontSizeFullscreen: current.subtitleFontSizeFullscreen,
        subtitleDropShadow: current.subtitleDropShadow,
        subtitleBackgroundHighlight: current.subtitleBackgroundHighlight,
        isTrailerMuted,
        trailerVolume: current.trailerVolume,
        trailerLastNonZeroVolume: current.trailerLastNonZeroVolume,
      },
      userData: {
        currentlyPlayingItem: current.currentlyPlayingItem,
        queue: current.queue,
        queueCursor: current.queueCursor,
        playlists,
        watchHistory: current.watchHistory,
        favorites,
        libraryItems,
        libraryStatusNotificationSettings,
        libraryLastNotifiedEpisodeByAnimeId,
        libraryNotifications,
        libraryLastDailyEpisodeCheckDate,
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
      setStoredValue('allowNsfw', false),
      setStoredValue('upcomingSeasonFilter', 'all' as UpcomingSeasonFilter),
      setStoredValue('baseCatalogSource', DEFAULT_BASE_CATALOG_SOURCE),
      setStoredValue('animeScheduleApiToken', DEFAULT_ANIMESCHEDULE_TOKEN),
      setStoredValue('animeScheduleRateLimitGuideDismissedDate', null),
      setStoredValue('subtitleFontColor', '#ffffff'),
      setStoredValue('subtitleFontSizeDocked', 19),
      setStoredValue('subtitleFontSizeExpanded', 38),
      setStoredValue('subtitleFontSizeFullscreen', 45),
      setStoredValue('subtitleDropShadow', true),
      setStoredValue('subtitleBackgroundHighlight', false),
      setStoredValue('isTrailerMuted', false),
      setStoredValue('trailerVolume', 72),
      setStoredValue('trailerLastNonZeroVolume', 72),
      setStoredValue('currentlyPlayingItem', null),
      setStoredValue('queue', []),
      setStoredValue('queueCursor', -1),
      setStoredValue('selectedSourceOptionId', null),
      setStoredValue('selectedSubtitleId', null),
      setStoredValue('playlists', []),
      setStoredValue('watchHistory', []),
      setStoredValue('favorites', []),
      setStoredValue('libraryItems', {}),
      setStoredValue('libraryStatusNotificationSettings', getDefaultLibraryStatusNotificationSettings()),
      setStoredValue('libraryLastNotifiedEpisodeByAnimeId', {}),
      setStoredValue('libraryNotifications', []),
      setStoredValue('libraryLastDailyEpisodeCheckDate', null),
      setStoredValue('watchProgress', {}),
      setStoredValue('sourceResolveCache', {}),
      setStoredValue('aniSkipCache', {}),
      clearJikanDataCache(),
      clearAnimeScheduleDataCache(),
      clearAniSkipDataCache(),
      removeStoredValue('localCredentials'),
    ]);

    actionToastTimers.forEach((timer) => clearTimeout(timer));
    actionToastTimers.clear();

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
      allowNsfw: false,
      upcomingSeasonFilter: 'all',
      episodeMetadata: null,
      animeSkipButtonSegment: null,
      baseCatalogSource: DEFAULT_BASE_CATALOG_SOURCE,
      animeScheduleApiToken: DEFAULT_ANIMESCHEDULE_TOKEN,
      subtitleFontColor: '#ffffff',
      subtitleFontSizeDocked: 19,
      subtitleFontSizeExpanded: 38,
      subtitleFontSizeFullscreen: 45,
      subtitleDropShadow: true,
      subtitleBackgroundHighlight: false,
      playbackSupportMode: 'fully-supported',
      selectedSourceOptionId: null,
      selectedSubtitleId: null,
      isTrailerMuted: false,
      trailerLastNonZeroVolume: 72,
      isProfilePopupOpen: false,
      isSettingsOpen: false,
      isAnimeScheduleRateLimitGuideOpen: false,
      animeScheduleRateLimitGuideDismissedDate: null,
      animeScheduleRateLimitGuideLastTriggeredAt: null,
      selectedAnime: null,
      currentlyPlayingItem: null,
      queue: [],
      queueCursor: -1,
      playlists: [],
      watchHistory: [],
      favorites: [],
      libraryItems: {},
      libraryStatusNotificationSettings: getDefaultLibraryStatusNotificationSettings(),
      libraryLastNotifiedEpisodeByAnimeId: {},
      libraryNotifications: [],
      actionToasts: [],
      libraryLastDailyEpisodeCheckDate: null,
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
