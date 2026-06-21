import { CalendarDays, Clapperboard, Clock3, Flame, ListPlus, Play, Star, Trophy } from 'lucide-react';
import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import LibraryStatusPickerModal from '../components/LibraryStatusPickerModal';
import SeasonLinkBadge from '../components/SeasonLinkBadge';
import { FALLBACK_PAGE_SIZE, getJikanDetailEpisodeBundle } from '../services/animeDetailEpisodes';
import { getAnimeEpisodeById } from '../services/jikan';
import { useAppStore } from '../state/appStore';
import type { AnimeDetail as AnimeDetailType, AnimeEpisode, AnimeEpisodePagination, LibraryStatus } from '../types/anime';
import { getEpisodeDisplayTitles } from '../utils/episodeTitle';
import { formatEpisodeTotalLabel } from '../utils/episodeCountLabel';
import { parseReleaseTimestamp } from '../utils/releaseTime';
import { resolveAnimeSeason } from '../utils/season';
import { getDisplayTitle } from '../utils/title';

function formatDuration(durationMinutes?: number, aired?: string) {
  if (durationMinutes && durationMinutes > 0) {
    return `${durationMinutes} min`;
  }

  const timestamp = parseReleaseTimestamp(aired);
  if (timestamp !== null) {
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(timestamp));
  }

  return 'Unknown';
}

function formatAired(aired?: string) {
  const text = aired?.trim();
  if (!text) return 'TBA';
  if (text.length <= 18) return text;
  return text.slice(0, 18);
}

