import { Info, ListPlus, Play, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAppStore } from '../state/appStore';
import type { AnimeSummary } from '../types/anime';
import { getReleaseBadgeLabel } from '../utils/releaseTime';
import { getDisplayTitle } from '../utils/title';

interface AnimeCardProps {
  anime: AnimeSummary;
  compact?: boolean;
}

export default function AnimeCard({ anime, compact = false }: AnimeCardProps) {
  const selectAnime = useAppStore((state) => state.selectAnime);
  const openRightPanelWithView = useAppStore((state) => state.openRightPanelWithView);
  const playAnimeSeries = useAppStore((state) => state.playAnimeSeries);
  const addAnimeSeriesToQueue = useAppStore((state) => state.addAnimeSeriesToQueue);
  const watchProgress = useAppStore((state) => state.watchProgress);
  const titleLanguage = useAppStore((state) => state.titleLanguage);
  const displayTitle = getDisplayTitle(anime, titleLanguage);
  const detailAnimeId = anime.jikanId ?? anime.id;
  const mediaType = anime.mediaType?.trim().toLowerCase() ?? '';
  const hasTrailer = Boolean(anime.trailerUrl?.trim());
  const watchEntry = watchProgress[anime.id];
  const isWatchedCompleted = Boolean(watchEntry?.completed || (watchEntry?.progress ?? 0) >= 100);
  const posterStatusLabel = getReleaseBadgeLabel(anime.airingDate, anime.mediaType, isWatchedCompleted);
  const mediaLabel =
    mediaType === 'tv'
      ? 'TV'
      : mediaType === 'movie'
        ? 'MOVIE'
        : mediaType === 'ova'
          ? 'OVA'
          : mediaType === 'ona'
            ? 'ONA'
            : mediaType === 'special'
              ? 'SPECIAL'
              : 'TV';

  const openDetailPanel = async () => {
    await selectAnime(anime);
    await openRightPanelWithView('detail');
  };

  const playFromCard = async () => {
    await playAnimeSeries(anime);
  };

  const addAnimeToQueue = async () => {
    await addAnimeSeriesToQueue(anime);
  };

  return (
    <article className="group app-card overflow-hidden transition hover:-translate-y-0.5 hover:bg-carbon/78">
      <button
        type="button"
        onClick={() => void selectAnime(anime)}
        className="block w-full text-left retro-tooltip"
        data-tooltip="Open Anime"
      >
        <div className="relative aspect-[3/4] overflow-hidden bg-black/40">
          <img src={anime.image} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" loading="lazy" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink via-transparent to-transparent" />
          {posterStatusLabel ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-3 z-[1] flex justify-center px-3">
              <span className="inline-flex items-center rounded-sm bg-amberline/92 px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-ink shadow-[0_4px_10px_rgba(0,0,0,0.28)]">
                {posterStatusLabel}
              </span>
            </div>
          ) : null}
          <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full bg-ink/80 px-2.5 py-1 font-mono text-[11px] text-amberline">
            <Star size={13} className="fill-amberline" />
            {anime.score?.toFixed(1) ?? 'N/A'}
          </div>
        </div>
      </button>
      <div className="space-y-2.5 p-3.5">
        <div>
          <h3 className="line-clamp-2 font-display text-lg font-semibold uppercase leading-tight text-cream">{displayTitle}</h3>
          <p className="mt-1 inline-flex">{mediaLabel}</p>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-cream/45">
            {anime.year ?? 'TBA'} / {anime.episodes ?? '?'} eps
          </p>
        </div>
        {!compact && <p className="line-clamp-3 text-sm leading-5 text-cream/62">{anime.synopsis}</p>}
        <div className="flex items-center justify-between gap-3">
          <Link to={`/anime/${detailAnimeId}`} className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amberline hover:text-cream">
            Details
          </Link>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void openDetailPanel()} className="vhs-button-ghost px-2.5 py-1.5 retro-tooltip" aria-label="Open detail panel" data-tooltip="Open Detail Panel">
              <Info size={13} />
            </button>
            {hasTrailer ? (
              <button type="button" onClick={() => void addAnimeToQueue()} className="vhs-button-ghost px-2.5 py-1.5 retro-tooltip" aria-label="Add to queue" data-tooltip="Add to Queue">
                <ListPlus size={13} />
              </button>
            ) : null}
            <button type="button" onClick={() => void playFromCard()} className="vhs-button-ghost px-3 py-1.5 retro-tooltip" data-tooltip="Cue Tape">
              <Play size={14} /> Cue
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
