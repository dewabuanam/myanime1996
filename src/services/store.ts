import type {
  CachedPayload,
  LibraryAnimeItem,
  LibraryNotificationFeedItem,
  LibraryStatusNotificationSettings,
  PlayableItem,
  Playlist,
  SearchGenreCacheEntry,
  SearchProducerCacheEntry,
  RecentSearchEntry,
  RightPanelView,
  TitleLanguage,
  UserSession,
  WatchProgress,
} from '../types/anime';
import type { ImportedSourcePluginDefinition, ResolvedSource, SourceAudioLanguage } from '../types/plugin';
import type { ApiHealthRuntimeState } from '../state/appStore';

type StoreShape = {
  session: UserSession | null;
  localCredentials: { email: string; passwordHint: string; updatedAt: string } | null;
  isSidebarCompact: boolean;
  isRightPanelHidden: boolean;
  isRightPanelFullpage: boolean;
  rightPanelView: RightPanelView;
  rightPanelWidth: number;
  titleLanguage: TitleLanguage;
  appTheme: 'myanime1996' | 'myanime2077';
  lastAppTheme: 'myanime1996' | 'myanime2077';
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
  runInBackgroundOnClose: boolean;
  runOnStartup: boolean;
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
  tenraiStoreMigrated: boolean;
  tenraiCache: Record<string, CachedPayload<unknown>>;
  sourceResolveCache: Record<string, CachedPayload<ResolvedSource>>;
  tenraiMeta: Record<string, string | number | boolean>;
  baseCatalogSource: 'animeschedule' | 'tenrai';
  animeScheduleApiToken: string;
  animeScheduleRateLimitGuideDismissedDate: string | null;
  apiHealthRuntime: ApiHealthRuntimeState;
  animeScheduleCache: Record<string, CachedPayload<unknown>>;
  animeScheduleMeta: Record<string, string | number | boolean>;
  aniSkipCache: Record<string, CachedPayload<unknown>>;
  recentSearches: RecentSearchEntry[];
  searchGenreCache: Record<string, CachedPayload<SearchGenreCacheEntry[]>>;
  searchProducerCache: Record<string, CachedPayload<SearchProducerCacheEntry[]>>;
};

