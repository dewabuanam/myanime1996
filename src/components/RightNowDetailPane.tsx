import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { CalendarDays, ChevronDown, Clock3, List, ListPlus, Minus, Play, Plus, RotateCcw, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import type { AnimeDetail, AnimeEpisode, AnimeEpisodePagination, TitleLanguage } from '../types/anime';
import { useAppStore } from '../state/appStore';
import { formatEpisodeDuration, formatEpisodeScoreOutOfTen } from '../utils/episodeFormatters';
import { formatEpisodeTotalLabel } from '../utils/episodeCountLabel';
import { getEpisodeDisplayTitles } from '../utils/episodeTitle';
import { parseReleaseTimestamp } from '../utils/releaseTime';
import { getSeasonLabelUpper, resolveAnimeSeason } from '../utils/season';
import SeasonLinkBadge from './SeasonLinkBadge';

type DetailEpisodeIcon = {
  iconDataUri: string;
  pluginName: string;
};

const MIN_POSTER_ZOOM = 1;
const MAX_POSTER_ZOOM = 4;
const RIGHT_PANEL_MIN_WIDTH_PX = 260;
const RIGHT_PANEL_MAX_WIDTH_PX = 560;
const COMPACT_DETAIL_PANE_RANGE_RATIO = 0.5;
const COMPACT_DETAIL_PANE_HYSTERESIS_PX = 18;
const COMPACT_DETAIL_PANE_MAX_WIDTH = Math.round(
  RIGHT_PANEL_MIN_WIDTH_PX + (RIGHT_PANEL_MAX_WIDTH_PX - RIGHT_PANEL_MIN_WIDTH_PX) * COMPACT_DETAIL_PANE_RANGE_RATIO,
);

type RightNowDetailPaneProps = {
  detailAnimeView: AnimeDetail | null;
  detailYearLabel: string;
  detailEpisodeSearchQuery: string;
  onDetailEpisodeSearchQueryChange: (value: string) => void;
  detailEpisodePagination: AnimeEpisodePagination;
  isDetailLoading: boolean;
  onDetailEpisodePageChange: (page: number) => void;
  filteredDetailEpisodes: AnimeEpisode[];
  detailExpandedEpisode: number | null;
  detailLoadingEpisode: number | null;
  titleLanguage: TitleLanguage;
  detailEpisodeResolvedIconByEpisode: Record<number, DetailEpisodeIcon>;
  onPlayEpisode: (episodeNumber: number) => void;
  onToggleEpisodeExpand: (episodeNumber: number) => void;
  onAddEpisodeToQueue?: (episodeNumber: number) => void;
  onAddToLibrary?: (anchorElement?: HTMLElement | null) => void;
  isInLibrary?: boolean;
};

export default function RightNowDetailPane({
  detailAnimeView,
  detailYearLabel,
  detailEpisodeSearchQuery,
  onDetailEpisodeSearchQueryChange,
  detailEpisodePagination,
  isDetailLoading,
  onDetailEpisodePageChange,
  filteredDetailEpisodes,
  detailExpandedEpisode,
  detailLoadingEpisode,
  titleLanguage,
  detailEpisodeResolvedIconByEpisode,
  onPlayEpisode,
  onToggleEpisodeExpand,
  onAddEpisodeToQueue,
  onAddToLibrary,
  isInLibrary = false,
}: RightNowDetailPaneProps) {
  const navigate = useNavigate();
  const allowNsfw = useAppStore((state) => state.allowNsfw);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isSynopsisExpanded, setIsSynopsisExpanded] = useState(false);
  const [isCompactPane, setIsCompactPane] = useState(false);
  const [isPosterModalOpen, setIsPosterModalOpen] = useState(false);
  const [posterZoom, setPosterZoom] = useState(1);
  const [posterPan, setPosterPan] = useState({ x: 0, y: 0 });
  const [isPosterDragging, setIsPosterDragging] = useState(false);
  const seasonMeta = detailAnimeView ? resolveAnimeSeason(detailAnimeView) : null;
  const scoreLabel = detailAnimeView?.score?.toFixed(1) ?? 'N/A';
  const membersLabel = detailAnimeView?.members ? detailAnimeView.members.toLocaleString('en-US') : 'N/A';
  const rankLabel = detailAnimeView?.rank ? String(detailAnimeView.rank) : 'N/A';
  const popularityLabel = detailAnimeView?.popularity ? String(detailAnimeView.popularity) : 'N/A';
  const episodeTotalLabel = formatEpisodeTotalLabel(detailAnimeView?.currentEpisode, detailAnimeView?.episodes);
  const genreList = detailAnimeView?.genres?.filter(Boolean) ?? [];
  const genreItems = detailAnimeView?.genreItems?.length
    ? detailAnimeView.genreItems
    : genreList.map((name) => ({ id: 0, name }));
  const explicitGenreItems = detailAnimeView?.explicitGenreItems ?? [];
  const themeItems = detailAnimeView?.themeItems ?? [];
  const demographicItems = detailAnimeView?.demographicItems ?? [];
  const producerItems = detailAnimeView?.producerItems ?? [];
  const rawReleaseDate = detailAnimeView?.airingDate || detailAnimeView?.aired;
  const parsedReleaseTimestamp = parseReleaseTimestamp(rawReleaseDate);
  const releaseDateLabel = parsedReleaseTimestamp !== null
    ? new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(parsedReleaseTimestamp))
    : rawReleaseDate?.split('to')[0]?.trim() || 'TBA';
  const seasonLabel = seasonMeta
    ? `${getSeasonLabelUpper(seasonMeta.season)} ${seasonMeta.year ?? detailYearLabel}`
    : detailYearLabel;

  const navigateToTaxonomySearch = (kind: 'genre' | 'producer', name: string, id?: number) => {
    const normalizedName = name.trim();
    if (!normalizedName) return;

    const nextParams = new URLSearchParams();
    if (kind === 'genre' && id && id > 0) {
      nextParams.set('genres', String(id));
    } else if (kind === 'genre') {
      nextParams.set('q', normalizedName);
    }
    if (kind === 'producer' && id && id > 0) {
      nextParams.set('producers', String(id));
    } else if (kind === 'producer') {
      nextParams.set('q', normalizedName);
    }
    if (!allowNsfw) {
      nextParams.set('sfw', 'true');
    }
    nextParams.set('page', '1');
    nextParams.set('limit', '24');
    navigate(`/search/results?${nextParams.toString()}`);
  };

  const taxonomyChipClass =
    'inline-flex items-center border border-amberline/30 bg-amberline/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.09em] text-amberline/90 transition-colors hover:bg-amberline/20';
  const taxonomyLabelClass = 'font-mono text-[10px] uppercase tracking-[0.11em] text-cream/55';

  const renderTaxonomySection = (
    label: string,
    items: Array<{ id: number; name: string }>,
    kind: 'genre' | 'producer',
  ) => {
    if (!items.length) return null;
    return (
      <div className="min-w-0 space-y-1">
        <p className={taxonomyLabelClass}>{label}</p>
        <div className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <button
              key={`${label}-${item.id}-${item.name}`}
              type="button"
              className={taxonomyChipClass}
              onClick={() => navigateToTaxonomySearch(kind, item.name, item.id)}
              title={`Search ${item.name}`}
            >
              {item.name}
            </button>
          ))}
        </div>
      </div>
    );
  };

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const updateCompactState = () => {
      const compactEnterThreshold = COMPACT_DETAIL_PANE_MAX_WIDTH - COMPACT_DETAIL_PANE_HYSTERESIS_PX / 2;
      const compactExitThreshold = COMPACT_DETAIL_PANE_MAX_WIDTH + COMPACT_DETAIL_PANE_HYSTERESIS_PX / 2;
      const width = root.clientWidth;

      setIsCompactPane((current) => {
        if (current) {
          return width <= compactExitThreshold;
        }
        return width <= compactEnterThreshold;
      });
    };

    updateCompactState();
    const observer = new ResizeObserver(updateCompactState);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isPosterModalOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsPosterModalOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isPosterModalOpen]);

  const adjustPosterZoom = (delta: number) => {
    setPosterZoom((current) => {
      const next = Math.min(MAX_POSTER_ZOOM, Math.max(MIN_POSTER_ZOOM, Number((current + delta).toFixed(2))));
      if (next <= MIN_POSTER_ZOOM) {
        setPosterPan({ x: 0, y: 0 });
      }
      return next;
    });
  };

  const openPosterModal = () => {
    setPosterZoom(1);
    setPosterPan({ x: 0, y: 0 });
    setIsPosterDragging(false);
    setIsPosterModalOpen(true);
  };

  const handlePosterDragStart = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (posterZoom <= MIN_POSTER_ZOOM) return;

    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const startPan = { ...posterPan };
    setIsPosterDragging(true);

    const onMouseMove = (moveEvent: MouseEvent) => {
      setPosterPan({
        x: startPan.x + (moveEvent.clientX - startX),
        y: startPan.y + (moveEvent.clientY - startY),
      });
    };

    const onMouseUp = () => {
      setIsPosterDragging(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  if (isDetailLoading && !detailAnimeView) {
    return (
      <div className="space-y-2.5">
        <div className="anime-card media-thumb-card border border-cream/14 bg-black/22 p-0">
          <div className="grid grid-cols-[140px_minmax(0,1fr)] items-start gap-2.5 p-2.5">
            <div className="min-h-[220px] w-[min(100%,170px)] animate-pulse border border-cream/12 bg-black/45" style={{ aspectRatio: '2 / 3' }} />
            <div className="min-w-0 space-y-1.5">
              <div className="grid grid-cols-3 gap-1.5">
                <div className="h-16 animate-pulse border border-amberline/30 bg-amberline/10" />
                <div className="h-16 animate-pulse border border-cream/16 bg-black/26" />
                <div className="h-16 animate-pulse border border-cream/16 bg-black/26" />
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <div className="h-10 animate-pulse border border-cream/15 bg-black/22" />
                <div className="h-10 animate-pulse border border-cream/15 bg-black/22" />
                <div className="h-10 animate-pulse border border-cream/15 bg-black/22" />
                <div className="h-10 animate-pulse border border-cream/15 bg-black/22" />
              </div>
            </div>
          </div>
          <div className="mt-2 space-y-2 border-t border-cream/10 px-2.5 pt-2 pb-2.5">
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <div className="h-12 animate-pulse border border-cream/15 bg-black/22" />
              <div className="h-12 animate-pulse border border-cream/15 bg-black/22" />
              <div className="h-12 animate-pulse border border-cream/15 bg-black/22" />
            </div>
          </div>
        </div>
        <div className="h-14 animate-pulse border border-cream/10 bg-black/20" />
        <div className="flex justify-center">
          <div className="h-6 w-6 animate-pulse border border-cream/12 bg-black/24" />
        </div>
        <div className="space-y-1.5 border-t border-cream/10 pt-2">
          <div className="h-7 animate-pulse border border-cream/10 bg-black/20" />
          <div className="h-16 animate-pulse border border-cream/10 bg-carbon/35" />
          <div className="h-16 animate-pulse border border-cream/10 bg-carbon/35" />
        </div>
        <div className="inline-flex items-center gap-2 text-cream/70">
          <RotateCcw size={13} className="animate-spin text-amberline" />
          <span className="font-mono text-[11px] uppercase tracking-[0.11em]">Loading anime detail...</span>
        </div>
      </div>
    );
  }

  if (!detailAnimeView) {
    return <p className="text-cream/72">Select an anime to view details and playback context.</p>;
  }

  return (
    <div ref={rootRef} className="space-y-2.5">
      <div className="anime-card media-thumb-card border border-cream/14 bg-black/22 p-0">
        <div className={`${isCompactPane ? 'space-y-2' : 'grid grid-cols-[140px_minmax(0,1fr)] items-start gap-2.5'}`}>
          <div
            className={`anime-card-poster-wrap border border-cream/12 bg-black/45 ${isCompactPane ? 'w-full min-h-[260px]' : 'w-[min(100%,170px)] min-h-[220px]'}`}
            style={{ aspectRatio: '2 / 3' }}
          >
            <button
              type="button"
              className="absolute inset-0 z-[1] cursor-zoom-in"
              onClick={openPosterModal}
              aria-label="Open poster in fullscreen"
            >
              <img src={detailAnimeView.image} alt={`${detailAnimeView.title} poster`} className="anime-card-poster" />
            </button>
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
            {isCompactPane ? (
              <>
                <div className="absolute left-1 top-1 z-[2]">
                  <div className="border border-amberline/55 bg-[rgba(43,27,17,0.60)] px-1.5 py-1 text-left shadow-[0_4px_14px_rgba(0,0,0,0.55)]">
                    <p className="font-mono text-[8px] uppercase tracking-[0.09em] text-cream/72">Rank</p>
                    <p className="font-display text-[13px] leading-none text-amberline/95">{rankLabel}</p>
                  </div>
                </div>
                <div className="absolute right-1 top-1 z-[2] space-y-1">
                  <div className="border border-amberline/60 bg-[rgba(43,27,17,0.60)] px-1.5 py-1 text-right shadow-[0_4px_14px_rgba(0,0,0,0.55)]">
                    <p className="font-mono text-[8px] uppercase tracking-[0.09em] text-cream/70">Score</p>
                    <p className="font-display text-[13px] leading-none text-amberline">{scoreLabel}</p>
                    <p className="mt-0.5 font-mono text-[7px] uppercase tracking-[0.09em] text-cream/62">{membersLabel}</p>
                  </div>
                  <div className="border border-amberline/54 bg-[rgba(43,27,17,0.60)] px-1.5 py-1 text-right shadow-[0_4px_14px_rgba(0,0,0,0.55)]">
                    <p className="font-mono text-[8px] uppercase tracking-[0.09em] text-cream/70">Popularity</p>
                    <p className="font-display text-[13px] leading-none text-amberline/95">{popularityLabel}</p>
                  </div>
                </div>

                <div className="absolute inset-x-1 bottom-1 z-[2] space-y-1 border border-amberline/45 bg-[rgba(36,22,14,0.60)] p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.5)] backdrop-blur-[1px]">
                <div className="grid grid-cols-2 gap-1">
                  <div className="space-y-0.5">
                    <p className="font-mono text-[8px] uppercase tracking-[0.11em] text-cream/55">Total Episodes</p>
                    <span className="inline-flex items-center gap-1 border border-amberline/40 bg-[rgba(52,33,21,0.60)] px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.08em] text-cream/84">
                      <List size={9} className="text-amberline" /> {episodeTotalLabel}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    <p className="font-mono text-[8px] uppercase tracking-[0.11em] text-cream/55">Release Date</p>
                    <span className="inline-flex items-center gap-1 border border-amberline/40 bg-[rgba(52,33,21,0.60)] px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.08em] text-cream/84">
                      <CalendarDays size={9} className="text-amberline" /> {releaseDateLabel}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    <p className="font-mono text-[8px] uppercase tracking-[0.11em] text-cream/55">Status</p>
                    <span className="inline-flex items-center gap-1 border border-amberline/40 bg-[rgba(52,33,21,0.60)] px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.08em] text-cream/84">
                      <Clock3 size={9} className="text-amberline" /> {detailAnimeView.status ?? 'Unknown'}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    <p className="font-mono text-[8px] uppercase tracking-[0.11em] text-cream/55">Season</p>
                    {seasonMeta ? (
                      <SeasonLinkBadge
                        season={seasonMeta.season}
                        year={seasonMeta.year}
                        variant="compact"
                        showLabel
                        interaction="link"
                        className="!bg-[rgba(52,33,21,0.60)] !border-amberline/45"
                      />
                    ) : (
                      <span className="inline-flex items-center gap-1 border border-amberline/40 bg-[rgba(52,33,21,0.60)] px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.08em] text-cream/84">
                        {seasonLabel}
                      </span>
                    )}
                  </div>
                </div>
                {genreItems.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {genreItems.slice(0, 4).map((genre) => (
                      <button
                        key={`compact-genre-${genre.id}-${genre.name}`}
                        type="button"
                        className="inline-flex items-center border border-amberline/42 bg-amberline/18 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.08em] text-amberline/95"
                        onClick={() => navigateToTaxonomySearch('genre', genre.name, genre.id)}
                      >
                        {genre.name}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              </>
            ) : null}
          </div>

          <div className="min-w-0 flex h-full flex-col space-y-1.5">
            {!isCompactPane ? (
              <div className="grid grid-cols-3 gap-1.5">
                <div className="border border-amberline/35 bg-amberline/10 px-2.5 py-1.5 text-center">
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-cream/65">Score</p>
                  <p className="mt-0.5 font-display text-[24px] leading-none text-amberline">{scoreLabel}</p>
                  <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-cream/60">{membersLabel}</p>
                </div>
                <div className="border border-cream/18 bg-black/26 px-2.5 py-1.5 text-center">
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-cream/65">Rank</p>
                  <p className="mt-0.5 font-display text-[22px] leading-none text-amberline/95">{rankLabel}</p>
                </div>
                <div className="border border-cream/18 bg-black/26 px-2.5 py-1.5 text-center">
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-cream/65">Popularity</p>
                  <p className="mt-0.5 font-display text-[22px] leading-none text-amberline/95">{popularityLabel}</p>
                </div>
              </div>
            ) : null}

            <div className={`grid grid-cols-2 gap-1.5 ${isCompactPane ? 'hidden' : ''}`}>
              <div className="space-y-1">
                <p className={taxonomyLabelClass}>Total Episodes</p>
                <span className="inline-flex items-center gap-1 border border-cream/15 bg-black/22 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-cream/72 retro-tooltip" data-tooltip="Episodes">
                  <List size={11} className="text-amberline" /> {episodeTotalLabel}
                </span>
              </div>
              <div className="space-y-1">
                <p className={taxonomyLabelClass}>Release Date</p>
                <span className="inline-flex items-center gap-1 border border-cream/15 bg-black/22 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-cream/72 retro-tooltip" data-tooltip="Release Date">
                  <CalendarDays size={11} className="text-amberline" /> {releaseDateLabel}
                </span>
              </div>
              <div className="space-y-1">
                <p className={taxonomyLabelClass}>Status</p>
                <span className="inline-flex items-center gap-1 border border-cream/15 bg-black/22 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-cream/72 retro-tooltip" data-tooltip="Status">
                  <Clock3 size={11} className="text-amberline" /> {detailAnimeView.status ?? 'Unknown'}
                </span>
              </div>
              <div className="space-y-1">
                <p className={taxonomyLabelClass}>Season</p>
                {seasonMeta ? (
                  <SeasonLinkBadge season={seasonMeta.season} year={seasonMeta.year} variant="compact" showLabel interaction="link" />
                ) : (
                  <span className="inline-flex items-center gap-1 border border-cream/15 bg-black/22 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-cream/72 retro-tooltip" data-tooltip="Season">
                    {seasonLabel}
                  </span>
                )}
              </div>
            </div>

          </div>
        </div>

        {!isCompactPane ? (
          <div className="mt-2 space-y-2 border-t border-cream/10 pt-2 pb-2">
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              {renderTaxonomySection('Genres', genreItems, 'genre')}
              {allowNsfw ? renderTaxonomySection('Explicit Genres', explicitGenreItems, 'genre') : null}
              {renderTaxonomySection('Themes', themeItems, 'genre')}
              {renderTaxonomySection('Demographics', demographicItems, 'genre')}
              {renderTaxonomySection('Producers', producerItems, 'producer')}
            </div>
          </div>
        ) : null}
      </div>

      <p className={isSynopsisExpanded ? 'text-justify text-cream/72' : 'line-clamp-5 text-justify text-cream/72'}>{detailAnimeView.synopsis ?? 'Select an anime to view details and playback context.'}</p>

      <div className="flex justify-center">
        <button
          type="button"
          className="vhs-button-ghost p-1.5 text-[10px] retro-tooltip"
          onClick={() => setIsSynopsisExpanded((current) => !current)}
          data-tooltip={isSynopsisExpanded ? 'Collapse Synopsis' : 'Expand Synopsis'}
          aria-label={isSynopsisExpanded ? 'Collapse Synopsis' : 'Expand Synopsis'}
        >
          <ChevronDown size={13} className={isSynopsisExpanded ? 'rotate-180 transition-transform' : 'transition-transform'} />
        </button>
      </div>

      <div className="space-y-1.5 border-t border-cream/10 pt-2">
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <p className="font-mono text-[10px] uppercase tracking-[0.13em] text-amberline/75">Episodes</p>
          <div className="inline-flex flex-wrap items-center gap-1.5">
            <input
              type="search"
              value={detailEpisodeSearchQuery}
              onChange={(event) => onDetailEpisodeSearchQueryChange(event.target.value)}
              placeholder="Search episode # / title"
              className="w-40 border border-cream/20 bg-black/25 px-2 py-1 text-[10px] font-mono uppercase tracking-[0.09em] text-cream/85 placeholder:text-cream/45 focus:border-amberline/55 focus:outline-none"
            />
            <label className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-[0.09em] text-cream/58">
              <span>Page</span>
              <select
                className="right-now-episode-page-select"
                value={detailEpisodePagination.page}
                onChange={(event) => onDetailEpisodePageChange(Number(event.target.value) || 1)}
                disabled={isDetailLoading || detailEpisodePagination.lastVisiblePage <= 1}
              >
                {Array.from({ length: Math.max(1, detailEpisodePagination.lastVisiblePage) }, (_, index) => {
                  const page = index + 1;
                  return (
                    <option key={page} value={page}>
                      {page}
                    </option>
                  );
                })}
              </select>
            </label>
          </div>
        </div>
        {isDetailLoading ? (
          <p className="text-cream/60">Loading episodes...</p>
        ) : filteredDetailEpisodes.length > 0 ? (
          filteredDetailEpisodes.map((episode) => {
            const isExpanded = detailExpandedEpisode === episode.episodeNumber;
            const labels = getEpisodeDisplayTitles(episode, detailAnimeView, titleLanguage);
            return (
              <article key={episode.episodeNumber} className="group/episode border border-cream/10 bg-carbon/35 px-2.5 py-2">
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    className="vhs-button-ghost px-2 py-1 text-[11px] retro-tooltip"
                    onClick={() => onPlayEpisode(episode.episodeNumber)}
                    data-tooltip={`Play Episode ${String(episode.episodeNumber).padStart(2, '0')}`}
                  >
                    <Play size={11} /> {String(episode.episodeNumber).padStart(2, '0')}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <p className="line-clamp-1 font-display text-sm uppercase text-cream">{labels.primary}</p>
                    </div>
                    {labels.secondary ? <p className="anime-card-jp line-clamp-1">{labels.secondary}</p> : null}
                    <div className="mt-1 flex flex-wrap gap-1 text-[10px] font-mono uppercase tracking-[0.09em] text-cream/55">
                      <span className="inline-flex items-center gap-1"><CalendarDays size={10} className="text-amberline" /> {episode.aired?.slice(0, 10) || 'TBA'}</span>
                      {episode.filler ? <span className="bg-rust/80 px-1.5 py-0.5 text-white">Filler</span> : null}
                      {episode.recap ? <span className="bg-amberline/85 px-1.5 py-0.5 text-ink">Recap</span> : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {detailEpisodeResolvedIconByEpisode[episode.episodeNumber] ? (
                      <div
                        className="shrink-0 bg-black/62 p-1 shadow-[0_4px_14px_rgba(0,0,0,0.45)] retro-tooltip"
                        data-tooltip={`${detailEpisodeResolvedIconByEpisode[episode.episodeNumber].pluginName} Available`}
                      >
                        <img
                          src={detailEpisodeResolvedIconByEpisode[episode.episodeNumber].iconDataUri}
                          alt="Resolved source"
                          className="h-4 w-4 object-contain"
                          loading="lazy"
                        />
                      </div>
                    ) : null}
                    {onAddEpisodeToQueue ? (
                      <button
                        type="button"
                        className="vhs-button-ghost p-1.5 text-[10px] opacity-0 transition-opacity duration-150 group-hover/episode:opacity-100 group-focus-within/episode:opacity-100"
                        onClick={() => onAddEpisodeToQueue(episode.episodeNumber)}
                        aria-label={`Add episode ${episode.episodeNumber} to queue`}
                      >
                        <ListPlus size={12} />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="vhs-button-ghost p-1.5 text-[10px] opacity-0 transition-opacity duration-150 group-hover/episode:opacity-100 group-focus-within/episode:opacity-100"
                      onClick={() => onToggleEpisodeExpand(episode.episodeNumber)}
                      data-tooltip={isExpanded ? 'Collapse Episode' : 'Expand Episode'}
                      aria-label={isExpanded ? 'Collapse Episode' : 'Expand Episode'}
                    >
                      {detailLoadingEpisode === episode.episodeNumber ? (
                        <RotateCcw size={12} className="animate-spin" />
                      ) : (
                        <ChevronDown size={12} className={isExpanded ? 'rotate-180 transition-transform' : 'transition-transform'} />
                      )}
                    </button>
                  </div>
                </div>
                {isExpanded ? (
                  <div className="mt-1.5 border border-cream/10 bg-black/20 p-2">
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                      {formatEpisodeScoreOutOfTen(episode.score) ? (
                        <span className="inline-flex items-center border border-cream/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.11em] text-cream/72">
                          Score {formatEpisodeScoreOutOfTen(episode.score)}
                        </span>
                      ) : null}
                      {episode.durationMinutes && episode.durationMinutes > 0 ? (
                        <span className="inline-flex items-center border border-cream/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.11em] text-cream/72">
                          <Clock3 size={10} className="mr-1 text-amberline" /> {formatEpisodeDuration(episode.durationMinutes)}
                        </span>
                      ) : null}
                      {episode.forumUrl ? (
                        <a
                          href={episode.forumUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center border border-amberline/55 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-amberline transition-colors hover:bg-amberline/12"
                        >
                          Forum Thread
                        </a>
                      ) : null}
                    </div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.13em] text-amberline/72">Synopsis</p>
                    <p className="mt-1 text-justify text-xs leading-5 text-cream/70">{episode.synopsis || 'No synopsis recorded for this episode.'}</p>
                  </div>
                ) : null}
              </article>
            );
          })
        ) : detailEpisodeSearchQuery.trim() ? (
          <p className="text-cream/60">No episodes match your search.</p>
        ) : (
          <p className="text-cream/60">No episode metadata available yet.</p>
        )}
      </div>

      {isPosterModalOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[220] bg-black/62 backdrop-blur-md"
              role="dialog"
              aria-modal="true"
              aria-label="Poster fullscreen preview"
              onClick={() => setIsPosterModalOpen(false)}
            >
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,0,0,0.08)_0%,rgba(0,0,0,0.42)_72%,rgba(0,0,0,0.62)_100%)]" />
              <div className="absolute right-3 top-3 z-[2] flex items-center gap-1.5">
                <button
                  type="button"
                  className="vhs-button-ghost p-2"
                  aria-label="Zoom out"
                  onClick={(event) => {
                    event.stopPropagation();
                    adjustPosterZoom(-0.2);
                  }}
                >
                  <Minus size={14} />
                </button>
                <button
                  type="button"
                  className="vhs-button-ghost p-2"
                  aria-label="Reset zoom"
                  onClick={(event) => {
                    event.stopPropagation();
                    setPosterZoom(1);
                    setPosterPan({ x: 0, y: 0 });
                  }}
                >
                  <RotateCcw size={14} />
                </button>
                <button
                  type="button"
                  className="vhs-button-ghost p-2"
                  aria-label="Zoom in"
                  onClick={(event) => {
                    event.stopPropagation();
                    adjustPosterZoom(0.2);
                  }}
                >
                  <Plus size={14} />
                </button>
                <button
                  type="button"
                  className="vhs-button-ghost p-2"
                  aria-label="Close poster preview"
                  onClick={(event) => {
                    event.stopPropagation();
                    setIsPosterModalOpen(false);
                  }}
                >
                  <X size={14} />
                </button>
              </div>

              <div
                className={`flex h-full w-full items-center justify-center p-5 ${posterZoom > MIN_POSTER_ZOOM ? (isPosterDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'}`}
                onClick={(event) => event.stopPropagation()}
                onMouseDown={handlePosterDragStart}
                onWheel={(event) => {
                  event.preventDefault();
                  adjustPosterZoom(event.deltaY < 0 ? 0.15 : -0.15);
                }}
              >
                <img
                  src={detailAnimeView.image}
                  alt={`${detailAnimeView.title} poster fullscreen`}
                  draggable={false}
                  className="max-h-[92vh] max-w-[92vw] border border-amberline/45 object-contain shadow-[0_16px_42px_rgba(0,0,0,0.6)]"
                  style={{ transform: `translate(${posterPan.x}px, ${posterPan.y}px) scale(${posterZoom})`, transformOrigin: 'center center' }}
                />
              </div>

              <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 border border-amberline/35 bg-black/60 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-cream/84">
                Zoom {Math.round(posterZoom * 100)}% · Mouse wheel, buttons, drag to pan
              </p>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
