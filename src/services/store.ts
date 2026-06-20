import type {
  CachedPayload,
  LibraryAnimeItem,
  LibraryNotificationFeedItem,
  LibraryStatusNotificationSettings,
  PlayableItem,
  Playlist,
  RightPanelView,
  TitleLanguage,
  UserSession,
  WatchProgress,
} from '../types/anime';
import type { ImportedSourcePluginDefinition, ResolvedSource, SourceAudioLanguage } from '../types/plugin';

type StoreShape = {
  session: UserSession | null;
  localCredentials: { email: string; passwordHint: string; updatedAt: string } | null;
  isSidebarCompact: boolean;
  isRightPanelHidden: boolean;
  isRightPanelFullpage: boolean;
  rightPanelView: RightPanelView;
  rightPanelWidth: number;
  titleLanguage: TitleLanguage;
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
  assumeEpisodeCountFromReleaseDate: boolean;
  allowNsfw: boolean;
  upcomingSeasonFilter: 'all' | 'tv' | 'movie' | 'ova' | 'special' | 'ona' | 'music';
  subtitleFontColor: string;
  subtitleFontSize: number;
  subtitleFontSizeDocked: number;
  subtitleFontSizeExpanded: number;
  subtitleFontSizeFullscreen: number;
  subtitleDropShadow: boolean;
  subtitleBackgroundHighlight: boolean;
  isTrailerMuted: boolean;
  trailerVolume: number;
  trailerLastNonZeroVolume: number;
  currentlyPlayingItem: PlayableItem | null;
  queue: PlayableItem[];
  queueCursor: number;
  selectedSourceOptionId: string | null;
  selectedSubtitleId: string | null;
  playlists: Playlist[];
  watchHistory: WatchProgress[];
  favorites: number[];
  libraryItems: Record<number, LibraryAnimeItem>;
  libraryStatusNotificationSettings: LibraryStatusNotificationSettings;
  libraryLastNotifiedEpisodeByAnimeId: Record<number, number>;
  libraryNotifications: LibraryNotificationFeedItem[];
  libraryLastDailyEpisodeCheckDate: string | null;
  watchProgress: Record<number, WatchProgress>;
  watchHistoryByProfile: Record<string, WatchProgress[]>;
  watchProgressByProfile: Record<string, Record<number, WatchProgress>>;
  legacyPlaybackMigrated: boolean;
  jikanCache: Record<string, CachedPayload<unknown>>;
  sourceResolveCache: Record<string, CachedPayload<ResolvedSource>>;
  jikanMeta: Record<string, string | number | boolean>;
  baseCatalogSource: 'animeschedule' | 'jikan';
  animeScheduleApiToken: string;
  animeScheduleRateLimitGuideDismissedDate: string | null;
  animeScheduleCache: Record<string, CachedPayload<unknown>>;
  animeScheduleMeta: Record<string, string | number | boolean>;
  aniSkipCache: Record<string, CachedPayload<unknown>>;
};

const PROFILE_SCOPED_KEYS: ReadonlySet<keyof StoreShape> = new Set<keyof StoreShape>([
  'isSidebarCompact',
  'titleLanguage',
  'shuffleEnabled',
  'repeatMode',
  'importedSourcePlugins',
  'pluginPriority',
  'pluginEnabled',
  'preferredSourcePluginId',
  'preferredAudioLanguage',
  'autoSkipOpening',
  'autoSkipEnding',
  'autoSkipRecap',
  'assumeEpisodeCountFromReleaseDate',
  'allowNsfw',
  'upcomingSeasonFilter',
  'subtitleFontColor',
  'subtitleFontSize',
  'subtitleFontSizeDocked',
  'subtitleFontSizeExpanded',
  'subtitleFontSizeFullscreen',
  'subtitleDropShadow',
  'subtitleBackgroundHighlight',
  'isTrailerMuted',
  'trailerVolume',
  'trailerLastNonZeroVolume',
  'currentlyPlayingItem',
  'queue',
  'queueCursor',
  'selectedSourceOptionId',
  'selectedSubtitleId',
  'playlists',
  'watchHistory',
  'favorites',
  'libraryItems',
  'libraryStatusNotificationSettings',
  'libraryLastNotifiedEpisodeByAnimeId',
  'libraryNotifications',
  'libraryLastDailyEpisodeCheckDate',
  'watchProgress',
  'baseCatalogSource',
  'animeScheduleApiToken',
  'animeScheduleRateLimitGuideDismissedDate',
]);

const STORE_FILE = 'myanime1996.store.json';
const browserPrefix = 'myanime1996:';
const profilePrefix = 'profile:';
let tauriStorePromise: Promise<unknown | null> | null = null;
let tauriStoreDisabled = false;
let activeProfileId: string | null = null;

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

async function getTauriStore() {
  if (!isTauri() || tauriStoreDisabled) return null;
  if (!tauriStorePromise) {
    tauriStorePromise = import('@tauri-apps/plugin-store')
      .then(async (module) => {
        const maybeLoad = module as unknown as {
          load?: (path: string, options?: { autoSave?: boolean }) => Promise<unknown>;
          Store?: new (path: string, options?: { autoSave?: boolean }) => unknown;
        };

        if (maybeLoad.load) return maybeLoad.load(STORE_FILE, { autoSave: true });
        if (maybeLoad.Store) return new maybeLoad.Store(STORE_FILE, { autoSave: true });
        return null;
      })
      .catch((error) => {
        // If plugin-store is unavailable at runtime, transparently fall back to localStorage.
        tauriStoreDisabled = true;
        console.warn('Falling back to localStorage store:', error);
        return null;
      });
  }
  return tauriStorePromise;
}

