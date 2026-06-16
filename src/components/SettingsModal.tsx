import { Download, Search, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { DEFAULT_ANIMESCHEDULE_TOKEN } from '../services/animeSchedule';
import { getStoredValue } from '../services/store';
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

const CACHE_VIEW_KEYS = ['jikanCache', 'animeScheduleCache', 'sourceResolveCache', 'jikanMeta', 'animeScheduleMeta'] as const;

function isJsonRecord(value: unknown): value is Record<string, JsonValue> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function renderTreeValue(value: unknown, path: string): JSX.Element {
  if (Array.isArray(value)) {
    if (!value.length) return <span className="text-cream/45">[]</span>;
    return (
      <details className="ml-4" open>
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
      <details className="ml-4" open>
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

export default function SettingsModal() {
  const isSettingsOpen = useAppStore((state) => state.isSettingsOpen);
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen);
  const setProfilePopupOpen = useAppStore((state) => state.setProfilePopupOpen);
  const clearJikanCache = useAppStore((state) => state.clearJikanCache);
  const exportUserData = useAppStore((state) => state.exportUserData);
  const factoryReset = useAppStore((state) => state.factoryReset);
  const animeScheduleApiToken = useAppStore((state) => state.animeScheduleApiToken);
  const setAnimeScheduleApiToken = useAppStore((state) => state.setAnimeScheduleApiToken);

  const [query, setQuery] = useState('');
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [pendingConfirmActionId, setPendingConfirmActionId] = useState<string | null>(null);
  const [tokenDraft, setTokenDraft] = useState('');
  const [isCacheViewerOpen, setCacheViewerOpen] = useState(false);
  const [cacheViewerLoading, setCacheViewerLoading] = useState(false);
  const [cacheSnapshot, setCacheSnapshot] = useState<Record<string, unknown>>({});

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
      setCacheSnapshot({});
    }
  }, [animeScheduleApiToken, isSettingsOpen]);

  const openCacheViewer = async () => {
    try {
      setCacheViewerLoading(true);
      const [jikanCache, animeScheduleCache, sourceResolveCache, jikanMeta, animeScheduleMeta] = await Promise.all([
        getStoredValue('jikanCache', {}),
        getStoredValue('animeScheduleCache', {}),
        getStoredValue('sourceResolveCache', {}),
        getStoredValue('jikanMeta', {}),
        getStoredValue('animeScheduleMeta', {}),
      ]);

      setCacheSnapshot({
        jikanCache,
        animeScheduleCache,
        sourceResolveCache,
        jikanMeta,
        animeScheduleMeta,
      });
      setCacheViewerOpen(true);
      setStatusMessage('Cache data loaded.');
    } catch {
      setStatusMessage('Unable to load cache data.');
    } finally {
      setCacheViewerLoading(false);
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
              {CACHE_VIEW_KEYS.map((key) => (
                <div key={key} className="mb-3 rounded-xl border border-cream/10 bg-black/20 p-3 last:mb-0">
                  <p className="font-mono text-[11px] uppercase tracking-[0.13em] text-cream/70">{key}</p>
                  <div className="mt-2 text-sm">{renderTreeValue(cacheSnapshot[key], key)}</div>
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