export default function AnimeDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [anime, setAnime] = useState<AnimeDetailType | null>(null);
  const [episodes, setEpisodes] = useState<AnimeEpisode[]>([]);
  const [episodePage, setEpisodePage] = useState(1);
  const [episodePagination, setEpisodePagination] = useState<AnimeEpisodePagination>({
    page: 1,
    lastVisiblePage: 1,
    hasNextPage: false,
    hasPrevPage: false,
  });
  const [expandedEpisode, setExpandedEpisode] = useState<number | null>(null);
  const [hasEpisodeData, setHasEpisodeData] = useState(false);
  const [loadingEpisodeDetail, setLoadingEpisodeDetail] = useState<number | null>(null);
  const [error, setError] = useState('');
  const selectAnime = useAppStore((state) => state.selectAnime);
  const playEpisode = useAppStore((state) => state.playEpisode);
  const setAnimeLibraryStatus = useAppStore((state) => state.setAnimeLibraryStatus);
  const removeAnimeFromLibrary = useAppStore((state) => state.removeAnimeFromLibrary);
  const getLibraryStatusForAnime = useAppStore((state) => state.getLibraryStatusForAnime);
  const titleLanguage = useAppStore((state) => state.titleLanguage);
  const allowNsfw = useAppStore((state) => state.allowNsfw);
  const [isLibraryPickerOpen, setIsLibraryPickerOpen] = useState(false);
  const [libraryPickerAnchorElement, setLibraryPickerAnchorElement] = useState<HTMLElement | null>(null);
  const seasonMeta = useMemo(() => (anime ? resolveAnimeSeason(anime) : null), [anime]);
  const episodeTotalLabel = useMemo(() => (anime ? formatEpisodeTotalLabel(anime.episodes, anime.status) : '?/?'), [anime]);
  const currentLibraryStatus = useMemo(
    () => (anime ? getLibraryStatusForAnime(anime.id, anime.jikanId) : null),
    [anime, getLibraryStatusForAnime],
  );

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

  const renderTaxonomySection = (
    label: string,
    items: Array<{ id: number; name: string }>,
    kind: 'genre' | 'producer',
  ) => {
    if (!items.length) return null;
    return (
      <div className="mt-3">
        <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.11em] text-cream/58">{label}</p>
        <div className="flex flex-wrap gap-2">
          {items.map((item) => (
            <button
              key={`${label}-${item.id}-${item.name}`}
              type="button"
              className="border border-cream/15 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.12em] text-cream/60 transition-colors hover:border-amberline/45 hover:text-amberline"
              onClick={() => navigateToTaxonomySearch(kind, item.name, item.id)}
            >
              {item.name}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const queryEpisode = useMemo(() => {
    const raw = Number(searchParams.get('episode'));
    if (!Number.isFinite(raw) || raw <= 0) return null;
    return Math.floor(raw);
  }, [searchParams]);

  const updateEpisodeQuery = (episodeNumber: number | null) => {
    const next = new URLSearchParams(searchParams);
    if (episodeNumber && episodeNumber > 0) {
      next.set('episode', String(episodeNumber));
    } else {
      next.delete('episode');
    }
    setSearchParams(next, { replace: true });
  };

  const handleEpisodeToggle = async (episodeNumber: number) => {
    const nextExpanded = expandedEpisode === episodeNumber ? null : episodeNumber;
    setExpandedEpisode(nextExpanded);
    updateEpisodeQuery(nextExpanded);

    if (!nextExpanded || !anime) return;

    const jikanAnimeId = anime.jikanId;
    if (typeof jikanAnimeId !== 'number' || !Number.isFinite(jikanAnimeId) || jikanAnimeId <= 0) return;

    setLoadingEpisodeDetail(episodeNumber);
    const detail = await getAnimeEpisodeById(Math.floor(jikanAnimeId), episodeNumber).catch(() => null);
    if (detail) {
      setEpisodes((current) =>
        current.map((entry) => {
          if (entry.episodeNumber !== episodeNumber) return entry;
          return {
            ...entry,
            ...detail,
            episodeNumber,
          };
        }),
      );
    }
    setLoadingEpisodeDetail((current) => (current === episodeNumber ? null : current));
  };

  useEffect(() => {
    let alive = true;
    if (!id) return;
    const jikanId = Number(id);
    if (!Number.isFinite(jikanId) || jikanId <= 0) {
      setError('Could not load this tape from the active source.');
      return;
    }
    async function load() {
      try {
        const payload = await getJikanDetailEpisodeBundle(Math.floor(jikanId), episodePage);
        if (!alive) return;
        setAnime(payload.detail);
        setEpisodes(payload.episodes);
        setHasEpisodeData(payload.hasEpisodeData);
        setEpisodePagination(payload.pagination);
        setError('');
      } catch {
        if (!alive) return;
        setError('Could not load this tape from the active source.');
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, [episodePage, id]);

  useEffect(() => {
    if (!queryEpisode) return;
    if (!episodes.some((entry) => entry.episodeNumber === queryEpisode)) {
      const targetPage = Math.max(1, Math.floor((queryEpisode - 1) / FALLBACK_PAGE_SIZE) + 1);
      if (targetPage !== episodePage) {
        setEpisodePage(targetPage);
      }
      return;
    }
    setExpandedEpisode(queryEpisode);
  }, [episodePage, episodes, queryEpisode]);

  if (error) return <div className="app-card p-6 text-rust">{error}</div>;
  if (!anime) return <div className="app-card p-6 font-mono uppercase tracking-[0.14em] text-amberline">Loading tape details...</div>;

  return (
    <div className="space-y-5">
      <section className="seeall-row-card app-card grid grid-cols-[270px_1fr] gap-5 overflow-hidden p-5 max-lg:grid-cols-1">
        <div className="relative aspect-[3/4] overflow-hidden bg-black/50 border border-cream/15">
          <img src={anime.image} alt="" className="h-full w-full object-cover" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
          <p className="absolute left-3 top-3 border border-cream/22 bg-ink/82 px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.12em] text-amberline">
            #{anime.id}
          </p>
        </div>

        <div>
          <p className="eyebrow">Anime Detail</p>
          <h1 className="mt-1.5 font-display text-4xl font-semibold uppercase leading-tight max-lg:text-3xl">{getDisplayTitle(anime, titleLanguage)}</h1>
          {anime.titleJapanese ? <p className="anime-card-jp mt-1.5 line-clamp-1">{anime.titleJapanese}</p> : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 border border-cream/20 px-2.5 py-1 text-xs text-cream/78 retro-tooltip" data-tooltip="Score">
              <Star size={12} className="text-amberline" /> {anime.score?.toFixed(1) ?? 'N/A'}
            </span>
            <span className="inline-flex items-center gap-1.5 border border-cream/20 px-2.5 py-1 text-xs text-cream/78 retro-tooltip" data-tooltip="Total Episodes">
              <Clapperboard size={12} className="text-amberline" /> {episodeTotalLabel}
            </span>
            <span className="inline-flex items-center gap-1.5 border border-cream/20 px-2.5 py-1 text-xs text-cream/78 retro-tooltip" data-tooltip="Broadcast Year">
              <CalendarDays size={12} className="text-amberline" /> {anime.year ?? 'TBA'}
            </span>
            {seasonMeta ? <SeasonLinkBadge season={seasonMeta.season} year={seasonMeta.year} variant="full" showLabel /> : null}
            <span className="inline-flex items-center gap-1.5 border border-cream/20 px-2.5 py-1 text-xs text-cream/78 retro-tooltip" data-tooltip="Episode Duration">
              <Clock3 size={12} className="text-amberline" /> {anime.duration || formatDuration(anime.durationMinutes)}
            </span>
            <span className="inline-flex items-center gap-1.5 border border-cream/20 px-2.5 py-1 text-xs text-cream/78 retro-tooltip" data-tooltip="Popularity Rank">
              <Flame size={12} className="text-amberline" /> {anime.popularity ? `#${anime.popularity}` : 'N/A'}
            </span>
            <span className="inline-flex items-center gap-1.5 border border-cream/20 px-2.5 py-1 text-xs text-cream/78 retro-tooltip" data-tooltip="Site Rank">
              <Trophy size={12} className="text-amberline" /> {anime.rank ? `#${anime.rank}` : 'N/A'}
            </span>
          </div>

          <p className="mt-4 text-sm leading-6 text-cream/70">{anime.synopsis}</p>

          {renderTaxonomySection('Genres', anime.genreItems ?? anime.genres.map((name) => ({ id: 0, name })), 'genre')}
          {allowNsfw ? renderTaxonomySection('Explicit Genres', anime.explicitGenreItems ?? [], 'genre') : null}
          {renderTaxonomySection('Themes', anime.themeItems ?? [], 'genre')}
          {renderTaxonomySection('Demographics', anime.demographicItems ?? [], 'genre')}
          {renderTaxonomySection('Producers', anime.producerItems ?? [], 'producer')}

          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={() => void selectAnime(anime)} className="vhs-button retro-tooltip" data-tooltip="Cue Tape">
              <Play size={18} /> Cue Tape
            </button>
            <button
              type="button"
              onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                setLibraryPickerAnchorElement(event.currentTarget);
                setIsLibraryPickerOpen(true);
              }}
              className="vhs-button-ghost py-3 retro-tooltip"
              data-tooltip={currentLibraryStatus ? 'Update Library Status' : 'Add to Library'}
            >
              <ListPlus size={17} />
              {currentLibraryStatus ? 'In Library' : 'Add to Library'}
            </button>
            {anime.trailerUrl ? (
              <a href={anime.trailerUrl} target="_blank" rel="noreferrer" className="vhs-button-ghost inline-flex items-center gap-2 py-3 retro-tooltip" data-tooltip="Open Trailer Source">
                Trailer
              </a>
            ) : null}
          </div>
        </div>
      </section>

      <section className="app-card p-4">
        <div className="flex items-center justify-between gap-3 border-b border-cream/10 pb-2">
          <h2 className="section-title text-2xl">Episode Queue</h2>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-cream/55">
            {hasEpisodeData ? 'Jikan episode metadata active' : 'Fallback episode metadata active'}
          </p>
        </div>

        {episodes.length === 0 ? (
          <p className="mt-3 text-sm text-cream/65">No episode metadata currently available.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {episodes.map((episode) => {
              const isExpanded = expandedEpisode === episode.episodeNumber;
              const titles = getEpisodeDisplayTitles(episode, anime, titleLanguage);
              const synopsis = episode.synopsis?.trim() || 'No synopsis recorded for this episode.';

              return (
                <article key={episode.episodeNumber} className="border border-cream/12 bg-carbon/35 px-3 py-2.5">
                  <div className="grid grid-cols-[82px_minmax(0,1fr)_130px_100px_auto] items-start gap-2 max-lg:grid-cols-1">
                    <div className="space-y-1">
                      <button
                        type="button"
                        onClick={() => void playEpisode(anime, episode.episodeNumber)}
                        className="vhs-button-ghost w-full justify-center px-2 py-1.5 text-xs retro-tooltip"
                        data-tooltip={`Play Episode ${String(episode.episodeNumber).padStart(2, '0')}`}
                      >
                        <Play size={12} /> EP {String(episode.episodeNumber).padStart(2, '0')}
                      </button>
                      <div className="flex flex-wrap gap-1">
                        {episode.filler ? <span className="bg-rust/80 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-white">Filler</span> : null}
                        {episode.recap ? <span className="bg-amberline/85 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink">Recap</span> : null}
                      </div>
                    </div>

                    <div className="min-w-0">
                      <p className="line-clamp-1 font-display text-base uppercase text-cream">{titles.primary}</p>
                      {titles.secondary ? <p className="anime-card-jp line-clamp-1">{titles.secondary}</p> : null}
                    </div>

                    <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-cream/62 retro-tooltip" data-tooltip="Aired Date">
                      <CalendarDays size={12} className="mr-1 inline-block text-amberline" /> {formatAired(episode.aired)}
                    </p>

                    <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-cream/62 retro-tooltip" data-tooltip="Duration">
                      <Clock3 size={12} className="mr-1 inline-block text-amberline" /> {formatDuration(episode.durationMinutes, episode.aired)}
                    </p>

                    <button
                      type="button"
                      className="vhs-button-ghost px-2 py-1.5 text-xs retro-tooltip"
                      onClick={() => void handleEpisodeToggle(episode.episodeNumber)}
                      data-tooltip={isExpanded ? 'Collapse Episode' : 'Expand Episode'}
                    >
                      {loadingEpisodeDetail === episode.episodeNumber ? 'Loading...' : isExpanded ? 'Hide' : 'Expand'}
                    </button>
                  </div>

                  {isExpanded ? (
                    <div className="mt-2 border border-cream/10 bg-black/20 p-3">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        {episode.score !== null && episode.score !== undefined ? (
                          <span className="inline-flex items-center border border-cream/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.11em] text-cream/72">
                            Score {episode.score.toFixed(2)}
                          </span>
                        ) : null}
                        {episode.forumUrl ? (
                          <a
                            href={episode.forumUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center border border-amberline/55 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-amberline transition-colors hover:bg-amberline/12"
                          >
                            Forum Thread
                          </a>
                        ) : null}
                      </div>
                      <div className="border border-cream/10 bg-black/25 p-2.5">
                        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-amberline/75">Synopsis</p>
                        <p className="mt-1 text-sm leading-5 text-cream/72">{synopsis}</p>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}

            <div className="flex items-center justify-between border border-cream/10 bg-black/20 px-3 py-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-cream/58">
                Page {episodePagination.page} / {episodePagination.lastVisiblePage}
              </p>
              <div className="inline-flex items-center gap-2">
                <button
                  type="button"
                  className="vhs-button-ghost px-2 py-1 text-xs disabled:opacity-40"
                  disabled={!episodePagination.hasPrevPage}
                  onClick={() => setEpisodePage((value) => Math.max(1, value - 1))}
                >
                  Prev
                </button>
                <button
                  type="button"
                  className="vhs-button-ghost px-2 py-1 text-xs disabled:opacity-40"
                  disabled={!episodePagination.hasNextPage}
                  onClick={() => setEpisodePage((value) => value + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      <LibraryStatusPickerModal
        open={isLibraryPickerOpen}
        title={getDisplayTitle(anime, titleLanguage)}
        anchorElement={libraryPickerAnchorElement}
        initialStatus={currentLibraryStatus}
        onClose={() => {
          setIsLibraryPickerOpen(false);
          setLibraryPickerAnchorElement(null);
        }}
        onConfirm={(status: LibraryStatus) => {
          void setAnimeLibraryStatus(anime, status);
          setIsLibraryPickerOpen(false);
          setLibraryPickerAnchorElement(null);
        }}
        onRemove={
          currentLibraryStatus
            ? () => {
                void removeAnimeFromLibrary(anime.jikanId ?? anime.id);
                setIsLibraryPickerOpen(false);
              setLibraryPickerAnchorElement(null);
              }
            : undefined
        }
      />
    </div>
  );
}
