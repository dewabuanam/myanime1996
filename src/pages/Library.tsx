import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { BookMarked, Info, Trash2, X } from 'lucide-react';
import AnimeHoverPreview from '../components/AnimeHoverPreview';
import ConfirmDialog from '../components/ConfirmDialog';
import LibraryStatusPickerModal from '../components/LibraryStatusPickerModal';
import { resolveCanonicalDetailRouteId } from '../services/catalogSource';
import { useAppStore } from '../state/appStore';
import type { LibraryAnimeItem, LibraryStatus } from '../types/anime';

const LIBRARY_STATUS_ORDER: LibraryStatus[] = ['watching', 'plan-to-watch', 'on-hold', 'dropped', 'completed'];

const LIBRARY_STATUS_LABEL: Record<LibraryStatus, string> = {
  watching: 'Watching',
  'plan-to-watch': 'Plan to Watch',
  'on-hold': 'On-Hold',
  dropped: 'Dropped',
  completed: 'Completed',
};

const LIBRARY_TABS: Array<{ key: LibraryStatus; label: string }> = [
  { key: 'watching', label: 'Watching' },
  { key: 'plan-to-watch', label: 'Plan to Watch' },
  { key: 'on-hold', label: 'On-Hold' },
  { key: 'dropped', label: 'Dropped' },
  { key: 'completed', label: 'Completed' },
];

function formatStatus(status: LibraryStatus) {
  return LIBRARY_STATUS_LABEL[status];
}

function getLibraryDisplayTitle(item: LibraryAnimeItem, preferEnglish: boolean) {
  if (preferEnglish) {
    return item.titleEnglish?.trim() || item.title?.trim() || 'Unknown Title';
  }
  return item.title?.trim() || item.titleEnglish?.trim() || 'Unknown Title';
}

function toAnimeSummaryFromLibraryItem(item: LibraryAnimeItem) {
  return {
    id: item.jikanId ?? item.animeId,
    jikanId: item.jikanId,
    animeScheduleRoute: item.animeScheduleRoute,
    title: item.title,
    titleEnglish: item.titleEnglish,
    titleJapanese: item.titleJapanese,
    image: item.image,
    synopsis: '',
    studios: [],
    genres: [],
    mediaType: item.mediaType,
    year: item.year,
    episodes: item.episodes,
    currentEpisode: item.currentEpisode,
  };
}

