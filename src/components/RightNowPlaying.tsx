import { Clock3, Play } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchAniSkipSegments } from '../services/aniSkip';
import { getAnimeDetails } from '../services/catalogSource';
import { resolveCanonicalDetailRouteId } from '../services/catalogSource';
import { getJikanDetailEpisodeBundle } from '../services/animeDetailEpisodes';
import { getAnimeEpisodeById } from '../services/jikan';
import { clearPluginRateLimit } from '../services/pluginExecutor';
import { getAvailableSourcePlugins } from '../services/sourceResolver';
import { useAppStore } from '../state/appStore';
import type { AniSkipSegmentMap, AniSkipType } from '../services/aniSkip';
import type { AnimeDetail as AnimeDetailType, AnimeEpisode, AnimeEpisodePagination, PlayableItem } from '../types/anime';
import type { ResolvedSource } from '../types/plugin';
import { formatAnimeYear } from '../utils/episodeFormatters';
import { buildActiveOrderedPluginIds, collectResolvedPluginsForAnime, pickPriorityPluginId, readResolvedSourceCache } from '../utils/resolvedSourceBadge';
import { getDisplayTitle } from '../utils/title';
import { extractYouTubeVideoId } from '../utils/youtubeUrl';
import { useAniSkipOverlay } from '../hooks/useAniSkipOverlay';
import { useHlsPlayer } from '../hooks/useHlsPlayer';
import { usePlaybackSourceResolver } from '../hooks/usePlaybackSourceResolver';
import { useYouTubeTrailerPlayer } from '../hooks/useYouTubeTrailerPlayer';
import { pickSourceOption, type LogoSelectItem } from './SourceSelector';
import PluginsPanel from './PluginsPanel';
import RightNowDetailPane from './RightNowDetailPane';
import RightNowFullscreenOverlays from './RightNowFullscreenOverlays';
import RightNowHeaderSection from './RightNowHeaderSection';
import RightNowQueueSection from './RightNowQueueSection';
import RightNowSourceResolveControls from './RightNowSourceResolveControls';
import SourceResolveLogPanel from './SourceResolveLogPanel';

const WATCH_PROGRESS_SAVE_INTERVAL_SECONDS = 5;
const FULLSCREEN_OVERLAY_HIDE_MS = 2000;
const MAX_REASONABLE_MAL_ID = 2_000_000;
const VOLUME_STEP = 5;

function isEditableKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]'));
}