function getMethod<T extends (...args: never[]) => unknown>(target: unknown, key: string): T | undefined {
  if (target && typeof target === 'object' && key in target) {
    const method = (target as Record<string, unknown>)[key];
    if (typeof method === 'function') return method.bind(target) as T;
  }
  return undefined;
}

function getStoreKey<K extends keyof StoreShape>(key: K, profileId = activeProfileId) {
  if (PROFILE_SCOPED_KEYS.has(key) && profileId && profileId.trim().length > 0) {
    return `${profilePrefix}${profileId}:${String(key)}`;
  }
  return String(key);
}

export function setActiveStoreProfile(profileId: string | null) {
  const normalized = typeof profileId === 'string' && profileId.trim().length > 0 ? profileId.trim() : null;
  activeProfileId = normalized;
}

export async function migrateLegacyStoreDataToProfile(profileId: string) {
  const normalizedProfileId = profileId.trim();
  if (!normalizedProfileId) return;

  const store = await getTauriStore();

  if (store) {
    const get = getMethod<(key: string) => Promise<unknown | undefined>>(store, 'get');
    const set = getMethod<(key: string, value: unknown) => Promise<void>>(store, 'set');
    const save = getMethod<() => Promise<void>>(store, 'save');
    if (!get || !set) return;

    for (const scopedKey of PROFILE_SCOPED_KEYS) {
      const profileKey = getStoreKey(scopedKey, normalizedProfileId);
      const hasProfileValue = (await get(profileKey)) !== undefined;
      if (hasProfileValue) continue;
      const legacyValue = await get(String(scopedKey));
      if (legacyValue === undefined) continue;
      await set(profileKey, legacyValue);
    }

    await save?.();
    return;
  }

  for (const scopedKey of PROFILE_SCOPED_KEYS) {
    const profileKey = `${browserPrefix}${getStoreKey(scopedKey, normalizedProfileId)}`;
    if (localStorage.getItem(profileKey) !== null) continue;

    const legacyKey = `${browserPrefix}${String(scopedKey)}`;
    const legacyRaw = localStorage.getItem(legacyKey);
    if (legacyRaw === null) continue;
    localStorage.setItem(profileKey, legacyRaw);
  }
}

export async function migrateProfileScopedKeysToGlobal<K extends keyof StoreShape>(
  profileId: string,
  keys: readonly K[],
) {
  const normalizedProfileId = profileId.trim();
  if (!normalizedProfileId || keys.length === 0) return;

  const store = await getTauriStore();

  if (store) {
    const get = getMethod<(key: string) => Promise<unknown | undefined>>(store, 'get');
    const set = getMethod<(key: string, value: unknown) => Promise<void>>(store, 'set');
    const save = getMethod<() => Promise<void>>(store, 'save');
    if (!get || !set) return;

    for (const key of keys) {
      const globalKey = String(key);
      const profileKey = `${profilePrefix}${normalizedProfileId}:${String(key)}`;
      const hasGlobalValue = (await get(globalKey)) !== undefined;
      if (hasGlobalValue) continue;

      const profileValue = await get(profileKey);
      if (profileValue === undefined) continue;
      await set(globalKey, profileValue);
    }

    await save?.();
    return;
  }

  for (const key of keys) {
    const globalKey = `${browserPrefix}${String(key)}`;
    if (localStorage.getItem(globalKey) !== null) continue;

    const profileKey = `${browserPrefix}${profilePrefix}${normalizedProfileId}:${String(key)}`;
    const profileRaw = localStorage.getItem(profileKey);
    if (profileRaw === null) continue;
    localStorage.setItem(globalKey, profileRaw);
  }
}

export async function getStoredValue<K extends keyof StoreShape>(key: K, fallback: StoreShape[K]): Promise<StoreShape[K]> {
  const resolvedKey = getStoreKey(key);
  try {
    const store = await getTauriStore();
    if (store) {
      const get = getMethod<(key: string) => Promise<StoreShape[K] | undefined>>(store, 'get');
      const value = await get?.(resolvedKey);
      return value ?? fallback;
    }
  } catch (error) {
    console.warn(`Store read failed for key "${String(key)}", using fallback.`, error);
  }

  const raw = localStorage.getItem(`${browserPrefix}${resolvedKey}`);
  return raw ? (JSON.parse(raw) as StoreShape[K]) : fallback;
}

export async function setStoredValue<K extends keyof StoreShape>(key: K, value: StoreShape[K]): Promise<void> {
  const resolvedKey = getStoreKey(key);
  try {
    const store = await getTauriStore();
    if (store) {
      const set = getMethod<(key: string, value: StoreShape[K]) => Promise<void>>(store, 'set');
      const save = getMethod<() => Promise<void>>(store, 'save');
      await set?.(resolvedKey, value);
      await save?.();
      return;
    }
  } catch (error) {
    console.warn(`Store write failed for key "${String(key)}", using localStorage.`, error);
  }

  localStorage.setItem(`${browserPrefix}${resolvedKey}`, JSON.stringify(value));
}

export async function removeStoredValue<K extends keyof StoreShape>(key: K): Promise<void> {
  const resolvedKey = getStoreKey(key);
  try {
    const store = await getTauriStore();
    if (store) {
      const deleteMethod = getMethod<(key: string) => Promise<boolean>>(store, 'delete');
      const save = getMethod<() => Promise<void>>(store, 'save');
      await deleteMethod?.(resolvedKey);
      await save?.();
      return;
    }
  } catch (error) {
    console.warn(`Store delete failed for key "${String(key)}", using localStorage.`, error);
  }

  localStorage.removeItem(`${browserPrefix}${resolvedKey}`);
}
