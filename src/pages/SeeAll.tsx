import { BookmarkPlus, Filter, Flower2, History, Info, Leaf, ListPlus, Play, RotateCcw, Snowflake, Sun, Tv2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import HeroSeeAllMenu from '../components/HeroSeeAllMenu';
import LibraryStatusPickerModal from '../components/LibraryStatusPickerModal';
import SeasonLinkBadge from '../components/SeasonLinkBadge';
import {
  getLatestPromoAnime,
  getLatestUpdatedAnime,
  getSeasonalAnime,
  getTopAiringAnime,
  getTopAnime,
  getTopUpcomingAnime,
  getUpcomingUpdatedAnime,
  resolveCanonicalDetailRouteId,
} from '../services/catalogSource';
import { getJikanDetailEpisodeBundle } from '../services/animeDetailEpisodes';
import { useAppStore } from '../state/appStore';
import type { AnimeSummary, LibraryStatus } from '../types/anime';
import { formatReleaseDateTimeLocal, getReleaseBadgeLabel, isUpcomingByReleaseTime } from '../utils/releaseTime';
import { formatEpisodeTotalLabel } from '../utils/episodeCountLabel';
import {
  isSeeAllType,
  SEE_ALL_TYPE_META,
  type SeeAllType,
} from '../utils/seeAll';
import { compareByScoreThenPopularity } from '../utils/animeRanking';
import {
  getCurrentSeasonYear,
  getSeasonLabel,
  getSeasonLabelUpper,
  normalizeSeasonKey,
  resolveAnimeSeason,
  shiftSeason,
  type SeasonKey,
} from '../utils/season';
import { getDisplayTitle } from '../utils/title';
import { UPCOMING_FILTER_OPTIONS } from '../constants/upcomingSeasonFilters';
import { TOP_AIRING_SHARED_FETCH_LIMIT, TOP_POPULAR_SHARED_FETCH_LIMIT, TOP_UPCOMING_SHARED_FETCH_LIMIT } from '../constants/catalogLimits';

const FETCH_LIMIT = TOP_UPCOMING_SHARED_FETCH_LIMIT;
const INITIAL_VISIBLE_COUNT = 12;
const PAGE_CHUNK = 8;
const SEASON_PAGE_LIMIT = 10;
const SEASON_PAGE_COUNT = 2;
const SEASON_FETCH_LIMIT = SEASON_PAGE_LIMIT * SEASON_PAGE_COUNT;

type ShelfPlayableMode = 'series' | 'episode' | 'trailer';

type ShelfFetchOptions = {
  forceRefresh?: boolean;
  onUpdate?: (value: AnimeSummary[]) => void;
  upcomingSeasonFilter?: 'all' | 'tv' | 'movie' | 'ova' | 'special' | 'ona' | 'music';
  upcomingRating?: 'g' | 'pg' | 'pg13' | 'r17' | 'r' | 'rx';
  topAnimeType?: 'TV' | 'OVA' | 'Movie' | 'Special' | 'ONA' | 'Music' | 'CM' | 'PV' | 'TV Special';
  topAnimeRating?: 'g' | 'pg' | 'pg13' | 'r17' | 'r' | 'rx';
  seasonYear?: number;
  season?: SeasonKey;
  seasonFilter?: 'all' | 'tv' | 'movie' | 'ova' | 'special' | 'ona' | 'music';
  seasonContinuing?: boolean;
  seasonPageLimit?: number;
  seasonPageCount?: number;
};

type UpcomingRatingFilter = 'none' | 'g' | 'pg' | 'pg13' | 'r17' | 'r' | 'rx';
type PopularTypeFilter = 'none' | 'TV' | 'OVA' | 'Movie' | 'Special' | 'ONA' | 'Music' | 'CM' | 'PV' | 'TV Special';
type PopularRatingFilter = 'none' | 'g' | 'pg' | 'pg13' | 'r17' | 'r' | 'rx';
type AiringTypeFilter = 'none' | 'TV' | 'OVA' | 'Movie' | 'Special' | 'ONA' | 'Music' | 'CM' | 'PV' | 'TV Special';
type AiringRatingFilter = 'none' | 'g' | 'pg' | 'pg13' | 'r17' | 'r' | 'rx';
type SeasonTypeFilter = 'all' | 'tv' | 'movie' | 'ova' | 'special' | 'ona' | 'music';

const UPCOMING_RATING_OPTIONS: Array<{ value: UpcomingRatingFilter; label: string }> = [
  { value: 'none', label: 'No Rating' },
  { value: 'g', label: 'G' },
  { value: 'pg', label: 'PG' },
  { value: 'pg13', label: 'PG-13' },
  { value: 'r17', label: 'R-17+' },
  { value: 'r', label: 'R+' },
  { value: 'rx', label: 'Rx' },
];

const POPULAR_TYPE_OPTIONS: Array<{ value: PopularTypeFilter; label: string }> = [
  { value: 'none', label: 'All Types' },
  { value: 'TV', label: 'TV' },
  { value: 'OVA', label: 'OVA' },
  { value: 'Movie', label: 'Movie' },
  { value: 'Special', label: 'Special' },
  { value: 'ONA', label: 'ONA' },
  { value: 'Music', label: 'Music' },
  { value: 'CM', label: 'CM' },
  { value: 'PV', label: 'PV' },
  { value: 'TV Special', label: 'TV Special' },
];

const POPULAR_RATING_OPTIONS: Array<{ value: PopularRatingFilter; label: string }> = [
  { value: 'none', label: 'No Rating' },
  { value: 'g', label: 'G' },
  { value: 'pg', label: 'PG' },
  { value: 'pg13', label: 'PG-13' },
  { value: 'r17', label: 'R-17+' },
  { value: 'r', label: 'R+' },
  { value: 'rx', label: 'Rx' },
];

const AIRING_TYPE_OPTIONS: Array<{ value: AiringTypeFilter; label: string }> = [
  { value: 'none', label: 'All Types' },
  { value: 'TV', label: 'TV' },
  { value: 'OVA', label: 'OVA' },
  { value: 'Movie', label: 'Movie' },
  { value: 'Special', label: 'Special' },
  { value: 'ONA', label: 'ONA' },
  { value: 'Music', label: 'Music' },
  { value: 'CM', label: 'CM' },
  { value: 'PV', label: 'PV' },
  { value: 'TV Special', label: 'TV Special' },
];

const AIRING_RATING_OPTIONS: Array<{ value: AiringRatingFilter; label: string }> = [
  { value: 'none', label: 'No Rating' },
  { value: 'g', label: 'G' },
  { value: 'pg', label: 'PG' },
  { value: 'pg13', label: 'PG-13' },
  { value: 'r17', label: 'R-17+' },
  { value: 'r', label: 'R+' },
  { value: 'rx', label: 'Rx' },
];

const SEASON_TYPE_OPTIONS: Array<{ value: SeasonTypeFilter; label: string }> = [
  { value: 'all', label: 'All Types' },
  { value: 'tv', label: 'TV' },
  { value: 'movie', label: 'Movie' },
  { value: 'ova', label: 'OVA' },
  { value: 'special', label: 'Special' },
  { value: 'ona', label: 'ONA' },
  { value: 'music', label: 'Music' },
];

const typeFetchers: Record<SeeAllType, (limit?: number, options?: ShelfFetchOptions) => Promise<AnimeSummary[]>> = {
  season: (_limit = SEASON_FETCH_LIMIT, options) => getSeasonalAnime(SEASON_FETCH_LIMIT, options),
  'upcoming-update': (limit = FETCH_LIMIT, options) => getUpcomingUpdatedAnime(limit, options),
  latest: (limit = FETCH_LIMIT, options) => getLatestUpdatedAnime(limit, options),
  promo: (limit = FETCH_LIMIT, options) => getLatestPromoAnime(limit, options),
  airing: (_limit = FETCH_LIMIT, options) => getTopAiringAnime(TOP_AIRING_SHARED_FETCH_LIMIT, options),
  popular: (_limit = FETCH_LIMIT, options) => getTopAnime(TOP_POPULAR_SHARED_FETCH_LIMIT, options),
  upcoming: (_limit = FETCH_LIMIT, options) => getTopUpcomingAnime(TOP_UPCOMING_SHARED_FETCH_LIMIT, options),
};

const getPlayableMode = (type: SeeAllType): ShelfPlayableMode => {
  if (type === 'latest' || type === 'upcoming-update') return 'episode';
  if (type === 'promo' || type === 'upcoming') return 'trailer';
  return 'series';
};

const getMediaTypeLabel = (anime: AnimeSummary) => {
  const mediaType = anime.mediaType?.trim();
  if (!mediaType) return 'TV';
  const normalized = mediaType.toLowerCase();
  if (normalized === 'unapproved') return null;
  if (normalized === 'tv') return 'TV';
  if (normalized === 'movie') return 'MOVIE';
  if (normalized === 'ova') return 'OVA';
  if (normalized === 'ona') return 'ONA';
  if (normalized === 'special') return 'SPECIAL';
  return mediaType.toUpperCase();
};

const getDateValue = (value?: string) => {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const isNotYetAired = (anime: AnimeSummary) => {
  if (isUpcomingByReleaseTime(anime.airingDate)) return true;
  const status = anime.status?.toLowerCase() ?? '';
  return status.includes('not yet') || status.includes('upcoming');
};

const getSeasonMenuIcon = (season: SeasonKey) => {
  if (season === 'winter') return Snowflake;
  if (season === 'spring') return Flower2;
  if (season === 'summer') return Sun;
  return Leaf;
};

const formatCompactCount = (value?: number) => {
  if (!value || value <= 0) return 'N/A';
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
};

const normalizeIdentityText = (value?: string) =>
  (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim();

export default function SeeAll() {
  const { type } = useParams<{ type: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const selectAnime = useAppStore((state) => state.selectAnime);
  const openRightPanelWithView = useAppStore((state) => state.openRightPanelWithView);
  const playAnimeSeries = useAppStore((state) => state.playAnimeSeries);
  const playEpisode = useAppStore((state) => state.playEpisode);
  const playTrailer = useAppStore((state) => state.playTrailer);
  const addAnimeSeriesToQueue = useAppStore((state) => state.addAnimeSeriesToQueue);
  const addEpisodeToQueue = useAppStore((state) => state.addEpisodeToQueue);
  const addTrailerToQueue = useAppStore((state) => state.addTrailerToQueue);
  const requestSeekTo = useAppStore((state) => state.requestSeekTo);
  const setPlaybackTime = useAppStore((state) => state.setPlaybackTime);
  const setPlaybackDuration = useAppStore((state) => state.setPlaybackDuration);
  const watchProgress = useAppStore((state) => state.watchProgress);
  const libraryItems = useAppStore((state) => state.libraryItems);
  const libraryNotifications = useAppStore((state) => state.libraryNotifications);
  const libraryLastNotifiedEpisodeByAnimeId = useAppStore((state) => state.libraryLastNotifiedEpisodeByAnimeId);
  const titleLanguage = useAppStore((state) => state.titleLanguage);
  const upcomingSeasonFilter = useAppStore((state) => state.upcomingSeasonFilter);
  const setUpcomingSeasonFilter = useAppStore((state) => state.setUpcomingSeasonFilter);
  const setAnimeLibraryStatus = useAppStore((state) => state.setAnimeLibraryStatus);
  const removeAnimeFromLibrary = useAppStore((state) => state.removeAnimeFromLibrary);
  const getLibraryStatusForAnime = useAppStore((state) => state.getLibraryStatusForAnime);

  const [items, setItems] = useState<AnimeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);
  const [isUpcomingFilterOpen, setIsUpcomingFilterOpen] = useState(false);
  const [upcomingRatingFilter, setUpcomingRatingFilter] = useState<UpcomingRatingFilter>('none');
  const [popularTypeFilter, setPopularTypeFilter] = useState<PopularTypeFilter>('none');
  const [popularRatingFilter, setPopularRatingFilter] = useState<PopularRatingFilter>('none');
  const [airingTypeFilter, setAiringTypeFilter] = useState<AiringTypeFilter>('none');
  const [airingRatingFilter, setAiringRatingFilter] = useState<AiringRatingFilter>('none');
  const [seasonTypeFilter, setSeasonTypeFilter] = useState<SeasonTypeFilter>('all');
  const [seasonContinuingEnabled, setSeasonContinuingEnabled] = useState(true);
  const [libraryPickerAnime, setLibraryPickerAnime] = useState<AnimeSummary | null>(null);
  const [libraryPickerAnchorElement, setLibraryPickerAnchorElement] = useState<HTMLElement | null>(null);

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const safeType: SeeAllType | null = isSeeAllType(type) ? type : null;
  const currentSeasonMeta = useMemo(() => getCurrentSeasonYear(), []);
  const seasonQuery = normalizeSeasonKey(searchParams.get('season')) ?? currentSeasonMeta.season;
  const seasonYearQueryRaw = Number(searchParams.get('year'));
  const seasonYearQuery = Number.isFinite(seasonYearQueryRaw) && seasonYearQueryRaw > 1900
    ? Math.floor(seasonYearQueryRaw)
    : currentSeasonMeta.year;

  useEffect(() => {
    if (!safeType) return;

    let alive = true;
    setLoading(true);
    setError('');

    const fetchOptions = safeType === 'upcoming'
      ? {
          forceRefresh: true,
          upcomingSeasonFilter,
          upcomingRating: upcomingRatingFilter === 'none' ? undefined : upcomingRatingFilter,
        }
      : safeType === 'popular'
        ? {
            forceRefresh: true,
            topAnimeType: popularTypeFilter === 'none' ? undefined : popularTypeFilter,
            topAnimeRating: popularRatingFilter === 'none' ? undefined : popularRatingFilter,
          }
        : safeType === 'airing'
          ? {
              forceRefresh: true,
              topAnimeType: airingTypeFilter === 'none' ? undefined : airingTypeFilter,
              topAnimeRating: airingRatingFilter === 'none' ? undefined : airingRatingFilter,
            }
          : safeType === 'season'
            ? {
                forceRefresh: true,
                seasonYear: seasonYearQuery,
                season: seasonQuery,
                seasonFilter: seasonTypeFilter,
                seasonContinuing: seasonContinuingEnabled,
                seasonPageLimit: SEASON_PAGE_LIMIT,
                seasonPageCount: SEASON_PAGE_COUNT,
              }
        : { forceRefresh: true };

    void typeFetchers[safeType](FETCH_LIMIT, fetchOptions)
      .then((data) => {
        if (!alive) return;
        const deduped = Array.from(new Map(data.map((anime) => [anime.id, anime])).values());
        setItems(deduped);
      })
      .catch(() => {
        if (!alive) return;
        setError('No signal from this shelf right now.');
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [
    safeType,
    upcomingSeasonFilter,
    upcomingRatingFilter,
    popularTypeFilter,
    popularRatingFilter,
    airingTypeFilter,
    airingRatingFilter,
    seasonQuery,
    seasonYearQuery,
    seasonTypeFilter,
    seasonContinuingEnabled,
  ]);

  useEffect(() => {
    if (safeType === 'upcoming' || safeType === 'popular' || safeType === 'airing' || safeType === 'season') return;
    setIsUpcomingFilterOpen(false);
  }, [safeType]);

  const sortedItems = useMemo(() => {
    const sorted = [...items];

    if (safeType === 'upcoming-update') {
      sorted.sort((a, b) => {
        const byDate = getDateValue(a.airingDate) - getDateValue(b.airingDate);
        if (byDate !== 0) return byDate;
        return compareByScoreThenPopularity(a, b);
      });
      return sorted;
    }

    if (safeType === 'latest' || safeType === 'promo') {
      sorted.sort((a, b) => {
        const byDate = getDateValue(b.airingDate) - getDateValue(a.airingDate);
        if (byDate !== 0) return byDate;
        return compareByScoreThenPopularity(a, b);
      });
      return sorted;
    }

    sorted.sort(compareByScoreThenPopularity);

    return sorted;
  }, [items, safeType]);

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_COUNT);
  }, [safeType]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry.isIntersecting) return;
        setVisibleCount((current) => {
          if (current >= sortedItems.length) return current;
          return Math.min(sortedItems.length, current + PAGE_CHUNK);
        });
      },
      { rootMargin: '220px 0px' },
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [sortedItems.length]);

  const visibleItems = sortedItems.slice(0, visibleCount);

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

  const resolveLatestPlayableEpisodeFromSignals = (anime: AnimeSummary) => {
    const candidateAnimeIds = new Set<number>(
      [anime.id, anime.jikanId]
        .filter((value): value is number => typeof value === 'number' && value > 0),
    );
    const animeRoute = anime.animeScheduleRoute?.trim().toLowerCase() ?? '';
    const animeTitleKeys = [anime.title, anime.titleEnglish, anime.titleJapanese]
      .map((value) => normalizeIdentityText(value))
      .filter((value): value is string => value.length > 0);

    let latestEpisode = Math.max(1, Math.floor(Number(anime.currentEpisode) || 0));

    for (const libraryItem of Object.values(libraryItems)) {
      const idsMatch = candidateAnimeIds.has(libraryItem.animeId) || (typeof libraryItem.jikanId === 'number' && candidateAnimeIds.has(libraryItem.jikanId));
      const routeMatch =
        animeRoute.length > 0 &&
        (libraryItem.animeScheduleRoute?.trim().toLowerCase() ?? '') === animeRoute;
      const libraryTitleKeys = [libraryItem.title, libraryItem.titleEnglish, libraryItem.titleJapanese]
        .map((value) => normalizeIdentityText(value))
        .filter((value): value is string => value.length > 0);
      const titleMatch = animeTitleKeys.some((key) => libraryTitleKeys.includes(key));

      if (!idsMatch && !routeMatch && !titleMatch) continue;

      candidateAnimeIds.add(libraryItem.animeId);
      if (typeof libraryItem.jikanId === 'number' && libraryItem.jikanId > 0) {
        candidateAnimeIds.add(libraryItem.jikanId);
      }
      latestEpisode = Math.max(latestEpisode, Math.floor(Number(libraryItem.currentEpisode) || 0));
    }

    for (const animeId of candidateAnimeIds) {
      latestEpisode = Math.max(latestEpisode, latestNotifiedEpisodeByAnimeId.get(animeId) ?? 0);
    }

    return Math.max(1, latestEpisode);
  };

  const resolveLatestPlayableEpisode = async (anime: AnimeSummary) => {
    let latestEpisode = resolveLatestPlayableEpisodeFromSignals(anime);
    const resolvedJikanId = anime.jikanId ?? await resolveCanonicalDetailRouteId(anime).catch(() => undefined);

    if (resolvedJikanId && resolvedJikanId > 0) {
      const bundle = await getJikanDetailEpisodeBundle(resolvedJikanId, 1).catch(() => null);
      latestEpisode = Math.max(latestEpisode, Math.floor(Number(bundle?.detail.currentEpisode) || 0));
    }

    return Math.max(1, latestEpisode);
  };

  const getResumePlan = (anime: AnimeSummary) => {
    const canonicalAnimeId = anime.jikanId ?? anime.id;
    const entry = watchProgress[canonicalAnimeId] ?? watchProgress[anime.id];
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
      Math.floor(Number(anime.currentEpisode) || 0),
      Math.floor(Number(anime.episodes) || 0),
      Math.floor(Number(entry.totalEpisodes) || 0),
      currentEpisode,
    );
    const nextEpisode = currentEpisode + 1;
    if (nextEpisode > latestKnownEpisode) return null;

    return {
      episode: nextEpisode,
      resumeAt: 0,
      resumeDuration: 0,
    };
  };

  const openDetails = async (anime: AnimeSummary) => {
    const canonicalDetailId = await resolveCanonicalDetailRouteId(anime);
    const selected = canonicalDetailId ? { ...anime, id: canonicalDetailId, jikanId: canonicalDetailId } : anime;
    await selectAnime(selected);
    await openRightPanelWithView('detail');
  };

  const openSeeAll = (nextType: SeeAllType) => {
    if (nextType === 'season') {
      const params = new URLSearchParams({
        year: String(seasonYearQuery),
        season: seasonQuery,
      });
      navigate(`/see-all/season?${params.toString()}`);
      return;
    }
    navigate(`/see-all/${nextType}`);
  };

  const goToSeason = (season: SeasonKey, year: number) => {
    const params = new URLSearchParams(searchParams);
    params.set('year', String(Math.floor(year)));
    params.set('season', season);
    setSearchParams(params);
  };

  const seasonNavigatorItems = useMemo(() => {
    const offsets = [-2, -1, 0, 1, 2] as const;
    return offsets.map((offset) => {
      const shifted = shiftSeason(seasonQuery, seasonYearQuery, offset);
      return {
        ...shifted,
        offset,
      };
    });
  }, [seasonQuery, seasonYearQuery]);
  const isViewingCurrentSeason = seasonQuery === currentSeasonMeta.season && seasonYearQuery === currentSeasonMeta.year;

  const playNow = async (anime: AnimeSummary, mode: ShelfPlayableMode) => {
    const resumePlan = getResumePlan(anime);
    const hasResume = Boolean(resumePlan);

    if (mode === 'trailer') {
      await playTrailer(anime);
      return;
    }

    if (hasResume && resumePlan) {
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

    if (mode === 'episode') {
      await playEpisode(anime, await resolveLatestPlayableEpisode(anime));
      return;
    }
    await playAnimeSeries(anime);
  };

  const startOver = async (anime: AnimeSummary, mode: ShelfPlayableMode) => {
    if (mode === 'trailer') {
      await playTrailer(anime);
      return;
    }

    const resumePlan = getResumePlan(anime);
    const episodeNumber = Math.max(1, resumePlan?.episode ?? 1);

    if (mode === 'episode') {
      await playEpisode(anime, episodeNumber);
      setPlaybackTime(0);
      requestSeekTo(0);
      return;
    }

    await playAnimeSeries(anime);
  };

  const addToQueue = async (anime: AnimeSummary, queueMode: ShelfPlayableMode) => {
    if (queueMode === 'trailer') {
      await addTrailerToQueue(anime);
      return;
    }
    if (queueMode === 'episode') {
      await addEpisodeToQueue(anime, await resolveLatestPlayableEpisode(anime));
      return;
    }
    await addAnimeSeriesToQueue(anime);
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

  if (!safeType) {
    return (
      <div className="space-y-4 px-6 py-6">
        <h1 className="section-title">Unknown Shelf</h1>
        <button type="button" className="vhs-button" onClick={() => navigate('/home')}>
          Back Home
        </button>
      </div>
    );
  }

  const mode = getPlayableMode(safeType);
  const typeMeta = SEE_ALL_TYPE_META[safeType];
  const typeTitle = safeType === 'season'
    ? `${getSeasonLabelUpper(seasonQuery)} ${seasonYearQuery}`
    : typeMeta.title;

  return (
    <div className="seeall-page space-y-4 pb-8">
      <section className="seeall-header px-6 py-5">
        <div className="hero-seeall-menu-slot">
          <HeroSeeAllMenu
            onNavigate={(nextType) => {
              openSeeAll(nextType);
            }}
          />
        </div>

        <div>
          <p className="eyebrow">Home Shelf</p>
          <div className="seeall-title-row">
            <h1 className="section-title">{typeTitle}</h1>

            {safeType === 'upcoming' || safeType === 'popular' || safeType === 'airing' || safeType === 'season' ? (
              <div className="seeall-hero-filter-wrap">
                <button
                  type="button"
                  className="seeall-hero-filter-trigger"
                  aria-expanded={isUpcomingFilterOpen}
                  aria-controls="seeall-upcoming-filter-popup"
                  onClick={() => setIsUpcomingFilterOpen((current) => !current)}
                >
                  <Filter size={14} /> Filter
                </button>

                {isUpcomingFilterOpen ? (
                  <div id="seeall-upcoming-filter-popup" className="seeall-hero-filter-popup" role="dialog" aria-label="Top anime filters">
                    <div className="seeall-hero-filter-popup-header">
                      <p className="seeall-upcoming-filter-eyebrow">Signal Deck</p>
                      <button
                        type="button"
                        className="seeall-hero-filter-close"
                        aria-label="Close filter menu"
                        onClick={() => setIsUpcomingFilterOpen(false)}
                      >
                        <X size={14} />
                      </button>
                    </div>

                    {safeType === 'upcoming' ? (
                      <>
                        <div className="space-y-2">
                          <p className="seeall-upcoming-filter-eyebrow">Type Band</p>
                          <div className="seeall-upcoming-filter-grid" role="group" aria-label="Upcoming media type filter">
                            {UPCOMING_FILTER_OPTIONS.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                className={`seeall-upcoming-filter-btn ${upcomingSeasonFilter === option.value ? 'is-active' : ''}`}
                                onClick={() => void setUpcomingSeasonFilter(option.value)}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <p className="seeall-upcoming-filter-eyebrow">Audience Rating</p>
                          <div className="seeall-upcoming-filter-grid" role="group" aria-label="Upcoming rating filter">
                            {UPCOMING_RATING_OPTIONS.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                className={`seeall-upcoming-filter-btn ${upcomingRatingFilter === option.value ? 'is-active' : ''}`}
                                onClick={() => setUpcomingRatingFilter(option.value)}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    ) : safeType === 'popular' ? (
                      <>
                        <div className="space-y-2">
                          <p className="seeall-upcoming-filter-eyebrow">Type</p>
                          <div className="seeall-upcoming-filter-grid" role="group" aria-label="Popular anime type filter">
                            {POPULAR_TYPE_OPTIONS.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                className={`seeall-upcoming-filter-btn ${popularTypeFilter === option.value ? 'is-active' : ''}`}
                                onClick={() => setPopularTypeFilter(option.value)}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <p className="seeall-upcoming-filter-eyebrow">Rating</p>
                          <div className="seeall-upcoming-filter-grid" role="group" aria-label="Popular anime rating filter">
                            {POPULAR_RATING_OPTIONS.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                className={`seeall-upcoming-filter-btn ${popularRatingFilter === option.value ? 'is-active' : ''}`}
                                onClick={() => setPopularRatingFilter(option.value)}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    ) : safeType === 'airing' ? (
                      <>
                        <div className="space-y-2">
                          <p className="seeall-upcoming-filter-eyebrow">Type</p>
                          <div className="seeall-upcoming-filter-grid" role="group" aria-label="Top airing anime type filter">
                            {AIRING_TYPE_OPTIONS.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                className={`seeall-upcoming-filter-btn ${airingTypeFilter === option.value ? 'is-active' : ''}`}
                                onClick={() => setAiringTypeFilter(option.value)}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <p className="seeall-upcoming-filter-eyebrow">Rating</p>
                          <div className="seeall-upcoming-filter-grid" role="group" aria-label="Top airing anime rating filter">
                            {AIRING_RATING_OPTIONS.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                className={`seeall-upcoming-filter-btn ${airingRatingFilter === option.value ? 'is-active' : ''}`}
                                onClick={() => setAiringRatingFilter(option.value)}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    ) : safeType === 'season' ? (
                      <>
                        <div className="space-y-2">
                          <p className="seeall-upcoming-filter-eyebrow">Type</p>
                          <div className="seeall-upcoming-filter-grid" role="group" aria-label="Season anime type filter">
                            {SEASON_TYPE_OPTIONS.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                className={`seeall-upcoming-filter-btn ${seasonTypeFilter === option.value ? 'is-active' : ''}`}
                                onClick={() => setSeasonTypeFilter(option.value)}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <p className="seeall-upcoming-filter-eyebrow">Continuing</p>
                          <div className="seeall-upcoming-filter-grid" role="group" aria-label="Season continuing filter">
                            <button
                              type="button"
                              className={`seeall-upcoming-filter-btn ${seasonContinuingEnabled ? 'is-active' : ''}`}
                              onClick={() => setSeasonContinuingEnabled((current) => !current)}
                            >
                              {seasonContinuingEnabled ? 'Enabled' : 'Disabled'}
                            </button>
                          </div>
                        </div>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          <p className="seeall-subtitle">{sortedItems.length} tapes loaded in full-card mode.</p>
          {safeType === 'season' ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="seeall-upcoming-filter-btn"
                onClick={() => {
                  goToSeason(seasonQuery, seasonYearQuery - 1);
                }}
              >
                ...
              </button>
              {seasonNavigatorItems.map((entry) => {
                const isActive = entry.season === seasonQuery && entry.year === seasonYearQuery;
                const isRuntimeCurrent = entry.season === currentSeasonMeta.season && entry.year === currentSeasonMeta.year;
                const SeasonIcon = getSeasonMenuIcon(entry.season);
                return (
                  <button
                    key={`${entry.year}-${entry.season}`}
                    type="button"
                    className={`seeall-upcoming-filter-btn ${isActive ? 'is-active' : ''}`}
                    onClick={() => goToSeason(entry.season, entry.year)}
                  >
                    <SeasonIcon size={12} /> {getSeasonLabel(entry.season)} {entry.year} {isRuntimeCurrent ? '(Current)' : ''}
                  </button>
                );
              })}
              <button
                type="button"
                className="seeall-upcoming-filter-btn"
                onClick={() => {
                  goToSeason(seasonQuery, seasonYearQuery + 1);
                }}
              >
                ...
              </button>
              {!isViewingCurrentSeason ? (
                <button
                  type="button"
                  className="seeall-upcoming-filter-btn"
                  onClick={() => goToSeason(currentSeasonMeta.season, currentSeasonMeta.year)}
                >
                  Go Current Season
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

      </section>

      {loading ? <p className="px-6 font-mono text-[11px] uppercase tracking-[0.12em] text-amberline/80">Loading shelf signal...</p> : null}
      {error ? <p className="px-6 font-mono text-[11px] uppercase tracking-[0.12em] text-rust">{error}</p> : null}

      <section className="space-y-3 px-6">
        {visibleItems.map((anime, index) => {
          const resumePlan = getResumePlan(anime);
          const isResumeAction = Boolean(resumePlan);
          const canPlayAnime = safeType !== 'promo' && (isResumeAction || !isNotYetAired(anime));
          const playLabel = isResumeAction ? 'Resume' : 'Play Now';
          const watchEntry = watchProgress[anime.jikanId ?? anime.id] ?? watchProgress[anime.id];
          const isWatchedCompleted = Boolean(watchEntry?.completed || (watchEntry?.progress ?? 0) >= 100);
          const releaseBadgeLabel = getReleaseBadgeLabel(anime.airingDate, anime.mediaType, isWatchedCompleted);
          const displayTitle = getDisplayTitle(anime, titleLanguage);
          const mediaTypeLabel = getMediaTypeLabel(anime);
          const animeSeasonMeta = resolveAnimeSeason(anime);
          const fallbackMeta = anime.status || (anime.year ? `${anime.year}` : 'Catalog');
          const releaseDateTime = formatReleaseDateTimeLocal(anime.airingDate);
          const scoreLabel = anime.score?.toFixed(1) ?? 'N/A';
          const membersLabel = formatCompactCount(anime.members);
          const detailMeta =
            safeType === 'latest'
              ? releaseDateTime
                ? `Release ${releaseDateTime}`
                : fallbackMeta
              : safeType === 'upcoming-update'
                ? releaseDateTime
                  ? `Airs ${releaseDateTime}`
                  : fallbackMeta
                : safeType === 'promo'
                  ? releaseDateTime ? `Promo ${releaseDateTime} local` : fallbackMeta
                  : fallbackMeta;

          return (
            <article key={`${safeType}-${anime.id}`} className="seeall-row-card group">
              <div className="seeall-row-poster-wrap">
                <img src={anime.image} alt="" className="seeall-row-poster" loading="lazy" />
                <div className="seeall-row-poster-overlay" />

                {typeMeta.ranked ? (
                  <span className="seeall-row-rank" aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                ) : null}

                {releaseBadgeLabel ? <span className="seeall-row-badge">{releaseBadgeLabel}</span> : null}
                <button type="button" className="seeall-row-trailer-btn" onClick={() => void playTrailer(anime)} aria-label="Play trailer">
                  <Tv2 size={14} />
                </button>
              </div>

              <div className="seeall-row-body">
                <div className="seeall-row-head">
                  <div className="min-w-0">
                    <p className="seeall-row-title line-clamp-2" title={displayTitle}>{displayTitle}</p>
                    {anime.titleJapanese ? <p className="seeall-row-japanese line-clamp-1" title={anime.titleJapanese}>{anime.titleJapanese}</p> : null}
                    <p className="seeall-row-meta">{mediaTypeLabel ? `${mediaTypeLabel} • ${detailMeta}` : detailMeta}</p>
                    {animeSeasonMeta ? <SeasonLinkBadge season={animeSeasonMeta.season} year={animeSeasonMeta.year} variant="full" showLabel className="mt-1" /> : null}
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
                  {canPlayAnime ? (
                    <button type="button" className="vhs-button seeall-row-action-btn" onClick={() => void playNow(anime, mode)}>
                      {isResumeAction ? <History size={14} /> : <Play size={14} />} {playLabel}
                    </button>
                  ) : null}
                  {canPlayAnime && isResumeAction ? (
                    <button
                      type="button"
                      className="vhs-button-ghost seeall-row-action-btn"
                      onClick={() => void startOver(anime, mode)}
                    >
                      <RotateCcw size={14} /> Start Over
                    </button>
                  ) : null}
                  <button type="button" className="vhs-button-ghost seeall-row-action-btn" onClick={() => void addToQueue(anime, mode)}>
                    <ListPlus size={14} /> Add to Queue
                  </button>
                  <button
                    type="button"
                    className="vhs-button-ghost seeall-row-action-btn"
                    onClick={(event) => openLibraryPicker(anime, event.currentTarget)}
                  >
                    <BookmarkPlus size={14} /> Add to Library
                  </button>
                  <button type="button" className="vhs-button-ghost seeall-row-action-btn" onClick={() => void openDetails(anime)}>
                    <Info size={14} /> Info
                  </button>
                </div>
              </div>
            </article>
          );
        })}

        {!loading && !error && visibleItems.length === 0 ? (
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-cream/70">No tapes available for this shelf.</p>
        ) : null}

        <div ref={sentinelRef} className="seeall-sentinel">
          {!loading && visibleCount < sortedItems.length ? 'Loading more tapes...' : 'End of shelf'}
        </div>
      </section>

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
    </div>
  );
}
