import { History, Play } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { AnimeSummary, WatchProgress } from '../types/anime';
import { useAppStore } from '../state/appStore';
import { getDisplayTitle } from '../utils/title';
import AnimeCard from './AnimeCard';

interface AnimeRowProps {
  title: string;
  anime?: AnimeSummary[];
  progress?: WatchProgress[];
}

export default function AnimeRow({ title, anime = [], progress = [] }: AnimeRowProps) {
  const navigate = useNavigate();
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

  const handleResume = async (item: WatchProgress) => {
    const fallbackDurationMinutes =
      item.episodeDurationSeconds && item.episodeDurationSeconds > 0
        ? Math.max(1, Math.round(item.episodeDurationSeconds / 60))
        : undefined;
    const anime = {
      id: item.animeId,
      title: item.title,
      titleEnglish: item.titleEnglish,
      titleJapanese: item.titleJapanese,
      image: item.image,
      banner: undefined,
      synopsis: '',
      episodes: item.totalEpisodes,
      durationMinutes: fallbackDurationMinutes,
      score: undefined,
      year: undefined,
      genres: [],
      studios: [],
    };
    await selectAnime(anime);
    await playEpisode(anime, item.episode);
    const resumeAt = Math.max(0, Math.floor(item.lastPlaybackSeconds ?? 0));
    if (resumeAt > 0) {
      requestSeekTo(resumeAt);
    }
  };

  const handleStartOver = async (item: WatchProgress) => {
    const fallbackDurationMinutes =
      item.episodeDurationSeconds && item.episodeDurationSeconds > 0
        ? Math.max(1, Math.round(item.episodeDurationSeconds / 60))
        : undefined;
    const anime = {
      id: item.animeId,
      title: item.title,
      titleEnglish: item.titleEnglish,
      titleJapanese: item.titleJapanese,
      image: item.image,
      banner: undefined,
      synopsis: '',
      episodes: item.totalEpisodes,
      durationMinutes: fallbackDurationMinutes,
      score: undefined,
      year: undefined,
      genres: [],
      studios: [],
    };
    await selectAnime(anime);
    await playEpisode(anime, item.episode);
    setPlaybackTime(0);
    requestSeekTo(0);
  };

  const isResumable = (item: WatchProgress) => item.progress > 0 && item.progress < 100;

  const openEpisodeDetail = (item: WatchProgress) => {
    navigate(`/anime/${item.animeId}?episode=${Math.max(1, item.episode)}`);
  };

  return (
    <section className="space-y-4">
      <h2 className="section-title">{title}</h2>
      <div className="flex gap-4 overflow-x-auto pb-3">
        {progress.map((item) => (
          <div key={item.animeId} className="app-card min-w-72 p-3">
            <button type="button" onClick={() => openEpisodeDetail(item)} className="relative block w-full overflow-hidden rounded-xl text-left retro-tooltip" data-tooltip="Open Anime Detail">
              <img src={item.image} alt="" className="h-32 w-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-3">
                <p className="line-clamp-1 font-display text-base font-semibold uppercase leading-tight text-cream">{getDisplayTitle(item, titleLanguage)}</p>
                <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.12em] text-cream/75">
                  EP {String(item.episode).padStart(2, '0')}
                  {item.totalEpisodes && item.totalEpisodes > 0 ? `/${String(item.totalEpisodes).padStart(2, '0')}` : ''} · {formatElapsed(item.lastPlaybackSeconds ?? 0)}
                </p>
              </div>
            </button>
            <div className="mt-3">
              <div className="stream-progress">
                <span style={{ width: `${item.progress}%` }} />
              </div>
            </div>
            <div className="mt-2.5 flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-cream/60">{item.progress}% watched</span>
              <div className="flex items-center gap-1.5">
                {isResumable(item) ? (
                  <button type="button" className="vhs-button px-3 py-1.5 retro-tooltip" onClick={() => void handleStartOver(item)} data-tooltip="Start Over">
                    <Play size={13} /> Start Over
                  </button>
                ) : null}
                <button type="button" className="vhs-button px-3 py-1.5 retro-tooltip" onClick={() => void handleResume(item)} data-tooltip="Resume Playback">
                  <History size={13} /> Resume
                </button>
              </div>
            </div>
          </div>
        ))}
        {anime.map((item) => (
          <div key={item.id} className="min-w-56 max-w-56">
            <AnimeCard anime={item} compact />
          </div>
        ))}
        {!progress.length && !anime.length && (
          <div className="app-card min-w-full p-6 font-mono text-sm uppercase tracking-[0.12em] text-cream/50">
            No tapes queued yet. Start watching from the hero or popular grid.
          </div>
        )}
      </div>
    </section>
  );
}
