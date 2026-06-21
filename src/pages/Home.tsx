import { Info, Play } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HeroSeeAllMenu from '../components/HeroSeeAllMenu';
import AnimeHoverPreview from '../components/AnimeHoverPreview';
import AnimeShelfScrollable from '../components/AnimeShelfScrollable';
import LibraryStatusPickerModal from '../components/LibraryStatusPickerModal';
import SeasonLinkBadge from '../components/SeasonLinkBadge';
import {
  getLatestPromoAnime,
  getLatestUpdatedAnime,
  getUpcomingUpdatedAnime,
  getSeasonalAnime,
  getTopAiringAnime,
  getTopAnime,
  getTopUpcomingAnime,
  refreshHomeShelvesIfNeeded,
  resolveCanonicalDetailRouteId,
} from '../services/catalogSource';
import { useAppStore } from '../state/appStore';
import type { AnimeSummary, LibraryStatus } from '../types/anime';
import {
  formatReleaseDateTimeLocal,
  getReleaseBadgeLabel,
  isUpcomingByReleaseTime,
} from '../utils/releaseTime';
import { compareByScoreThenPopularity } from '../utils/animeRanking';
import { HOME_SHELF_TO_SEE_ALL_TYPE, type SeeAllSort, type SeeAllType } from '../utils/seeAll';
import { buildSeasonSeeAllPath, getCurrentSeasonYear, getSeasonLabelUpper, resolveAnimeSeason } from '../utils/season';
import { getDisplayTitle } from '../utils/title';
import { TOP_AIRING_SHARED_FETCH_LIMIT, TOP_POPULAR_SHARED_FETCH_LIMIT, TOP_UPCOMING_SHARED_FETCH_LIMIT } from '../constants/catalogLimits';

const SHELF_LIMIT = 20;
const HOME_TOP_SHELF_LIMIT = TOP_POPULAR_SHARED_FETCH_LIMIT;
const SEASON_PAGE_LIMIT = 10;
const SEASON_PAGE_COUNT = 2;
const SEASON_FETCH_LIMIT = SEASON_PAGE_LIMIT * SEASON_PAGE_COUNT;

type ContinueWatchingItem = {
  source?: AnimeSummary;
  id: number;
  jikanId?: number;
  animeScheduleRoute?: string;
  title: string;
  titleEnglish?: string;
  titleJapanese?: string;
  image: string;
  episode: number;
  totalEpisodes?: number;
  episodeDurationSeconds?: number;
  elapsedSeconds: number;
  elapsedLabel: string;
  progress: number;
};

type ShelfDensity = 5 | 6;

type ShelfItem = ContinueWatchingItem | AnimeSummary;

type ShelfConfig = {
  key: string;
  title: string;
  tooltip: string;
  density: ShelfDensity;
  items: ShelfItem[];
  withProgress: boolean;
};

type ShelfPlayableMode = 'series' | 'episode' | 'trailer';

const isContinueWatchingItem = (item: ContinueWatchingItem | AnimeSummary): item is ContinueWatchingItem =>
  'elapsedLabel' in item && 'progress' in item;

