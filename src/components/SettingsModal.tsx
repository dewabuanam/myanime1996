import { Download, Search, ToggleLeft, ToggleRight, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { clearAniSkipDataCache } from '../services/aniSkip';
import { DEFAULT_ANIMESCHEDULE_TOKEN } from '../services/animeSchedule';
import { clearPluginResolverCacheByKey, getPluginResolverCacheSnapshot } from '../services/pluginExecutor';
import { clearSourceResolveCache } from '../services/sourceCache';
import { getStoredValue, setStoredValue } from '../services/store';
import { useAppStore } from '../state/appStore';
import ConfirmDialog from './ConfirmDialog';

type SettingAction = {
  id: string;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => Promise<void>;
  tone?: 'default' | 'danger';
  confirm?: {
    title: string;
    message: string;
    confirmLabel: string;
  };
};

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const CACHE_VIEW_KEYS = ['jikanCache', 'animeScheduleCache', 'sourceResolveCache', 'aniSkipCache', 'jikanMeta', 'animeScheduleMeta'] as const;
type CacheViewKey = (typeof CACHE_VIEW_KEYS)[number];

type CacheCard = {
  id: string;
  key: string;
  title: string;
  description: string;
  kind: 'stored' | 'runtime';
};

function isJsonRecord(value: unknown): value is Record<string, JsonValue> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function renderTreeValue(value: unknown, path: string): JSX.Element {
  if (Array.isArray(value)) {
    if (!value.length) return <span className="text-cream/45">[]</span>;
    return (
      <details className="ml-4">
        <summary className="cursor-pointer text-cream/80">[{value.length}]</summary>
        <div className="mt-1 space-y-1 border-l border-cream/15 pl-3">
          {value.map((item, index) => (
            <div key={`${path}[${index}]`} className="text-[12px] leading-5 text-cream/75">
              <span className="text-cream/60">[{index}] </span>
              {renderTreeValue(item, `${path}[${index}]`)}
            </div>
          ))}
        </div>
      </details>
    );
  }

  if (isJsonRecord(value)) {
    const keys = Object.keys(value);
    if (!keys.length) return <span className="text-cream/45">{}</span>;
    return (
      <details className="ml-4">
        <summary className="cursor-pointer text-cream/80">{'{'}{keys.length}{'}'}</summary>
        <div className="mt-1 space-y-1 border-l border-cream/15 pl-3">
          {keys.sort().map((key) => (
            <div key={`${path}.${key}`} className="text-[12px] leading-5 text-cream/75">
              <span className="font-mono text-cream/60">{key}: </span>
              {renderTreeValue(value[key], `${path}.${key}`)}
            </div>
          ))}
        </div>
      </details>
    );
  }

  if (typeof value === 'string') {
    return <span className="text-amberline/80">"{value}"</span>;
  }

  if (value === null || value === undefined) {
    return <span className="text-cream/45">null</span>;
  }

  return <span className="text-cream/80">{String(value)}</span>;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightText(text: string, query: string) {
  if (!query.trim()) return text;
  const matcher = new RegExp(`(${escapeRegex(query.trim())})`, 'ig');
  const parts = text.split(matcher);
  return parts.map((part, index) => {
    if (part.toLowerCase() !== query.trim().toLowerCase()) {
      return <span key={`${part}-${index}`}>{part}</span>;
    }
    return (
      <mark key={`${part}-${index}`} className="settings-highlight">
        {part}
      </mark>
    );
  });
}

function isPluginRuntimeCacheKey(key: string) {
  return /^__myanime1996.*cache$/i.test(key);
}

function buildCacheCards(snapshot: Record<string, unknown>): CacheCard[] {
  const storedCards: CacheCard[] = [
    {
      id: 'stored:jikanCache',
      key: 'jikanCache',
      title: 'Jikan Cache',
      description: 'Cached Jikan API payloads.',
      kind: 'stored',
    },
    {
      id: 'stored:animeScheduleCache',
      key: 'animeScheduleCache',
      title: 'AnimeSchedule Cache',
      description: 'Cached AnimeSchedule API payloads.',
      kind: 'stored',
    },
    {
      id: 'stored:sourceResolveCache',
      key: 'sourceResolveCache',
      title: 'Source Resolve Cache',
      description: 'Resolved source results by provider/title/episode.',
      kind: 'stored',
    },
    {
      id: 'stored:aniSkipCache',
      key: 'aniSkipCache',
      title: 'AniSkip Cache',
      description: 'Cached opening/ending/recap segment data.',
      kind: 'stored',
    },
    {
      id: 'stored:jikanMeta',
      key: 'jikanMeta',
      title: 'Jikan Meta',
      description: 'Jikan metadata and refresh timestamps.',
      kind: 'stored',
    },
    {
      id: 'stored:animeScheduleMeta',
      key: 'animeScheduleMeta',
      title: 'AnimeSchedule Meta',
      description: 'AnimeSchedule metadata and refresh timestamps.',
      kind: 'stored',
    },
  ];

  const runtimeKeys = Object.keys(snapshot)
    .filter((key) => isPluginRuntimeCacheKey(key))
    .sort((left, right) => left.localeCompare(right));

  const runtimeCards: CacheCard[] = runtimeKeys.map((key) => ({
    id: `runtime:${key}`,
    key,
    title: key,
    description: 'Runtime plugin resolver cache (includes plugin token/rate-limit state if present).',
    kind: 'runtime',
  }));

  return [...storedCards, ...runtimeCards];
}

function findVideoToken(value: unknown) {
  if (!isJsonRecord(value)) return '';
  const token = value.videoBearerToken;
  return typeof token === 'string' ? token.trim() : '';
}

export default function SettingsModal() {
  const isSettingsOpen = useAppStore((state) => state.isSettingsOpen);
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen);
  const setProfilePopupOpen = useAppStore((state) => state.setProfilePopupOpen);
  const clearJikanCache = useAppStore((state) => state.clearJikanCache);
  const exportUserData = useAppStore((state) => state.exportUserData);
  const factoryReset = useAppStore((state) => state.factoryReset);
  const animeScheduleApiToken = useAppStore((state) => state.animeScheduleApiToken);
  const setAnimeScheduleApiToken = useAppStore((state) => state.setAnimeScheduleApiToken);
  const openAnimeScheduleRateLimitGuide = useAppStore((state) => state.openAnimeScheduleRateLimitGuide);
  const autoSkipOpening = useAppStore((state) => state.autoSkipOpening);
  const autoSkipEnding = useAppStore((state) => state.autoSkipEnding);
  const autoSkipRecap = useAppStore((state) => state.autoSkipRecap);
  const setAutoSkipOpening = useAppStore((state) => state.setAutoSkipOpening);
  const setAutoSkipEnding = useAppStore((state) => state.setAutoSkipEnding);
  const setAutoSkipRecap = useAppStore((state) => state.setAutoSkipRecap);
  const subtitleFontColor = useAppStore((state) => state.subtitleFontColor);
  const subtitleFontSizeDocked = useAppStore((state) => state.subtitleFontSizeDocked);
  const subtitleFontSizeExpanded = useAppStore((state) => state.subtitleFontSizeExpanded);
  const subtitleFontSizeFullscreen = useAppStore((state) => state.subtitleFontSizeFullscreen);
  const subtitleDropShadow = useAppStore((state) => state.subtitleDropShadow);
  const subtitleBackgroundHighlight = useAppStore((state) => state.subtitleBackgroundHighlight);
  const setSubtitleFontColor = useAppStore((state) => state.setSubtitleFontColor);
  const setSubtitleFontSizeDocked = useAppStore((state) => state.setSubtitleFontSizeDocked);
  const setSubtitleFontSizeExpanded = useAppStore((state) => state.setSubtitleFontSizeExpanded);
  const setSubtitleFontSizeFullscreen = useAppStore((state) => state.setSubtitleFontSizeFullscreen);
  const setSubtitleDropShadow = useAppStore((state) => state.setSubtitleDropShadow);
  const setSubtitleBackgroundHighlight = useAppStore((state) => state.setSubtitleBackgroundHighlight);

  const [query, setQuery] = useState('');
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [pendingConfirmActionId, setPendingConfirmActionId] = useState<string | null>(null);
  const [tokenDraft, setTokenDraft] = useState('');
  const [isCacheViewerOpen, setCacheViewerOpen] = useState(false);
  const [cacheViewerLoading, setCacheViewerLoading] = useState(false);
  const [busyCacheCardId, setBusyCacheCardId] = useState<string | null>(null);
  const [cacheSnapshot, setCacheSnapshot] = useState<Record<string, unknown>>({});
  const isDevMode = (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;

  const cacheCards = useMemo(() => buildCacheCards(cacheSnapshot), [cacheSnapshot]);

  useEffect(() => {
    if (!isSettingsOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (isCacheViewerOpen) {
        setCacheViewerOpen(false);
        return;
      }
      setSettingsOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isCacheViewerOpen, isSettingsOpen, setSettingsOpen]);

  useEffect(() => {
    if (!isSettingsOpen) {
      setQuery('');
      setSelectedActionId(null);
      setBusyActionId(null);
      setStatusMessage('');
      setPendingConfirmActionId(null);
      setTokenDraft(animeScheduleApiToken);
      setCacheViewerOpen(false);
      setCacheViewerLoading(false);
      setBusyCacheCardId(null);
      setCacheSnapshot({});
    }
  }, [animeScheduleApiToken, isSettingsOpen]);

  const loadCacheSnapshot = async () => {
    const [jikanCache, animeScheduleCache, sourceResolveCache, aniSkipCache, jikanMeta, animeScheduleMeta] = await Promise.all([
      getStoredValue('jikanCache', {}),
      getStoredValue('animeScheduleCache', {}),
      getStoredValue('sourceResolveCache', {}),
      getStoredValue('aniSkipCache', {}),
      getStoredValue('jikanMeta', {}),
      getStoredValue('animeScheduleMeta', {}),
    ]);

    return {
      jikanCache,
      animeScheduleCache,
      sourceResolveCache,
      aniSkipCache,
      jikanMeta,
      animeScheduleMeta,
      ...getPluginResolverCacheSnapshot(),
    } as Record<string, unknown>;
  };

  const openCacheViewer = async () => {
    try {
      setCacheViewerLoading(true);
      const snapshot = await loadCacheSnapshot();
      setCacheSnapshot(snapshot);
      setCacheViewerOpen(true);
      setStatusMessage('Cache data loaded.');
    } catch {
      setStatusMessage('Unable to load cache data.');
    } finally {
      setCacheViewerLoading(false);
    }
  };

  const clearCacheCard = async (card: CacheCard) => {
    try {
      setBusyCacheCardId(card.id);

      if (card.kind === 'runtime') {
        clearPluginResolverCacheByKey(card.key);
      } else {
        const key = card.key as CacheViewKey;
        if (key === 'jikanCache') {
          await setStoredValue('jikanCache', {});
        } else if (key === 'animeScheduleCache') {
          await setStoredValue('animeScheduleCache', {});
        } else if (key === 'sourceResolveCache') {
          await clearSourceResolveCache();
        } else if (key === 'aniSkipCache') {
          await clearAniSkipDataCache();
        } else if (key === 'jikanMeta') {
          await setStoredValue('jikanMeta', {});
        } else if (key === 'animeScheduleMeta') {
          await setStoredValue('animeScheduleMeta', {});
        }
      }

      const snapshot = await loadCacheSnapshot();
      setCacheSnapshot(snapshot);
      setStatusMessage(`${card.title} cleared.`);
    } catch {
      setStatusMessage(`Unable to clear ${card.title}.`);
    } finally {
      setBusyCacheCardId(null);
    }
  };

  useEffect(() => {
    if (!isSettingsOpen) return;
    setTokenDraft(animeScheduleApiToken);
  }, [animeScheduleApiToken, isSettingsOpen]);

  const actions = useMemo<SettingAction[]>(
    () => [
      {
        id: 'base-source',
        title: 'Base Source',
        description: 'Choose the default catalog source and manage AnimeSchedule API token settings.',
        actionLabel: 'Manage source',
        onAction: async () => {
          setStatusMessage('Base source settings are ready below.');
        },
      },
      {
        id: 'clear-cache',
        title: 'Cache Data',
        description: 'Remove cached Jikan/AnimeSchedule responses, plugin runtime cache, and source resolve cache to force fresh content on next load.',
        actionLabel: 'Clear cache',
        confirm: {
          title: 'Clear cache data?',
          message: 'This removes cached Jikan and AnimeSchedule data, plugin runtime cache, and source resolve cache. Your history, playlists, and settings stay unchanged.',
          confirmLabel: 'Clear cache',
        },
        onAction: async () => {
          await clearJikanCache();
          setCacheSnapshot({});
          setCacheViewerOpen(false);
          setStatusMessage('Cache cleared.');
        },
      },
      {
        id: 'anime-skip',
        title: 'Anime Skip',
        description: 'Toggle auto-skip for opening, ending, and recap segments during controllable playback.',
        actionLabel: 'Manage anime skip',
        onAction: async () => {
          setStatusMessage('Anime Skip settings are ready below.');
        },
      },
      {
        id: 'subtitle-style',
        title: 'Subtitle Style',
        description: 'Adjust subtitle font color, docked/expanded/fullscreen size, drop shadow, and background highlight.',
        actionLabel: 'Manage subtitle style',
        onAction: async () => {
          setStatusMessage('Subtitle style settings are ready below.');
        },
      },
      {
        id: 'export-json',
        title: 'Export User Data (JSON)',
        description: 'Save current profile, UI settings, watch data, and history as a JSON file.',
        actionLabel: 'Export JSON',
        onAction: async () => {
          const payload = await exportUserData();
          const stamp = new Date().toISOString().replace(/[.:]/g, '-');
          const filePath = await save({
            defaultPath: `myanime1996-user-export-${stamp}.json`,
            filters: [
              {
                name: 'JSON',
                extensions: ['json'],
              },
            ],
          });

          if (!filePath) {
            setStatusMessage('Export canceled.');
            return;
          }

          await writeTextFile(filePath, JSON.stringify(payload, null, 2));
          setStatusMessage('Export saved.');
        },
      },
      {
        id: 'factory-reset',
        title: 'Factory Reset',
        description: 'Reset UI settings, watchlist data, favorites, and history while keeping the current login session.',
        actionLabel: 'Reset now',
        tone: 'danger',
        confirm: {
          title: 'Factory reset app data?',
          message: 'This deletes user settings, watch data, favorites, playlists, and history while keeping your current login session.',
          confirmLabel: 'Reset all',
        },
        onAction: async () => {
          await factoryReset();
          setProfilePopupOpen(false);
          setSettingsOpen(false);
        },
      },
    ],
    [clearJikanCache, exportUserData, factoryReset, setProfilePopupOpen, setSettingsOpen],
  );

  const filteredActions = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return actions;
    return actions.filter((action) => `${action.title} ${action.description}`.toLowerCase().includes(term));
  }, [actions, query]);

  useEffect(() => {
    if (!isSettingsOpen) return;
    if (!filteredActions.length) {
      setSelectedActionId(null);
      return;
    }
    if (selectedActionId && filteredActions.some((action) => action.id === selectedActionId)) {
      return;
    }
    setSelectedActionId(filteredActions[0].id);
  }, [filteredActions, isSettingsOpen, selectedActionId]);

  const selectedAction = useMemo(() => filteredActions.find((action) => action.id === selectedActionId) ?? null, [filteredActions, selectedActionId]);

  const runAction = async (action: SettingAction) => {
    if (action.confirm) {
      setPendingConfirmActionId(action.id);
      return;
    }

    try {
      setBusyActionId(action.id);
      await action.onAction();
    } finally {
      setBusyActionId(null);
    }
  };

  const pendingConfirmAction = useMemo(() => actions.find((action) => action.id === pendingConfirmActionId) ?? null, [actions, pendingConfirmActionId]);

  const handleConfirmAction = async () => {
    if (!pendingConfirmAction) return;
    try {
      setBusyActionId(pendingConfirmAction.id);
      await pendingConfirmAction.onAction();
    } finally {
      setBusyActionId(null);
      setPendingConfirmActionId(null);
    }
  };

  if (!isSettingsOpen) return null;

  return createPortal(
    <>
      <div className="settings-overlay" aria-hidden={false}>
        <button
          type="button"
          className="settings-backdrop"
          aria-label="Close settings"
          onClick={() => setSettingsOpen(false)}
        />
        <section className="settings-modal" role="dialog" aria-modal="true" aria-label="Settings">
          <header className="settings-modal-header">
            <div>
              <p className="settings-modal-eyebrow">Control Room</p>
              <h2 className="settings-modal-title">Settings</h2>
            </div>
            <button type="button" className="settings-close-btn retro-tooltip" aria-label="Close" onClick={() => setSettingsOpen(false)} data-tooltip="Close Settings">
              <X size={16} />
            </button>
          </header>

          <div className="settings-layout">
            <aside className="settings-sidebar">
              <label className="settings-search" htmlFor="settings-search-input">
                <Search size={15} />
                <input
                  id="settings-search-input"
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search settings..."
                />
              </label>
              <div className="settings-nav" role="tablist" aria-label="Settings sections">
                {filteredActions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    role="tab"
                    aria-selected={selectedAction?.id === action.id}
                    className={`settings-nav-item retro-tooltip ${selectedAction?.id === action.id ? 'is-active' : ''}`}
                    onClick={() => setSelectedActionId(action.id)}
                    data-tooltip={action.title}
                  >
                    <span className="settings-nav-title">{highlightText(action.title, query)}</span>
                  </button>
                ))}
                {!filteredActions.length && <p className="settings-empty">No settings matched your search.</p>}
              </div>
            </aside>

            <section className="settings-detail" role="tabpanel" aria-label="Setting detail">
              {selectedAction ? (
                selectedAction.id === 'base-source' ? (
                  <article className="settings-action-card space-y-4">
                    <div className="settings-action-copy">
                      <h3>{highlightText(selectedAction.title, query)}</h3>
                      <p>{highlightText(selectedAction.description, query)}</p>
                    </div>

                    <div className="space-y-2">
                      <p className="font-mono text-[11px] uppercase tracking-[0.13em] text-cream/70">Catalog Source</p>
                      <p className="rounded-xl border border-cream/20 bg-black/25 px-3 py-2 text-sm text-cream/80">AnimeSchedule (Default)</p>
                    </div>

                    <div className="space-y-2">
                      <p className="font-mono text-[11px] uppercase tracking-[0.13em] text-cream/70">AnimeSchedule API Token</p>
                      <input
                        type="text"
                        className="w-full rounded-xl border border-cream/20 bg-black/25 px-3 py-2 text-sm text-cream outline-none focus:border-amberline"
                        value={tokenDraft}
                        onChange={(event) => setTokenDraft(event.target.value)}
                        placeholder="Enter AnimeSchedule API token"
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="settings-action-btn"
                          onClick={() =>
                            void setAnimeScheduleApiToken(tokenDraft).then(() => {
                              setTokenDraft(tokenDraft.trim() || DEFAULT_ANIMESCHEDULE_TOKEN);
                              setStatusMessage('AnimeSchedule token saved.');
                            })
                          }
                        >
                          Save Token
                        </button>
                        <button
                          type="button"
                          className="settings-action-btn"
                          onClick={() =>
                            void setAnimeScheduleApiToken(DEFAULT_ANIMESCHEDULE_TOKEN).then(() => {
                              setTokenDraft(DEFAULT_ANIMESCHEDULE_TOKEN);
                              setStatusMessage('AnimeSchedule token reset to default.');
                            })
                          }
                        >
                          Reset to Default
                        </button>
                        {isDevMode ? (
                          <button
                            type="button"
                            className="settings-action-btn"
                            onClick={() => {
                              openAnimeScheduleRateLimitGuide();
                              setStatusMessage('Rate-limit guide opened (dev trigger).');
                            }}
                          >
                            Trigger Rate-Limit Guide (Dev)
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div className="space-y-1 text-sm text-cream/75">
                      <p className="font-mono text-[11px] uppercase tracking-[0.13em] text-cream/70">Tutorial</p>
                      <p>Base Source controls anime catalog metadata feeds, including the Home Latest Update shelf.</p>
                      <p>AnimeSchedule mode uses timetable endpoints: /timetables and /timetables/{'{'}airType{'}'}.</p>
                      <p>Token is stored locally in app settings. Default token is preloaded and can be replaced with your own.</p>
                      <p>If AnimeSchedule latest updates fail, the app falls back to Jikan for reliability.</p>
                    </div>
                  </article>
                ) : selectedAction.id === 'clear-cache' ? (
                  <article className="settings-action-card space-y-4">
                    <div className="settings-action-copy">
                      <h3>{highlightText(selectedAction.title, query)}</h3>
                      <p>{highlightText(selectedAction.description, query)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="settings-action-btn retro-tooltip"
                        onClick={() => void runAction(selectedAction)}
                        disabled={busyActionId === selectedAction.id}
                        data-tooltip={busyActionId === selectedAction.id ? 'Working' : selectedAction.actionLabel}
                      >
                        <Trash2 size={14} />
                        {busyActionId === selectedAction.id ? 'Working...' : selectedAction.actionLabel}
                      </button>
                      <button
                        type="button"
                        className="settings-action-btn retro-tooltip"
                        onClick={() => void openCacheViewer()}
                        disabled={cacheViewerLoading}
                        data-tooltip={cacheViewerLoading ? 'Loading cache data' : 'Show Cache Data'}
                      >
                        {cacheViewerLoading ? 'Loading...' : 'Show Cache Data'}
                      </button>
                    </div>
                  </article>
                ) : selectedAction.id === 'anime-skip' ? (
                  <article className="settings-action-card space-y-4">
                    <div className="settings-action-copy">
                      <h3>{highlightText(selectedAction.title, query)}</h3>
                      <p>{highlightText(selectedAction.description, query)}</p>
                    </div>

                    <div className="space-y-3">
                      <button
                        type="button"
                        className="w-full flex items-center justify-between rounded-xl border border-cream/20 bg-black/25 px-4 py-3 hover:border-cream/40 transition-colors"
                        onClick={() => void setAutoSkipOpening(!autoSkipOpening)}
                        aria-label={`${autoSkipOpening ? 'Disable' : 'Enable'} auto-skip opening`}
                      >
                        <span className="text-sm text-cream/80">Auto-skip Opening</span>
                        {autoSkipOpening ? <ToggleRight size={16} className="text-amberline" /> : <ToggleLeft size={16} className="text-cream/40" />}
                      </button>

                      <button
                        type="button"
                        className="w-full flex items-center justify-between rounded-xl border border-cream/20 bg-black/25 px-4 py-3 hover:border-cream/40 transition-colors"
                        onClick={() => void setAutoSkipEnding(!autoSkipEnding)}
                        aria-label={`${autoSkipEnding ? 'Disable' : 'Enable'} auto-skip ending`}
                      >
                        <span className="text-sm text-cream/80">Auto-skip Ending</span>
                        {autoSkipEnding ? <ToggleRight size={16} className="text-amberline" /> : <ToggleLeft size={16} className="text-cream/40" />}
                      </button>

                      <button
                        type="button"
                        className="w-full flex items-center justify-between rounded-xl border border-cream/20 bg-black/25 px-4 py-3 hover:border-cream/40 transition-colors"
                        onClick={() => void setAutoSkipRecap(!autoSkipRecap)}
                        aria-label={`${autoSkipRecap ? 'Disable' : 'Enable'} auto-skip recap`}
                      >
                        <span className="text-sm text-cream/80">Auto-skip Recap</span>
                        {autoSkipRecap ? <ToggleRight size={16} className="text-amberline" /> : <ToggleLeft size={16} className="text-cream/40" />}
                      </button>
                    </div>

                    <div className="space-y-1 text-sm text-cream/75">
                      <p className="font-mono text-[11px] uppercase tracking-[0.13em] text-cream/70">Behavior</p>
                      <p>When disabled, a Skip button appears while the segment is active.</p>
                      <p>When enabled, playback jumps to the segment end automatically and shows a small toast.</p>
                    </div>
                  </article>
                ) : selectedAction.id === 'subtitle-style' ? (
                  <article className="settings-action-card space-y-4">
                    <div className="settings-action-copy">
                      <h3>{highlightText(selectedAction.title, query)}</h3>
                      <p>{highlightText(selectedAction.description, query)}</p>
                    </div>

                    <div className="space-y-2">
                      <p className="font-mono text-[11px] uppercase tracking-[0.13em] text-cream/70">Font Color</p>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          className="h-10 w-16 rounded-lg border border-cream/20 bg-black/25 p-1"
                          value={subtitleFontColor}
                          onChange={(event) => void setSubtitleFontColor(event.target.value)}
                          aria-label="Subtitle font color"
                        />
                        <span className="rounded-xl border border-cream/20 bg-black/25 px-3 py-2 text-sm text-cream/80">{subtitleFontColor}</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="font-mono text-[11px] uppercase tracking-[0.13em] text-cream/70">Docked Size</p>
                      <input
                        type="range"
                        min={12}
                        max={64}
                        step={1}
                        value={subtitleFontSizeDocked}
                        onChange={(event) => void setSubtitleFontSizeDocked(Number(event.target.value))}
                        aria-label="Subtitle docked size"
                        className="w-full"
                      />
                      <p className="text-sm text-cream/80">{subtitleFontSizeDocked}px</p>
                    </div>

                    <div className="space-y-2">
                      <p className="font-mono text-[11px] uppercase tracking-[0.13em] text-cream/70">Expanded Size</p>
                      <input
                        type="range"
                        min={12}
                        max={64}
                        step={1}
                        value={subtitleFontSizeExpanded}
                        onChange={(event) => void setSubtitleFontSizeExpanded(Number(event.target.value))}
                        aria-label="Subtitle expanded size"
                        className="w-full"
                      />
                      <p className="text-sm text-cream/80">{subtitleFontSizeExpanded}px</p>
                    </div>

                    <div className="space-y-2">
                      <p className="font-mono text-[11px] uppercase tracking-[0.13em] text-cream/70">Fullscreen Size</p>
                      <input
                        type="range"
                        min={12}
                        max={72}
                        step={1}
                        value={subtitleFontSizeFullscreen}
                        onChange={(event) => void setSubtitleFontSizeFullscreen(Number(event.target.value))}
                        aria-label="Subtitle fullscreen size"
                        className="w-full"
                      />
                      <p className="text-sm text-cream/80">{subtitleFontSizeFullscreen}px</p>
                    </div>

                    <button
                      type="button"
                      className="w-full flex items-center justify-between rounded-xl border border-cream/20 bg-black/25 px-4 py-3 hover:border-cream/40 transition-colors"
                      onClick={() => void setSubtitleDropShadow(!subtitleDropShadow)}
                      aria-label={`${subtitleDropShadow ? 'Disable' : 'Enable'} subtitle drop shadow`}
                    >
                      <span className="text-sm text-cream/80">Drop Shadow</span>
                      {subtitleDropShadow ? <ToggleRight size={16} className="text-amberline" /> : <ToggleLeft size={16} className="text-cream/40" />}
                    </button>

                    <button
                      type="button"
                      className="w-full flex items-center justify-between rounded-xl border border-cream/20 bg-black/25 px-4 py-3 hover:border-cream/40 transition-colors"
                      onClick={() => void setSubtitleBackgroundHighlight(!subtitleBackgroundHighlight)}
                      aria-label={`${subtitleBackgroundHighlight ? 'Disable' : 'Enable'} subtitle background highlight`}
                    >
                      <span className="text-sm text-cream/80">Background Highlight</span>
                      {subtitleBackgroundHighlight ? <ToggleRight size={16} className="text-amberline" /> : <ToggleLeft size={16} className="text-cream/40" />}
                    </button>

                    <div className="space-y-1 text-sm text-cream/75">
                      <p className="font-mono text-[11px] uppercase tracking-[0.13em] text-cream/70">Preview</p>
                      <div className="space-y-2">
                        <p
                          style={{
                            color: subtitleFontColor,
                            fontSize: `${subtitleFontSizeDocked}px`,
                            textShadow: subtitleDropShadow ? '0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.75)' : 'none',
                            backgroundColor: subtitleBackgroundHighlight ? 'rgba(0,0,0,0.72)' : 'transparent',
                            display: 'inline-block',
                            padding: subtitleBackgroundHighlight ? '2px 6px' : 0,
                            borderRadius: subtitleBackgroundHighlight ? '4px' : 0,
                          }}
                        >
                          Docked preview
                        </p>
                        <p
                          style={{
                            color: subtitleFontColor,
                            fontSize: `${subtitleFontSizeExpanded}px`,
                            textShadow: subtitleDropShadow ? '0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.75)' : 'none',
                            backgroundColor: subtitleBackgroundHighlight ? 'rgba(0,0,0,0.72)' : 'transparent',
                            display: 'inline-block',
                            padding: subtitleBackgroundHighlight ? '2px 6px' : 0,
                            borderRadius: subtitleBackgroundHighlight ? '4px' : 0,
                          }}
                        >
                          Expanded preview
                        </p>
                        <p
                          style={{
                            color: subtitleFontColor,
                            fontSize: `${subtitleFontSizeFullscreen}px`,
                            textShadow: subtitleDropShadow ? '0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.75)' : 'none',
                            backgroundColor: subtitleBackgroundHighlight ? 'rgba(0,0,0,0.72)' : 'transparent',
                            display: 'inline-block',
                            padding: subtitleBackgroundHighlight ? '2px 6px' : 0,
                            borderRadius: subtitleBackgroundHighlight ? '4px' : 0,
                          }}
                        >
                          Fullscreen preview
                        </p>
                      </div>
                    </div>
                  </article>
                ) : (
                  <article className="settings-action-card">
                    <div className="settings-action-copy">
                      <h3>{highlightText(selectedAction.title, query)}</h3>
                      <p>{highlightText(selectedAction.description, query)}</p>
                    </div>
                    <button
                      type="button"
                      className={`settings-action-btn retro-tooltip ${selectedAction.tone === 'danger' ? 'is-danger' : ''}`}
                      onClick={() => void runAction(selectedAction)}
                      disabled={busyActionId === selectedAction.id}
                      data-tooltip={busyActionId === selectedAction.id ? 'Working' : selectedAction.actionLabel}
                    >
                      {selectedAction.id === 'clear-cache' && <Trash2 size={14} />}
                      {selectedAction.id === 'export-json' && <Download size={14} />}
                      {selectedAction.id === 'factory-reset' && <Trash2 size={14} />}
                      {busyActionId === selectedAction.id ? 'Working...' : selectedAction.actionLabel}
                    </button>
                  </article>
                )
              ) : (
                <p className="settings-empty">Select a setting from the left list.</p>
              )}
            </section>
          </div>

          {statusMessage && <p className="settings-status">{statusMessage}</p>}
        </section>
      </div>
      <ConfirmDialog
        open={!!pendingConfirmAction}
        title={pendingConfirmAction?.confirm?.title ?? 'Confirm action'}
        message={pendingConfirmAction?.confirm?.message ?? 'Are you sure you want to continue?'}
        confirmLabel={pendingConfirmAction?.confirm?.confirmLabel ?? 'Confirm'}
        tone={pendingConfirmAction?.tone ?? 'default'}
        onCancel={() => setPendingConfirmActionId(null)}
        onConfirm={() => void handleConfirmAction()}
      />
      {isCacheViewerOpen && (
        <div className="settings-overlay" aria-hidden={false}>
          <button
            type="button"
            className="settings-backdrop"
            aria-label="Close cache data viewer"
            onClick={() => setCacheViewerOpen(false)}
          />
          <section className="settings-modal max-w-5xl" role="dialog" aria-modal="true" aria-label="Cache data viewer">
            <header className="settings-modal-header">
              <div>
                <p className="settings-modal-eyebrow">Control Room</p>
                <h2 className="settings-modal-title">Cache Data</h2>
              </div>
              <button type="button" className="settings-close-btn retro-tooltip" aria-label="Close" onClick={() => setCacheViewerOpen(false)} data-tooltip="Close Cache Data">
                <X size={16} />
              </button>
            </header>
            <div className="max-h-[70vh] overflow-auto rounded-2xl border border-cream/15 bg-black/25 p-4">
              {cacheCards.map((card) => (
                <div key={card.id} className="mb-3 rounded-xl border border-cream/10 bg-black/20 p-3 last:mb-0">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-mono text-[11px] uppercase tracking-[0.13em] text-cream/70">{card.title}</p>
                      <p className="text-xs text-cream/60">{card.description}</p>
                    </div>
                    <button
                      type="button"
                      className="settings-action-btn retro-tooltip"
                      onClick={() => void clearCacheCard(card)}
                      disabled={busyCacheCardId === card.id}
                      data-tooltip={busyCacheCardId === card.id ? 'Clearing cache' : `Clear ${card.title}`}
                    >
                      <Trash2 size={14} />
                      {busyCacheCardId === card.id ? 'Clearing...' : 'Clear'}
                    </button>
                  </div>
                  {findVideoToken(cacheSnapshot[card.key]) && (
                    <div className="mt-2 rounded-lg border border-cream/10 bg-black/20 px-2 py-1 text-[11px] text-cream/70">
                      <span className="font-mono text-amberline/80">videoBearerToken</span>
                      <span className="ml-2 break-all">{findVideoToken(cacheSnapshot[card.key])}</span>
                    </div>
                  )}
                  <div className="mt-2 text-sm">{renderTreeValue(cacheSnapshot[card.key], card.key)}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </>,
    document.body,
  );
}
