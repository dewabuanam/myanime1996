import { CalendarDays, Check, ChevronDown, Clock3, EllipsisVertical, List, ListX, Play, RotateCcw, ScrollText, Trash2, Unlock } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import { ANISKIP_LABELS, fetchAniSkipSegments, voteOnAniSkip } from '../services/aniSkip';
import { getAnimeDetails, getLatestUpdatedAnime, refreshHomeShelvesIfNeeded } from '../services/catalogSource';
import { getAnimeDetailEpisodeBundle } from '../services/animeDetailEpisodes';
import { getAnimeEpisodeById } from '../services/jikan';
import { clearPluginRateLimit } from '../services/pluginExecutor';
import { getAvailableSourcePlugins, resolveSourceForPlayable, resolveSourceForPlayableWithTrace } from '../services/sourceResolver';
import { useAppStore } from '../state/appStore';
import type { AniSkipSegmentMap, AniSkipType } from '../services/aniSkip';
import type { AnimeDetail as AnimeDetailType, AnimeEpisode, AnimeEpisodePagination, PlayableItem } from '../types/anime';
import type { ResolvedSource, ResolvedSourceOption, SourceResolveAttemptStatus, SourceResolveTrace } from '../types/plugin';
import { getEpisodeDisplayTitles } from '../utils/episodeTitle';
import { buildActiveOrderedPluginIds, collectResolvedPluginsForAnime, pickPriorityPluginId, readResolvedSourceCache } from '../utils/resolvedSourceBadge';
import { getDisplayTitle } from '../utils/title';
import { extractYouTubeVideoId } from '../utils/youtubeUrl';
import PluginsPanel from './PluginsPanel';
import WindowControls from './WindowControls';

const YOUTUBE_EMBED_HOST = 'www.youtube-nocookie.com';
const MIN_SOURCE_RESOLVE_VISIBLE_MS = 700;
const WATCH_PROGRESS_SAVE_INTERVAL_SECONDS = 5;
const FULLSCREEN_OVERLAY_HIDE_MS = 2000;
const ANISKIP_OVERLAY_FADE_MS = 10000;
const BACKGROUND_LATEST_RESOLVE_LIMIT = 5;
const HOME_REFRESH_LIMIT = 20;

function formatEpisodeDuration(durationMinutes?: number) {
  if (durationMinutes && durationMinutes > 0) return `${durationMinutes}m`;
  return 'Unknown';
}

function formatEpisodeScoreOutOfTen(score?: number | null) {
  if (score === null || score === undefined || !Number.isFinite(score)) return null;
  const scaled = Math.max(0, Math.min(10, score * 2));
  return scaled.toFixed(2);
}

function formatAnimeYear(year?: number, aired?: string) {
  if (year && Number.isFinite(year) && year > 0) return String(Math.floor(year));
  if (!aired) return 'TBA';
  const match = aired.match(/(19|20)\d{2}/);
  return match ? match[0] : 'TBA';
}

type LogoSelectItem = {
  value: string;
  label: string;
  iconDataUri?: string;
  meta?: string;
};