export default function Library() {
  const libraryItems = useAppStore((state) => state.libraryItems);
  const libraryNotifications = useAppStore((state) => state.libraryNotifications);
  const titleLanguage = useAppStore((state) => state.titleLanguage);
  const setAnimeLibraryStatus = useAppStore((state) => state.setAnimeLibraryStatus);
  const removeAnimeFromLibrary = useAppStore((state) => state.removeAnimeFromLibrary);
  const libraryStatusNotificationSettings = useAppStore((state) => state.libraryStatusNotificationSettings);
  const setLibraryStatusNotificationEnabled = useAppStore((state) => state.setLibraryStatusNotificationEnabled);
  const playAnimeSeries = useAppStore((state) => state.playAnimeSeries);
  const playEpisode = useAppStore((state) => state.playEpisode);
  const addAnimeSeriesToQueue = useAppStore((state) => state.addAnimeSeriesToQueue);
  const requestSeekTo = useAppStore((state) => state.requestSeekTo);
  const setPlaybackTime = useAppStore((state) => state.setPlaybackTime);
  const setPlaybackDuration = useAppStore((state) => state.setPlaybackDuration);
  const watchProgress = useAppStore((state) => state.watchProgress);
  const selectAnime = useAppStore((state) => state.selectAnime);
  const openRightPanelWithView = useAppStore((state) => state.openRightPanelWithView);
  const [editingItem, setEditingItem] = useState<LibraryAnimeItem | null>(null);
  const [libraryPickerAnchorElement, setLibraryPickerAnchorElement] = useState<HTMLElement | null>(null);
  const [pendingRemoveItem, setPendingRemoveItem] = useState<LibraryAnimeItem | null>(null);
  const [undoRemovedItem, setUndoRemovedItem] = useState<LibraryAnimeItem | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeTab, setActiveTab] = useState<LibraryStatus>('watching');

  const groupedByStatus = useMemo(() => {
    const grouped: Record<LibraryStatus, LibraryAnimeItem[]> = {
      watching: [],
      'plan-to-watch': [],
      'on-hold': [],
      dropped: [],
      completed: [],
    };

    Object.values(libraryItems).forEach((item) => {
      grouped[item.status].push(item);
    });

    for (const status of LIBRARY_STATUS_ORDER) {
      grouped[status].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
    }

    return grouped;
  }, [libraryItems]);

  const unreadNotificationCountByAnimeId = useMemo(() => {
    const counts = new Map<number, number>();
    for (const notification of libraryNotifications) {
      if (notification.read) continue;
      const key = Math.max(1, Math.floor(Number(notification.animeId) || 0));
      if (key <= 0) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [libraryNotifications]);

  const preferEnglish = titleLanguage === 'english';
  const visibleItems = groupedByStatus[activeTab];
  const isActiveStatusNotificationEnabled = Boolean(libraryStatusNotificationSettings[activeTab]);
  const activeStatusTooltip = `${formatStatus(activeTab)} alerts are ${isActiveStatusNotificationEnabled ? 'enabled' : 'disabled'}`;

  useEffect(() => {
    return () => {
      if (!undoTimerRef.current) return;
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    };
  }, []);

  const clearUndoBanner = () => {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setUndoRemovedItem(null);
  };

  const scheduleUndoBanner = (item: LibraryAnimeItem) => {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setUndoRemovedItem(item);
    undoTimerRef.current = setTimeout(() => {
      setUndoRemovedItem(null);
      undoTimerRef.current = null;
    }, 30_000);
  };

  const confirmRemoveLibraryItem = async () => {
    if (!pendingRemoveItem) return;
    const removeTarget = pendingRemoveItem;
    setPendingRemoveItem(null);
    await removeAnimeFromLibrary(removeTarget.jikanId ?? removeTarget.animeId);
    scheduleUndoBanner(removeTarget);
  };

  const handleUndoRemove = async () => {
    if (!undoRemovedItem) return;
    const restoreTarget = undoRemovedItem;
    clearUndoBanner();
    await setAnimeLibraryStatus(toAnimeSummaryFromLibraryItem(restoreTarget), restoreTarget.status);
  };

  const openLibraryDetailPanel = async (item: LibraryAnimeItem) => {
    const animeSummary = toAnimeSummaryFromLibraryItem(item);
    const canonicalDetailId = await resolveCanonicalDetailRouteId(animeSummary);
    const selected = canonicalDetailId
      ? { ...animeSummary, id: canonicalDetailId, jikanId: canonicalDetailId }
      : animeSummary;
    await selectAnime(selected);
    await openRightPanelWithView('detail');
  };

  const getEpisodeProgressLabel = (item: LibraryAnimeItem) => {
    const animeId = Math.max(1, Math.floor(item.animeId));
    const canonicalAnimeId = Math.max(1, Math.floor(item.jikanId ?? animeId));
    const progressEntry = watchProgress[canonicalAnimeId] ?? watchProgress[animeId];

    const watchedEpisode = progressEntry && progressEntry.progress > 0
      ? Math.max(1, Math.floor(progressEntry.episode || 1))
      : 0;

    const availableEpisode = Math.max(
      0,
      Math.floor(Number(item.currentEpisode) || 0),
      Math.floor(Number(item.episodes) || 0),
      Math.floor(Number(progressEntry?.totalEpisodes) || 0),
    );

    if (availableEpisode <= 0 && watchedEpisode <= 0) return 'N/A';
    if (availableEpisode <= 0) return `${watchedEpisode}/?`;
    return `${Math.min(watchedEpisode, availableEpisode)}/${availableEpisode}`;
  };

  const getResumePlan = (item: LibraryAnimeItem) => {
    const animeId = Math.max(1, Math.floor(item.animeId));
    const canonicalAnimeId = Math.max(1, Math.floor(item.jikanId ?? animeId));
    const entry = watchProgress[canonicalAnimeId] ?? watchProgress[animeId];
    if (!entry) return null;
    if (entry.progress <= 0) return null;

    const currentEpisode = Math.max(1, Math.floor(entry.episode || 1));
    const resumeAt = Math.max(0, Math.floor(entry.lastPlaybackSeconds ?? 0));
    const resumeDuration = Math.max(0, Math.floor(entry.episodeDurationSeconds ?? 0));

    if (entry.progress < 100) {
      if (resumeAt <= 0 && currentEpisode <= 1) return null;
      return {
        episode: currentEpisode,
        resumeAt,
        resumeDuration,
      };
    }

    const latestKnownEpisode = Math.max(
      1,
      currentEpisode,
      Math.floor(Number(item.currentEpisode) || 0),
      Math.floor(Number(item.episodes) || 0),
      Math.floor(Number(entry.totalEpisodes) || 0),
    );
    const nextEpisode = currentEpisode + 1;
    if (nextEpisode > latestKnownEpisode) return null;

    return {
      episode: nextEpisode,
      resumeAt: 0,
      resumeDuration: 0,
    };
  };

  const canPlayLibraryItem = (item: LibraryAnimeItem, isResumeAction: boolean) => {
    if (isResumeAction) return true;
    const status = (item.status || '').toLowerCase();
    return !status.includes('not yet') && !status.includes('upcoming');
  };

  const playFromLibraryCard = async (item: LibraryAnimeItem) => {
    const anime = toAnimeSummaryFromLibraryItem(item);
    const resumePlan = getResumePlan(item);

    if (resumePlan) {
      await playEpisode(anime, Math.max(1, resumePlan.episode));
      if (resumePlan.resumeDuration > 0) {
        setPlaybackDuration(resumePlan.resumeDuration);
      }
      if (resumePlan.resumeAt > 0) {
        setPlaybackTime(resumePlan.resumeAt);
        requestSeekTo(resumePlan.resumeAt);
      }
      return;
    }

    await playAnimeSeries(anime);
  };

  const startOverFromLibraryCard = async (item: LibraryAnimeItem) => {
    const anime = toAnimeSummaryFromLibraryItem(item);
    await playAnimeSeries(anime);
  };

  return (
    <div className="seeall-page space-y-4 pb-8">
      <div className="sticky top-0 z-30 space-y-2">
        <section className="seeall-header library-header relative overflow-hidden border border-amberline/35 px-6 pb-3 pt-5 shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
          <div className="absolute inset-0 bg-gradient-to-r from-[#100b08]/96 via-[#1a120c]/86 to-[#2e2016]/46" />
          <div className="pointer-events-none absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(252,214,148,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(252,214,148,0.04)_1px,transparent_1px)] [background-size:3px_3px]" />
          <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-amberline/80">Tape Archive</p>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-3xl uppercase tracking-[0.08em] text-cream">{formatStatus(activeTab)}</h1>
                <button
                  type="button"
                  className="retro-tooltip rounded-md border border-amberline/35 bg-black/25 p-1.5 text-amberline/85 transition hover:border-amberline/70 hover:text-amberline"
                  data-tooltip={activeStatusTooltip}
                  aria-label={activeStatusTooltip}
                  onClick={() => void setLibraryStatusNotificationEnabled(activeTab, !isActiveStatusNotificationEnabled)}
                >
                  {isActiveStatusNotificationEnabled ? <Bell size={17} /> : <BellOff size={17} />}
                </button>
              </div>
              <p className="mt-2 max-w-2xl font-mono text-[11px] uppercase tracking-[0.08em] text-cream/68">
                Manage your {formatStatus(activeTab).toLowerCase()} shelf and alert behavior from here.
              </p>
            </div>
          </div>

          <div className="relative z-10 mt-3">
            <div className="inline-flex flex-wrap gap-2 rounded-xl border border-cream/20 bg-black/25 p-2">
              {LIBRARY_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={`rounded-md border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] transition ${
                    activeTab === tab.key
                      ? 'border-amberline/85 bg-gradient-to-b from-amberline/28 to-amberline/16 text-cream shadow-[0_0_0_1px_rgba(0,0,0,0.35)_inset]'
                      : 'border-cream/25 bg-black/20 text-cream/75 hover:border-cream/45 hover:bg-black/35'
                  }`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {undoRemovedItem ? (
          <section className="app-card flex items-center justify-between gap-3 border border-amberline/40 bg-amberline/10 px-3 py-2">
            <p className="text-sm text-cream/90">
              Removed <span className="font-semibold">{getLibraryDisplayTitle(undoRemovedItem, preferEnglish)}</span>. Undo available for 30 seconds.
            </p>
            <div className="flex items-center gap-2">
              <button type="button" className="vhs-button-ghost px-2 py-1 text-[10px]" onClick={() => void handleUndoRemove()}>
                Undo
              </button>
              <button type="button" className="vhs-button-ghost px-2 py-1 text-[10px]" aria-label="Dismiss undo banner" onClick={clearUndoBanner}>
                <X size={12} />
              </button>
            </div>
          </section>
        ) : null}
      </div>

      <section className="px-6">
        {visibleItems.length === 0 ? (
          <div className="app-card border border-cream/20 bg-black/22 p-8 text-center font-mono text-[11px] uppercase tracking-[0.08em] text-cream/70">
            No anime in this tab yet. Add anime from cards and detail panels.
          </div>
        ) : (
          <div className="grid grid-cols-6 gap-3 max-2xl:grid-cols-5 max-xl:grid-cols-4 max-lg:grid-cols-3 max-sm:grid-cols-2">
            {visibleItems.map((item) => {
              const unreadAnimeIds = [item.animeId, item.jikanId]
                .filter((value, index, list): value is number => typeof value === 'number' && value > 0 && list.indexOf(value) === index);
              const unreadCount = unreadAnimeIds.reduce((total, animeId) => total + (unreadNotificationCountByAnimeId.get(animeId) ?? 0), 0);
              const resumePlan = getResumePlan(item);
              const episodeProgressLabel = getEpisodeProgressLabel(item);
              const isResumeAction = Boolean(resumePlan);
              const playLabel = isResumeAction ? 'Resume' : 'Play Now';
              const canPlayAnime = canPlayLibraryItem(item, isResumeAction);
              return (
                <AnimeHoverPreview
                  key={item.animeId}
                  anime={toAnimeSummaryFromLibraryItem(item)}
                  episodeLabel={episodeProgressLabel}
                  mediaLabel={item.mediaType?.toUpperCase() ?? 'ANIME'}
                  playLabel={playLabel}
                  isResumeAction={isResumeAction}
                  canPlayAnime={canPlayAnime}
                  onPlay={() => void playFromLibraryCard(item)}
                  onStartOver={isResumeAction ? () => void startOverFromLibraryCard(item) : undefined}
                  onAddToQueue={() => void addAnimeSeriesToQueue(toAnimeSummaryFromLibraryItem(item))}
                  onOpenDetail={() => void openLibraryDetailPanel(item)}
                >
                  <article className="anime-card media-thumb-card library-row-card border border-cream/12 bg-black/18 p-2">
                    <div className="anime-card-poster-wrap">
                      <img src={item.image} alt="" className="anime-card-poster" loading="lazy" />
                      <span
                        className="anime-hover-preview-episode-overlay retro-tooltip"
                        data-tooltip={`Progress ${episodeProgressLabel}`}
                        aria-label={`Progress ${episodeProgressLabel}`}
                      >
                        {episodeProgressLabel}
                      </span>
                      {unreadCount > 0 ? (
                        <span
                          className="absolute right-2 top-2 z-[2] inline-flex min-h-[1rem] min-w-[1rem] items-center justify-center rounded-full border border-amberline/65 bg-amberline/18 px-1 font-mono text-[10px] leading-none text-amberline"
                          title={`${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}`}
                        >
                          {unreadCount}
                        </span>
                      ) : null}
                    </div>

                    <div className="anime-card-copy mt-2">
                      <p className="anime-card-title anime-card-title-slot line-clamp-2">{getLibraryDisplayTitle(item, preferEnglish)}</p>
                      <p className="anime-card-jp anime-card-jp-slot line-clamp-1">{item.titleJapanese || '\u3000'}</p>
                      <p className="anime-card-jp">{item.mediaType ?? 'anime'} • {item.year ?? 'tba'}</p>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        className="vhs-button-ghost px-2 py-1 text-[10px] retro-tooltip"
                        onClick={() => void openLibraryDetailPanel(item)}
                        aria-label="Open anime detail"
                        data-tooltip="Open Detail"
                      >
                        <Info size={13} />
                      </button>
                      <button
                        type="button"
                        className="vhs-button-ghost px-2 py-1 text-[10px] retro-tooltip"
                        onClick={(event) => {
                          setLibraryPickerAnchorElement(event.currentTarget);
                          setEditingItem(item);
                        }}
                        aria-label="Update library status"
                        data-tooltip="Status"
                      >
                        <BookMarked size={13} />
                      </button>
                      <button
                        type="button"
                        className="vhs-button-ghost px-2 py-1 text-[10px] retro-tooltip"
                        onClick={() => setPendingRemoveItem(item)}
                        aria-label="Remove from library"
                        data-tooltip="Remove"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </article>
                </AnimeHoverPreview>
              );
            })}
          </div>
        )}
      </section>

      <LibraryStatusPickerModal
        open={Boolean(editingItem)}
        title={editingItem ? getLibraryDisplayTitle(editingItem, preferEnglish) : 'Anime'}
        anchorElement={libraryPickerAnchorElement}
        initialStatus={editingItem?.status ?? null}
        onClose={() => {
          setEditingItem(null);
          setLibraryPickerAnchorElement(null);
        }}
        onConfirm={(status) => {
          if (!editingItem) return;
          void setAnimeLibraryStatus(
            toAnimeSummaryFromLibraryItem(editingItem),
            status,
          );
          setEditingItem(null);
          setLibraryPickerAnchorElement(null);
        }}
        onRemove={
          editingItem
            ? () => {
                setPendingRemoveItem(editingItem);
                setEditingItem(null);
                setLibraryPickerAnchorElement(null);
              }
            : undefined
        }
      />

      <ConfirmDialog
        open={Boolean(pendingRemoveItem)}
        title="Remove From Library"
        message={pendingRemoveItem ? `Remove ${getLibraryDisplayTitle(pendingRemoveItem, preferEnglish)} from your library?` : 'Remove this anime from your library?'}
        confirmLabel="Remove"
        cancelLabel="Cancel"
        tone="danger"
        onCancel={() => setPendingRemoveItem(null)}
        onConfirm={() => {
          void confirmRemoveLibraryItem();
        }}
      />
    </div>
  );
}
