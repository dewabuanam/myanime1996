import { History as HistoryIcon, Play, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import ConfirmDialog from '../components/ConfirmDialog';
import { useAppStore } from '../state/appStore';
import { getDisplayTitle } from '../utils/title';

type SortMode = 'recent' | 'progress-desc' | 'progress-asc' | 'title';
type PendingHistoryAction = { type: 'clear-all' } | { type: 'remove-item'; animeId: number; title: string } | null;

function formatRelativeTime(value: string) {
  const deltaMs = Date.now() - new Date(value).getTime();
  const seconds = Math.max(1, Math.round(deltaMs / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

export default function History() {
  const history = useAppStore((state) => state.watchHistory);
  const libraryItems = useAppStore((state) => state.libraryItems);
  const libraryNotifications = useAppStore((state) => state.libraryNotifications);
  const libraryLastNotifiedEpisodeByAnimeId = useAppStore((state) => state.libraryLastNotifiedEpisodeByAnimeId);
  const removeHistoryItem = useAppStore((state) => state.removeHistoryItem);
  const clearHistory = useAppStore((state) => state.clearHistory);
  const selectAnime = useAppStore((state) => state.selectAnime);
  const playEpisode = useAppStore((state) => state.playEpisode);
  const requestSeekTo = useAppStore((state) => state.requestSeekTo);
  const setPlaybackTime = useAppStore((state) => state.setPlaybackTime);
  const titleLanguage = useAppStore((state) => state.titleLanguage);

  const formatElapsed = (seconds: number) => {
    const safe = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
    const minutes = Math.floor(safe / 60);
    const rest = safe % 60;
    return `${minutes}:${String(rest).padStart(2, '0')}`;
  };

  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [progressFilter, setProgressFilter] = useState<'all' | 'in-progress' | 'nearly-done'>('all');
  const [pendingAction, setPendingAction] = useState<PendingHistoryAction>(null);

  const filteredHistory = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    const withFilter = history.filter((entry) => {
      const haystack = `${entry.title} ${entry.titleEnglish ?? ''} ${entry.titleJapanese ?? ''}`.toLowerCase();
      const queryMatch = normalized ? haystack.includes(normalized) : true;
      if (!queryMatch) return false;

      if (progressFilter === 'in-progress') return entry.progress < 80;
      if (progressFilter === 'nearly-done') return entry.progress >= 80;
      return true;
    });

    return [...withFilter].sort((a, b) => {
      if (sortMode === 'recent') {
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }
      if (sortMode === 'progress-desc') {
        return b.progress - a.progress;
      }
      if (sortMode === 'progress-asc') {
        return a.progress - b.progress;
      }
      return getDisplayTitle(a, titleLanguage).localeCompare(getDisplayTitle(b, titleLanguage));
    });
  }, [history, progressFilter, query, sortMode, titleLanguage]);

  const averageProgress = useMemo(() => {
    if (!history.length) return 0;
    const total = history.reduce((acc, entry) => acc + entry.progress, 0);
    return Math.round(total / history.length);
  }, [history]);

  const newestEntry = history[0];

  const latestNotifiedEpisodeByAnimeId = useMemo(() => {
    const latestByAnimeId = new Map<number, number>();

    const update = (animeId: number, episode: number) => {
      const safeAnimeId = Math.max(1, Math.floor(Number(animeId) || 0));
      const safeEpisode = Math.max(0, Math.floor(Number(episode) || 0));
      if (safeAnimeId <= 0 || safeEpisode <= 0) return;
      const previous = latestByAnimeId.get(safeAnimeId) ?? 0;
      if (safeEpisode > previous) {
        latestByAnimeId.set(safeAnimeId, safeEpisode);
      }
    };

    for (const [rawAnimeId, rawEpisode] of Object.entries(libraryLastNotifiedEpisodeByAnimeId)) {
      update(Number(rawAnimeId), Number(rawEpisode));
    }

    for (const notification of libraryNotifications) {
      update(notification.animeId, notification.episode);
    }

    return latestByAnimeId;
  }, [libraryLastNotifiedEpisodeByAnimeId, libraryNotifications]);

  const getResumePlan = (animeId: number) => {
    const entry = history.find((item) => item.animeId === animeId);
    if (!entry) return null;
    if (entry.progress <= 0) return null;

    const currentEpisode = Math.max(1, Math.floor(entry.episode || 1));
    const resumeAt = Math.max(0, Math.floor(entry.lastPlaybackSeconds ?? 0));
    const resumeDuration = Math.max(0, Math.floor(entry.episodeDurationSeconds ?? 0));

    if (entry.progress < 100) {
      if (resumeAt <= 0 && currentEpisode <= 1) return null;
      return {
        entry,
        episode: currentEpisode,
        resumeAt,
        resumeDuration,
      };
    }

    const candidateAnimeIds = [entry.animeId, entry.jikanId]
      .filter((value, index, list): value is number => typeof value === 'number' && value > 0 && list.indexOf(value) === index);
    let latestKnownEpisode = Math.max(
      1,
      currentEpisode,
      Math.floor(Number(entry.totalEpisodes) || 0),
    );

    for (const candidateAnimeId of candidateAnimeIds) {
      const libraryItem = libraryItems[candidateAnimeId];
      latestKnownEpisode = Math.max(
        latestKnownEpisode,
        Math.floor(Number(libraryItem?.currentEpisode) || 0),
        Math.floor(Number(libraryItem?.episodes) || 0),
        latestNotifiedEpisodeByAnimeId.get(candidateAnimeId) ?? 0,
      );
    }

    const nextEpisode = currentEpisode + 1;
    if (nextEpisode > latestKnownEpisode) return null;

    return {
      entry,
      episode: nextEpisode,
      resumeAt: 0,
      resumeDuration: 0,
    };
  };

  const handleResume = async (animeId: number) => {
    const resumePlan = getResumePlan(animeId);
    if (!resumePlan) return;
    const entry = resumePlan.entry;
    const fallbackDurationMinutes =
      entry.episodeDurationSeconds && entry.episodeDurationSeconds > 0
        ? Math.max(1, Math.round(entry.episodeDurationSeconds / 60))
        : undefined;
    const anime = {
      id: entry.animeId,
      jikanId: entry.jikanId,
      title: entry.title,
      titleEnglish: entry.titleEnglish,
      titleJapanese: entry.titleJapanese,
      image: entry.image,
      banner: undefined,
      synopsis: '',
      episodes: entry.totalEpisodes,
      currentEpisode: entry.totalEpisodes,
      durationMinutes: fallbackDurationMinutes,
      score: undefined,
      year: undefined,
      genres: [],
      studios: [],
    };
    await selectAnime(anime);
    await playEpisode(anime, resumePlan.episode);
    const resumeAt = Math.max(0, resumePlan.resumeAt);
    if (resumeAt > 0) {
      requestSeekTo(resumeAt);
    }
  };

  const handleStartOver = async (animeId: number) => {
    const resumePlan = getResumePlan(animeId);
    if (!resumePlan) return;
    const entry = resumePlan.entry;
    const fallbackDurationMinutes =
      entry.episodeDurationSeconds && entry.episodeDurationSeconds > 0
        ? Math.max(1, Math.round(entry.episodeDurationSeconds / 60))
        : undefined;
    const anime = {
      id: entry.animeId,
      jikanId: entry.jikanId,
      title: entry.title,
      titleEnglish: entry.titleEnglish,
      titleJapanese: entry.titleJapanese,
      image: entry.image,
      banner: undefined,
      synopsis: '',
      episodes: entry.totalEpisodes,
      currentEpisode: entry.totalEpisodes,
      durationMinutes: fallbackDurationMinutes,
      score: undefined,
      year: undefined,
      genres: [],
      studios: [],
    };
    await selectAnime(anime);
    await playEpisode(anime, resumePlan.episode);
    setPlaybackTime(0);
    requestSeekTo(0);
  };

  const isStartOverAvailable = (animeId: number) => {
    const resumePlan = getResumePlan(animeId);
    return Boolean(resumePlan);
  };

  const handleClearAll = async () => {
    setPendingAction({ type: 'clear-all' });
  };

  const handleConfirmAction = async () => {
    if (!pendingAction) return;

    if (pendingAction.type === 'clear-all') {
      await clearHistory();
      setPendingAction(null);
      return;
    }

    await removeHistoryItem(pendingAction.animeId);
    setPendingAction(null);
  };

  return (
    <div className="history-page seeall-page space-y-4 pb-8">
      <section className="seeall-header history-header px-6 py-5">
        <div>
          <p className="eyebrow">Playback log</p>
          <h1 className="section-title">History</h1>
          <p className="seeall-subtitle">Track playback progress and quickly resume where you left off.</p>
        </div>
        <button type="button" className="see-all-link retro-tooltip" onClick={() => void handleClearAll()} disabled={!history.length} data-tooltip="Clear All History">
          Clear all
        </button>
      </section>

      <section className="history-content space-y-5 px-6">
        <section className="history-stats-grid">
        <article className="history-stat-card">
          <p>Total entries</p>
          <strong>{history.length}</strong>
        </article>
        <article className="history-stat-card">
          <p>Average progress</p>
          <strong>{averageProgress}%</strong>
        </article>
        <article className="history-stat-card">
          <p>Latest activity</p>
          <strong>{newestEntry ? formatRelativeTime(newestEntry.updatedAt) : 'No activity'}</strong>
        </article>
        </section>

        <section className="history-controls">
        <label className="history-search" htmlFor="history-search">
          <Search size={14} />
          <input
            id="history-search"
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search title..."
          />
        </label>

        <label className="history-select-wrap" htmlFor="history-sort">
          Sort
          <select id="history-sort" value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
            <option value="recent">Recently watched</option>
            <option value="progress-desc">Highest progress</option>
            <option value="progress-asc">Lowest progress</option>
            <option value="title">Title</option>
          </select>
        </label>

        <label className="history-select-wrap" htmlFor="history-filter">
          Filter
          <select
            id="history-filter"
            value={progressFilter}
            onChange={(event) => setProgressFilter(event.target.value as 'all' | 'in-progress' | 'nearly-done')}
          >
            <option value="all">All progress</option>
            <option value="in-progress">In progress (&lt; 80%)</option>
            <option value="nearly-done">Nearly done (80%+)</option>
          </select>
        </label>
        </section>

        <section className="history-list">
          {!filteredHistory.length && (
            <div className="app-card p-6 font-mono text-sm uppercase tracking-[0.12em] text-cream/50">
              No history matched this filter.
            </div>
          )}

          {filteredHistory.map((item) => (
            <article key={item.animeId} className="history-item">
              <img src={item.image} alt="" className="history-item-image" />
              <div className="history-item-copy">
                <p className="history-item-title">{getDisplayTitle(item, titleLanguage)}</p>
                <p className="history-item-meta">
                  EP {String(item.episode).padStart(2, '0')}
                  {item.totalEpisodes && item.totalEpisodes > 0 ? `/${String(item.totalEpisodes).padStart(2, '0')}` : ''} · {formatElapsed(item.lastPlaybackSeconds ?? 0)} · Updated{' '}
                  {formatRelativeTime(item.updatedAt)}
                </p>
                <div className="stream-progress">
                  <span style={{ width: `${item.progress}%` }} />
                </div>
              </div>
              <div className="history-item-actions">
                {isStartOverAvailable(item.animeId) ? (
                  <button type="button" className="history-action-btn history-action-btn-startover retro-tooltip" onClick={() => void handleStartOver(item.animeId)} data-tooltip="Start Over Playback">
                    <Play size={13} /> Start Over
                  </button>
                ) : null}
                <button type="button" className="history-action-btn history-action-btn-resume retro-tooltip" onClick={() => void handleResume(item.animeId)} data-tooltip="Resume Playback">
                  <HistoryIcon size={13} /> Resume
                </button>
                <button
                  type="button"
                  className="history-action-btn history-action-btn-remove retro-tooltip"
                  onClick={() => setPendingAction({ type: 'remove-item', animeId: item.animeId, title: getDisplayTitle(item, titleLanguage) })}
                  aria-label="Remove from history"
                  data-tooltip="Remove from History"
                >
                  <Trash2 size={13} />
                  Remove
                </button>
              </div>
            </article>
          ))}
        </section>
      </section>
      <ConfirmDialog
        open={!!pendingAction}
        title={pendingAction?.type === 'clear-all' ? 'Clear all history?' : 'Remove this history item?'}
        message={
          pendingAction?.type === 'clear-all'
            ? 'This will remove all history and watch progress entries from this device.'
            : `Remove ${pendingAction?.title ?? 'this anime'} from history?`
        }
        confirmLabel={pendingAction?.type === 'clear-all' ? 'Clear all' : 'Remove'}
        tone="danger"
        onCancel={() => setPendingAction(null)}
        onConfirm={() => void handleConfirmAction()}
      />
    </div>
  );
}