const PROFILE_SCOPED_KEYS: ReadonlySet<keyof StoreShape> = new Set<keyof StoreShape>([
  'isSidebarCompact',
  'titleLanguage',
  'appTheme',
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
  'runInBackgroundOnClose',
  'runOnStartup',
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
  'apiHealthRuntime',
  'recentSearches',
  'searchGenreCache',
  'searchProducerCache',
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

// Raw, unscoped store access. Used by one-off data migrations that have to walk every
// stored key, including the `profile:<id>:` scoped copies of a key.
export async function listRawStoredKeys(): Promise<string[]> {
  try {
    const store = await getTauriStore();
    if (store) {
      const keys = getMethod<() => Promise<string[]>>(store, 'keys');
      return (await keys?.()) ?? [];
    }
  } catch (error) {
    console.warn('Store key listing failed, using localStorage.', error);
  }

  const collected: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const rawKey = localStorage.key(index);
    if (rawKey?.startsWith(browserPrefix)) collected.push(rawKey.slice(browserPrefix.length));
  }
  return collected;
}

export async function getRawStoredValue(rawKey: string): Promise<unknown> {
  try {
    const store = await getTauriStore();
    if (store) {
      const get = getMethod<(key: string) => Promise<unknown | undefined>>(store, 'get');
      return await get?.(rawKey);
    }
  } catch (error) {
    console.warn(`Raw store read failed for key "${rawKey}".`, error);
  }

  const raw = localStorage.getItem(`${browserPrefix}${rawKey}`);
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

export async function setRawStoredValue(rawKey: string, value: unknown): Promise<void> {
  memoryCache.set(rawKey, value);
  try {
    const store = await getTauriStore();
    if (store) {
      const set = getMethod<(key: string, value: unknown) => Promise<void>>(store, 'set');
      const save = getMethod<() => Promise<void>>(store, 'save');
      await set?.(rawKey, value);
      await save?.();
      return;
    }
  } catch (error) {
    console.warn(`Raw store write failed for key "${rawKey}".`, error);
  }

  localStorage.setItem(`${browserPrefix}${rawKey}`, JSON.stringify(value));
}

export async function removeRawStoredValue(rawKey: string): Promise<void> {
  memoryCache.delete(rawKey);

  try {
    const store = await getTauriStore();
    if (store) {
      const deleteMethod = getMethod<(key: string) => Promise<boolean>>(store, 'delete');
      const save = getMethod<() => Promise<void>>(store, 'save');
      await deleteMethod?.(rawKey);
      await save?.();
      return;
    }
  } catch (error) {
    console.warn(`Raw store delete failed for key "${rawKey}".`, error);
  }

  localStorage.removeItem(`${browserPrefix}${rawKey}`);
}

// ---------------------------------------------------------------------------
// Read-through / write-behind layer.
//
// The cache keys (tenraiCache, animeScheduleCache, sourceResolveCache) hold tens of
// thousands of entries and every call site used to do a full read-modify-write of the
// whole blob. Each `get` serialized the entire value across the Tauri IPC boundary and
// re-parsed it in JS, and the Home screen alone fires seven of those concurrently on
// every load and again on each background refresh. That churn, not the data itself, is
// what pushed the WebView2 renderer into gigabytes.
//
// Values are now held in memory and written back on a short debounce, so repeated reads
// cost nothing and a burst of writes collapses into a single IPC round trip.
// ---------------------------------------------------------------------------

const WRITE_DEBOUNCE_MS = 400;

const memoryCache = new Map<string, unknown>();
const inflightReads = new Map<string, Promise<unknown>>();
const pendingWrites = new Map<string, { value: unknown; deleted: boolean }>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let activeFlush: Promise<void> | null = null;

async function readFromBackingStore(resolvedKey: string): Promise<unknown> {
  try {
    const store = await getTauriStore();
    if (store) {
      const get = getMethod<(key: string) => Promise<unknown | undefined>>(store, 'get');
      return await get?.(resolvedKey);
    }
  } catch (error) {
    console.warn(`Store read failed for key "${resolvedKey}", using fallback.`, error);
    return undefined;
  }

  const raw = localStorage.getItem(`${browserPrefix}${resolvedKey}`);
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

async function writeToBackingStore(entries: Array<[string, { value: unknown; deleted: boolean }]>) {
  try {
    const store = await getTauriStore();
    if (store) {
      const set = getMethod<(key: string, value: unknown) => Promise<void>>(store, 'set');
      const deleteMethod = getMethod<(key: string) => Promise<boolean>>(store, 'delete');
      const save = getMethod<() => Promise<void>>(store, 'save');

      for (const [resolvedKey, entry] of entries) {
        if (entry.deleted) await deleteMethod?.(resolvedKey);
        else await set?.(resolvedKey, entry.value);
      }

      // One save for the whole batch instead of one per mutation.
      await save?.();
      return;
    }
  } catch (error) {
    console.warn('Store write failed, falling back to localStorage.', error);
  }

  for (const [resolvedKey, entry] of entries) {
    if (entry.deleted) localStorage.removeItem(`${browserPrefix}${resolvedKey}`);
    else localStorage.setItem(`${browserPrefix}${resolvedKey}`, JSON.stringify(entry.value));
  }
}

async function drainPendingWrites() {
  while (pendingWrites.size > 0) {
    const batch = Array.from(pendingWrites.entries());
    pendingWrites.clear();
    await writeToBackingStore(batch);
  }
}

// Persist everything still buffered. Called on a debounce, and eagerly when the window
// is going away so a write-behind value is never lost on close.
export function flushStoredValues(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (pendingWrites.size === 0) return activeFlush ?? Promise.resolve();

  const run = (activeFlush ?? Promise.resolve())
    .catch(() => undefined)
    .then(drainPendingWrites)
    .finally(() => {
      if (activeFlush === run) activeFlush = null;
    });

  activeFlush = run;
  return run;
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushStoredValues();
  }, WRITE_DEBOUNCE_MS);
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    void flushStoredValues();
  });
  window.addEventListener('pagehide', () => {
    void flushStoredValues();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushStoredValues();
  });
}

export async function getStoredValue<K extends keyof StoreShape>(key: K, fallback: StoreShape[K]): Promise<StoreShape[K]> {
  const resolvedKey = getStoreKey(key);

  if (memoryCache.has(resolvedKey)) {
    const cached = memoryCache.get(resolvedKey);
    return (cached ?? fallback) as StoreShape[K];
  }

  // Collapse concurrent first reads of the same key into one backing-store round trip.
  let read = inflightReads.get(resolvedKey);
  if (!read) {
    read = readFromBackingStore(resolvedKey).then((value) => {
      memoryCache.set(resolvedKey, value);
      return value;
    }).finally(() => {
      inflightReads.delete(resolvedKey);
    });
    inflightReads.set(resolvedKey, read);
  }

  const value = await read;
  return (value ?? fallback) as StoreShape[K];
}

// Only the response caches are written back on a debounce. They are the hot, multi-MB
// keys, and losing the last few hundred milliseconds of a cache write costs nothing but
// a refetch. Everything else -- watch progress, playlists, library, settings -- is
// written through immediately so `await setStoredValue(...)` keeps meaning "persisted",
// which matters because a close with runInBackgroundOnClose disabled tears the webview
// down without waiting for us.
function isDeferrableKey(key: string) {
  return key.endsWith('Cache') || key.endsWith('Meta');
}

export async function setStoredValue<K extends keyof StoreShape>(key: K, value: StoreShape[K]): Promise<void> {
  const resolvedKey = getStoreKey(key);
  memoryCache.set(resolvedKey, value);

  if (isDeferrableKey(String(key))) {
    pendingWrites.set(resolvedKey, { value, deleted: false });
    scheduleFlush();
    return;
  }

  pendingWrites.delete(resolvedKey);
  await writeToBackingStore([[resolvedKey, { value, deleted: false }]]);
}

export async function removeStoredValue<K extends keyof StoreShape>(key: K): Promise<void> {
  const resolvedKey = getStoreKey(key);
  memoryCache.set(resolvedKey, undefined);
  pendingWrites.delete(resolvedKey);
  await writeToBackingStore([[resolvedKey, { value: undefined, deleted: true }]]);
}
