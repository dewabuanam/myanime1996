import { History, Info, ListPlus, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { getAnimeTrailerUrl } from '../services/catalogSource';
import { useAppStore } from '../state/appStore';
import type { AnimeSummary } from '../types/anime';
import { getDisplayTitle } from '../utils/title';

type AnimeHoverPreviewProps = {
  anime: AnimeSummary;
  posterOverlayLabel?: string | null;
  episodeLabel: string;
  mediaLabel?: string;
  onPlay?: () => void;
  onPlayTrailer?: () => void;
  canPlayAnime?: boolean;
  playLabel?: string;
  isResumeAction?: boolean;
  onStartOver?: () => void;
  onAddToQueue?: () => void;
  onOpenDetail?: () => void;
  children: ReactNode;
  delayMs?: number;
};

type Position = {
  left: number;
  top: number;
  width: number;
};

const PREVIEW_WIDTH = 360;
const PREVIEW_MARGIN = 12;
const HIDE_DELAY_MS = 160;

const YOUTUBE_EMBED_HOST = 'www.youtube-nocookie.com';

const toAutoplayEmbedUrl = (url?: string, muted = false) => {
  if (!url) return '';

  const withPlaybackParams = (base: string) => {
    const parsed = new URL(base);
    parsed.searchParams.set('autoplay', '1');
    parsed.searchParams.set('mute', muted ? '1' : '0');
    parsed.searchParams.set('controls', '0');
    parsed.searchParams.set('disablekb', '1');
    parsed.searchParams.set('fs', '0');
    parsed.searchParams.set('iv_load_policy', '3');
    parsed.searchParams.set('cc_load_policy', '0');
    parsed.searchParams.set('playsinline', '1');
    parsed.searchParams.set('rel', '0');
    parsed.searchParams.set('modestbranding', '1');
    parsed.searchParams.set('showinfo', '0');
    parsed.searchParams.set('enablejsapi', '1');
    parsed.searchParams.set('origin', window.location.origin);
    return parsed.toString();
  };

  const toEmbedUrl = (videoId: string) => `https://${YOUTUBE_EMBED_HOST}/embed/${videoId}`;

  try {
    if (url.includes('youtube.com/embed/') || url.includes('youtube-nocookie.com/embed/')) {
      const parsed = new URL(url);
      const parts = parsed.pathname.split('/').filter(Boolean);
      const embedIndex = parts.indexOf('embed');
      const embedId = embedIndex >= 0 ? parts[embedIndex + 1] : '';
      if (embedId) return withPlaybackParams(toEmbedUrl(embedId));
      return withPlaybackParams(url);
    }

    const parsed = new URL(url);
    if (parsed.hostname.includes('youtu.be')) {
      const id = parsed.pathname.replace('/', '');
      return withPlaybackParams(toEmbedUrl(id));
    }

    const watchId = parsed.searchParams.get('v');
    if (watchId) {
      return withPlaybackParams(toEmbedUrl(watchId));
    }
  } catch {
    return '';
  }

  return '';
};

export default function AnimeHoverPreview({
  anime,
  posterOverlayLabel,
  episodeLabel,
  mediaLabel,
  onPlay,
  onPlayTrailer,
  canPlayAnime = true,
  playLabel = 'Play Now',
  isResumeAction = false,
  onStartOver,
  onAddToQueue,
  onOpenDetail,
  children,
  delayMs = 1000,
}: AnimeHoverPreviewProps) {
  const titleLanguage = useAppStore((state) => state.titleLanguage);
  const isTrailerMuted = useAppStore((state) => state.isTrailerMuted);
  const setTrailerMuted = useAppStore((state) => state.setTrailerMuted);
  const trailerVolume = useAppStore((state) => state.trailerVolume);
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const trailerIframeRef = useRef<HTMLIFrameElement | null>(null);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const staticTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [visible, setVisible] = useState(false);
  const [staticActive, setStaticActive] = useState(false);
  const [position, setPosition] = useState<Position>({ left: 0, top: 0, width: PREVIEW_WIDTH });
  const [resolvedTrailerUrl, setResolvedTrailerUrl] = useState(anime.trailerUrl);

  const hasPlayableTrailer = useMemo(() => Boolean(toAutoplayEmbedUrl(resolvedTrailerUrl, true)), [resolvedTrailerUrl]);
  const hasQueueableTrailer = Boolean(resolvedTrailerUrl?.trim());
  const isPreviewMuted = isTrailerMuted || trailerVolume <= 0;
  const trailerUrl = useMemo(() => toAutoplayEmbedUrl(resolvedTrailerUrl, true), [resolvedTrailerUrl]);
  const displayTitle = useMemo(() => getDisplayTitle(anime, titleLanguage), [anime, titleLanguage]);
  const japaneseTitle = anime.titleJapanese?.trim() ?? '';
  const fallbackVisual = anime.banner?.trim() || anime.image;

  useEffect(() => {
    setResolvedTrailerUrl(anime.trailerUrl);
  }, [anime.id, anime.trailerUrl]);

  useEffect(() => {
    if (!visible) return;
    if (resolvedTrailerUrl?.trim()) return;

    let alive = true;
    const detailAnimeId = anime.jikanId ?? anime.id;
    void getAnimeTrailerUrl(detailAnimeId)
      .then((nextTrailer) => {
        if (!alive) return;
        if (!nextTrailer?.trim()) return;
        setResolvedTrailerUrl(nextTrailer);
      })
      .catch(() => {
        // Keep poster fallback when trailer cannot be resolved.
      });

    return () => {
      alive = false;
    };
  }, [anime.id, resolvedTrailerUrl, visible]);

  const clearShowTimer = () => {
    if (!showTimerRef.current) return;
    clearTimeout(showTimerRef.current);
    showTimerRef.current = null;
  };

  const clearHideTimer = () => {
    if (!hideTimerRef.current) return;
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
  };

  const clearStaticTimer = () => {
    if (!staticTimerRef.current) return;
    clearTimeout(staticTimerRef.current);
    staticTimerRef.current = null;
  };

  const scheduleShow = () => {
    clearHideTimer();
    if (visible) return;
    clearShowTimer();
    showTimerRef.current = setTimeout(() => {
      setVisible(true);
    }, delayMs);
  };

  const scheduleHide = () => {
    clearShowTimer();
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      setVisible(false);
    }, HIDE_DELAY_MS);
  };

  useEffect(() => {
    return () => {
      clearShowTimer();
      clearHideTimer();
      clearStaticTimer();
    };
  }, []);

  useEffect(() => {
    clearStaticTimer();

    if (!visible) {
      setStaticActive(false);
      return;
    }

    if (!hasPlayableTrailer) {
      setStaticActive(false);
      return;
    }

    setStaticActive(true);
    staticTimerRef.current = setTimeout(() => {
      setStaticActive(false);
    }, 6100);

    return () => {
      clearStaticTimer();
    };
  }, [hasPlayableTrailer, visible]);

  const isMovingToAnchor = (relatedTarget: EventTarget | null) => {
    const anchor = anchorRef.current;
    return !!(anchor && relatedTarget instanceof Node && anchor.contains(relatedTarget));
  };

  const isMovingToPopup = (relatedTarget: EventTarget | null) => {
    const popup = popupRef.current;
    return !!(popup && relatedTarget instanceof Node && popup.contains(relatedTarget));
  };

  useEffect(() => {
    if (!visible) return;
    const updatePosition = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();

      const width = PREVIEW_WIDTH;
      const maxLeft = window.innerWidth - width - PREVIEW_MARGIN;
      const left = Math.min(Math.max(rect.left + rect.width / 2 - width / 2, PREVIEW_MARGIN), maxLeft);

      let top = rect.top - 18;
      if (top < PREVIEW_MARGIN) top = rect.bottom + 12;

      setPosition({ left, top, width });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [visible]);

  const applyPreviewVolume = useCallback(() => {
    const iframe = trailerIframeRef.current;
    if (!iframe?.contentWindow) return;

    const sendCommand = (func: string, args: unknown[] = []) => {
      iframe.contentWindow?.postMessage(
        JSON.stringify({ event: 'command', func, args }),
        '*',
      );
    };

    sendCommand('setVolume', [Math.max(0, Math.min(100, trailerVolume))]);
    if (isPreviewMuted) {
      sendCommand('mute');
    } else {
      sendCommand('unMute');
    }
  }, [isPreviewMuted, trailerVolume]);

  useEffect(() => {
    if (!visible || !hasPlayableTrailer) return;
    applyPreviewVolume();
    const id = setTimeout(() => applyPreviewVolume(), 200);
    return () => clearTimeout(id);
  }, [applyPreviewVolume, hasPlayableTrailer, visible]);

  const popup = visible ? (
    <div
      ref={popupRef}
      className="anime-hover-preview"
      style={{ left: `${position.left}px`, top: `${position.top}px`, width: `${position.width}px` }}
      onMouseEnter={() => {
        clearHideTimer();
      }}
      onMouseLeave={(event) => {
        if (isMovingToAnchor(event.relatedTarget)) return;
        scheduleHide();
      }}
    >
      <div className="anime-hover-preview-media">
        {hasPlayableTrailer ? (
          <>
            <iframe
              ref={trailerIframeRef}
              src={trailerUrl}
              title={`${displayTitle} trailer`}
              tabIndex={-1}
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
              referrerPolicy="strict-origin-when-cross-origin"
              onLoad={applyPreviewVolume}
            />
            <div className="anime-hover-trailer-blocker" aria-hidden="true" />
            {staticActive && <div className="anime-hover-static-overlay" aria-hidden="true" />}
            <button
              type="button"
              className="anime-hover-mute-btn retro-tooltip"
              onClick={() => void setTrailerMuted(!isTrailerMuted)}
              aria-label={isTrailerMuted ? 'Unmute trailer' : 'Mute trailer'}
              data-tooltip={isTrailerMuted ? 'Unmute Trailer' : 'Mute Trailer'}
            >
              {isPreviewMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            {onPlayTrailer ? (
              <button
                type="button"
                className="anime-hover-trailer-play-btn retro-tooltip"
                onClick={onPlayTrailer}
                aria-label="Play trailer"
                data-tooltip="Play Trailer"
              >
                <Play size={14} />
              </button>
            ) : null}
          </>
        ) : (
          <img src={fallbackVisual} alt="" className="anime-hover-preview-poster" />
        )}
        {posterOverlayLabel ? <span className="anime-card-poster-overlay-badge">{posterOverlayLabel}</span> : null}
      </div>

      <div className="anime-hover-preview-body">
        <p className="anime-hover-preview-title line-clamp-2" title={displayTitle}>{displayTitle}</p>
        {japaneseTitle && <p className="anime-hover-preview-japanese line-clamp-1" title={japaneseTitle}>{japaneseTitle}</p>}

        <div className="anime-hover-preview-actions">
          {canPlayAnime && onPlay ? (
            <button type="button" className="anime-hover-btn anime-hover-btn-play retro-tooltip" onClick={onPlay} aria-label={playLabel} data-tooltip={playLabel}>
              {isResumeAction ? <History size={14} /> : <Play size={14} />}
            </button>
          ) : null}
          {canPlayAnime && isResumeAction && onStartOver ? (
            <button
              type="button"
              className="anime-hover-btn anime-hover-btn-info retro-tooltip"
              onClick={onStartOver}
              aria-label="Start Over"
              data-tooltip="Start Over"
            >
              <RotateCcw size={14} />
            </button>
          ) : null}
          {hasQueueableTrailer && onAddToQueue ? (
            <button type="button" className="anime-hover-btn anime-hover-btn-add retro-tooltip" aria-label="Add to queue" onClick={onAddToQueue} data-tooltip="Add to Queue">
              <ListPlus size={14} />
            </button>
          ) : null}
          <button type="button" className="anime-hover-btn anime-hover-btn-info retro-tooltip" aria-label="Open details" onClick={onOpenDetail} data-tooltip="Open Details">
            <Info size={14} />
          </button>
        </div>

        <p className="anime-hover-preview-episode">{episodeLabel}</p>
        {mediaLabel ? <p className="anime-hover-preview-media-type">{mediaLabel}</p> : null}
        <p className="anime-hover-preview-genres">
          {(anime.genres?.length ? anime.genres.slice(0, 3) : ['Anime']).join(' • ')}
        </p>
      </div>
    </div>
  ) : null;

  return (
    <>
      <span
        ref={anchorRef}
        className="anime-hover-anchor"
        onMouseEnter={() => {
          scheduleShow();
        }}
        onMouseLeave={(event) => {
          if (isMovingToPopup(event.relatedTarget)) return;
          scheduleHide();
        }}
      >
        {children}
      </span>
      {popup ? createPortal(popup, document.body) : null}
    </>
  );
}
