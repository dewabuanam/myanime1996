import { BookmarkPlus, Filter, Info, ListPlus, Play, RotateCcw, Tv2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AdvancedSearchModal from '../components/AdvancedSearchModal';
import LibraryStatusPickerModal from '../components/LibraryStatusPickerModal';
import { useAnimeSearch } from '../hooks/useAnimeSearch';
import type { AnimeSearchQuery, AnimeSearchQueryOrderBy, SearchQuerySort } from '../services/catalogSource';
import { useAppStore } from '../state/appStore';
import type { AnimeSummary, LibraryStatus } from '../types/anime';
import { getDisplayTitle } from '../utils/title';

const ORDER_BY_OPTIONS: Array<{ value: Exclude<AnimeSearchQueryOrderBy, 'mal_id'>; label: string }> = [
  { value: 'title', label: 'Title' },
  { value: 'start_date', label: 'Start Date' },
  { value: 'end_date', label: 'End Date' },
  { value: 'episodes', label: 'Episodes' },
  { value: 'score', label: 'Score' },
  { value: 'scored_by', label: 'Scored By' },
  { value: 'rank', label: 'Rank' },
  { value: 'popularity', label: 'Popularity' },
  { value: 'members', label: 'Members' },
  { value: 'favorites', label: 'Favorites' },
];

const SORT_OPTIONS: SearchQuerySort[] = ['desc', 'asc'];

function normalizeOrderByValue(
  value: AnimeSearchQueryOrderBy | undefined,
): Exclude<AnimeSearchQueryOrderBy, 'mal_id'> | '' {
  if (!value || value === 'mal_id') return '';
  return value;
}

function parseNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseIds(value: string | null): number[] {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0);
}

