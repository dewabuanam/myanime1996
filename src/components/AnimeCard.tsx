import { BookmarkPlus, Info, ListPlus, Play, Star } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import LibraryStatusPickerModal from './LibraryStatusPickerModal';
import SeasonLinkBadge from './SeasonLinkBadge';
import { resolveCanonicalDetailRouteId } from '../services/catalogSource';
import { useAppStore } from '../state/appStore';
import type { AnimeSummary, LibraryStatus } from '../types/anime';
import { getReleaseBadgeLabel } from '../utils/releaseTime';
import { resolveAnimeSeason } from '../utils/season';
import { formatEpisodeTotalLabel } from '../utils/episodeCountLabel';
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
  const setAnimeLibraryStatus = useAppStore((state) => state.setAnimeLibraryStatus);
  const removeAnimeFromLibrary = useAppStore((state) => state.removeAnimeFromLibrary);
  const getLibraryStatusForAnime = useAppStore((state) => state.getLibraryStatusForAnime);
  const [libraryPickerOpen, setLibraryPickerOpen] = useState(false);
  const libraryButtonRef = useRef<HTMLButtonElement | null>(null);
  const displayTitle = getDisplayTitle(anime, titleLanguage);
  const detailAnimeId = anime.jikanId;
  const mediaType = anime.mediaType?.trim().toLowerCase() ?? '';
  const watchEntry = (detailAnimeId ? watchProgress[detailAnimeId] : undefined) ?? watchProgress[anime.id];
  const isWatchedCompleted = Boolean(watchEntry?.completed || (watchEntry?.progress ?? 0) >= 100);
  const posterStatusLabel = getReleaseBadgeLabel(anime.airingDate, anime.mediaType, isWatchedCompleted);
  const seasonMeta = resolveAnimeSeason(anime);
  const currentEpisode = watchEntry?.episode ?? anime.episodes;
  const episodeTotalLabel = formatEpisodeTotalLabel(currentEpisode, anime.episodes, anime.status);
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
    const canonicalDetailId = await resolveCanonicalDetailRouteId(anime);
    const selected = canonicalDetailId ? { ...anime, id: canonicalDetailId, jikanId: canonicalDetailId } : anime;
    await selectAnime(selected);
    await openRightPanelWithView('detail');
  };

  const playFromCard = async () => {
    await playAnimeSeries(anime);
  };

  const addAnimeToQueue = async () => {
    await addAnimeSeriesToQueue(anime);
  };

  const handleLibraryStatusConfirm = async (status: LibraryStatus) => {
    await setAnimeLibraryStatus(anime, status);
  };

  const handleRemoveFromLibrary = async () => {
    await removeAnimeFromLibrary(anime.jikanId ?? anime.id);
    setLibraryPickerOpen(false);
  };

  const currentLibraryStatus = getLibraryStatusForAnime(anime.id, anime.jikanId);

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
            {anime.year ?? 'TBA'} / {episodeTotalLabel} eps
          </p>
          {seasonMeta ? <SeasonLinkBadge season={seasonMeta.season} year={seasonMeta.year} variant="compact" className="mt-1" /> : null}
        </div>
        {!compact && <p className="line-clamp-3 text-sm leading-5 text-cream/62">{anime.synopsis}</p>}
        <div className="flex items-center justify-between gap-3">
          {detailAnimeId ? (
            <Link to={`/anime/${detailAnimeId}`} className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amberline hover:text-cream">
              Details
            </Link>
          ) : (
            <button type="button" onClick={() => void openDetailPanel()} className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amberline hover:text-cream">
              Details
            </button>
          )}
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void openDetailPanel()} className="vhs-button-ghost px-2.5 py-1.5 retro-tooltip" aria-label="Open detail panel" data-tooltip="Open Detail Panel">
              <Info size={13} />
            </button>
            <button type="button" onClick={() => void addAnimeToQueue()} className="vhs-button-ghost px-2.5 py-1.5 retro-tooltip" aria-label="Add to queue" data-tooltip="Add to Queue">
              <ListPlus size={13} />
            </button>
            <button ref={libraryButtonRef} type="button" onClick={() => setLibraryPickerOpen(true)} className="vhs-button-ghost px-2.5 py-1.5 retro-tooltip" aria-label="Add to library" data-tooltip="Add to Library">
              <BookmarkPlus size={13} />
            </button>
            <button type="button" onClick={() => void playFromCard()} className="vhs-button-ghost px-3 py-1.5 retro-tooltip" data-tooltip="Cue Tape">
              <Play size={14} /> Cue
            </button>
          </div>
        </div>
      </div>

      <LibraryStatusPickerModal
        open={libraryPickerOpen}
        title={displayTitle}
        initialStatus={currentLibraryStatus}
        anchorElement={libraryButtonRef.current}
        onClose={() => setLibraryPickerOpen(false)}
        onConfirm={(status) => {
          void handleLibraryStatusConfirm(status);
          setLibraryPickerOpen(false);
        }}
        onRemove={
          currentLibraryStatus
            ? () => {
                void handleRemoveFromLibrary();
              }
            : undefined
        }
      />
    </article>
  );
}