export default function RightNowPlaying() {
  const selectedAnime = useAppStore((state) => state.selectedAnime);
  const currentlyPlayingItem = useAppStore((state) => state.currentlyPlayingItem);
  const queue = useAppStore((state) => state.queue);
  const queueCursor = useAppStore((state) => state.queueCursor);
  const watchProgress = useAppStore((state) => state.watchProgress);
  const clearQueue = useAppStore((state) => state.clearQueue);
  const removeFromQueue = useAppStore((state) => state.removeFromQueue);
  const playFromQueue = useAppStore((state) => state.playFromQueue);
  const playEpisode = useAppStore((state) => state.playEpisode);
  const isRightPanelFullpage = useAppStore((state) => state.isRightPanelFullpage);
  const toggleRightPanelFullpage = useAppStore((state) => state.toggleRightPanelFullpage);
  const titleLanguage = useAppStore((state) => state.titleLanguage);
  const rightPanelView = useAppStore((state) => state.rightPanelView);
  const isPlaying = useAppStore((state) => state.isPlaying);
  const playbackTime = useAppStore((state) => state.playbackTime);
  const playbackDuration = useAppStore((state) => state.playbackDuration);
  const trailerVolume = useAppStore((state) => state.trailerVolume);
  const setTrailerVolume = useAppStore((state) => state.setTrailerVolume);
  const episodeMetadata = useAppStore((state) => state.episodeMetadata);
  const pendingSeekTo = useAppStore((state) => state.pendingSeekTo);
  const setPlaying = useAppStore((state) => state.setPlaying);
  const setPlaybackTime = useAppStore((state) => state.setPlaybackTime);
  const setPlaybackDuration = useAppStore((state) => state.setPlaybackDuration);
  const updateWatchProgress = useAppStore((state) => state.updateWatchProgress);
  const clearPendingSeekTo = useAppStore((state) => state.clearPendingSeekTo);
  const setTrailerPlayerReady = useAppStore((state) => state.setTrailerPlayerReady);
  const resetPlaybackTransport = useAppStore((state) => state.resetPlaybackTransport);
  const playNextInQueue = useAppStore((state) => state.playNextInQueue);
  const importedSourcePlugins = useAppStore((state) => state.importedSourcePlugins);
  const pluginPriority = useAppStore((state) => state.pluginPriority);
  const pluginEnabled = useAppStore((state) => state.pluginEnabled);
  const preferredSourcePluginId = useAppStore((state) => state.preferredSourcePluginId);
  const preferredAudioLanguage = useAppStore((state) => state.preferredAudioLanguage);
  const baseCatalogSource = useAppStore((state) => state.baseCatalogSource);
  const selectedSourceOptionId = useAppStore((state) => state.selectedSourceOptionId);
  const autoSkipOpening = useAppStore((state) => state.autoSkipOpening);
  const autoSkipEnding = useAppStore((state) => state.autoSkipEnding);
  const autoSkipRecap = useAppStore((state) => state.autoSkipRecap);
  const setActivePlaybackUrl = useAppStore((state) => state.setActivePlaybackUrl);
  const setPlaybackSupportMode = useAppStore((state) => state.setPlaybackSupportMode);
  const setResolvingPlaybackSource = useAppStore((state) => state.setResolvingPlaybackSource);
  const setPreferredSourcePluginId = useAppStore((state) => state.setPreferredSourcePluginId);
  const setPreferredAudioLanguage = useAppStore((state) => state.setPreferredAudioLanguage);
  const setSelectedSourceOptionId = useAppStore((state) => state.setSelectedSourceOptionId);
  const requestSeekTo = useAppStore((state) => state.requestSeekTo);
  const setAnimeSkipButtonSegment = useAppStore((state) => state.setAnimeSkipButtonSegment);
  const setEpisodeMetadata = useAppStore((state) => state.setEpisodeMetadata);

  const menuRootRef = useRef<HTMLDivElement | null>(null);
  const queueDrawerRef = useRef<HTMLDivElement | null>(null);
  const queueToggleRef = useRef<HTMLButtonElement | null>(null);
  const logDrawerRef = useRef<HTMLDivElement | null>(null);
  const logToggleRef = useRef<HTMLButtonElement | null>(null);
  const paneLayoutMenuRef = useRef<HTMLDivElement | null>(null);
  const sourceVideoRef = useRef<HTMLVideoElement | null>(null);
  const pendingAutoPlayAfterResolveRef = useRef(false);
  const autoAdvanceHandledItemIdRef = useRef<string | null>(null);
  const fullscreenOverlayHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAutoSkippedSegmentRef = useRef<string | null>(null);
  const latestAniSkipFetchKeyRef = useRef<string | null>(null);
  const aniSkipMalIdCacheRef = useRef<Map<number, number | null>>(new Map());
  const lastWatchProgressSaveSecondRef = useRef(-1);
  const lastNonZeroVolumeRef = useRef(72);
  const [openMenuQueueItemId, setOpenMenuQueueItemId] = useState<string | null>(null);
  const [isFullQueueDrawerOpen, setIsFullQueueDrawerOpen] = useState(false);
  const [isSourceLogOpen, setIsSourceLogOpen] = useState(false);
  const [isFullscreenOverlayVisible, setIsFullscreenOverlayVisible] = useState(true);
  const [aniSkipSegments, setAniSkipSegments] = useState<AniSkipSegmentMap>({});
  const [detailAnime, setDetailAnime] = useState<AnimeDetailType | null>(null);
  const [detailEpisodes, setDetailEpisodes] = useState<AnimeEpisode[]>([]);
  const [detailEpisodePage, setDetailEpisodePage] = useState(1);
  const [detailEpisodePagination, setDetailEpisodePagination] = useState<AnimeEpisodePagination>({
    page: 1,
    lastVisiblePage: 1,
    hasNextPage: false,
    hasPrevPage: false,
  });
  const [detailExpandedEpisode, setDetailExpandedEpisode] = useState<number | null>(null);
  const [detailLoadingEpisode, setDetailLoadingEpisode] = useState<number | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [detailEpisodeSearchQuery, setDetailEpisodeSearchQuery] = useState('');
  const [detailEpisodeResolvedIconByEpisode, setDetailEpisodeResolvedIconByEpisode] = useState<
    Record<number, { iconDataUri: string; pluginName: string }>
  >({});
  const [isPaneLayoutMenuOpen, setIsPaneLayoutMenuOpen] = useState(false);
  const [isDocumentFullscreen, setIsDocumentFullscreen] = useState(() =>
    typeof document !== 'undefined' ? Boolean(document.fullscreenElement) : false,
  );
  const [sourceCacheVersion, setSourceCacheVersion] = useState(0);

  const trailerVideoId = useMemo(
    () => (currentlyPlayingItem?.kind === 'trailer' ? extractYouTubeVideoId(currentlyPlayingItem.anime.trailerUrl) : ''),
    [currentlyPlayingItem],
  );

  const hasTrailerPlayback = currentlyPlayingItem?.kind === 'trailer' && Boolean(trailerVideoId);
  const isNonTrailerPlayback = Boolean(currentlyPlayingItem && currentlyPlayingItem.kind !== 'trailer');
  const isNowPlayingView = rightPanelView === 'now-playing';
  const isDetailView = rightPanelView === 'detail';
  const isPluginsView = rightPanelView === 'plugins';
  const isSplitPaneMode = false;
  const showNowPlayingPane = isNowPlayingView;
  const isFullNowPlayingView = isRightPanelFullpage && isNowPlayingView;
  const showVideoOverlayControls = isDocumentFullscreen;
  const fallbackDisplayTitle = currentlyPlayingItem
    ? getDisplayTitle(currentlyPlayingItem.anime, titleLanguage)
    : selectedAnime
      ? getDisplayTitle(selectedAnime, titleLanguage)
      : 'Nothing Playing';
  const fallbackDisplayJapanese = currentlyPlayingItem?.anime.titleJapanese ?? selectedAnime?.titleJapanese ?? 'No Japanese title available';
  const episodeDisplayTitle =
    titleLanguage === 'english'
      ? episodeMetadata?.title?.trim() || episodeMetadata?.titleRomanji?.trim() || ''
      : episodeMetadata?.titleRomanji?.trim() || episodeMetadata?.title?.trim() || '';
  const episodeDisplayJapanese = episodeMetadata?.titleJapanese?.trim() || '';
  const fallbackTypeLabel = (() => {
    if (currentlyPlayingItem?.kind === 'episode') {
      const episodeNumber = Math.max(1, Math.round(currentlyPlayingItem.episodeNumber ?? episodeMetadata?.episodeNumber ?? 1));
      return episodeDisplayTitle ? `Episode ${episodeNumber} - ${episodeDisplayTitle}` : `Episode ${episodeNumber}`;
    }

    return currentlyPlayingItem?.typeLabel ?? (selectedAnime?.mediaType?.toUpperCase() ?? 'No Media');
  })();
  const detailAnimeView = detailAnime;
  const detailTargetAnimeId = useMemo(() => {
    const preferred = selectedAnime?.jikanId;
    if (typeof preferred === 'number' && Number.isFinite(preferred) && preferred > 0 && preferred <= MAX_REASONABLE_MAL_ID) {
      return Math.floor(preferred);
    }

    return null;
  }, [selectedAnime?.jikanId]);
  const detailDisplayTitle = detailAnimeView ? getDisplayTitle(detailAnimeView, titleLanguage) : '';
  const detailYearLabel = formatAnimeYear(detailAnimeView?.year, detailAnime?.aired);
  const filteredDetailEpisodes = useMemo(() => {
    const term = detailEpisodeSearchQuery.trim().toLowerCase();
    if (!term) return detailEpisodes;

    return detailEpisodes.filter((episode) => {
      const haystack = [
        String(episode.episodeNumber),
        episode.title ?? '',
        episode.titleJapanese ?? '',
        episode.titleRomanji ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [detailEpisodeSearchQuery, detailEpisodes]);

  const queueUpcoming = useMemo(() => {
    if (!queue.length) return [];
    if (queueCursor < 0) return queue;
    return queue.slice(queueCursor + 1);
  }, [queue, queueCursor]);

  useEffect(() => {
    setDetailEpisodeSearchQuery('');
  }, [detailAnimeView?.id]);

  const sourcePlugins = useMemo(() => getAvailableSourcePlugins(importedSourcePlugins), [importedSourcePlugins]);
  const activeOrderedPluginIds = useMemo(
    () => buildActiveOrderedPluginIds(sourcePlugins, pluginPriority, pluginEnabled),
    [pluginEnabled, pluginPriority, sourcePlugins],
  );
  const sourcePluginById = useMemo(
    () => new Map(sourcePlugins.map((plugin) => [plugin.id, plugin])),
    [sourcePlugins],
  );
  const { resolvedSource, isResolvingSource, sourceResolveTrace, retrySourceResolve } = usePlaybackSourceResolver({
    currentlyPlayingItem,
    importedSourcePlugins,
    pluginPriority,
    pluginEnabled,
    baseCatalogSource,
    preferredSourcePluginId,
    preferredAudioLanguage,
    setResolvingPlaybackSource,
    setSelectedSourceOptionId,
    onPrimeResolvedEpisode: async (playable, isCancelled) => {
      setEpisodeMetadata(null);
      const malId = await getAniSkipMalId();
      const episodeNumber = Math.max(1, Math.round(playable.episodeNumber ?? 1));
      const episodeLength = getAniSkipEpisodeLength();

      if (!isCancelled() && malId) {
        const fetchKey = `${malId}:${episodeNumber}:${episodeLength.toFixed(3)}`;
        latestAniSkipFetchKeyRef.current = fetchKey;
        const segments = await fetchAniSkipSegments(malId, episodeNumber, episodeLength);
        if (!isCancelled()) {
          setAniSkipSegments(segments);
          setActiveAniSkipType(null);
          setAnimeSkipButtonSegment(null);
          setIsAniSkipOverlayFading(false);
          clearAniSkipFadeTimer();
        }
      }

      if (!isCancelled()) {
        const jikanMalId = await getAniSkipMalId();
        if (jikanMalId) {
          getAnimeEpisodeById(jikanMalId, episodeNumber)
            .then((episodeDetail) => {
              if (isCancelled()) return;
              setEpisodeMetadata({
                episodeNumber,
                title: episodeDetail?.title?.trim() || undefined,
                titleJapanese: episodeDetail?.titleJapanese?.trim() || undefined,
                titleRomanji: episodeDetail?.titleRomanji?.trim() || undefined,
              });
            })
            .catch(() => {
              // Episode metadata is optional — keep UX unchanged on failure.
            });
        }
      }
    },
    onClearEpisodeMetadata: () => {
      setEpisodeMetadata(null);
    },
  });
  const sourceOptions = useMemo(() => resolvedSource?.options ?? [], [resolvedSource]);

  const availableLanguages = useMemo(() => {
    const set = new Set<'sub' | 'dub'>();
    for (const option of sourceOptions) {
      if (option.language === 'sub' || option.language === 'dub') {
        set.add(option.language);
      }
    }
    return Array.from(set);
  }, [sourceOptions]);

  const activeResolvedSource = useMemo<ResolvedSource | null>(() => {
    if (!resolvedSource) return null;
    if (!sourceOptions.length) return resolvedSource;

    const selected = pickSourceOption(sourceOptions, selectedSourceOptionId, preferredAudioLanguage);
    if (!selected) return resolvedSource;

    return {
      ...resolvedSource,
      type: selected.type,
      url: selected.url,
      label: selected.label ?? resolvedSource.label,
      language: selected.language,
      server: selected.server,
      controllable: selected.controllable,
      selectedOptionId: selected.id,
    };
  }, [preferredAudioLanguage, resolvedSource, selectedSourceOptionId, sourceOptions]);

  const shouldBlockPlaybackSurface = hasTrailerPlayback || Boolean(activeResolvedSource) || isResolvingSource;
  const {
    activeAniSkipType,
    setActiveAniSkipType,
    isAniSkipOverlayFading,
    setIsAniSkipOverlayFading,
    autoSkipToastLabel,
    clearAniSkipFadeTimer,
    restartAniSkipFadeTimer,
    performAniSkip,
  } = useAniSkipOverlay({
    requestSeekTo,
    setAnimeSkipButtonSegment,
  });

  const { trailerPlayerMountRef, syncTrailerPlaybackState, syncTrailerVolume, seekTrailer } = useYouTubeTrailerPlayer({
    currentlyPlayingKind: currentlyPlayingItem?.kind,
    playbackSessionKey: currentlyPlayingItem?.createdAt,
    hasTrailerPlayback,
    trailerVideoId,
    trailerVolume,
    playbackTime,
    isPlaying,
    setTrailerPlayerReady,
    setPlaybackDuration,
    setPlaybackTime,
    setPlaying,
    playNextInQueue,
    resetPlaybackTransport,
  });

  const sourceSelectorItems = useMemo<LogoSelectItem[]>(() => {
    const items: LogoSelectItem[] = [
      {
        value: 'auto',
        label: sourcePlugins.length === 0 ? 'No Plugins' : 'Auto',
        meta: sourcePlugins.length === 0 ? 'Install plugin first' : 'Use plugin order',
      },
    ];

    for (const plugin of sourcePlugins) {
      items.push({
        value: plugin.id,
        label: plugin.name,
        iconDataUri: plugin.iconDataUri,
        meta: `v${plugin.version}`,
      });
    }

    return items;
  }, [sourcePlugins]);

  const optionSelectorItems = useMemo<LogoSelectItem[]>(() => {
    const resolvedPlugin = activeResolvedSource?.pluginId ?? resolvedSource?.pluginId;
    const iconDataUri = resolvedPlugin ? sourcePluginById.get(resolvedPlugin)?.iconDataUri : undefined;
    const items: LogoSelectItem[] = [
      {
        value: 'auto',
        label: 'Auto',
        iconDataUri,
        meta: 'Use preference match',
      },
    ];

    for (const option of sourceOptions) {
      const optionLabel = option.label?.trim().length ? option.label : option.id;
      const optionMeta = [option.language?.toUpperCase(), option.server].filter((entry) => Boolean(entry)).join(' • ');
      items.push({
        value: option.id,
        label: optionLabel,
        iconDataUri,
        meta: optionMeta || undefined,
      });
    }

    return items;
  }, [activeResolvedSource?.pluginId, resolvedSource?.pluginId, sourceOptions, sourcePluginById]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onSourceCacheUpdated = () => {
      setSourceCacheVersion((value) => value + 1);
    };

    window.addEventListener('myanime1996:source-cache-updated', onSourceCacheUpdated as EventListener);
    return () => {
      window.removeEventListener('myanime1996:source-cache-updated', onSourceCacheUpdated as EventListener);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadDetailEpisodeBadges = async () => {
      if (!detailAnimeView || activeOrderedPluginIds.length === 0 || sourcePlugins.length === 0) {
        if (!cancelled) setDetailEpisodeResolvedIconByEpisode({});
        return;
      }

      const cache = await readResolvedSourceCache();
      const snapshot = collectResolvedPluginsForAnime(cache, {
        animeIds: [detailAnimeView.id, detailAnimeView.jikanId ?? -1],
        titles: [detailAnimeView.title, detailAnimeView.titleEnglish ?? '', detailAnimeView.titleJapanese ?? ''],
      });
      const next: Record<number, { iconDataUri: string; pluginName: string }> = {};

      for (const [episodeNumber, resolvedPluginIds] of snapshot.episodePluginIds.entries()) {
        const pluginId = pickPriorityPluginId(resolvedPluginIds, activeOrderedPluginIds);
        if (!pluginId) continue;
        const plugin = sourcePluginById.get(pluginId);
        if (!plugin?.iconDataUri) continue;
        next[episodeNumber] = {
          iconDataUri: plugin.iconDataUri,
          pluginName: plugin.name,
        };
      }

      if (!cancelled) {
        setDetailEpisodeResolvedIconByEpisode(next);
      }
    };

    void loadDetailEpisodeBadges();
    return () => {
      cancelled = true;
    };
  }, [activeOrderedPluginIds, detailAnimeView, sourceCacheVersion, sourcePluginById, sourcePlugins.length]);

  const audioSelectorItems = useMemo<LogoSelectItem[]>(() => {
    return [
      {
        value: 'sub',
        label: 'Sub',
        meta: 'ja-JP',
      },
      {
        value: 'dub',
        label: 'Dub',
        meta: 'en-US',
      },
    ];
  }, []);

  const isDirectPluginPlayback = Boolean(isNonTrailerPlayback && activeResolvedSource?.type === 'direct');
  const playbackSupportMode = useMemo<'fully-supported' | 'fullscreen-only' | 'fully-unsupported'>(() => {
    if (!isNonTrailerPlayback) return 'fully-supported';
    if (!activeResolvedSource) return 'fully-unsupported';

    const isEmbedOnly = activeResolvedSource.type === 'embed';
    const isExplicitlyNonControllable = activeResolvedSource.controllable === false;

    return isEmbedOnly || isExplicitlyNonControllable ? 'fullscreen-only' : 'fully-supported';
  }, [activeResolvedSource, isNonTrailerPlayback]);

  const getAniSkipMalId = async () => {
    const raw = currentlyPlayingItem?.anime.jikanId;
    if (Number.isFinite(raw) && raw && raw > 0) {
      return Math.floor(raw);
    }

    const fallbackAnimeId = currentlyPlayingItem?.anime.id;
    if (!Number.isFinite(fallbackAnimeId) || !fallbackAnimeId || fallbackAnimeId <= 0) {
      return null;
    }

    const bridgedAnimeId = await resolveCanonicalDetailRouteId({
      id: Math.floor(fallbackAnimeId),
      jikanId: currentlyPlayingItem?.anime.jikanId,
      animeScheduleRoute: currentlyPlayingItem?.anime.animeScheduleRoute,
    }).catch(() => undefined);
    const detailAnimeId = Math.floor(bridgedAnimeId ?? currentlyPlayingItem?.anime.jikanId ?? fallbackAnimeId);
    const cacheKey = Math.floor(fallbackAnimeId);
    if (aniSkipMalIdCacheRef.current.has(cacheKey)) {
      return aniSkipMalIdCacheRef.current.get(cacheKey) ?? null;
    }

    try {
      const detail = await getAnimeDetails(detailAnimeId);
      const fromDetail = detail?.jikanId;
      const resolved = Number.isFinite(fromDetail) && fromDetail && fromDetail > 0 ? Math.floor(fromDetail) : null;
      aniSkipMalIdCacheRef.current.set(cacheKey, resolved);
      return resolved;
    } catch {
      aniSkipMalIdCacheRef.current.set(cacheKey, null);
      return null;
    }
  };

  const getAniSkipEpisodeNumber = () => {
    const raw = currentlyPlayingItem?.episodeNumber ?? 1;
    const safe = Math.max(1, Math.round(raw));
    return Number.isFinite(safe) ? safe : 1;
  };

  const getAniSkipEpisodeLength = () => 0;

  useHlsPlayer({
    sourceVideoRef,
    activeResolvedSource,
    isPlaying,
    playbackTime,
    pendingAutoPlayAfterResolveRef,
    setPlaying,
  });

  useEffect(() => {
    pendingAutoPlayAfterResolveRef.current = Boolean(
      isPlaying && currentlyPlayingItem && currentlyPlayingItem.kind !== 'trailer',
    );
  }, [currentlyPlayingItem?.id, currentlyPlayingItem?.kind, isPlaying]);

  useEffect(() => {
    if (!currentlyPlayingItem) {
      setActivePlaybackUrl(null);
      return;
    }

    if (currentlyPlayingItem.kind === 'trailer') {
      const trailerUrl = currentlyPlayingItem.anime.trailerUrl?.trim() ?? '';
      setActivePlaybackUrl(trailerUrl.length > 0 ? trailerUrl : null);
      return;
    }

    const resolvedUrl = activeResolvedSource?.url?.trim() ?? '';
    if (resolvedUrl === '' && isNonTrailerPlayback && isResolvingSource) {
      return;
    }
    setActivePlaybackUrl(resolvedUrl.length > 0 ? resolvedUrl : null);
  }, [activeResolvedSource?.url, currentlyPlayingItem, isNonTrailerPlayback, isResolvingSource, setActivePlaybackUrl]);

  useEffect(() => {
    setPlaybackSupportMode(playbackSupportMode);
  }, [playbackSupportMode, setPlaybackSupportMode]);

  useEffect(() => {
    setAniSkipSegments({});
    setActiveAniSkipType(null);
    setAnimeSkipButtonSegment(null);
    setIsAniSkipOverlayFading(false);
    clearAniSkipFadeTimer();
    lastAutoSkippedSegmentRef.current = null;
    latestAniSkipFetchKeyRef.current = null;
  }, [currentlyPlayingItem?.id, setAnimeSkipButtonSegment]);

  useEffect(() => {
    if (!currentlyPlayingItem || currentlyPlayingItem.kind === 'trailer') return;
    if (playbackSupportMode !== 'fully-supported') return;

    let cancelled = false;
    const run = async () => {
      const malId = await getAniSkipMalId();
      const episodeNumber = getAniSkipEpisodeNumber();
      const episodeLength = getAniSkipEpisodeLength();
      if (!malId) return;

      const fetchKey = `${malId}:${episodeNumber}:${episodeLength.toFixed(3)}`;
      if (latestAniSkipFetchKeyRef.current === fetchKey) {
        return;
      }

      latestAniSkipFetchKeyRef.current = fetchKey;
      const segments = await fetchAniSkipSegments(malId, episodeNumber, episodeLength);
      if (cancelled) return;
      setAniSkipSegments(segments);
      setActiveAniSkipType(null);
      setAnimeSkipButtonSegment(null);
      setIsAniSkipOverlayFading(false);
      clearAniSkipFadeTimer();
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [currentlyPlayingItem, playbackSupportMode, setAnimeSkipButtonSegment]);

  useEffect(() => {
    if (!currentlyPlayingItem || currentlyPlayingItem.kind !== 'episode') return;
    if (playbackSupportMode !== 'fully-supported') return;

    let cancelled = false;

    const prefetchNeighbors = async () => {
      const malId = await getAniSkipMalId();
      if (!malId || cancelled) return;

      const episodeLength = getAniSkipEpisodeLength();
      const currentEpisode = getAniSkipEpisodeNumber();
      const totalEpisodes = Math.max(0, Math.round(currentlyPlayingItem.anime.episodes ?? 0));
      const neighbors = [currentEpisode - 1, currentEpisode + 1].filter(
        (episodeNumber, index, list) =>
          episodeNumber >= 1 &&
          (totalEpisodes <= 0 || episodeNumber <= totalEpisodes) &&
          list.indexOf(episodeNumber) === index,
      );

      for (const episodeNumber of neighbors) {
        if (cancelled) return;
        void fetchAniSkipSegments(malId, episodeNumber, episodeLength).catch(() => {
          // AniSkip neighbor prefetch should be silent.
        });
      }
    };

    void prefetchNeighbors();

    return () => {
      cancelled = true;
    };
  }, [currentlyPlayingItem, playbackSupportMode]);

  useEffect(() => {
    if (!currentlyPlayingItem || currentlyPlayingItem.kind === 'trailer') {
      setAnimeSkipButtonSegment(null);
      setActiveAniSkipType(null);
      return;
    }

    if (playbackSupportMode !== 'fully-supported') {
      setAnimeSkipButtonSegment(null);
      setActiveAniSkipType(null);
      return;
    }

    const autoSkipByType: Record<AniSkipType, boolean> = {
      op: autoSkipOpening,
      ed: autoSkipEnding,
      recap: autoSkipRecap,
    };

    const order: AniSkipType[] = ['op', 'recap', 'ed'];
    const matchedType = order.find((type) => {
      const segment = aniSkipSegments[type];
      if (!segment) return false;
      return playbackTime >= segment.startTime && playbackTime < segment.endTime;
    }) ?? null;

    if (!matchedType) {
      setAnimeSkipButtonSegment(null);
      setActiveAniSkipType(null);
      setIsAniSkipOverlayFading(false);
      clearAniSkipFadeTimer();
      return;
    }

    const matchedSegment = aniSkipSegments[matchedType];
    if (!matchedSegment) return;

    if (autoSkipByType[matchedType]) {
      const signature = `${currentlyPlayingItem.id}:${matchedType}:${matchedSegment.startTime}:${matchedSegment.endTime}`;
      if (lastAutoSkippedSegmentRef.current === signature) {
        return;
      }
      lastAutoSkippedSegmentRef.current = signature;
      performAniSkip(matchedType, matchedSegment, false);
      return;
    }

    setAnimeSkipButtonSegment({
      type: matchedType,
      startTime: matchedSegment.startTime,
      endTime: matchedSegment.endTime,
      skipId: matchedSegment.skipId,
    });

    if (activeAniSkipType !== matchedType) {
      setActiveAniSkipType(matchedType);
      setIsAniSkipOverlayFading(false);
      if (showVideoOverlayControls) {
        restartAniSkipFadeTimer();
      }
      return;
    }

    if (showVideoOverlayControls && !isAniSkipOverlayFading) {
      restartAniSkipFadeTimer();
    }
  }, [
    activeAniSkipType,
    aniSkipSegments,
    autoSkipEnding,
    autoSkipOpening,
    autoSkipRecap,
    currentlyPlayingItem,
    playbackSupportMode,
    playbackTime,
    isAniSkipOverlayFading,
    setAnimeSkipButtonSegment,
    showVideoOverlayControls,
  ]);

  useEffect(() => {
    if (showVideoOverlayControls) return;
    clearAniSkipFadeTimer();
    setIsAniSkipOverlayFading(false);
  }, [showVideoOverlayControls]);

  const handleClearRateLimit = (pluginId: string) => {
    clearPluginRateLimit();
    // Trigger a re-resolve so the unblocked plugin can be tried again immediately.
    retrySourceResolve();
  };

  const handleDetailEpisodeToggle = async (_animeId: number, episodeNumber: number) => {
    const next = detailExpandedEpisode === episodeNumber ? null : episodeNumber;
    setDetailExpandedEpisode(next);

    if (!next || !detailAnimeView) return;

    const jikanAnimeId = detailAnimeView.jikanId;
    if (typeof jikanAnimeId !== 'number' || !Number.isFinite(jikanAnimeId) || jikanAnimeId <= 0 || jikanAnimeId > MAX_REASONABLE_MAL_ID) return;

    setDetailLoadingEpisode(episodeNumber);
    const detail = await getAnimeEpisodeById(Math.floor(jikanAnimeId), episodeNumber).catch(() => null);
    if (detail) {
      setDetailEpisodes((current) =>
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
    setDetailLoadingEpisode((current) => (current === episodeNumber ? null : current));
  };

  useEffect(() => {
    setDetailEpisodePage(1);
  }, [detailTargetAnimeId]);

  useEffect(() => {
    const shouldLoadDetailPane = rightPanelView === 'detail';
    if (!shouldLoadDetailPane) {
      setIsDetailLoading(false);
      return;
    }

    if (!detailTargetAnimeId) {
      setDetailAnime(null);
      setDetailEpisodes([]);
      setDetailEpisodePagination({ page: 1, lastVisiblePage: 1, hasNextPage: false, hasPrevPage: false });
      setDetailExpandedEpisode(null);
      setIsDetailLoading(false);
      return;
    }

    let cancelled = false;
    setIsDetailLoading(true);

    const run = async () => {
      const detail = await getAnimeDetails(detailTargetAnimeId).catch(() => null);
      if (cancelled) return;

      if (!detail) {
        setDetailAnime(null);
        setDetailEpisodes([]);
        setDetailEpisodePagination({ page: 1, lastVisiblePage: 1, hasNextPage: false, hasPrevPage: false });
        setDetailExpandedEpisode(null);
        setIsDetailLoading(false);
        return;
      }

      setDetailAnime(detail);

      const jikanId =
        typeof detail.jikanId === 'number' && Number.isFinite(detail.jikanId) && detail.jikanId > 0
          ? Math.floor(detail.jikanId)
          : undefined;

      if (!jikanId || jikanId > MAX_REASONABLE_MAL_ID) {
        setDetailEpisodes([]);
        setDetailEpisodePagination({ page: 1, lastVisiblePage: 1, hasNextPage: false, hasPrevPage: false });
        setDetailExpandedEpisode(null);
        setIsDetailLoading(false);
        return;
      }

      const payload = await getJikanDetailEpisodeBundle(jikanId, detailEpisodePage).catch(() => null);
      if (cancelled) return;

      if (!payload) {
        setDetailEpisodes([]);
        setDetailEpisodePagination({ page: 1, lastVisiblePage: 1, hasNextPage: false, hasPrevPage: false });
        setDetailExpandedEpisode(null);
        setIsDetailLoading(false);
        return;
      }

      setDetailAnime(payload.detail);
      setDetailEpisodes(payload.episodes);
      setDetailEpisodePagination(payload.pagination);
      setDetailExpandedEpisode(null);
      setIsDetailLoading(false);
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [detailEpisodePage, detailTargetAnimeId, rightPanelView]);

  useEffect(() => {
    if (!activeResolvedSource?.selectedOptionId) {
      if (selectedSourceOptionId) {
        setSelectedSourceOptionId(null);
      }
      return;
    }

    if (selectedSourceOptionId !== activeResolvedSource.selectedOptionId) {
      setSelectedSourceOptionId(activeResolvedSource.selectedOptionId);
    }
  }, [activeResolvedSource?.selectedOptionId, selectedSourceOptionId, setSelectedSourceOptionId]);

  useEffect(() => {
    if (!isNonTrailerPlayback) return;
    if (isDirectPluginPlayback || playbackSupportMode === 'fullscreen-only') return;
    setTrailerPlayerReady(false);
  }, [isDirectPluginPlayback, isNonTrailerPlayback, playbackSupportMode, setTrailerPlayerReady]);

  useEffect(() => {
    if (isFullNowPlayingView || showVideoOverlayControls) return;
    setIsFullQueueDrawerOpen(false);
  }, [isFullNowPlayingView, showVideoOverlayControls]);

  const queueContent = (
    <RightNowQueueSection
      queueUpcoming={queueUpcoming}
      titleLanguage={titleLanguage}
      openMenuQueueItemId={openMenuQueueItemId}
      onToggleMenu={(queueItemId) => {
        setOpenMenuQueueItemId((current) => (current === queueItemId ? null : queueItemId));
      }}
      onClearQueue={() => {
        void clearQueue();
        setIsFullQueueDrawerOpen(false);
      }}
      onPlayFromQueue={(queueItemId) => {
        void playFromQueue(queueItemId);
      }}
      onRemoveFromQueue={(queueItemId) => {
        void removeFromQueue(queueItemId);
        setOpenMenuQueueItemId(null);
      }}
    />
  );

  useEffect(() => {
    lastWatchProgressSaveSecondRef.current = -1;
  }, [currentlyPlayingItem?.id]);

  useEffect(() => {
    autoAdvanceHandledItemIdRef.current = null;
  }, [currentlyPlayingItem?.id]);

  const advanceQueueAfterPlaybackComplete = useCallback(() => {
    const currentItemId = currentlyPlayingItem?.id;
    if (!currentItemId) return;
    if (autoAdvanceHandledItemIdRef.current === currentItemId) return;
    if (playbackSupportMode !== 'fully-supported') return;

    autoAdvanceHandledItemIdRef.current = currentItemId;
    void playNextInQueue(true);
  }, [currentlyPlayingItem?.id, playbackSupportMode, playNextInQueue]);

  useEffect(() => {
    if (!currentlyPlayingItem) return;
    if (currentlyPlayingItem.kind === 'trailer') return;
    if (!isPlaying) return;

    const elapsedSeconds = Math.max(0, Math.floor(playbackTime));
    if (elapsedSeconds <= 0) return;

    const previousSaved = lastWatchProgressSaveSecondRef.current;
    if (previousSaved >= 0 && elapsedSeconds - previousSaved < WATCH_PROGRESS_SAVE_INTERVAL_SECONDS) return;

    const fallbackDurationSeconds = Math.max(0, Math.round((currentlyPlayingItem.durationMinutes ?? 0) * 60));
    const durationSeconds =
      playbackDuration > 0
        ? Math.round(playbackDuration)
        : fallbackDurationSeconds > 0
          ? fallbackDurationSeconds
          : undefined;
    const progress = durationSeconds && durationSeconds > 0 ? (elapsedSeconds / durationSeconds) * 100 : undefined;

    lastWatchProgressSaveSecondRef.current = elapsedSeconds;
    void updateWatchProgress(currentlyPlayingItem.anime, progress, currentlyPlayingItem.episodeNumber, {
      elapsedSeconds,
      durationSeconds,
    });
  }, [currentlyPlayingItem, isPlaying, playbackDuration, playbackTime, updateWatchProgress]);

  useEffect(() => {
    if (!currentlyPlayingItem) return;
    if (currentlyPlayingItem.kind === 'trailer') return;
    if (isPlaying) return;

    const elapsedSeconds = Math.max(0, Math.floor(playbackTime));
    if (elapsedSeconds <= 0) return;

    const previousSaved = lastWatchProgressSaveSecondRef.current;
    if (previousSaved >= elapsedSeconds) return;

    const fallbackDurationSeconds = Math.max(0, Math.round((currentlyPlayingItem.durationMinutes ?? 0) * 60));
    const durationSeconds =
      playbackDuration > 0
        ? Math.round(playbackDuration)
        : fallbackDurationSeconds > 0
          ? fallbackDurationSeconds
          : undefined;
    const progress = durationSeconds && durationSeconds > 0 ? (elapsedSeconds / durationSeconds) * 100 : undefined;

    lastWatchProgressSaveSecondRef.current = elapsedSeconds;
    void updateWatchProgress(currentlyPlayingItem.anime, progress, currentlyPlayingItem.episodeNumber, {
      elapsedSeconds,
      durationSeconds,
    });
  }, [currentlyPlayingItem, isPlaying, playbackDuration, playbackTime, updateWatchProgress]);

  useEffect(() => {
    if (hasTrailerPlayback) {
      syncTrailerPlaybackState(isPlaying);
      return;
    }

    if (!isDirectPluginPlayback) return;
    const video = sourceVideoRef.current;
    if (!video) return;

    const shouldAttemptAutoplay = isPlaying || pendingAutoPlayAfterResolveRef.current;
    if (shouldAttemptAutoplay) {
      void video.play().catch(() => {
        setPlaying(false);
      }).then(() => {
        pendingAutoPlayAfterResolveRef.current = false;
      });
      return;
    }

    video.pause();
  }, [hasTrailerPlayback, isDirectPluginPlayback, isPlaying, setPlaying, syncTrailerPlaybackState]);

  useEffect(() => {
    if (hasTrailerPlayback) {
      syncTrailerVolume(trailerVolume);
      return;
    }

    if (!isDirectPluginPlayback) return;
    const video = sourceVideoRef.current;
    if (!video) return;
    video.volume = Math.max(0, Math.min(1, trailerVolume / 100));
  }, [hasTrailerPlayback, isDirectPluginPlayback, trailerVolume, syncTrailerVolume]);

  useEffect(() => {
    if (pendingSeekTo === null) return;

    if (playbackSupportMode === 'fullscreen-only') {
      setPlaybackTime(Math.max(0, pendingSeekTo));
      clearPendingSeekTo();
      return;
    }

    if (hasTrailerPlayback) {
      if (seekTrailer(pendingSeekTo)) {
        clearPendingSeekTo();
      }
      return;
    }

    if (!isDirectPluginPlayback) return;
    const video = sourceVideoRef.current;
    if (!video) return;

    const targetTime = Math.max(0, pendingSeekTo);

    const applySeek = () => {
      video.currentTime = targetTime;
      setPlaybackTime(targetTime);
      clearPendingSeekTo();
    };

    if (video.readyState >= 1) {
      applySeek();
      return;
    }

    const onLoadedMetadata = () => {
      applySeek();
    };

    video.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
    return () => {
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
    };
  }, [clearPendingSeekTo, hasTrailerPlayback, isDirectPluginPlayback, pendingSeekTo, playbackSupportMode, seekTrailer, setPlaybackTime]);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const syncFullscreenState = () => {
      setIsDocumentFullscreen(Boolean(document.fullscreenElement));
    };

    syncFullscreenState();
    document.addEventListener('fullscreenchange', syncFullscreenState);
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreenState);
    };
  }, []);

  useEffect(() => {
    if (!showVideoOverlayControls) {
      if (fullscreenOverlayHideTimerRef.current) {
        clearTimeout(fullscreenOverlayHideTimerRef.current);
        fullscreenOverlayHideTimerRef.current = null;
      }
      setIsFullscreenOverlayVisible(true);
      return;
    }

    setIsFullscreenOverlayVisible(false);

    const revealOverlayControls = () => {
      setIsFullscreenOverlayVisible(true);

      if (activeAniSkipType && aniSkipSegments[activeAniSkipType]) {
        setIsAniSkipOverlayFading(false);
        restartAniSkipFadeTimer();
      }

      if (fullscreenOverlayHideTimerRef.current) {
        clearTimeout(fullscreenOverlayHideTimerRef.current);
      }
      fullscreenOverlayHideTimerRef.current = setTimeout(() => {
        setIsFullscreenOverlayVisible(false);
      }, FULLSCREEN_OVERLAY_HIDE_MS);
    };
    document.addEventListener('mousemove', revealOverlayControls);
    document.addEventListener('mousedown', revealOverlayControls);
    document.addEventListener('touchstart', revealOverlayControls);
    document.addEventListener('keydown', revealOverlayControls);

    return () => {
      document.removeEventListener('mousemove', revealOverlayControls);
      document.removeEventListener('mousedown', revealOverlayControls);
      document.removeEventListener('touchstart', revealOverlayControls);
      document.removeEventListener('keydown', revealOverlayControls);
      if (fullscreenOverlayHideTimerRef.current) {
        clearTimeout(fullscreenOverlayHideTimerRef.current);
        fullscreenOverlayHideTimerRef.current = null;
      }
    };
  }, [activeAniSkipType, aniSkipSegments, showVideoOverlayControls]);

  useEffect(() => {
    if (!showVideoOverlayControls) return;
    if (!isFullQueueDrawerOpen && !isSourceLogOpen) return;
    setIsFullscreenOverlayVisible(true);
  }, [isFullQueueDrawerOpen, isSourceLogOpen, showVideoOverlayControls]);

  useEffect(() => {
    if (!showVideoOverlayControls) {
      clearAniSkipFadeTimer();
      setIsAniSkipOverlayFading(false);
      return;
    }
    if (!activeAniSkipType) return;
    if (!aniSkipSegments[activeAniSkipType]) return;
    restartAniSkipFadeTimer();
  }, [activeAniSkipType, aniSkipSegments, showVideoOverlayControls]);

  useEffect(() => {
    if (trailerVolume > 0) {
      lastNonZeroVolumeRef.current = trailerVolume;
    }
  }, [trailerVolume]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsPaneLayoutMenuOpen(false);
        return;
      }

      if (isEditableKeyboardTarget(event.target)) {
        return;
      }

      const isShortcutScopeActive = isNowPlayingView && (isFullNowPlayingView || isDocumentFullscreen);
      if (!isShortcutScopeActive || !currentlyPlayingItem) {
        return;
      }

      const seekBySeconds = (deltaSeconds: number) => {
        if (playbackSupportMode !== 'fully-supported') return;
        const unclamped = playbackTime + deltaSeconds;
        const nextTime = playbackDuration > 0
          ? Math.min(Math.max(0, unclamped), playbackDuration)
          : Math.max(0, unclamped);
        requestSeekTo(nextTime);
      };

      switch (event.key) {
        case ' ':
        case 'Spacebar':
          event.preventDefault();
          setPlaying(!isPlaying);
          return;
        case 'ArrowLeft':
          event.preventDefault();
          seekBySeconds(-10);
          return;
        case 'ArrowRight':
          event.preventDefault();
          seekBySeconds(10);
          return;
        case 'm':
        case 'M':
          event.preventDefault();
          if (trailerVolume <= 0) {
            setTrailerVolume(lastNonZeroVolumeRef.current > 0 ? lastNonZeroVolumeRef.current : 72);
          } else {
            setTrailerVolume(0);
          }
          return;
        case 'ArrowUp':
          event.preventDefault();
          setTrailerVolume(Math.min(100, trailerVolume + VOLUME_STEP));
          return;
        case 'ArrowDown':
          event.preventDefault();
          setTrailerVolume(Math.max(0, trailerVolume - VOLUME_STEP));
          return;
        default:
          return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    currentlyPlayingItem,
    isDocumentFullscreen,
    isFullNowPlayingView,
    isNowPlayingView,
    isPlaying,
    playbackDuration,
    playbackSupportMode,
    playbackTime,
    requestSeekTo,
    setPlaying,
    setTrailerVolume,
    trailerVolume,
  ]);

  useEffect(() => {
    const onDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      if (isFullQueueDrawerOpen) {
        const clickedDrawer = queueDrawerRef.current?.contains(target) ?? false;
        const clickedToggle = queueToggleRef.current?.contains(target) ?? false;
        if (!clickedDrawer && !clickedToggle) {
          setIsFullQueueDrawerOpen(false);
        }
      }

      if (showVideoOverlayControls && isSourceLogOpen) {
        const clickedLogDrawer = logDrawerRef.current?.contains(target) ?? false;
        const clickedLogToggle = logToggleRef.current?.contains(target) ?? false;
        if (!clickedLogDrawer && !clickedLogToggle) {
          setIsSourceLogOpen(false);
        }
      }

      if (target.closest('.right-queue-item-menu') || target.closest('.right-queue-item-menu-trigger')) return;
      setOpenMenuQueueItemId(null);

      if (!paneLayoutMenuRef.current?.contains(target)) {
        setIsPaneLayoutMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', onDocumentMouseDown);
    return () => {
      document.removeEventListener('mousedown', onDocumentMouseDown);
    };
  }, [isFullQueueDrawerOpen, isSourceLogOpen, showVideoOverlayControls]);

  const sourceResolveControls = (
    <RightNowSourceResolveControls
      isNonTrailerPlayback={isNonTrailerPlayback}
      showVideoOverlayControls={showVideoOverlayControls}
      preferredSourcePluginId={preferredSourcePluginId}
      onPreferredSourcePluginChange={(pluginId) => {
        void setPreferredSourcePluginId(pluginId);
      }}
      sourceSelectorItems={sourceSelectorItems}
      sourcePluginsCount={sourcePlugins.length}
      preferredAudioLanguage={preferredAudioLanguage}
      onPreferredAudioLanguageChange={(language) => {
        void setPreferredAudioLanguage(language);
      }}
      audioSelectorItems={audioSelectorItems}
      sourceOptionsCount={sourceOptions.length}
      activeResolvedSourceOptionId={activeResolvedSource?.selectedOptionId ?? null}
      onSelectedSourceOptionChange={setSelectedSourceOptionId}
      optionSelectorItems={optionSelectorItems}
      onRetrySourceResolve={retrySourceResolve}
      isResolvingSource={isResolvingSource}
    />
  );

  const activeAniSkipSegment = activeAniSkipType ? aniSkipSegments[activeAniSkipType] ?? null : null;

  return (
    <aside className={`right-now-panel vhs-panel relative flex h-full min-h-0 flex-col gap-3 bg-carbon/45 p-4 ${isFullNowPlayingView ? 'right-now-panel-full' : ''}`}>
      <RightNowHeaderSection
        isRightPanelFullpage={isRightPanelFullpage}
        isPluginsView={isPluginsView}
        showNowPlayingPane={showNowPlayingPane}
        isPlaying={isPlaying}
        isFullNowPlayingView={isFullNowPlayingView}
        showVideoOverlayControls={showVideoOverlayControls}
        isFullQueueDrawerOpen={isFullQueueDrawerOpen}
        onToggleQueueDrawer={() => setIsFullQueueDrawerOpen((open) => !open)}
        queueToggleRef={queueToggleRef}
        onToggleRightPanelFullpage={() => {
          void toggleRightPanelFullpage();
        }}
        isNonTrailerPlayback={isNonTrailerPlayback}
        isSourceLogOpen={isSourceLogOpen}
        onToggleSourceLog={() => setIsSourceLogOpen((open) => !open)}
        logToggleRef={logToggleRef}
        isPaneLayoutMenuOpen={isPaneLayoutMenuOpen}
        onTogglePaneLayoutMenu={() => setIsPaneLayoutMenuOpen((open) => !open)}
        onClosePaneLayoutMenu={() => setIsPaneLayoutMenuOpen(false)}
        paneLayoutMenuRef={paneLayoutMenuRef}
        fallbackDisplayTitle={fallbackDisplayTitle}
        fallbackDisplayJapanese={fallbackDisplayJapanese}
        currentlyPlayingKind={currentlyPlayingItem?.kind}
        fallbackTypeLabel={fallbackTypeLabel}
        episodeDisplayJapanese={episodeDisplayJapanese}
        sourceResolveControls={sourceResolveControls}
        sourceResolveTrace={sourceResolveTrace}
        isResolvingSource={isResolvingSource}
        onClearRateLimit={handleClearRateLimit}
        detailAnimeView={detailAnimeView}
        detailDisplayTitle={detailDisplayTitle}
      />

      <div className={`right-now-video-section ${isDocumentFullscreen || isNowPlayingView ? '' : 'is-collapsed'}`} aria-hidden={!showNowPlayingPane}>
        <div className="right-now-video-wrap relative -mx-4 w-[calc(100%+2rem)] overflow-hidden bg-black/45">
          <RightNowFullscreenOverlays
            showVideoOverlayControls={showVideoOverlayControls}
            isFullscreenOverlayVisible={isFullscreenOverlayVisible}
            sourceResolveControls={sourceResolveControls}
            isFullQueueDrawerOpen={isFullQueueDrawerOpen}
            isSourceLogOpen={isSourceLogOpen}
            isNonTrailerPlayback={isNonTrailerPlayback}
            queueToggleRef={queueToggleRef}
            logToggleRef={logToggleRef}
            onToggleQueueDrawer={() => {
              setIsSourceLogOpen(false);
              setIsFullQueueDrawerOpen((open) => !open);
            }}
            onToggleSourceLog={() => {
              setIsFullQueueDrawerOpen(false);
              setIsSourceLogOpen((open) => !open);
            }}
            activeAniSkipType={activeAniSkipType}
            activeAniSkipSegment={activeAniSkipSegment}
            playbackSupportMode={playbackSupportMode}
            isAniSkipOverlayFading={isAniSkipOverlayFading}
            onAniSkipOverlayPointerEnter={() => {
              setIsAniSkipOverlayFading(false);
              restartAniSkipFadeTimer();
            }}
            onAniSkipOverlayFocus={() => {
              setIsAniSkipOverlayFading(false);
              restartAniSkipFadeTimer();
            }}
            onAniSkipOverlayClick={() => {
              if (!activeAniSkipType || !activeAniSkipSegment) return;
              performAniSkip(activeAniSkipType, activeAniSkipSegment, true);
            }}
          />
          {autoSkipToastLabel ? <div className="skip-toast">{`Skipped ${autoSkipToastLabel}`}</div> : null}
          <div className={`right-now-video-frame w-full ${isRightPanelFullpage ? 'right-now-video-frame-full' : 'aspect-video'}`}>
            <div ref={trailerPlayerMountRef} className={`right-now-video-player ${hasTrailerPlayback ? '' : 'hidden'}`} />
            {hasTrailerPlayback ? null : isResolvingSource ? (
              <div className="right-now-no-signal">
                <div className="right-now-no-signal-crt right-now-finding-signal-crt" aria-hidden="true" />
                <div className="right-now-no-signal-badge">
                  <p className="right-now-no-signal-title">Finding Signal</p>
                  <p className="right-now-no-signal-subtitle">Scanning plugins by priority for a playable source.</p>
                  <p className="right-now-no-signal-meta">{fallbackTypeLabel}</p>
                </div>
              </div>
            ) : activeResolvedSource ? (
              playbackSupportMode === 'fullscreen-only' ? (
                <div className="right-now-no-signal">
                  <div className="right-now-no-signal-crt" aria-hidden="true" />
                  <div className="right-now-no-signal-badge">
                    <p className="right-now-no-signal-title">Not Supported</p>
                    <p className="right-now-no-signal-subtitle">This source supports external player window playback only.</p>
                    <p className="right-now-no-signal-meta">Use Open Window in player controls.</p>
                  </div>
                </div>
              ) : activeResolvedSource.type === 'direct' ? (
                <video
                  ref={sourceVideoRef}
                  className="right-now-video-native"
                  playsInline
                  disablePictureInPicture
                  controlsList="nodownload noplaybackrate noremoteplayback"
                  onLoadedMetadata={(event) => {
                    const video = event.currentTarget;
                    setPlaybackDuration(Number.isFinite(video.duration) ? video.duration : 0);
                    const nextCurrentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
                    if (nextCurrentTime > 0 || playbackTime <= 0) {
                      setPlaybackTime(nextCurrentTime);
                    }
                    setTrailerPlayerReady(true);
                    video.volume = Math.max(0, Math.min(1, trailerVolume / 100));
                    if (isPlaying || pendingAutoPlayAfterResolveRef.current) {
                      void video.play().then(() => {
                        pendingAutoPlayAfterResolveRef.current = false;
                      }).catch(() => {
                        setPlaying(false);
                      });
                    }
                  }}
                  onCanPlay={(event) => {
                    const video = event.currentTarget;
                    if (!(isPlaying || pendingAutoPlayAfterResolveRef.current)) return;
                    void video.play().then(() => {
                      pendingAutoPlayAfterResolveRef.current = false;
                    }).catch(() => {
                      setPlaying(false);
                    });
                  }}
                  onTimeUpdate={(event) => {
                    const video = event.currentTarget;
                    const nextTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
                    const nextDuration = Number.isFinite(video.duration) ? video.duration : 0;
                    setPlaybackTime(nextTime);

                    if (nextDuration > 0) {
                      const remaining = nextDuration - nextTime;
                      if (remaining <= 0.35 || nextTime / nextDuration >= 0.998) {
                        advanceQueueAfterPlaybackComplete();
                      }
                    }
                  }}
                  onDurationChange={(event) => {
                    const video = event.currentTarget;
                    setPlaybackDuration(Number.isFinite(video.duration) ? video.duration : 0);
                  }}
                  onPlay={() => setPlaying(true)}
                  onPause={(event) => {
                    if (event.currentTarget.ended) return;
                    setPlaying(false);
                  }}
                  onEnded={() => {
                    advanceQueueAfterPlaybackComplete();
                  }}
                />
              ) : (
                <iframe
                  className="right-now-video-embed"
                  src={activeResolvedSource.url}
                  title={activeResolvedSource.label ?? 'Plugin Source'}
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                />
              )
            ) : (
              <div className="right-now-no-signal">
                <div className="right-now-no-signal-crt" aria-hidden="true" />
                <div className="right-now-no-signal-badge">
                  <p className="right-now-no-signal-title">{sourcePlugins.length === 0 ? 'No Plugin Installed' : 'No Signal'}</p>
                  <p className="right-now-no-signal-subtitle">
                    {sourcePlugins.length === 0
                      ? 'Open Plugins tab and import a plugin artifact from the plugin repository output.'
                      : 'No plugin could resolve a playable video source.'}
                  </p>
                  <p className="right-now-no-signal-meta">{fallbackTypeLabel}</p>
                </div>
              </div>
            )}
            {shouldBlockPlaybackSurface ? <div className="right-now-video-blocker" aria-hidden="true" /> : null}
          </div>
        </div>
      </div>

      <div className="right-now-pane-bottom min-h-0 flex-1">
      <div ref={menuRootRef} data-right-now-scroll="true" className="min-h-0 flex-1 overflow-y-auto px-0 py-2 text-sm leading-5 text-cream/62">
        {rightPanelView === 'detail' ? (
          <RightNowDetailPane
            detailAnimeView={detailAnimeView}
            detailYearLabel={detailYearLabel}
            detailEpisodeSearchQuery={detailEpisodeSearchQuery}
            onDetailEpisodeSearchQueryChange={setDetailEpisodeSearchQuery}
            detailEpisodePagination={detailEpisodePagination}
            isDetailLoading={isDetailLoading}
            onDetailEpisodePageChange={setDetailEpisodePage}
            filteredDetailEpisodes={filteredDetailEpisodes}
            detailExpandedEpisode={detailExpandedEpisode}
            detailLoadingEpisode={detailLoadingEpisode}
            titleLanguage={titleLanguage}
            detailEpisodeResolvedIconByEpisode={detailEpisodeResolvedIconByEpisode}
            onPlayEpisode={(episodeNumber) => {
              if (!detailAnimeView) return;
              void playEpisode(detailAnimeView, episodeNumber);
            }}
            onToggleEpisodeExpand={(episodeNumber) => {
              if (!detailAnimeView) return;
              void handleDetailEpisodeToggle(detailAnimeView.id, episodeNumber);
            }}
          />
        ) : isPluginsView ? (
          <PluginsPanel />
        ) : (
          isFullNowPlayingView || showVideoOverlayControls ? null : queueContent
        )}
      </div>
      </div>

      {isFullNowPlayingView || showVideoOverlayControls ? (
        <div
          ref={queueDrawerRef}
          className={`right-now-queue-drawer ${isFullQueueDrawerOpen ? 'is-open' : ''} ${showVideoOverlayControls ? 'is-with-top-overlay' : ''}`}
          aria-hidden={!isFullQueueDrawerOpen}
        >
          <div className="right-now-queue-drawer-body">{queueContent}</div>
        </div>
      ) : null}

      {showVideoOverlayControls && isNonTrailerPlayback ? (
        <div
          ref={logDrawerRef}
          className={`right-now-log-drawer ${isSourceLogOpen ? 'is-open' : ''}`}
          aria-hidden={!isSourceLogOpen}
        >
          <div className="right-now-log-drawer-body">
            <SourceResolveLogPanel
              sourceResolveTrace={sourceResolveTrace}
              isResolvingSource={isResolvingSource}
              onClearRateLimit={handleClearRateLimit}
              className="mt-0"
            />
          </div>
        </div>
      ) : null}
    </aside>
  );
}