const normalizeIdentityText = (value?: string) =>
  (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim();

const buildShelfIdentityKeys = (item: ShelfItem) => {
  const keys = new Set<string>();
  keys.add(`id:${item.id}`);

  const titleCandidates = [
    item.title,
    'titleEnglish' in item ? item.titleEnglish : undefined,
    'titleJapanese' in item ? item.titleJapanese : undefined,
    'source' in item ? item.source?.title : undefined,
    'source' in item ? item.source?.titleEnglish : undefined,
    'source' in item ? item.source?.titleJapanese : undefined,
  ];

  for (const candidate of titleCandidates) {
    const normalized = normalizeIdentityText(candidate);
    if (normalized) {
      keys.add(`title:${normalized}`);
    }
  }

  return keys;
};

const buildAnimeIdentityKeys = (anime: AnimeSummary) => {
  const keys = new Set<string>();
  keys.add(`id:${anime.id}`);

  const titleCandidates = [anime.title, anime.titleEnglish, anime.titleJapanese, ...(anime.titleSynonyms ?? [])];
  for (const candidate of titleCandidates) {
    const normalized = normalizeIdentityText(candidate);
    if (normalized) {
      keys.add(`title:${normalized}`);
    }
  }

  return keys;
};

const hasReleaseBadgeSignal = (item: ShelfItem) => {
  const anime = toAnimeSummary(item);
  return getReleaseBadgeLabel(anime.airingDate, anime.mediaType, false) !== null;
};

const shouldReplaceShelfItem = (current: ShelfItem, candidate: ShelfItem) => {
  const currentHasBadgeSignal = hasReleaseBadgeSignal(current);
  const candidateHasBadgeSignal = hasReleaseBadgeSignal(candidate);
  if (candidateHasBadgeSignal && !currentHasBadgeSignal) return true;

  const currentAiring = toAnimeSummary(current).airingDate;
  const candidateAiring = toAnimeSummary(candidate).airingDate;
  if (!currentAiring && candidateAiring) return true;

  return false;
};

const formatElapsedLabel = (seconds: number) => {
  const safe = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
};

const toAnimeSummary = (item: ShelfItem): AnimeSummary => {
  if (!isContinueWatchingItem(item)) return item;
  const fallbackDurationMinutes =
    item.episodeDurationSeconds && item.episodeDurationSeconds > 0
      ? Math.max(1, Math.round(item.episodeDurationSeconds / 60))
      : undefined;
  return {
    id: item.id,
    jikanId: item.jikanId ?? item.source?.jikanId,
    animeScheduleRoute: item.animeScheduleRoute ?? item.source?.animeScheduleRoute,
    title: item.title,
    titleEnglish: item.titleEnglish ?? item.source?.titleEnglish,
    titleJapanese: item.titleJapanese ?? item.source?.titleJapanese,
    image: item.image,
    banner: item.source?.banner ?? item.image,
    synopsis: item.source?.synopsis ?? '',
    score: item.source?.score,
    year: item.source?.year,
    airingDate: item.source?.airingDate,
    episodes: item.totalEpisodes ?? item.source?.episodes,
    status: item.source?.status,
    studios: item.source?.studios ?? [],
    genres: item.source?.genres ?? [],
    durationMinutes: item.source?.durationMinutes ?? fallbackDurationMinutes,
    trailerUrl: item.source?.trailerUrl,
    mediaType: item.source?.mediaType,
  };
};

const isNotYetAired = (anime: AnimeSummary) => {
  if (isUpcomingByReleaseTime(anime.airingDate)) return true;
  const status = anime.status?.toLowerCase() ?? '';
  return status.includes('not yet') || status.includes('upcoming');
};

const formatReleaseDateTime = (airingDate?: string) => {
  return formatReleaseDateTimeLocal(airingDate);
};

const getPosterOverlayLabel = (anime: AnimeSummary, watchedCompleted = false) => {
  return getReleaseBadgeLabel(anime.airingDate, anime.mediaType, watchedCompleted);
};

export default function Home() {
  const navigate = useNavigate();
  const activeSeasonMeta = useMemo(() => getCurrentSeasonYear(), []);
  const [seasonal, setSeasonal] = useState<AnimeSummary[]>([]);
  const [popular, setPopular] = useState<AnimeSummary[]>([]);
  const [latestUpdated, setLatestUpdated] = useState<AnimeSummary[]>([]);
  const [upcomingUpdated, setUpcomingUpdated] = useState<AnimeSummary[]>([]);
  const [latestPromo, setLatestPromo] = useState<AnimeSummary[]>([]);
  const [topAiring, setTopAiring] = useState<AnimeSummary[]>([]);
  const [topUpcoming, setTopUpcoming] = useState<AnimeSummary[]>([]);
  const [featuredAnimeId, setFeaturedAnimeId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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
  const watchHistory = useAppStore((state) => state.watchHistory);
  const removeHistoryItem = useAppStore((state) => state.removeHistoryItem);
  const watchProgress = useAppStore((state) => state.watchProgress);
  const titleLanguage = useAppStore((state) => state.titleLanguage);
  const homeRefreshVersion = useAppStore((state) => state.homeRefreshVersion);
  const runLibraryEpisodeDailyCheck = useAppStore((state) => state.runLibraryEpisodeDailyCheck);
  const setAnimeLibraryStatus = useAppStore((state) => state.setAnimeLibraryStatus);
  const removeAnimeFromLibrary = useAppStore((state) => state.removeAnimeFromLibrary);
  const getLibraryStatusForAnime = useAppStore((state) => state.getLibraryStatusForAnime);
  const [libraryPickerAnime, setLibraryPickerAnime] = useState<AnimeSummary | null>(null);
  const [libraryPickerAnchorElement, setLibraryPickerAnchorElement] = useState<HTMLElement | null>(null);
  const [libraryPickerAllowRemove, setLibraryPickerAllowRemove] = useState(true);

  const getCardActionMode = (shelfKey: string): ShelfPlayableMode => {
    if (shelfKey === 'latest' || shelfKey === 'upcoming-update' || shelfKey === 'continue') return 'episode';
    if (shelfKey === 'promo') return 'trailer';
    if (shelfKey === 'upcoming') return 'trailer';
    return 'series';
  };

  const getCardLabelMode = (shelfKey: string): ShelfPlayableMode => {
    if (shelfKey === 'latest' || shelfKey === 'upcoming-update') return 'episode';
    if (shelfKey === 'promo') return 'trailer';
    if (shelfKey === 'upcoming') return 'trailer';
    return 'series';
  };

  const getAnimeMediaTypeLabel = (anime: AnimeSummary) => {
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

  const getMediaLabel = (mode: ShelfPlayableMode, anime: AnimeSummary, fallbackEpisode: number) => {
    if (mode === 'trailer') return 'Trailer';
    if (mode === 'episode') return `Episode ${String(Math.max(1, fallbackEpisode)).padStart(2, '0')}`;
    const mediaTypeLabel = getAnimeMediaTypeLabel(anime);
    if (mediaTypeLabel) return mediaTypeLabel;
    const normalizedStatus = anime.status?.trim().toLowerCase() ?? '';
    if (normalizedStatus.includes('continuing')) return 'CONTINUING';
    return 'SERIES';
  };

  const getMetaLabel = (item: ShelfItem, shelfKey: string, anime: AnimeSummary) => {
    if (isContinueWatchingItem(item)) {
      const totalEpisodes = item.totalEpisodes && item.totalEpisodes > 0 ? `/${item.totalEpisodes}` : '';
      return `Ep ${item.episode}${totalEpisodes} • ${item.elapsedLabel}`;
    }
    if (shelfKey === 'latest') {
      const releaseDateTime = formatReleaseDateTime(anime.airingDate);
      return releaseDateTime ? `Release ${releaseDateTime}` : anime.status ?? 'Latest update';
    }
    if (shelfKey === 'upcoming-update') {
      const releaseDateTime = formatReleaseDateTime(anime.airingDate);
      return releaseDateTime ? `Airs ${releaseDateTime}` : anime.status ?? 'Upcoming update';
    }
    if (shelfKey === 'promo') return anime.status ?? 'Latest promo';
    if (shelfKey === 'upcoming') return anime.year ? `Year ${anime.year}` : 'Upcoming';
    if (shelfKey === 'airing') return 'Top Airing';
    if (shelfKey === 'season' || shelfKey === 'popular') return '';
    return anime.status ?? (anime.year ? `Year ${anime.year}` : '');
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');

    const onSeasonal = (value: AnimeSummary[]) => {
      if (!alive) return;
      setSeasonal(value);
    };
    const onPopular = (value: AnimeSummary[]) => {
      if (!alive) return;
      setPopular(value);
    };
    const onLatestUpdated = (value: AnimeSummary[]) => {
      if (!alive) return;
      setLatestUpdated(value);
    };
    const onUpcomingUpdated = (value: AnimeSummary[]) => {
      if (!alive) return;
      setUpcomingUpdated(value);
    };
    const onLatestPromo = (value: AnimeSummary[]) => {
      if (!alive) return;
      setLatestPromo(value);
    };
    const onTopAiring = (value: AnimeSummary[]) => {
      if (!alive) return;
      setTopAiring(value);
    };
    const onTopUpcoming = (value: AnimeSummary[]) => {
      if (!alive) return;
      setTopUpcoming(value);
    };

    const refreshCallbacks = {
      onSeasonal,
      onPopular,
      onLatestUpdated,
      onUpcomingUpdated,
      onLatestPromo,
      onTopAiring,
      onTopUpcoming,
    };

    const refreshIfNeeded = () => {
      void refreshHomeShelvesIfNeeded(SHELF_LIMIT, refreshCallbacks);
      void runLibraryEpisodeDailyCheck();
    };

    async function load() {
      try {
        const [seasonalData, popularData, latestUpdatedData, upcomingUpdatedData, latestPromoData, topAiringData, topUpcomingData] = await Promise.all([
          getSeasonalAnime(SEASON_FETCH_LIMIT, {
            onUpdate: onSeasonal,
            seasonYear: activeSeasonMeta.year,
            season: activeSeasonMeta.season,
            seasonPageLimit: SEASON_PAGE_LIMIT,
            seasonPageCount: SEASON_PAGE_COUNT,
            seasonContinuing: true,
          }),
          getTopAnime(TOP_POPULAR_SHARED_FETCH_LIMIT, { onUpdate: onPopular }),
          getLatestUpdatedAnime(SHELF_LIMIT, { onUpdate: onLatestUpdated }),
          getUpcomingUpdatedAnime(SHELF_LIMIT, { onUpdate: onUpcomingUpdated }),
          getLatestPromoAnime(SHELF_LIMIT, { onUpdate: onLatestPromo }),
          getTopAiringAnime(TOP_AIRING_SHARED_FETCH_LIMIT, { onUpdate: onTopAiring }),
          getTopUpcomingAnime(TOP_UPCOMING_SHARED_FETCH_LIMIT, { onUpdate: onTopUpcoming, upcomingSeasonFilter: 'all' }),
        ]);
        if (!alive) return;
        setSeasonal(seasonalData);
        setPopular(popularData);
        setLatestUpdated(latestUpdatedData);
        setUpcomingUpdated(upcomingUpdatedData);
        setLatestPromo(latestPromoData);
        setTopAiring(topAiringData);
        setTopUpcoming(topUpcomingData);
        refreshIfNeeded();
      } catch {
        if (alive) setError('Source signal is noisy. Try again in a moment.');
      } finally {
        if (alive) setLoading(false);
      }
    }

    void load();

    const onFocus = () => refreshIfNeeded();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshIfNeeded();
    };
    const refreshTimer = window.setInterval(() => {
      refreshIfNeeded();
    }, 60 * 1000);

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      alive = false;
      window.clearInterval(refreshTimer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [activeSeasonMeta.season, activeSeasonMeta.year, homeRefreshVersion, runLibraryEpisodeDailyCheck]);

  const heroPool = useMemo(() => {
    const poolMap = new Map<number, AnimeSummary>();
    [...seasonal, ...popular, ...latestUpdated, ...latestPromo, ...topAiring, ...topUpcoming].forEach((anime) => {
      if (!poolMap.has(anime.id)) {
        poolMap.set(anime.id, anime);
      }
    });
    return Array.from(poolMap.values());
  }, [latestPromo, latestUpdated, popular, seasonal, topAiring, topUpcoming]);

  useEffect(() => {
    if (!heroPool.length) {
      setFeaturedAnimeId(null);
      return;
    }
    setFeaturedAnimeId((currentId) => {
      if (currentId !== null && heroPool.some((anime) => anime.id === currentId)) {
        return currentId;
      }
      const randomAnime = heroPool[Math.floor(Math.random() * heroPool.length)];
      return randomAnime?.id ?? null;
    });
  }, [heroPool]);

  const featured = useMemo(() => {
    if (!heroPool.length || featuredAnimeId === null) return undefined;
    return heroPool.find((anime) => anime.id === featuredAnimeId) ?? heroPool[0];
  }, [featuredAnimeId, heroPool]);

  const animeLookup = useMemo(() => {
    const map = new Map<number, AnimeSummary>();
    [...seasonal, ...popular, ...latestUpdated, ...latestPromo, ...topAiring, ...topUpcoming].forEach((anime) => map.set(anime.id, anime));
    return map;
  }, [latestPromo, latestUpdated, popular, seasonal, topAiring, topUpcoming]);

  const animeIdentityLookup = useMemo(() => {
    const map = new Map<string, AnimeSummary>();
    [...seasonal, ...popular, ...latestUpdated, ...latestPromo, ...topAiring, ...topUpcoming].forEach((anime) => {
      const keys = buildAnimeIdentityKeys(anime);
      keys.forEach((key) => {
        if (!map.has(key)) {
          map.set(key, anime);
        }
      });
    });
    return map;
  }, [latestPromo, latestUpdated, popular, seasonal, topAiring, topUpcoming]);

  const startWatching = async () => {
    if (!featured) return;
    await playAnimeSeries(featured);
  };

  const openFeaturedDetails = async () => {
    if (!featured) return;
    const canonicalDetailId = await resolveCanonicalDetailRouteId(featured);
    const selected = canonicalDetailId ? { ...featured, id: canonicalDetailId, jikanId: canonicalDetailId } : featured;
    await selectAnime(selected);
    await openRightPanelWithView('detail');
  };

  const heroIsFromLatestPromo = Boolean(featured && latestPromo.some((anime) => anime.id === featured.id));
  const heroIsFromTopUpcoming = Boolean(featured && topUpcoming.some((anime) => anime.id === featured.id));
  const showStartWatching = Boolean(featured && !heroIsFromLatestPromo && !heroIsFromTopUpcoming && !isNotYetAired(featured));

  const continueWatching = useMemo<ContinueWatchingItem[]>(() => {
    return watchHistory
      .filter((item) => item.progress < 100)
      .map((item) => {
        const directSource = animeLookup.get(item.animeId);
        const titleKeys = [item.title, item.titleEnglish, item.titleJapanese]
          .map((value) => normalizeIdentityText(value))
          .filter((value): value is string => value.length > 0)
          .map((value) => `title:${value}`);
        const matchedSource = directSource ?? titleKeys.map((key) => animeIdentityLookup.get(key)).find((anime): anime is AnimeSummary => !!anime);

        return {
          source: matchedSource,
          id: item.animeId,
          jikanId: item.jikanId ?? matchedSource?.jikanId,
          animeScheduleRoute: item.animeScheduleRoute ?? matchedSource?.animeScheduleRoute,
          title: item.title,
          titleEnglish: item.titleEnglish,
          titleJapanese: item.titleJapanese,
          image: item.image,
          episode: item.episode,
          totalEpisodes: item.totalEpisodes,
          episodeDurationSeconds: item.episodeDurationSeconds,
          elapsedSeconds: Math.max(0, Math.floor(item.lastPlaybackSeconds ?? 0)),
          elapsedLabel: formatElapsedLabel(item.lastPlaybackSeconds ?? 0),
          progress: item.progress,
        };
      });
  }, [animeIdentityLookup, animeLookup, watchHistory]);

  const seasonLabel = useMemo(() => {
    return `${getSeasonLabelUpper(activeSeasonMeta.season)} ${activeSeasonMeta.year}`;
  }, [activeSeasonMeta.season, activeSeasonMeta.year]);

  const nextRelease = useMemo(() => upcomingUpdated.slice(0, SHELF_LIMIT), [upcomingUpdated]);
  const latestReleased = useMemo(() => latestUpdated.slice(0, SHELF_LIMIT), [latestUpdated]);
  const sortedPopular = useMemo(() => [...popular].sort(compareByScoreThenPopularity), [popular]);

  const rawShelves = useMemo<ShelfConfig[]>(
    () => [
      { key: 'continue', title: 'Continue Watching', tooltip: 'View All Continue Watching', density: 5 as const, items: continueWatching, withProgress: true },
      { key: 'season', title: seasonLabel, tooltip: `View All ${seasonLabel}`, density: 6 as const, items: seasonal, withProgress: false },
      { key: 'upcoming-update', title: 'Upcoming Update', tooltip: 'View All Upcoming Update', density: 6 as const, items: nextRelease, withProgress: false },
      { key: 'latest', title: 'Latest Update', tooltip: 'View All Latest Update', density: 6 as const, items: latestReleased, withProgress: false },
      { key: 'promo', title: 'Latest Promo', tooltip: 'View All Latest Promo', density: 6 as const, items: latestPromo.slice(0, SHELF_LIMIT), withProgress: false },
      { key: 'airing', title: 'Top Airing', tooltip: 'View All Top Airing', density: 6 as const, items: topAiring, withProgress: false },
      { key: 'popular', title: 'Popular on My Anime 1996', tooltip: 'View All Popular Anime', density: 6 as const, items: sortedPopular, withProgress: false },
      { key: 'upcoming', title: 'Top Upcoming', tooltip: 'View All Top Upcoming', density: 6 as const, items: topUpcoming, withProgress: false },
    ],
    [continueWatching, latestPromo, latestReleased, nextRelease, seasonLabel, seasonal, sortedPopular, topAiring, topUpcoming],
  );

  const shelves = useMemo(() => {
    const builtShelves = rawShelves.map((shelf) => {
      const sectionSeen = new Map<string, number>();
      const uniqueItems: ShelfItem[] = [];
      const maxItems = shelf.key === 'airing' || shelf.key === 'popular' || shelf.key === 'upcoming'
        ? HOME_TOP_SHELF_LIMIT
        : SHELF_LIMIT;

      for (const item of shelf.items) {
        const identityKeys = buildShelfIdentityKeys(item);
        const duplicateIndex = Array.from(identityKeys)
          .map((key) => sectionSeen.get(key))
          .find((index): index is number => index !== undefined);

        if (duplicateIndex === undefined) {
          const nextIndex = uniqueItems.length;
          uniqueItems.push(item);
          identityKeys.forEach((key) => sectionSeen.set(key, nextIndex));
        } else {
          if (shouldReplaceShelfItem(uniqueItems[duplicateIndex], item)) {
            uniqueItems[duplicateIndex] = item;
          }
          identityKeys.forEach((key) => sectionSeen.set(key, duplicateIndex));
        }

        if (uniqueItems.length >= maxItems) break;
      }

      return {
        ...shelf,
        items: uniqueItems,
      };
    });

    return builtShelves.filter((shelf) => shelf.items.length > 0);
  }, [rawShelves]);

  const selectFromCard = async (item: ContinueWatchingItem | AnimeSummary) => {
    const anime = toAnimeSummary(item);
    const canonicalDetailId = await resolveCanonicalDetailRouteId(anime);
    const selected = canonicalDetailId ? { ...anime, id: canonicalDetailId, jikanId: canonicalDetailId } : anime;
    await selectAnime(selected);
  };

  const playFromCard = async (item: ContinueWatchingItem | AnimeSummary, shelfKey: string) => {
    const anime = toAnimeSummary(item);
    const canonicalAnimeId = anime.jikanId ?? anime.id;
    const resumeEntry = watchProgress[canonicalAnimeId] ?? watchProgress[anime.id];
    const hasResume =
      !!resumeEntry &&
      resumeEntry.progress > 0 &&
      resumeEntry.progress < 100 &&
      (Math.max(0, Math.floor(resumeEntry.lastPlaybackSeconds ?? 0)) > 0 || Math.max(1, resumeEntry.episode) > 1);

    const fallbackDurationMinutes =
      resumeEntry?.episodeDurationSeconds && resumeEntry.episodeDurationSeconds > 0
        ? Math.max(1, Math.round(resumeEntry.episodeDurationSeconds / 60))
        : anime.durationMinutes;
    const resumeAnime = hasResume
      ? {
          ...anime,
          episodes: resumeEntry?.totalEpisodes ?? anime.episodes,
          durationMinutes: fallbackDurationMinutes,
        }
      : anime;
    const mode = getCardActionMode(shelfKey);

    if (mode === 'trailer') {
      await playTrailer(anime);
      return;
    }

    if (hasResume && resumeEntry) {
      const resumeAt = Math.max(0, Math.floor(resumeEntry.lastPlaybackSeconds ?? 0));
      const resumeDuration = Math.max(0, Math.floor(resumeEntry.episodeDurationSeconds ?? 0));
      await playEpisode(resumeAnime, Math.max(1, resumeEntry.episode));
      if (resumeDuration > 0) {
        setPlaybackDuration(resumeDuration);
      }
      if (resumeAt > 0) {
        setPlaybackTime(resumeAt);
        requestSeekTo(resumeAt);
      }
      return;
    }

    if (mode === 'episode') {
      const episodeNumber = isContinueWatchingItem(item) ? item.episode : Math.max(1, anime.episodes ?? 1);
      await playEpisode(anime, episodeNumber);
      if (isContinueWatchingItem(item) && item.elapsedSeconds > 0) {
        requestSeekTo(item.elapsedSeconds);
      }
      return;
    }

    await playAnimeSeries(anime);
  };

  const playTrailerFromCard = async (item: ContinueWatchingItem | AnimeSummary) => {
    const anime = toAnimeSummary(item);
    await playTrailer(anime);
  };

  const startOverFromCard = async (item: ContinueWatchingItem | AnimeSummary, shelfKey: string) => {
    const anime = toAnimeSummary(item);
    const mode = getCardActionMode(shelfKey);

    if (mode === 'trailer') {
      await playTrailer(anime);
      return;
    }

    if (mode === 'episode') {
      const episodeNumber = isContinueWatchingItem(item) ? item.episode : Math.max(1, anime.episodes ?? 1);
      await playEpisode(anime, episodeNumber);
      setPlaybackTime(0);
      requestSeekTo(0);
      return;
    }

    await playAnimeSeries(anime);
  };

  const addToQueueFromCard = async (item: ContinueWatchingItem | AnimeSummary, shelfKey: string) => {
    const anime = toAnimeSummary(item);
    const mode = getCardActionMode(shelfKey);

    if (mode === 'trailer') {
      await addTrailerToQueue(anime);
      return;
    }

    if (mode === 'episode') {
      const episodeNumber = isContinueWatchingItem(item) ? item.episode : Math.max(1, anime.episodes ?? 1);
      await addEpisodeToQueue(anime, episodeNumber);
      return;
    }

    await addAnimeSeriesToQueue(anime);
  };

  const openDetailFromCard = async (item: ContinueWatchingItem | AnimeSummary) => {
    await selectFromCard(item);
    await openRightPanelWithView('detail');
  };

  const openLibraryPickerFromCard = (item: ContinueWatchingItem | AnimeSummary, shelfKey: string, anchorElement?: HTMLElement | null) => {
    setLibraryPickerAnime(toAnimeSummary(item));
    setLibraryPickerAnchorElement(anchorElement ?? null);
    setLibraryPickerAllowRemove(!(shelfKey === 'continue' || shelfKey === 'history'));
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

  const getResumeEntry = (anime: AnimeSummary) => {
    const canonicalAnimeId = anime.jikanId ?? anime.id;
    const entry = watchProgress[canonicalAnimeId] ?? watchProgress[anime.id];
    if (!entry) return null;
    if (entry.progress <= 0 || entry.progress >= 100) return null;
    if (Math.max(0, Math.floor(entry.lastPlaybackSeconds ?? 0)) <= 0 && Math.max(1, entry.episode) <= 1) return null;
    return entry;
  };

  const openSeeAll = (type: SeeAllType, sort?: SeeAllSort) => {
    const params = new URLSearchParams();
    if (sort) {
      params.set('sort', sort);
    }
    if (type === 'season') {
      params.set('year', String(activeSeasonMeta.year));
      params.set('season', activeSeasonMeta.season);
    }
    const query = params.toString();
    navigate(query ? `/see-all/${type}?${query}` : `/see-all/${type}`);
  };

  return (
    <div className="space-y-6 pb-4">
      <section className="hero-scene hero-band relative overflow-hidden px-6 py-9">
        {featured?.banner && <img src={featured.banner} alt="" className="hero-retro-image absolute inset-0 h-full w-full object-cover opacity-[0.34]" />}
        <div className="absolute inset-0 bg-gradient-to-r from-[#0f0b09]/92 via-[#15100d]/84 to-[#1e160f]/40" />

        <div className="hero-seeall-menu-slot">
          <HeroSeeAllMenu
            onNavigate={(type, sort) => {
              openSeeAll(type, sort);
            }}
          />
        </div>

        <div className="relative z-10 max-w-[52%]">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-amberline/80">Welcome Back</p>
          <h1 className="retro-hero-title font-display text-[3.45rem] font-semibold uppercase leading-[0.95] tracking-[0.05em] text-amberline">
            Good to see you
            <br />
            again.
          </h1>
          <p className="retro-hero-subtitle mt-3 text-base text-cream/72">Where will we go today?</p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {showStartWatching ? (
              <button type="button" onClick={startWatching} data-tooltip="Start Watching" className="retro-tooltip vhs-button rounded-full px-5 py-2.5">
                <Play size={16} /> Start Watching
              </button>
            ) : null}
            {featured ? (
              <button type="button" onClick={openFeaturedDetails} data-tooltip="Open Details" className="retro-tooltip vhs-button-ghost rounded-full px-5 py-2.5">
                <Info size={16} /> Open Details
              </button>
            ) : null}
          </div>
        </div>

        {featured && (
          <div className="hero-featured-highlight">
            <p className="hero-featured-title" title={getDisplayTitle(featured, titleLanguage)}>{getDisplayTitle(featured, titleLanguage)}</p>
            {featured.titleJapanese && <p className="hero-featured-japanese line-clamp-1" title={featured.titleJapanese}>{featured.titleJapanese}</p>}
          </div>
        )}
      </section>

      {loading && <p className="px-6 font-mono text-[11px] uppercase tracking-[0.14em] text-amberline/70">Tracking signal...</p>}
      {error && <div className="mx-6 app-card p-4 font-mono text-sm uppercase tracking-[0.12em] text-rust">{error}</div>}

      {shelves.map((shelf) => (
        <section key={shelf.key} className="space-y-3 px-6">
          <div className="flex items-end justify-between">
            <h2 className="section-title">{shelf.title}</h2>
            <button
              type="button"
              className="see-all-link retro-tooltip tooltip-down tooltip-left"
              data-tooltip={shelf.tooltip}
              onClick={() => {
                if (shelf.key === 'continue') {
                  navigate('/history');
                  return;
                }

                const mappedType = HOME_SHELF_TO_SEE_ALL_TYPE[shelf.key];
                if (!mappedType) return;
                openSeeAll(mappedType);
              }}
            >
              See all
            </button>
          </div>

          <AnimeShelfScrollable
            items={shelf.items}
            resetKey={`${homeRefreshVersion}:${shelf.key}:${shelf.items.length}:${shelf.items[0]?.id ?? 'none'}`}
            trackClassName={`anime-shelf-track ${shelf.density === 5 ? 'anime-shelf-track-5' : 'anime-shelf-track-6'}`}
            renderItem={(item, index) => {
              const episodes = isContinueWatchingItem(item) ? item.episode : item.episodes;
              const previewAnime = toAnimeSummary(item);
              const displayTitle = getDisplayTitle(previewAnime, titleLanguage);
              const secondaryTitle = previewAnime.titleJapanese ?? '';
              const isRankedShelf = shelf.key === 'airing' || shelf.key === 'upcoming';
              const labelMode = getCardLabelMode(shelf.key);
              const mediaLabel = getMediaLabel(labelMode, previewAnime, isContinueWatchingItem(item) ? item.episode : episodes ?? 1);
              const statusLabel = previewAnime.status?.trim() || 'Currently Airing';
              const mediaStatusLabel = `${mediaLabel} • ${statusLabel}`;
              const previewEpisodeLabel = getMetaLabel(item, shelf.key, previewAnime);
              const seasonMeta = resolveAnimeSeason(previewAnime);
              const resumeEntry = getResumeEntry(previewAnime);
              const canonicalAnimeId = previewAnime.jikanId ?? previewAnime.id;
              const watchEntry = watchProgress[canonicalAnimeId] ?? watchProgress[previewAnime.id];
              const isWatchedCompleted = Boolean(watchEntry?.completed || (watchEntry?.progress ?? 0) >= 100);
              const isResumeAction = Boolean(resumeEntry);
              const canPlayAnime = shelf.key !== 'promo' && (isResumeAction || !isNotYetAired(previewAnime));
              const playLabel = isResumeAction ? 'Resume' : 'Play Now';
              const posterOverlayLabel = getPosterOverlayLabel(previewAnime, isWatchedCompleted);

              return (
                <AnimeHoverPreview
                  key={`${shelf.key}-${item.id}`}
                  anime={previewAnime}
                  posterOverlayLabel={posterOverlayLabel}
                  episodeLabel={previewEpisodeLabel}
                  mediaLabel={mediaLabel}
                  playLabel={playLabel}
                  isResumeAction={isResumeAction}
                  canPlayAnime={canPlayAnime}
                  onStartOver={isResumeAction ? () => void startOverFromCard(item, shelf.key) : undefined}
                  onPlay={() => void playFromCard(item, shelf.key)}
                  onPlayTrailer={() => void playTrailerFromCard(item)}
                  onAddToQueue={() => void addToQueueFromCard(item, shelf.key)}
                  onAddToLibrary={(anchorElement) => openLibraryPickerFromCard(item, shelf.key, anchorElement)}
                  isLibraryModalOpen={Boolean(libraryPickerAnime)}
                  onRemove={
                    shelf.key === 'continue' && isContinueWatchingItem(item)
                      ? () => {
                          void removeHistoryItem(item.id);
                        }
                      : undefined
                  }
                  onOpenDetail={() => void openDetailFromCard(item)}
                >
                  <button
                    type="button"
                    onClick={() => void openDetailFromCard(item)}
                    data-tooltip={displayTitle}
                    data-tooltip-sub={secondaryTitle}
                    className={`retro-tooltip anime-card-tooltip anime-card anime-shelf-card media-thumb-card p-2 text-left ${isRankedShelf ? 'airing-rank-card' : ''}`}
                  >
                    {isRankedShelf && <span className="airing-rank-badge" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>}
                    <div className="anime-card-poster-wrap">
                      <img src={item.image} alt="" className="anime-card-poster" />
                      {posterOverlayLabel ? <span className="anime-card-poster-overlay-badge">{posterOverlayLabel}</span> : null}
                    </div>
                    <div className="anime-card-copy mt-2">
                      <p className="anime-card-title anime-card-title-slot line-clamp-2">{displayTitle}</p>
                      <p className="anime-card-jp anime-card-jp-slot line-clamp-1">{secondaryTitle || '\u3000'}</p>
                      {seasonMeta ? (
                        <SeasonLinkBadge
                          season={seasonMeta.season}
                          year={seasonMeta.year}
                          variant="compact"
                          interaction="action"
                          onActivate={() => navigate(buildSeasonSeeAllPath(seasonMeta.year, seasonMeta.season))}
                        />
                      ) : null}
                      <p className="anime-card-jp">{mediaStatusLabel}</p>
                      {previewEpisodeLabel ? <p className="anime-card-meta">{previewEpisodeLabel}</p> : null}
                      {shelf.withProgress && isContinueWatchingItem(item) && <div className="stream-progress"><span style={{ width: `${item.progress}%` }} /></div>}
                    </div>
                  </button>
                </AnimeHoverPreview>
              );
            }}
          />
        </section>
      ))}

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
          setLibraryPickerAllowRemove(true);
        }}
        onConfirm={(status) => {
          void handleLibraryStatusConfirm(status);
          setLibraryPickerAnime(null);
          setLibraryPickerAnchorElement(null);
          setLibraryPickerAllowRemove(true);
        }}
        onRemove={
          libraryPickerAllowRemove && libraryPickerAnime && getLibraryStatusForAnime(libraryPickerAnime.id, libraryPickerAnime.jikanId)
            ? () => {
                void handleLibraryRemove();
              }
            : undefined
        }
      />
    </div>
  );
}