type LogoSelectProps = {
  value: string;
  items: LogoSelectItem[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel: string;
};

type SourceSelectorFieldProps = {
  label: string;
  ariaLabel: string;
  value: string;
  items: LogoSelectItem[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
};

function LogoSelect({ value, items, onChange, disabled = false, placeholder = 'Select', ariaLabel }: LogoSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedItem = items.find((item) => item.value === value) ?? null;

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (rootRef.current?.contains(target)) return;
      setOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
    };

    document.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className={`logo-select ${disabled ? 'is-disabled' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="logo-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="logo-select-trigger-inner">
          <span className="logo-select-icon" aria-hidden="true">
            {selectedItem?.iconDataUri ? (
              <img src={selectedItem.iconDataUri} alt="" className="logo-select-icon-image" />
            ) : (
              <span className="logo-select-icon-fallback" />
            )}
          </span>
          <span className="logo-select-copy">
            <span className="logo-select-label">{selectedItem?.label ?? placeholder}</span>
            {selectedItem?.meta ? <span className="logo-select-meta">{selectedItem.meta}</span> : null}
          </span>
        </span>
        <ChevronDown size={12} className={`logo-select-chevron ${open ? 'is-open' : ''}`} />
      </button>

      {open ? (
        <div className="logo-select-menu" role="listbox" aria-label={ariaLabel}>
          {items.map((item) => (
            <button
              key={item.value}
              type="button"
              role="option"
              aria-selected={item.value === value}
              className={`logo-select-option retro-tooltip tooltip-right ${item.value === value ? 'is-active' : ''}`}
              data-tooltip={`${item.label}${item.meta ? ` • ${item.meta}` : ''}`}
              onClick={() => {
                onChange(item.value);
                setOpen(false);
              }}
            >
              <span className="logo-select-icon" aria-hidden="true">
                {item.iconDataUri ? (
                  <img src={item.iconDataUri} alt="" className="logo-select-icon-image" />
                ) : (
                  <span className="logo-select-icon-fallback" />
                )}
              </span>
              <span className="logo-select-copy">
                <span className="logo-select-label">{item.label}</span>
                {item.meta ? <span className="logo-select-meta">{item.meta}</span> : null}
              </span>
              {item.value === value ? <Check size={12} className="logo-select-check" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SourceSelectorField({
  label,
  ariaLabel,
  value,
  items,
  onChange,
  disabled = false,
  placeholder,
}: SourceSelectorFieldProps) {
  return (
    <label className="source-select-wrap" aria-label={ariaLabel}>
      <span className="source-select-label">{label}</span>
      <LogoSelect
        value={value}
        onChange={onChange}
        items={items}
        disabled={disabled}
        placeholder={placeholder}
        ariaLabel={ariaLabel}
      />
    </label>
  );
}

function pickSourceOption(
  options: ResolvedSourceOption[],
  selectedOptionId: string | null,
  preferredLanguage: 'sub' | 'dub',
) {
  if (!options.length) return null;

  if (selectedOptionId) {
    const explicit = options.find((option) => option.id === selectedOptionId);
    if (explicit) return explicit;
  }

  if (preferredLanguage) {
    const byLanguage = options.find((option) => option.language === preferredLanguage);
    if (byLanguage) return byLanguage;
  }

  return options[0] ?? null;
}

type YouTubePlayerLike = {
  destroy: () => void;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  setVolume: (volume: number) => void;
};

type YouTubePlayerCtor = new (
  element: HTMLElement,
  options: {
    videoId: string;
    playerVars?: Record<string, number | string>;
    events?: {
      onReady?: (event: { target: YouTubePlayerLike }) => void;
      onStateChange?: (event: { data: number; target: YouTubePlayerLike }) => void;
    };
  },
) => YouTubePlayerLike;

declare global {
  interface Window {
    YT?: {
      Player?: YouTubePlayerCtor;
      PlayerState?: {
        ENDED?: number;
        PLAYING?: number;
        PAUSED?: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeApiReadyPromise: Promise<void> | null = null;

function ensureYouTubeApiReady() {
  if (window.YT?.Player) return Promise.resolve();
  if (youtubeApiReadyPromise) return youtubeApiReadyPromise;

  youtubeApiReadyPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>('script[data-youtube-api="true"]');
    if (existingScript) {
      const waitUntilReady = () => {
        if (window.YT?.Player) {
          resolve();
          return;
        }
        window.setTimeout(waitUntilReady, 50);
      };
      waitUntilReady();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.dataset.youtubeApi = 'true';
    script.onerror = () => reject(new Error('Failed to load YouTube iframe API.'));

    const previousReadyHandler = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReadyHandler?.();
      resolve();
    };

    document.head.appendChild(script);
  });

  return youtubeApiReadyPromise;
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
  const setCurrentlyPlayingTypeLabel = useAppStore((state) => state.setCurrentlyPlayingTypeLabel);

  const menuRootRef = useRef<HTMLDivElement | null>(null);
  const queueDrawerRef = useRef<HTMLDivElement | null>(null);
  const queueToggleRef = useRef<HTMLButtonElement | null>(null);
  const logDrawerRef = useRef<HTMLDivElement | null>(null);
  const logToggleRef = useRef<HTMLButtonElement | null>(null);
  const paneLayoutMenuRef = useRef<HTMLDivElement | null>(null);
  const trailerPlayerMountRef = useRef<HTMLDivElement | null>(null);
  const sourceVideoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const pendingAutoPlayAfterResolveRef = useRef(false);
  const trailerPlayerRef = useRef<YouTubePlayerLike | null>(null);
  const trailerPlayerDestroyedRef = useRef(false);
  const trailerPlayerSessionRef = useRef(0);
  const trailerSyncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fullscreenOverlayHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aniSkipFadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aniSkipToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAutoSkippedSegmentRef = useRef<string | null>(null);
  const latestAniSkipFetchKeyRef = useRef<string | null>(null);
  const aniSkipMalIdCacheRef = useRef<Map<number, number | null>>(new Map());
  const lastWatchProgressSaveSecondRef = useRef(-1);
  const lastBackgroundResolveKeyRef = useRef<string | null>(null);
  const [openMenuQueueItemId, setOpenMenuQueueItemId] = useState<string | null>(null);
  const [isFullQueueDrawerOpen, setIsFullQueueDrawerOpen] = useState(false);
  const [resolvedSource, setResolvedSource] = useState<ResolvedSource | null>(null);
  const [isResolvingSource, setIsResolvingSource] = useState(false);
  const [sourceResolveTrace, setSourceResolveTrace] = useState<SourceResolveTrace | null>(null);
  const [isSourceLogOpen, setIsSourceLogOpen] = useState(false);
  const [sourceResolveRetryToken, setSourceResolveRetryToken] = useState(0);
  const [isFullscreenOverlayVisible, setIsFullscreenOverlayVisible] = useState(true);
  const [aniSkipSegments, setAniSkipSegments] = useState<AniSkipSegmentMap>({});
  const [activeAniSkipType, setActiveAniSkipType] = useState<AniSkipType | null>(null);
  const [isAniSkipOverlayFading, setIsAniSkipOverlayFading] = useState(false);
  const [autoSkipToastLabel, setAutoSkipToastLabel] = useState<string | null>(null);
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
  const fallbackDisplayTitle = currentlyPlayingItem?.title ?? (selectedAnime ? getDisplayTitle(selectedAnime, titleLanguage) : 'Nothing Playing');
  const fallbackDisplayJapanese = currentlyPlayingItem?.titleJapanese ?? selectedAnime?.titleJapanese ?? 'No Japanese title available';
  const fallbackTypeLabel = currentlyPlayingItem?.typeLabel ?? (selectedAnime?.mediaType?.toUpperCase() ?? 'No Media');
  const detailAnimeView = detailAnime ?? selectedAnime;
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

    const animeId = currentlyPlayingItem?.anime.id;
    if (!Number.isFinite(animeId) || !animeId || animeId <= 0) {
      return null;
    }

    const normalizedAnimeId = Math.floor(animeId);
    if (aniSkipMalIdCacheRef.current.has(normalizedAnimeId)) {
      return aniSkipMalIdCacheRef.current.get(normalizedAnimeId) ?? null;
    }

    try {
      const detail = await getAnimeDetails(normalizedAnimeId);
      const fromDetail = detail?.jikanId;
      const resolved = Number.isFinite(fromDetail) && fromDetail && fromDetail > 0 ? Math.floor(fromDetail) : null;
      aniSkipMalIdCacheRef.current.set(normalizedAnimeId, resolved);
      return resolved;
    } catch {
      aniSkipMalIdCacheRef.current.set(normalizedAnimeId, null);
      return null;
    }
  };

  const getAniSkipEpisodeNumber = () => {
    const raw = currentlyPlayingItem?.episodeNumber ?? 1;
    const safe = Math.max(1, Math.round(raw));
    return Number.isFinite(safe) ? safe : 1;
  };

  const getAniSkipEpisodeLength = () => 0;

  const clearAniSkipFadeTimer = () => {
    if (!aniSkipFadeTimerRef.current) return;
    clearTimeout(aniSkipFadeTimerRef.current);
    aniSkipFadeTimerRef.current = null;
  };

  const restartAniSkipFadeTimer = () => {
    clearAniSkipFadeTimer();
    setIsAniSkipOverlayFading(false);
    aniSkipFadeTimerRef.current = setTimeout(() => {
      setIsAniSkipOverlayFading(true);
      aniSkipFadeTimerRef.current = null;
    }, ANISKIP_OVERLAY_FADE_MS);
  };

  const showAniSkipToast = (type: AniSkipType) => {
    if (aniSkipToastTimerRef.current) {
      clearTimeout(aniSkipToastTimerRef.current);
      aniSkipToastTimerRef.current = null;
    }
    setAutoSkipToastLabel(ANISKIP_LABELS[type]);
    aniSkipToastTimerRef.current = setTimeout(() => {
      setAutoSkipToastLabel(null);
      aniSkipToastTimerRef.current = null;
    }, 2500);
  };

  const performAniSkip = (type: AniSkipType, segment: { endTime: number; skipId: string }, shouldVote: boolean) => {
    requestSeekTo(segment.endTime);
    setAnimeSkipButtonSegment(null);
    setActiveAniSkipType(null);
    setIsAniSkipOverlayFading(false);
    clearAniSkipFadeTimer();
    if (shouldVote) {
      void voteOnAniSkip('upvote', segment.skipId);
    }
    if (!shouldVote) {
      showAniSkipToast(type);
    }
  };

  // HLS lifecycle — attach/detach hls.js instance when direct source URL changes
  useEffect(() => {
    const video = sourceVideoRef.current;
    if (!video) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const url = activeResolvedSource?.type === 'direct'
      ? (activeResolvedSource.url || '').trim()
      : '';

    // Guard against empty/blanks URLs and non-http schemes
    if (!url || !/^https?:\/\//.test(url)) return;

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: false,
        lowLatencyMode: false,
        debug: false,
        xhrSetup: (xhr) => {
          xhr.withCredentials = false;
        },
      });
      hlsRef.current = hls;

      // attachMedia must happen before loadSource (hls.js API contract)
      hls.attachMedia(video);
      hls.loadSource(url);

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.warn('HLS network error, retrying...', data.details);
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.warn('HLS media error, recovering...', data.details);
              hls.recoverMediaError();
              break;
            default:
              console.error('HLS fatal error, destroying instance.', data.details);
              hls.destroy();
              hlsRef.current = null;
              break;
          }
        } else {
          console.warn('HLS non-fatal error:', data.type, data.details);
        }
      });

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        // Manifest loaded — attempt autoplay if player is in playing state
        if (isPlaying || pendingAutoPlayAfterResolveRef.current) {
          void video.play().then(() => {
            pendingAutoPlayAfterResolveRef.current = false;
          }).catch((err) => {
            console.warn('HLS autoplay rejected:', err);
            setPlaying(false);
          });
        }
      });

      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    }

    // HLS unsupported — fall back to native <video src>
    if (!video.src || video.src !== url) {
      video.src = url;
    }
  }, [activeResolvedSource?.type, activeResolvedSource?.url]);

  useEffect(() => {
    pendingAutoPlayAfterResolveRef.current = Boolean(currentlyPlayingItem && currentlyPlayingItem.kind !== 'trailer');
  }, [currentlyPlayingItem?.id, currentlyPlayingItem?.kind]);

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

    if (showVideoOverlayControls && !aniSkipFadeTimerRef.current && !isAniSkipOverlayFading) {
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

  useEffect(() => {
    return () => {
      clearAniSkipFadeTimer();
      if (aniSkipToastTimerRef.current) {
        clearTimeout(aniSkipToastTimerRef.current);
        aniSkipToastTimerRef.current = null;
      }
      setAnimeSkipButtonSegment(null);
    };
  }, [setAnimeSkipButtonSegment]);

  const sourceAttemptStatusLabel = (status: SourceResolveAttemptStatus) => {
    if (status === 'cache-hit') return 'Cache Hit';
    if (status === 'resolved') return 'Resolved';
    if (status === 'no-match') return 'No Match';
    if (status === 'error') return 'Error';
    return 'Skipped';
  };

  const isRateLimitError = (message: string) => {
    const lower = message.toLowerCase();
    return lower.includes('429') || lower.includes('rate limit') || lower.includes('cooldown');
  };

  const handleClearRateLimit = (pluginId: string) => {
    clearPluginRateLimit();
    // Trigger a re-resolve so the unblocked plugin can be tried again immediately.
    setSourceResolveRetryToken((value) => value + 1);
  };

  const handleDetailEpisodeToggle = async (_animeId: number, episodeNumber: number) => {
    const next = detailExpandedEpisode === episodeNumber ? null : episodeNumber;
    setDetailExpandedEpisode(next);

    if (!next || !detailAnimeView) return;

    const jikanAnimeId = detailAnimeView.jikanId ?? detailAnimeView.id;
    if (!Number.isFinite(jikanAnimeId) || jikanAnimeId <= 0) return;

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
  }, [selectedAnime?.id]);

  useEffect(() => {
    if (!selectedAnime) return;
    setDetailAnime(selectedAnime);
  }, [selectedAnime?.id]);

  useEffect(() => {
    const shouldLoadDetailPane = rightPanelView === 'detail';
    if (!shouldLoadDetailPane) {
      setIsDetailLoading(false);
      return;
    }

    const targetAnime = selectedAnime ?? detailAnime;
    if (!targetAnime) {
      setDetailEpisodes([]);
      setDetailEpisodePagination({ page: 1, lastVisiblePage: 1, hasNextPage: false, hasPrevPage: false });
      setDetailExpandedEpisode(null);
      setIsDetailLoading(false);
      return;
    }

    let cancelled = false;
    setIsDetailLoading(true);

    const run = async () => {
      const payload = await getAnimeDetailEpisodeBundle(targetAnime.id, detailEpisodePage).catch(() => null);
      if (cancelled) return;

      if (!payload) {
        setDetailAnime(targetAnime);
        setDetailEpisodes([]);
        setDetailEpisodePagination({ page: 1, lastVisiblePage: 1, hasNextPage: false, hasPrevPage: false });
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
  }, [detailAnime?.id, detailEpisodePage, rightPanelView, selectedAnime?.id]);

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

  const destroyTrailerPlayer = () => {
    trailerPlayerSessionRef.current += 1;
    trailerPlayerDestroyedRef.current = true;

    if (trailerSyncIntervalRef.current) {
      clearInterval(trailerSyncIntervalRef.current);
      trailerSyncIntervalRef.current = null;
    }

    const activePlayer = trailerPlayerRef.current;
    trailerPlayerRef.current = null;
    if (activePlayer) {
      let currentTime = 0;
      try {
        currentTime = activePlayer.getCurrentTime() || 0;
      } catch {
        currentTime = 0;
      }
      if (currentTime > 0) {
        setPlaybackTime(currentTime);
      }
      try {
        activePlayer.destroy();
      } catch {
        // Ignore teardown errors from stale/partially-initialized iframe instances.
      }
    }

    const mountNode = trailerPlayerMountRef.current;
    if (mountNode) {
      mountNode.innerHTML = '';
    }
  };

  useEffect(() => {
    if (currentlyPlayingItem?.kind !== 'trailer') {
      destroyTrailerPlayer();
      setTrailerPlayerReady(false);
      return;
    }

    if (!hasTrailerPlayback || !trailerVideoId) {
      destroyTrailerPlayer();
      resetPlaybackTransport();
      return;
    }

    let cancelled = false;

    const initPlayer = async () => {
      const session = trailerPlayerSessionRef.current + 1;

      destroyTrailerPlayer();
      trailerPlayerSessionRef.current = session;
      trailerPlayerDestroyedRef.current = false;

      try {
        await ensureYouTubeApiReady();
      } catch {
        if (!cancelled) {
          setTrailerPlayerReady(false);
        }
        return;
      }
      if (cancelled || trailerPlayerSessionRef.current !== session || trailerPlayerDestroyedRef.current) return;
      if (!trailerPlayerMountRef.current || !window.YT?.Player) return;

      const player = new window.YT.Player(trailerPlayerMountRef.current, {
        videoId: trailerVideoId,
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          cc_load_policy: 0,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          origin: window.location.origin,
          host: `https://${YOUTUBE_EMBED_HOST}`,
        },
        events: {
          onReady: (event) => {
            if (cancelled || trailerPlayerDestroyedRef.current || trailerPlayerSessionRef.current !== session) return;
            trailerPlayerRef.current = event.target;
            setTrailerPlayerReady(true);
            event.target.setVolume(trailerVolume);
            setPlaybackDuration(event.target.getDuration() || 0);
            const resumeAt = Math.max(0, playbackTime);
            if (resumeAt > 0.25) {
              event.target.seekTo(resumeAt, true);
              setPlaybackTime(resumeAt);
            } else {
              setPlaybackTime(event.target.getCurrentTime() || 0);
            }
            if (isPlaying) {
              event.target.playVideo();
            } else {
              event.target.pauseVideo();
            }

            const iframe = trailerPlayerMountRef.current?.querySelector('iframe');
            if (iframe) {
              iframe.setAttribute('tabindex', '-1');
              iframe.setAttribute('aria-hidden', 'true');
            }

            trailerSyncIntervalRef.current = setInterval(() => {
              if (cancelled || trailerPlayerDestroyedRef.current || trailerPlayerSessionRef.current !== session) {
                if (trailerSyncIntervalRef.current) {
                  clearInterval(trailerSyncIntervalRef.current);
                  trailerSyncIntervalRef.current = null;
                }
                return;
              }
              const activePlayer = trailerPlayerRef.current;
              if (!activePlayer) return;
              try {
                setPlaybackTime(activePlayer.getCurrentTime() || 0);
                setPlaybackDuration(activePlayer.getDuration() || 0);
              } catch {
                // Ignore transient player errors while tearing down between playback modes.
              }
            }, 300);
          },
          onStateChange: (event) => {
            if (cancelled || trailerPlayerDestroyedRef.current || trailerPlayerSessionRef.current !== session) return;
            const playingState = window.YT?.PlayerState?.PLAYING ?? 1;
            const pausedState = window.YT?.PlayerState?.PAUSED ?? 2;
            const endedState = window.YT?.PlayerState?.ENDED ?? 0;

            if (event.data === playingState) {
              setPlaying(true);
              return;
            }

            if (event.data === pausedState) {
              setPlaying(false);
              return;
            }

            if (event.data === endedState) {
              setPlaying(false);
              void playNextInQueue(true);
            }
          },
        },
      });

      trailerPlayerRef.current = player;
    };

    void initPlayer();

    return () => {
      cancelled = true;
      destroyTrailerPlayer();
      setTrailerPlayerReady(false);
    };
  }, [
    hasTrailerPlayback,
    playNextInQueue,
    resetPlaybackTransport,
    setPlaybackDuration,
    setPlaybackTime,
    setPlaying,
    setTrailerPlayerReady,
    trailerVideoId,
  ]);

  useEffect(() => {
    if (isFullNowPlayingView) return;
    setIsFullQueueDrawerOpen(false);
  }, [isFullNowPlayingView]);

  const queueContent = (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.13em] text-amberline/70">Next in Queue</p>
        <button
          type="button"
          className="right-queue-clear-btn retro-tooltip"
          onClick={() => {
            void clearQueue();
            setIsFullQueueDrawerOpen(false);
          }}
          aria-label="Clear queue"
          data-tooltip="Clear Queue"
        >
          <ListX size={12} /> Clear Queue
        </button>
      </div>

      {queueUpcoming.length > 0 ? (
        <div className="space-y-1.5">
          {queueUpcoming.map((queueItem) => (
            <div key={queueItem.id} className="right-queue-item group">
              <img src={queueItem.anime.image} alt="" className="right-queue-item-thumb" />
              <div className="min-w-0 flex-1">
                <p className="right-queue-item-title line-clamp-1">{queueItem.title}</p>
                <p className="right-queue-item-jp line-clamp-1">{queueItem.titleJapanese ?? 'No Japanese title'}</p>
                <p className="right-queue-item-type line-clamp-1">{queueItem.typeLabel}</p>
              </div>

              <div className="right-queue-item-actions">
                <button
                  type="button"
                  className="right-queue-item-action-btn retro-tooltip"
                  onClick={() => void playFromQueue(queueItem.id)}
                  aria-label="Play from queue"
                  data-tooltip="Play from Queue"
                >
                  <Play size={13} />
                </button>

                <button
                  type="button"
                  className="right-queue-item-action-btn right-queue-item-menu-trigger retro-tooltip"
                  aria-label="Queue item options"
                  data-tooltip="Queue Item Options"
                  onClick={() => {
                    setOpenMenuQueueItemId((current) => (current === queueItem.id ? null : queueItem.id));
                  }}
                >
                  <EllipsisVertical size={13} />
                </button>
              </div>

              {openMenuQueueItemId === queueItem.id ? (
                <div className="right-queue-item-menu" role="menu" aria-label="Queue item options">
                  <button
                    type="button"
                    className="right-queue-item-menu-btn retro-tooltip"
                    onClick={() => {
                      void removeFromQueue(queueItem.id);
                      setOpenMenuQueueItemId(null);
                    }}
                    data-tooltip="Remove from Queue"
                  >
                    <Trash2 size={12} /> Remove from Queue
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-cream/72">Queue is empty. Use Add to Queue on cards or hover preview.</p>
      )}
    </div>
  );

  useEffect(() => {
    lastWatchProgressSaveSecondRef.current = -1;
  }, [currentlyPlayingItem?.id]);

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
      if (trailerPlayerDestroyedRef.current) return;
      const player = trailerPlayerRef.current;
      if (!player) return;
      try {
        if (isPlaying) {
          player.playVideo();
          return;
        }
        player.pauseVideo();
      } catch {
        setPlaying(false);
      }
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
  }, [hasTrailerPlayback, isDirectPluginPlayback, isPlaying, setPlaying]);

  useEffect(() => {
    if (hasTrailerPlayback) {
      if (trailerPlayerDestroyedRef.current) return;
      const player = trailerPlayerRef.current;
      if (!player) return;
      try {
        player.setVolume(trailerVolume);
      } catch {
        // Ignore transient player errors while switching playback modes.
      }
      return;
    }

    if (!isDirectPluginPlayback) return;
    const video = sourceVideoRef.current;
    if (!video) return;
    video.volume = Math.max(0, Math.min(1, trailerVolume / 100));
  }, [hasTrailerPlayback, isDirectPluginPlayback, trailerVolume]);

  useEffect(() => {
    if (pendingSeekTo === null) return;

    if (playbackSupportMode === 'fullscreen-only') {
      setPlaybackTime(Math.max(0, pendingSeekTo));
      clearPendingSeekTo();
      return;
    }

    if (hasTrailerPlayback) {
      if (trailerPlayerDestroyedRef.current) return;
      const player = trailerPlayerRef.current;
      if (!player) return;
      try {
        player.seekTo(pendingSeekTo, true);
      } catch {
        // Ignore transient player errors while switching playback modes.
      }
      clearPendingSeekTo();
      return;
    }

    if (!isDirectPluginPlayback) return;
    const video = sourceVideoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, pendingSeekTo);
    clearPendingSeekTo();
  }, [clearPendingSeekTo, hasTrailerPlayback, isDirectPluginPlayback, pendingSeekTo, playbackSupportMode, setPlaybackTime]);

  useEffect(() => {
    const playable = currentlyPlayingItem;
    if (!playable || playable.kind === 'trailer') {
      setResolvingPlaybackSource(false);
      setResolvedSource(null);
      setIsResolvingSource(false);
      setSourceResolveTrace(null);
      setSelectedSourceOptionId(null);
      return;
    }

    if (importedSourcePlugins.length === 0) {
      setResolvingPlaybackSource(false);
      setResolvedSource(null);
      setIsResolvingSource(false);
      setSourceResolveTrace({
        createdAt: new Date().toISOString(),
        activePluginIds: [],
        preferredSourcePluginId: preferredSourcePluginId ?? undefined,
        preferredAudioLanguage,
        attempts: [],
      });
      return;
    }

    let cancelled = false;
    setResolvingPlaybackSource(true);
    setIsResolvingSource(true);
    setResolvedSource(null);
    const initialTrace: SourceResolveTrace = {
      createdAt: new Date().toISOString(),
      activePluginIds: [],
      preferredSourcePluginId: preferredSourcePluginId ?? undefined,
      preferredAudioLanguage,
      attempts: [],
    };
    setSourceResolveTrace(initialTrace);
    setSelectedSourceOptionId(null);
    const resolveStartedAt = Date.now();

    const runResolve = async () => {
      const { resolved, trace } = await resolveSourceForPlayableWithTrace(
        playable,
        {
          importedPlugins: importedSourcePlugins,
          pluginPriority,
          pluginEnabled,
          baseCatalogSource,
          preferredSourcePluginId: preferredSourcePluginId ?? undefined,
          preferredAudioLanguage,
        },
        (attempt) => {
          if (cancelled) return;
          setSourceResolveTrace((current) => {
            if (!current) return current;
            return {
              ...current,
              attempts: [...current.attempts, attempt],
            };
          });
        },
      );

      const elapsedMs = Date.now() - resolveStartedAt;
      const remainingMs = Math.max(0, MIN_SOURCE_RESOLVE_VISIBLE_MS - elapsedMs);
      if (remainingMs > 0) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, remainingMs);
        });
      }

      if (cancelled) return;

      // Prime AniSkip before starting playback so skip UI can appear immediately in-range.
      if (resolved && playable.kind === 'episode') {
        const malId = await getAniSkipMalId();
        const episodeNumber = getAniSkipEpisodeNumber();
        const episodeLength = getAniSkipEpisodeLength();

        if (!cancelled && malId) {
          const fetchKey = `${malId}:${episodeNumber}:${episodeLength.toFixed(3)}`;
          latestAniSkipFetchKeyRef.current = fetchKey;
          const segments = await fetchAniSkipSegments(malId, episodeNumber, episodeLength);
          if (!cancelled) {
            setAniSkipSegments(segments);
            setActiveAniSkipType(null);
            setAnimeSkipButtonSegment(null);
            setIsAniSkipOverlayFading(false);
            clearAniSkipFadeTimer();
          }
        }

        // Fetch Jikan episode metadata so the typeLabel shows "Episode <num> - <title>".
        if (!cancelled) {
          const jikanMalId = await getAniSkipMalId();
          if (jikanMalId) {
            getAnimeEpisodeById(jikanMalId, episodeNumber)
              .then((episodeDetail) => {
                if (cancelled) return;
                const title = episodeDetail?.title?.trim();
                if (title) {
                  setCurrentlyPlayingTypeLabel(`Episode ${episodeNumber} - ${title}`);
                }
              })
              .catch(() => {
                // Episode metadata is optional — keep UX unchanged on failure.
              });
          }
        }
      }

      setResolvedSource(resolved);
      if (resolved) {
        setPlaying(true);
      }
      setSourceResolveTrace((current) => {
        if (!current) return trace;
        return {
          ...trace,
          attempts: current.attempts.length > 0 ? current.attempts : trace.attempts,
        };
      });
      setIsResolvingSource(false);
      setResolvingPlaybackSource(false);
    };

    void runResolve();

    return () => {
      cancelled = true;
    };
  }, [
    currentlyPlayingItem?.id,
    importedSourcePlugins,
    pluginEnabled,
    pluginPriority,
    baseCatalogSource,
    preferredAudioLanguage,
    preferredSourcePluginId,
    sourceResolveRetryToken,
    setPlaying,
    setResolvingPlaybackSource,
    setSelectedSourceOptionId,
  ]);

  useEffect(() => {
    if (!currentlyPlayingItem || currentlyPlayingItem.kind !== 'episode') return;
    if (!resolvedSource) return;
    if (!importedSourcePlugins.length) return;

    const currentEpisode = Math.max(1, Math.round(currentlyPlayingItem.episodeNumber ?? 1));
    const totalEpisodes = Math.max(0, Math.round(currentlyPlayingItem.anime.episodes ?? 0));

    const preferenceSignature = [
      preferredAudioLanguage,
      preferredSourcePluginId ?? 'auto',
      baseCatalogSource,
      importedSourcePlugins.map((plugin) => plugin.id).join(','),
      pluginPriority.join(','),
      Object.entries(pluginEnabled)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, enabled]) => `${id}:${enabled ? '1' : '0'}`)
        .join(','),
    ].join('::');

    const backgroundResolveKey = `${currentlyPlayingItem.id}::${preferenceSignature}`;
    if (lastBackgroundResolveKeyRef.current === backgroundResolveKey) {
      return;
    }
    lastBackgroundResolveKeyRef.current = backgroundResolveKey;

    const toEpisodePlayableItem = (anime: PlayableItem['anime'], episodeNumber: number, scope: string): PlayableItem => ({
      id: `${anime.id}:episode:ep-${episodeNumber}:${scope}`,
      anime,
      kind: 'episode',
      sourceKind: 'episode-card',
      title: anime.title,
      titleJapanese: anime.titleJapanese,
      durationMinutes: anime.durationMinutes,
      episodeNumber,
      typeLabel: `Episode ${episodeNumber}`,
      createdAt: new Date().toISOString(),
    });

    const neighborEpisodes = [currentEpisode - 1, currentEpisode + 1].filter(
      (episodeNumber, index, list) =>
        episodeNumber >= 1 &&
        (totalEpisodes <= 0 || episodeNumber <= totalEpisodes) &&
        list.indexOf(episodeNumber) === index,
    );

    for (const episodeNumber of neighborEpisodes) {
      const neighborItem = toEpisodePlayableItem(currentlyPlayingItem.anime, episodeNumber, 'neighbor-prefetch');
      void resolveSourceForPlayable(neighborItem, {
        importedPlugins: importedSourcePlugins,
        pluginPriority,
        pluginEnabled,
        baseCatalogSource,
        preferredSourcePluginId: preferredSourcePluginId ?? undefined,
        preferredAudioLanguage,
      }).catch(() => {
        // Neighbor prefetch should stay silent and never block active playback.
      });
    }

    let cancelled = false;
    const prefetchLatestUpdates = async () => {
      try {
        await refreshHomeShelvesIfNeeded(HOME_REFRESH_LIMIT);
        const latestUpdated = await getLatestUpdatedAnime(BACKGROUND_LATEST_RESOLVE_LIMIT);
        if (cancelled || latestUpdated.length === 0) return;

        const seen = new Set<string>();
        const latestItems = latestUpdated
          .slice(0, BACKGROUND_LATEST_RESOLVE_LIMIT)
          .map((anime) => {
            const episodeNumber = Math.max(1, Math.round(anime.episodes ?? 1));
            return toEpisodePlayableItem(anime, episodeNumber, 'latest-prefetch');
          })
          .filter((item) => {
            const identity = `${item.anime.id}:${item.episodeNumber ?? 1}`;
            if (seen.has(identity)) return false;
            seen.add(identity);
            return true;
          });

        for (const item of latestItems) {
          if (cancelled) return;
          void resolveSourceForPlayable(item, {
            importedPlugins: importedSourcePlugins,
            pluginPriority,
            pluginEnabled,
            baseCatalogSource,
            preferredSourcePluginId: preferredSourcePluginId ?? undefined,
            preferredAudioLanguage,
          }).catch(() => {
            // Latest-update prefetch should stay silent and never block active playback.
          });
        }
      } catch {
        // Ignore refresh/fetch failures for background prefetch.
      }
    };

    void prefetchLatestUpdates();

    return () => {
      cancelled = true;
    };
  }, [
    currentlyPlayingItem,
    resolvedSource,
    importedSourcePlugins,
    pluginPriority,
    pluginEnabled,
    baseCatalogSource,
    preferredSourcePluginId,
    preferredAudioLanguage,
  ]);

  useEffect(() => {
    return () => {
      setResolvingPlaybackSource(false);
    };
  }, [setResolvingPlaybackSource]);

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
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsPaneLayoutMenuOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

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

  const sourceResolveControls = isNonTrailerPlayback ? (
    <div className={`${showVideoOverlayControls ? 'right-now-full-overlay-row' : 'mt-2 flex flex-wrap items-center gap-1.5'}`}>
      <SourceSelectorField
        label="Source"
        ariaLabel="Choose source plugin preference"
        value={preferredSourcePluginId ?? 'auto'}
        onChange={(value) => {
          void setPreferredSourcePluginId(value === 'auto' ? null : value);
        }}
        items={sourceSelectorItems}
        disabled={sourcePlugins.length === 0}
        placeholder="No Plugins"
      />
      <SourceSelectorField
        label="Audio"
        ariaLabel="Preferred audio language"
        value={preferredAudioLanguage}
        onChange={(value) => {
          const next = value === 'dub' ? 'dub' : 'sub';
          void setPreferredAudioLanguage(next);
        }}
        items={audioSelectorItems}
        disabled={!isNonTrailerPlayback}
      />
      {sourceOptions.length > 0 ? (
        <SourceSelectorField
          label="Option"
          ariaLabel="Choose active source option"
          value={activeResolvedSource?.selectedOptionId ?? 'auto'}
          onChange={(value) => {
            setSelectedSourceOptionId(value === 'auto' ? null : value);
          }}
          items={optionSelectorItems}
        />
      ) : null}
      <button
        type="button"
        className={`${showVideoOverlayControls ? 'source-log-btn right-now-full-overlay-retry-btn' : 'source-log-btn right-now-retry-btn'} retro-tooltip`}
        onClick={() => setSourceResolveRetryToken((value) => value + 1)}
        aria-label="Retry source resolve"
        data-tooltip={isResolvingSource ? 'Retrying Source Resolve...' : 'Retry Source Resolve'}
        disabled={isResolvingSource || sourcePlugins.length === 0}
      >
        <RotateCcw size={12} className={isResolvingSource ? 'animate-spin' : undefined} />
      </button>
    </div>
  ) : null;

  const fullscreenTopLeftOverlay = showVideoOverlayControls ? (
    <div className={`right-now-full-overlay-top-left right-now-static-overlay ${isFullscreenOverlayVisible ? '' : 'is-hidden'}`}>
      {sourceResolveControls}
    </div>
  ) : null;

  const fullscreenTopRightOverlay = showVideoOverlayControls ? (
    <div className={`right-now-full-overlay-top-right right-now-static-overlay ${isFullscreenOverlayVisible ? '' : 'is-hidden'}`}>
      <div className="right-now-full-overlay-actions">
        <button
          type="button"
          className={`source-log-btn retro-tooltip ${isFullQueueDrawerOpen ? 'is-active' : ''}`}
          ref={queueToggleRef}
          onClick={() => {
            setIsSourceLogOpen(false);
            setIsFullQueueDrawerOpen((open) => !open);
          }}
          aria-label={isFullQueueDrawerOpen ? 'Close queue drawer' : 'Open queue drawer'}
          data-tooltip={isFullQueueDrawerOpen ? 'Close Queue Drawer' : 'Open Queue Drawer'}
        >
          <List size={13} />
        </button>

        {isNonTrailerPlayback ? (
          <button
            type="button"
            ref={logToggleRef}
            className={`source-log-btn retro-tooltip ${isSourceLogOpen ? 'is-active' : ''}`}
            onClick={() => {
              setIsFullQueueDrawerOpen(false);
              setIsSourceLogOpen((open) => !open);
            }}
            aria-label={isSourceLogOpen ? 'Hide source resolve log' : 'Show source resolve log'}
            data-tooltip={isSourceLogOpen ? 'Hide Source Log' : 'Show Source Log'}
          >
            <ScrollText size={12} />
          </button>
        ) : null}
      </div>
    </div>
  ) : null;

  const activeAniSkipSegment = activeAniSkipType ? aniSkipSegments[activeAniSkipType] : null;
  const showFullscreenAniSkipButton =
    showVideoOverlayControls &&
    Boolean(activeAniSkipType) &&
    Boolean(activeAniSkipSegment) &&
    playbackSupportMode === 'fully-supported';

  const fullscreenAniSkipOverlay = showFullscreenAniSkipButton && activeAniSkipType && activeAniSkipSegment ? (
    <div className="aniskip-overlay-wrap right-now-static-overlay">
      <button
        type="button"
        className={`aniskip-overlay-btn ${isAniSkipOverlayFading ? 'is-fading' : ''}`}
        onMouseEnter={() => {
          setIsAniSkipOverlayFading(false);
          restartAniSkipFadeTimer();
        }}
        onFocus={() => {
          setIsAniSkipOverlayFading(false);
          restartAniSkipFadeTimer();
        }}
        onClick={() => {
          performAniSkip(activeAniSkipType, activeAniSkipSegment, true);
        }}
        aria-label={`Skip ${ANISKIP_LABELS[activeAniSkipType]}`}
      >
        {`Skip ${ANISKIP_LABELS[activeAniSkipType]}`}
      </button>
    </div>
  ) : null;

  return (
    <aside className={`right-now-panel vhs-panel relative flex h-full min-h-0 flex-col gap-3 bg-carbon/45 p-4 ${isFullNowPlayingView ? 'right-now-panel-full' : ''}`}>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex items-center gap-2">
            {isRightPanelFullpage ? <WindowControls /> : null}
            <p className="eyebrow">{isPluginsView ? 'Plugins' : showNowPlayingPane ? 'Now Playing' : 'Anime Detail'}</p>
            {showNowPlayingPane ? (
              <span className={`right-now-indicator ${isPlaying ? 'is-playing' : ''}`} aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            ) : null}
          </div>
          <div className="inline-flex items-center gap-1.5">
            {isFullNowPlayingView && !showVideoOverlayControls ? (
              <button
                type="button"
                className={`right-panel-fullpage-btn retro-tooltip ${isFullQueueDrawerOpen ? 'is-active' : ''}`}
                ref={queueToggleRef}
                onClick={() => setIsFullQueueDrawerOpen((open) => !open)}
                aria-label={isFullQueueDrawerOpen ? 'Close queue drawer' : 'Open queue drawer'}
                data-tooltip={isFullQueueDrawerOpen ? 'Close Queue Drawer' : 'Open Queue Drawer'}
              >
                <List size={13} />
              </button>
            ) : null}
            {showNowPlayingPane ? (
              <button
                type="button"
                className={`right-panel-mode-btn retro-tooltip ${isRightPanelFullpage ? 'is-full' : 'is-docked'}`}
                onClick={() => void toggleRightPanelFullpage()}
                aria-label={isRightPanelFullpage ? 'Switch to docked panel mode' : 'Switch to expanded panel mode'}
                data-tooltip={isRightPanelFullpage ? 'Switch to Docked Panel' : 'Switch to Expanded Panel'}
              >
                {isRightPanelFullpage ? (
                  <svg viewBox="0 0 20 20" aria-hidden="true" className="right-panel-mode-icon" focusable="false">
                    <rect x="3" y="4" width="14" height="12" rx="1.6" className="mode-frame" />
                    <path d="M11.8 5.4h4.2v9.2h-4.2z" className="mode-pane" />
                    <path d="M6 7.2h3.1v1.1H6zM6 9.5h3.1v1.1H6zM6 11.8h3.1v1.1H6z" className="mode-line" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 20 20" aria-hidden="true" className="right-panel-mode-icon" focusable="false">
                    <rect x="3" y="4" width="14" height="12" rx="1.6" className="mode-frame" />
                    <path d="M4.6 5.4h10.8v9.2H4.6z" className="mode-pane" />
                    <path d="M6.3 7.1h7.4v1.1H6.3zM6.3 9.45h7.4v1.1H6.3zM6.3 11.8h5.1v1.1H6.3z" className="mode-line" />
                  </svg>
                )}
              </button>
            ) : null}
            {showNowPlayingPane && isNonTrailerPlayback && !showVideoOverlayControls ? (
              <button
                type="button"
                ref={logToggleRef}
                className={`source-log-btn retro-tooltip ${isSourceLogOpen ? 'is-active' : ''}`}
                onClick={() => setIsSourceLogOpen((open) => !open)}
                aria-label={isSourceLogOpen ? 'Hide source resolve log' : 'Show source resolve log'}
                data-tooltip={isSourceLogOpen ? 'Hide Source Log' : 'Show Source Log'}
              >
                <ScrollText size={12} />
              </button>
            ) : null}
            <div ref={paneLayoutMenuRef} className="relative">
              <button
                type="button"
                className="right-panel-fullpage-btn retro-tooltip"
                aria-label="Pane layout options"
                data-tooltip="Pane Layout"
                onClick={() => setIsPaneLayoutMenuOpen((open) => !open)}
              >
                <EllipsisVertical size={13} />
              </button>
              {isPaneLayoutMenuOpen ? (
                <div className="right-pane-layout-menu" role="menu" aria-label="Pane layout options">
                  <button type="button" role="menuitem" className="right-pane-layout-btn is-active" onClick={() => setIsPaneLayoutMenuOpen(false)}>
                    Full Right Panel
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        {showNowPlayingPane ? (
          <>
            <h2 className="anime-card-title line-clamp-2">
              {fallbackDisplayTitle}
            </h2>
            <p className="anime-card-jp mt-0.5 line-clamp-1">{fallbackDisplayJapanese}</p>
            <p className="anime-card-video-badge mt-1 inline-flex">{fallbackTypeLabel}</p>
            {!showVideoOverlayControls ? sourceResolveControls : null}
            {isNonTrailerPlayback && isSourceLogOpen && !showVideoOverlayControls ? (
              <div className="source-trace-panel">
                <div className="source-trace-header">
                  <p className="source-trace-title">Source Resolve Log</p>
                  <p className="source-trace-meta">
                    Active: {sourceResolveTrace?.activePluginIds.length ?? 0}
                    {sourceResolveTrace?.resolvedPluginId ? ` / Winner: ${sourceResolveTrace.resolvedPluginId}` : ''}
                  </p>
                </div>

                <div className="source-trace-list">
                  {isResolvingSource ? (
                    <p className="source-trace-empty">Resolving source and collecting plugin attempt logs...</p>
                  ) : sourceResolveTrace?.attempts.length ? (
                    sourceResolveTrace.attempts.map((attempt) => (
                      <div key={`${attempt.pluginId}-${attempt.order}-${attempt.status}`} className="source-trace-item">
                        <div className="source-trace-item-head">
                          <span className="source-trace-item-order">#{attempt.order}</span>
                          <span className="source-trace-item-plugin">{attempt.pluginName}</span>
                          <span className={`source-trace-item-status is-${attempt.status}`}>{sourceAttemptStatusLabel(attempt.status)}</span>
                        </div>
                        <p className="source-trace-item-message">{attempt.message}</p>
                        {attempt.status === 'error' && isRateLimitError(attempt.message) ? (
                          <button
                            type="button"
                            className="source-trace-rate-limit-clear-btn retro-tooltip"
                            onClick={() => handleClearRateLimit(attempt.pluginId)}
                            aria-label={`Clear rate limit cooldown for ${attempt.pluginName}`}
                            data-tooltip={`Clear Rate Limit for ${attempt.pluginName}`}
                          >
                            <Unlock size={10} />
                            <span>Clear Rate Limit</span>
                          </button>
                        ) : null}
                        {attempt.steps?.length ? (
                          <div className="source-trace-item-steps" aria-label="Resolve steps">
                            {attempt.steps.map((step, stepIndex) => (
                              <p key={`${attempt.pluginId}-${attempt.order}-step-${stepIndex}`} className="source-trace-step">
                                {stepIndex + 1}. {step}
                              </p>
                            ))}
                          </div>
                        ) : null}
                        <p className="source-trace-item-meta">{attempt.durationMs}ms</p>
                      </div>
                    ))
                  ) : (
                    <p className="source-trace-empty">No plugin attempts yet for this item.</p>
                  )}
                </div>
              </div>
            ) : null}
          </>
        ) : isPluginsView ? (
          <>
            <h2 className="line-clamp-2 font-display text-xl font-semibold uppercase text-cream">Plugin Sources</h2>
            <p className="mt-0.5 text-xs text-cream/68">Manage source priority and preferred plugin.</p>
          </>
        ) : (
          <>
            <h2 className="line-clamp-2 font-display text-xl font-semibold uppercase text-cream">
              {detailAnimeView ? getDisplayTitle(detailAnimeView, titleLanguage) : ''}
            </h2>
            {detailAnimeView ? <p className="anime-card-jp mt-0.5 line-clamp-1">{detailAnimeView.titleJapanese}</p> : null}
          </>
        )}
      </div>

      <div className={`right-now-video-section ${isDocumentFullscreen || isNowPlayingView ? '' : 'is-collapsed'}`} aria-hidden={!showNowPlayingPane}>
        <div className="right-now-video-wrap relative -mx-4 w-[calc(100%+2rem)] overflow-hidden bg-black/45">
          {fullscreenTopLeftOverlay}
          {fullscreenTopRightOverlay}
          {fullscreenAniSkipOverlay}
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
                  autoPlay
                  playsInline
                  disablePictureInPicture
                  controlsList="nodownload noplaybackrate noremoteplayback"
                  onLoadedMetadata={(event) => {
                    const video = event.currentTarget;
                    setPlaybackDuration(Number.isFinite(video.duration) ? video.duration : 0);
                    setPlaybackTime(Number.isFinite(video.currentTime) ? video.currentTime : 0);
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
                    setPlaybackTime(Number.isFinite(video.currentTime) ? video.currentTime : 0);
                  }}
                  onDurationChange={(event) => {
                    const video = event.currentTarget;
                    setPlaybackDuration(Number.isFinite(video.duration) ? video.duration : 0);
                  }}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onEnded={() => {
                    setPlaying(false);
                    if (playbackSupportMode === 'fully-supported') {
                      void playNextInQueue(true);
                    }
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
          </div>
        </div>
      </div>

      <div className="right-now-pane-bottom min-h-0 flex-1">
      <div ref={menuRootRef} data-right-now-scroll="true" className="min-h-0 flex-1 overflow-y-auto px-0 py-2 text-sm leading-5 text-cream/62">
        {rightPanelView === 'detail' ? (
          detailAnimeView ? (
            <div className="space-y-2.5">
              <div className="relative overflow-hidden rounded-2xl border border-cream/12 bg-black/45">
                <img src={detailAnimeView.image} alt="" className="h-40 w-full object-cover" />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
              </div>

              <p className="line-clamp-4 text-cream/72">{detailAnimeView.synopsis ?? 'Select an anime to view details and playback context.'}</p>

              <div className="flex flex-wrap gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full border border-cream/15 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-cream/68 retro-tooltip" data-tooltip="Year">
                  <CalendarDays size={11} className="text-amberline" /> {detailYearLabel}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-cream/15 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-cream/68 retro-tooltip" data-tooltip="Episodes">
                  <List size={11} className="text-amberline" /> {detailAnimeView.episodes ?? '?'}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-cream/15 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-cream/68 retro-tooltip" data-tooltip="Status">
                  <Clock3 size={11} className="text-amberline" /> {detailAnimeView.status ?? 'Unknown'}
                </span>
              </div>

              <div className="space-y-1.5 border-t border-cream/10 pt-2">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <p className="font-mono text-[10px] uppercase tracking-[0.13em] text-amberline/75">Episodes</p>
                  <div className="inline-flex flex-wrap items-center gap-1.5">
                    <input
                      type="search"
                      value={detailEpisodeSearchQuery}
                      onChange={(event) => setDetailEpisodeSearchQuery(event.target.value)}
                      placeholder="Search episode # / title"
                      className="w-40 rounded-md border border-cream/20 bg-black/25 px-2 py-1 text-[10px] font-mono uppercase tracking-[0.09em] text-cream/85 placeholder:text-cream/45 focus:border-amberline/55 focus:outline-none"
                    />
                    <label className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-[0.09em] text-cream/58">
                      <span>Page</span>
                      <select
                        className="right-now-episode-page-select"
                        value={detailEpisodePagination.page}
                        onChange={(event) => setDetailEpisodePage(Number(event.target.value) || 1)}
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
                      <article key={episode.episodeNumber} className="rounded-xl border border-cream/10 bg-carbon/35 px-2.5 py-2">
                        <div className="flex items-start gap-2">
                          <button
                            type="button"
                            className="vhs-button-ghost px-2 py-1 text-[11px] retro-tooltip"
                            onClick={() => void playEpisode(detailAnimeView, episode.episodeNumber)}
                            data-tooltip={`Play Episode ${String(episode.episodeNumber).padStart(2, '0')}`}
                          >
                            <Play size={11} /> {String(episode.episodeNumber).padStart(2, '0')}
                          </button>
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-start justify-between gap-2">
                              <p className="line-clamp-1 font-display text-sm uppercase text-cream">{labels.primary}</p>
                              {detailEpisodeResolvedIconByEpisode[episode.episodeNumber] ? (
                                <div
                                  className="shrink-0 rounded-md bg-black/62 p-1 shadow-[0_4px_14px_rgba(0,0,0,0.45)] retro-tooltip"
                                  data-tooltip={`${detailEpisodeResolvedIconByEpisode[episode.episodeNumber].pluginName} Available`}
                                >
                                  <img
                                    src={detailEpisodeResolvedIconByEpisode[episode.episodeNumber].iconDataUri}
                                    alt="Resolved source"
                                    className="h-4 w-4 rounded-sm object-contain"
                                    loading="lazy"
                                  />
                                </div>
                              ) : null}
                            </div>
                            {labels.secondary ? <p className="anime-card-jp line-clamp-1">{labels.secondary}</p> : null}
                            <div className="mt-1 flex flex-wrap gap-1 text-[10px] font-mono uppercase tracking-[0.09em] text-cream/55">
                              <span className="inline-flex items-center gap-1"><CalendarDays size={10} className="text-amberline" /> {episode.aired?.slice(0, 10) || 'TBA'}</span>
                              {episode.filler ? <span className="rounded-full bg-rust/80 px-1.5 py-0.5 text-white">Filler</span> : null}
                              {episode.recap ? <span className="rounded-full bg-amberline/85 px-1.5 py-0.5 text-ink">Recap</span> : null}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="vhs-button-ghost p-1.5 text-[10px] retro-tooltip"
                            onClick={() => void handleDetailEpisodeToggle(detailAnimeView.id, episode.episodeNumber)}
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
                        {isExpanded ? (
                          <div className="mt-1.5 rounded-lg border border-cream/10 bg-black/20 p-2">
                            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                              {formatEpisodeScoreOutOfTen(episode.score) ? (
                                <span className="inline-flex items-center rounded-full border border-cream/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.11em] text-cream/72">
                                  Score {formatEpisodeScoreOutOfTen(episode.score)}
                                </span>
                              ) : null}
                              {episode.durationMinutes && episode.durationMinutes > 0 ? (
                                <span className="inline-flex items-center rounded-full border border-cream/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.11em] text-cream/72">
                                  <Clock3 size={10} className="mr-1 text-amberline" /> {formatEpisodeDuration(episode.durationMinutes)}
                                </span>
                              ) : null}
                              {episode.forumUrl ? (
                                <a
                                  href={episode.forumUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center rounded-full border border-amberline/55 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-amberline transition-colors hover:bg-amberline/12"
                                >
                                  Forum Thread
                                </a>
                              ) : null}
                            </div>
                            <p className="font-mono text-[10px] uppercase tracking-[0.13em] text-amberline/72">Synopsis</p>
                            <p className="mt-1 text-xs leading-5 text-cream/70">{episode.synopsis || 'No synopsis recorded for this episode.'}</p>
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
            </div>
          ) : (
            <p className="text-cream/72">Select an anime to view details and playback context.</p>
          )
        ) : isPluginsView ? (
          <PluginsPanel />
        ) : (
          isFullNowPlayingView ? null : queueContent
        )}
      </div>
      </div>

      {isFullNowPlayingView ? (
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
            <div className="source-trace-panel mt-0">
              <div className="source-trace-header">
                <p className="source-trace-title">Source Resolve Log</p>
                <p className="source-trace-meta">
                  Active: {sourceResolveTrace?.activePluginIds.length ?? 0}
                  {sourceResolveTrace?.resolvedPluginId ? ` / Winner: ${sourceResolveTrace.resolvedPluginId}` : ''}
                </p>
              </div>

              <div className="source-trace-list">
                {isResolvingSource ? (
                  <p className="source-trace-empty">Resolving source and collecting plugin attempt logs...</p>
                ) : sourceResolveTrace?.attempts.length ? (
                  sourceResolveTrace.attempts.map((attempt) => (
                    <div key={`${attempt.pluginId}-${attempt.order}-${attempt.status}`} className="source-trace-item">
                      <div className="source-trace-item-head">
                        <span className="source-trace-item-order">#{attempt.order}</span>
                        <span className="source-trace-item-plugin">{attempt.pluginName}</span>
                        <span className={`source-trace-item-status is-${attempt.status}`}>{sourceAttemptStatusLabel(attempt.status)}</span>
                      </div>
                      <p className="source-trace-item-message">{attempt.message}</p>
                      {attempt.status === 'error' && isRateLimitError(attempt.message) ? (
                        <button
                          type="button"
                          className="source-trace-rate-limit-clear-btn retro-tooltip"
                          onClick={() => handleClearRateLimit(attempt.pluginId)}
                          aria-label={`Clear rate limit cooldown for ${attempt.pluginName}`}
                          data-tooltip={`Clear Rate Limit for ${attempt.pluginName}`}
                        >
                          <Unlock size={10} />
                          <span>Clear Rate Limit</span>
                        </button>
                      ) : null}
                      {attempt.steps?.length ? (
                        <div className="source-trace-item-steps" aria-label="Resolve steps">
                          {attempt.steps.map((step, stepIndex) => (
                            <p key={`${attempt.pluginId}-${attempt.order}-step-${stepIndex}`} className="source-trace-step">
                              {stepIndex + 1}. {step}
                            </p>
                          ))}
                        </div>
                      ) : null}
                      <p className="source-trace-item-meta">{attempt.durationMs}ms</p>
                    </div>
                  ))
                ) : (
                  <p className="source-trace-empty">No plugin attempts yet for this item.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
