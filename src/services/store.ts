import type { CachedPayload, PlayableItem, Playlist, RightPanelView, TitleLanguage, UserSession, WatchProgress } from '../types/anime';
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

const STORE_FILE = 'myanime1996.store.json';
const browserPrefix = 'myanime1996:';
let tauriStorePromise: Promise<unknown | null> | null = null;
let tauriStoreDisabled = false;

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

export async function getStoredValue<K extends keyof StoreShape>(key: K, fallback: StoreShape[K]): Promise<StoreShape[K]> {
  try {
    const store = await getTauriStore();
    if (store) {
      const get = getMethod<(key: string) => Promise<StoreShape[K] | undefined>>(store, 'get');
      const value = await get?.(key);
      return value ?? fallback;
    }
  } catch (error) {
    console.warn(`Store read failed for key "${String(key)}", using fallback.`, error);
  }

  const raw = localStorage.getItem(`${browserPrefix}${String(key)}`);
  return raw ? (JSON.parse(raw) as StoreShape[K]) : fallback;
}

export async function setStoredValue<K extends keyof StoreShape>(key: K, value: StoreShape[K]): Promise<void> {
  try {
    const store = await getTauriStore();
    if (store) {
      const set = getMethod<(key: string, value: StoreShape[K]) => Promise<void>>(store, 'set');
      const save = getMethod<() => Promise<void>>(store, 'save');
      await set?.(key, value);
      await save?.();
      return;
    }
  } catch (error) {
    console.warn(`Store write failed for key "${String(key)}", using localStorage.`, error);
  }

  localStorage.setItem(`${browserPrefix}${String(key)}`, JSON.stringify(value));
}

export async function removeStoredValue<K extends keyof StoreShape>(key: K): Promise<void> {
  try {
    const store = await getTauriStore();
    if (store) {
      const deleteMethod = getMethod<(key: string) => Promise<boolean>>(store, 'delete');
      const save = getMethod<() => Promise<void>>(store, 'save');
      await deleteMethod?.(key);
      await save?.();
      return;
    }
  } catch (error) {
    console.warn(`Store delete failed for key "${String(key)}", using localStorage.`, error);
  }

  localStorage.removeItem(`${browserPrefix}${String(key)}`);
}