export default function SearchResults() {
  const navigate = useNavigate();
  const titleLanguage = useAppStore((state) => state.titleLanguage);
  const allowNsfw = useAppStore((state) => state.allowNsfw);
  const selectAnime = useAppStore((state) => state.selectAnime);
  const openRightPanelWithView = useAppStore((state) => state.openRightPanelWithView);
  const playAnimeSeries = useAppStore((state) => state.playAnimeSeries);
  const playTrailer = useAppStore((state) => state.playTrailer);
  const addAnimeSeriesToQueue = useAppStore((state) => state.addAnimeSeriesToQueue);
  const setAnimeLibraryStatus = useAppStore((state) => state.setAnimeLibraryStatus);
  const removeAnimeFromLibrary = useAppStore((state) => state.removeAnimeFromLibrary);
  const getLibraryStatusForAnime = useAppStore((state) => state.getLibraryStatusForAnime);
  const watchProgress = useAppStore((state) => state.watchProgress);
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    runAdvancedSearch,
    lastSearchResult,
    genreBuckets,
    producerQuery,
    setProducerQuery,
    producerResults,
    selectedProducerIds,
    toggleProducer,
  } = useAnimeSearch();

  const [modalOpen, setModalOpen] = useState(false);
  const [libraryPickerAnime, setLibraryPickerAnime] = useState<AnimeSummary | null>(null);
  const [libraryPickerAnchorElement, setLibraryPickerAnchorElement] = useState<HTMLElement | null>(null);

  const getResumePlan = (anime: AnimeSummary) => {
    const canonicalAnimeId = anime.jikanId ?? anime.id;
    const entry = watchProgress[canonicalAnimeId] ?? watchProgress[anime.id];
    if (!entry) return null;
    if (entry.progress <= 0) return null;

    const currentEpisode = Math.max(1, Math.floor(entry.episode || 1));
    const resumeAt = Math.max(0, Math.floor(entry.lastPlaybackSeconds ?? 0));

    if (entry.progress < 100) {
      if (resumeAt <= 0 && currentEpisode <= 1) return null;
      return {
        episode: currentEpisode,
        resumeAt,
      };
    }

    return null;
  };

  const openDetails = async (anime: AnimeSummary) => {
    await selectAnime(anime);
    await openRightPanelWithView('detail');
  };

  const openLibraryPicker = (anime: AnimeSummary, anchorElement?: HTMLElement | null) => {
    setLibraryPickerAnime(anime);
    setLibraryPickerAnchorElement(anchorElement ?? null);
  };

  const handleLibraryStatusConfirm = async (status: LibraryStatus) => {
    if (!libraryPickerAnime) return;
    await setAnimeLibraryStatus(libraryPickerAnime, status);
  };

  const handleLibraryRemove = async () => {
    if (!libraryPickerAnime) return;
    await removeAnimeFromLibrary(libraryPickerAnime.jikanId ?? libraryPickerAnime.id);
    setLibraryPickerAnime(null);
  };

  const formatCompactCount = (value?: number) => {
    if (!value || value <= 0) return 'N/A';
    return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  };

  const queryObject = useMemo<AnimeSearchQuery>(() => {
    const q = searchParams.get('q') ?? '';
    return {
      q,
      type: (searchParams.get('type') as AnimeSearchQuery['type']) ?? undefined,
      status: (searchParams.get('status') as AnimeSearchQuery['status']) ?? undefined,
      rating: (searchParams.get('rating') as AnimeSearchQuery['rating']) ?? undefined,
      order_by: (searchParams.get('order_by') as AnimeSearchQuery['order_by']) ?? undefined,
      sort: (searchParams.get('sort') as AnimeSearchQuery['sort']) ?? undefined,
      min_score: parseNumber(searchParams.get('min_score')),
      max_score: parseNumber(searchParams.get('max_score')),
      genres: parseIds(searchParams.get('genres')),
      genres_exclude: parseIds(searchParams.get('genres_exclude')),
      producers: parseIds(searchParams.get('producers')),
      page: parseNumber(searchParams.get('page')) ?? 1,
      limit: parseNumber(searchParams.get('limit')) ?? 24,
    };
  }, [searchParams]);

  useEffect(() => {
    const hasSearchSignal = Boolean(
      queryObject.q.trim() ||
      queryObject.type ||
      queryObject.status ||
      queryObject.rating ||
      queryObject.order_by ||
      queryObject.sort ||
      queryObject.min_score !== undefined ||
      queryObject.max_score !== undefined ||
      (queryObject.genres?.length ?? 0) > 0 ||
      (queryObject.genres_exclude?.length ?? 0) > 0 ||
      (queryObject.producers?.length ?? 0) > 0
    );
    if (!hasSearchSignal) return;
    void runAdvancedSearch(queryObject);
  }, [queryObject, runAdvancedSearch]);

  const handleHeroSortChange = (orderBy: Exclude<AnimeSearchQueryOrderBy, 'mal_id'> | '', sort: SearchQuerySort | '') => {
    const nextParams = new URLSearchParams(searchParams);
    if (orderBy) {
      nextParams.set('order_by', orderBy);
    } else {
      nextParams.delete('order_by');
    }
    if (sort) {
      nextParams.set('sort', sort);
    } else {
      nextParams.delete('sort');
    }
    nextParams.set('page', '1');
    if (!nextParams.get('limit')) {
      nextParams.set('limit', '24');
    }
    setSearchParams(nextParams);
  };

  return (
    <div className="seeall-page space-y-4 pb-8">
      <section className="seeall-header px-6 py-5">
        <div>
          <p className="eyebrow">Archive Scanner</p>
          <div className="seeall-title-row">
            <h1 className="section-title">Search Results</h1>
            <div className="seeall-hero-filter-wrap">
              <button type="button" className="seeall-hero-filter-trigger" onClick={() => setModalOpen(true)}>
                <Filter size={14} /> Filter
              </button>
            </div>
          </div>
          <p className="seeall-subtitle">
            Query: <span className="text-amberline/90">{queryObject.q || 'n/a'}</span>
          </p>
          <div className="mt-2 space-y-2">
            <div className="space-y-1">
              <p className="seeall-upcoming-filter-eyebrow">Order By</p>
              <div className="seeall-upcoming-filter-grid" role="group" aria-label="Search order by options">
                <button
                  type="button"
                  className={`seeall-upcoming-filter-btn ${!queryObject.order_by ? 'is-active' : ''}`}
                  onClick={() => handleHeroSortChange('', queryObject.sort ?? '')}
                >
                  Default
                </button>
                {ORDER_BY_OPTIONS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className={`seeall-upcoming-filter-btn ${queryObject.order_by === item.value ? 'is-active' : ''}`}
                    onClick={() => handleHeroSortChange(item.value, queryObject.sort ?? '')}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <p className="seeall-upcoming-filter-eyebrow">Sort</p>
              <div className="seeall-upcoming-filter-grid" role="group" aria-label="Search sort direction options">
                <button
                  type="button"
                  className={`seeall-upcoming-filter-btn ${!queryObject.sort ? 'is-active' : ''}`}
                  onClick={() => handleHeroSortChange(normalizeOrderByValue(queryObject.order_by), '')}
                >
                  Default
                </button>
                {SORT_OPTIONS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={`seeall-upcoming-filter-btn ${queryObject.sort === item ? 'is-active' : ''}`}
                    onClick={() => handleHeroSortChange(normalizeOrderByValue(queryObject.order_by), item)}
                  >
                    {item.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3 px-6">
        {(lastSearchResult?.data ?? []).map((anime) => {
          const displayTitle = getDisplayTitle(anime, titleLanguage);
          const detailMeta = anime.status || (anime.year ? `${anime.year}` : 'Catalog');
          const scoreLabel = anime.score?.toFixed(1) ?? 'N/A';
          const membersLabel = formatCompactCount(anime.members);
          const resumePlan = getResumePlan(anime);
          const isResumeAction = Boolean(resumePlan);

          return (
            <article key={`${anime.id}-${anime.jikanId ?? 'none'}`} className="seeall-row-card group">
              <div className="seeall-row-poster-wrap">
                <img src={anime.image} alt="" className="seeall-row-poster" loading="lazy" />
                <div className="seeall-row-poster-overlay" />

                <button
                  type="button"
                  className="seeall-row-trailer-btn"
                  onClick={(event) => {
                    event.stopPropagation();
                    void playTrailer(anime);
                  }}
                  aria-label="Play trailer"
                >
                  <Tv2 size={14} />
                </button>
              </div>

              <div className="seeall-row-body">
                <div className="seeall-row-head">
                  <div className="min-w-0">
                    <p className="seeall-row-title line-clamp-2" title={displayTitle}>{displayTitle}</p>
                    {anime.titleJapanese ? <p className="seeall-row-japanese line-clamp-1" title={anime.titleJapanese}>{anime.titleJapanese}</p> : null}
                    <p className="seeall-row-meta">{detailMeta}</p>
                  </div>

                  <div className="seeall-row-score-wrap">
                    <div className="seeall-row-score-value">{scoreLabel}</div>
                    <div className="seeall-row-members retro-tooltip" data-tooltip={anime.members ? `${anime.members.toLocaleString('en-US')} Members` : 'Members unavailable'}>
                      {membersLabel}
                    </div>
                  </div>
                </div>

                {anime.synopsis ? <p className="seeall-row-synopsis line-clamp-6">{anime.synopsis}</p> : null}

                <div className="seeall-row-actions" role="group" aria-label={`Actions for ${displayTitle}`}>
                  <button
                    type="button"
                    className="vhs-button seeall-row-action-btn"
                    onClick={() => {
                      void playAnimeSeries(anime);
                    }}
                  >
                    <Play size={14} /> {isResumeAction ? 'Resume' : 'Play Now'}
                  </button>

                  {isResumeAction ? (
                    <button
                      type="button"
                      className="vhs-button-ghost seeall-row-action-btn"
                      onClick={() => {
                        void playAnimeSeries(anime);
                      }}
                    >
                      <RotateCcw size={14} /> Start Over
                    </button>
                  ) : null}

                  <button
                    type="button"
                    className="vhs-button-ghost seeall-row-action-btn"
                    onClick={() => {
                      void addAnimeSeriesToQueue(anime);
                    }}
                  >
                    <ListPlus size={14} /> Add to Queue
                  </button>

                  <button
                    type="button"
                    className="vhs-button-ghost seeall-row-action-btn"
                    onClick={(event) => openLibraryPicker(anime, event.currentTarget)}
                  >
                    <BookmarkPlus size={14} /> Add to Library
                  </button>

                  <button
                    type="button"
                    className="vhs-button-ghost seeall-row-action-btn"
                    onClick={() => {
                      void openDetails(anime);
                    }}
                  >
                    <Info size={14} /> Info
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      {!lastSearchResult?.data?.length ? (
        <p className="px-6 font-mono text-xs uppercase tracking-[0.14em] text-cream/55">
          No result found for this signal.
        </p>
      ) : null}

      <LibraryStatusPickerModal
        open={Boolean(libraryPickerAnime)}
        title={libraryPickerAnime ? getDisplayTitle(libraryPickerAnime, titleLanguage) : 'Anime'}
        anchorElement={libraryPickerAnchorElement}
        initialStatus={
          libraryPickerAnime
            ? getLibraryStatusForAnime(libraryPickerAnime.id, libraryPickerAnime.jikanId)
            : null
        }
        onClose={() => {
          setLibraryPickerAnime(null);
          setLibraryPickerAnchorElement(null);
        }}
        onConfirm={(status) => {
          void handleLibraryStatusConfirm(status);
          setLibraryPickerAnime(null);
          setLibraryPickerAnchorElement(null);
        }}
        onRemove={
          libraryPickerAnime && getLibraryStatusForAnime(libraryPickerAnime.id, libraryPickerAnime.jikanId)
            ? () => {
                void handleLibraryRemove();
              }
            : undefined
        }
      />

      <AdvancedSearchModal
        open={modalOpen}
        query={queryObject.q}
        allowNsfw={allowNsfw}
        initialType={queryObject.type}
        initialStatus={queryObject.status}
        initialRating={queryObject.rating}
        initialMinScore={queryObject.min_score}
        initialMaxScore={queryObject.max_score}
        initialIncludeGenreIds={queryObject.genres}
        initialExcludeGenreIds={queryObject.genres_exclude}
        initialProducerIds={queryObject.producers}
        genres={genreBuckets.genres}
        themes={genreBuckets.themes}
        demographics={genreBuckets.demographics}
        explicitGenres={genreBuckets.explicitGenres}
        producerResults={producerResults}
        selectedProducerIds={selectedProducerIds}
        producerQuery={producerQuery}
        onClose={() => setModalOpen(false)}
        onProducerQueryChange={setProducerQuery}
        onToggleProducer={toggleProducer}
        onSubmit={(payload) => {
          const nextParams = new URLSearchParams();
          if (payload.q.trim()) nextParams.set('q', payload.q.trim());
          if (payload.type) nextParams.set('type', payload.type);
          if (payload.status) nextParams.set('status', payload.status);
          if (payload.rating) nextParams.set('rating', payload.rating);
          if (queryObject.order_by) nextParams.set('order_by', queryObject.order_by);
          if (queryObject.sort) nextParams.set('sort', queryObject.sort);
          if (payload.min_score !== undefined) nextParams.set('min_score', String(payload.min_score));
          if (payload.max_score !== undefined) nextParams.set('max_score', String(payload.max_score));
          if (payload.genres?.length) nextParams.set('genres', payload.genres.join(','));
          if (payload.genres_exclude?.length) nextParams.set('genres_exclude', payload.genres_exclude.join(','));
          if (payload.producers?.length) nextParams.set('producers', payload.producers.join(','));
          nextParams.set('page', '1');
          nextParams.set('limit', '24');
          setSearchParams(nextParams);
          setModalOpen(false);
        }}
      />
    </div>
  );
}
