import { Expand, Maximize, Minimize, Pause, Play, Repeat1, Repeat2, Shuffle, SkipBack, SkipForward, SquareArrowOutUpRight, Volume2, VolumeX, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ANISKIP_LABELS, voteOnAniSkip } from '../services/aniSkip';
import { useAppStore } from '../state/appStore';
import { getDisplayTitle } from '../utils/title';
import { toCanonicalYouTubeWatchUrl } from '../utils/youtubeUrl';

const formatDuration = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  const remainder = whole % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
};

function toExternalPlaybackUrl(url: string, isTrailer: boolean) {
  if (!isTrailer) return url;
  return toCanonicalYouTubeWatchUrl(url);
}

export default function BottomPlayer() {
  const currentlyPlayingItem = useAppStore((state) => state.currentlyPlayingItem);
  const titleLanguage = useAppStore((state) => state.titleLanguage);
  const episodeMetadata = useAppStore((state) => state.episodeMetadata);
  const isPlaying = useAppStore((state) => state.isPlaying);
  const playbackTime = useAppStore((state) => state.playbackTime);
  const playbackDuration = useAppStore((state) => state.playbackDuration);
  const trailerVolume = useAppStore((state) => state.trailerVolume);
  const activePlaybackUrl = useAppStore((state) => state.activePlaybackUrl);
  const playbackSupportMode = useAppStore((state) => state.playbackSupportMode);
  const isResolvingPlaybackSource = useAppStore((state) => state.isResolvingPlaybackSource);
  const isTrailerPlayerReady = useAppStore((state) => state.isTrailerPlayerReady);
  const currentlyPlayingKind = currentlyPlayingItem?.kind;
  const setPlaying = useAppStore((state) => state.setPlaying);
  const setPlaybackTime = useAppStore((state) => state.setPlaybackTime);
  const setPlaybackDuration = useAppStore((state) => state.setPlaybackDuration);
  const requestSeekTo = useAppStore((state) => state.requestSeekTo);
  const animeSkipButtonSegment = useAppStore((state) => state.animeSkipButtonSegment);
  const setAnimeSkipButtonSegment = useAppStore((state) => state.setAnimeSkipButtonSegment);
  const setTrailerVolume = useAppStore((state) => state.setTrailerVolume);
  const playNextInQueue = useAppStore((state) => state.playNextInQueue);
  const playPreviousInQueue = useAppStore((state) => state.playPreviousInQueue);
  const shuffleEnabled = useAppStore((state) => state.shuffleEnabled);
  const repeatMode = useAppStore((state) => state.repeatMode);
  const toggleShuffle = useAppStore((state) => state.toggleShuffle);
  const cycleRepeatMode = useAppStore((state) => state.cycleRepeatMode);
  const lastNonZeroVolumeRef = useRef(72);
  const externalPlaybackTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const externalElapsedRef = useRef(0);
  const externalWindowTargetRef = useRef<string | null>(null);
  const wasMaximizedBeforeFullscreenRef = useRef(false);
  const [isExternalWindowOpen, setIsExternalWindowOpen] = useState(false);
  const [isAppFullscreen, setIsAppFullscreen] = useState(false);
  const fullscreenControlsHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isFullscreenControlsVisible, setIsFullscreenControlsVisible] = useState(true);

  const isTrailerActive = currentlyPlayingKind === 'trailer' && isTrailerPlayerReady;
  const isDirectPluginActive =
    currentlyPlayingKind !== undefined &&
    currentlyPlayingKind !== 'trailer' &&
    Boolean(activePlaybackUrl?.trim()) &&
    playbackDuration > 0;
  const isFullyUnsupported = currentlyPlayingKind !== 'trailer' && playbackSupportMode === 'fully-unsupported';
  const isFullscreenOnly = currentlyPlayingKind !== 'trailer' && playbackSupportMode === 'fullscreen-only';
  const isExternalWindowPlaybackActive = isFullscreenOnly && isExternalWindowOpen;
  const isTransportActive = isTrailerActive || isDirectPluginActive || isExternalWindowPlaybackActive;
  const isFullscreenOnlyAttached =
    isFullscreenOnly &&
    Boolean(currentlyPlayingItem) &&
    Boolean(activePlaybackUrl?.trim());
  const hasPlaybackContext = isTransportActive || isFullscreenOnlyAttached;
  const safeDuration = playbackDuration > 0 ? playbackDuration : 0;
  const safeTime = Math.min(Math.max(0, playbackTime), safeDuration || Number.MAX_SAFE_INTEGER);

  const repeatTooltip = repeatMode === 'off' ? 'Repeat: Off' : 'Repeat: One';
  const shuffleTooltip = shuffleEnabled ? 'Shuffle: On' : 'Shuffle: Off';
  const japaneseTitle = currentlyPlayingItem?.titleJapanese?.trim() || currentlyPlayingItem?.anime.titleJapanese?.trim() || '';
  const displayAnimeTitle = currentlyPlayingItem ? getDisplayTitle(currentlyPlayingItem.anime, titleLanguage) : 'Kimi no Shiranai Monogatari';
  const episodeDisplayTitle =
    titleLanguage === 'english'
      ? episodeMetadata?.title?.trim() || episodeMetadata?.titleRomanji?.trim() || ''
      : episodeMetadata?.titleRomanji?.trim() || episodeMetadata?.title?.trim() || '';
  const episodeDisplayJapanese = episodeMetadata?.titleJapanese?.trim() || '';
  const episodeDisplayLabel = (() => {
    const episodeNumber = Math.max(1, Math.round(currentlyPlayingItem?.episodeNumber ?? episodeMetadata?.episodeNumber ?? 1));
    return episodeDisplayTitle ? `Episode ${episodeNumber} - ${episodeDisplayTitle}` : `Episode ${episodeNumber}`;
  })();
  const displayTypeLabel = currentlyPlayingItem?.typeLabel ?? 'No media selected';
  const canOpenPlaybackAction = Boolean(activePlaybackUrl?.trim()) && !isFullyUnsupported;

  const getExternalTargetUrl = () => {
    const rawTargetUrl = activePlaybackUrl?.trim() ?? '';
    if (!rawTargetUrl) return null;
    return toExternalPlaybackUrl(rawTargetUrl, currentlyPlayingKind === 'trailer');
  };

  const redirectExternalPlaybackWindow = async (targetUrl: string) => {
    await invoke('navigate_external_playback_window', { url: targetUrl });
    externalWindowTargetRef.current = targetUrl;
  };

  useEffect(() => {
    if (trailerVolume > 0) {
      lastNonZeroVolumeRef.current = trailerVolume;
    }
  }, [trailerVolume]);

  useEffect(() => {
    if (!isExternalWindowPlaybackActive) {
      if (externalPlaybackTimerRef.current) {
        clearInterval(externalPlaybackTimerRef.current);
        externalPlaybackTimerRef.current = null;
      }
      return;
    }

    if (externalPlaybackTimerRef.current) {
      clearInterval(externalPlaybackTimerRef.current);
      externalPlaybackTimerRef.current = null;
    }

    externalPlaybackTimerRef.current = setInterval(() => {
      externalElapsedRef.current += 1;
      setPlaybackTime(externalElapsedRef.current);
    }, 1000);

    return () => {
      if (!externalPlaybackTimerRef.current) return;
      clearInterval(externalPlaybackTimerRef.current);
      externalPlaybackTimerRef.current = null;
    };
  }, [isExternalWindowPlaybackActive, setPlaybackTime]);

  const startExternalWindowSession = () => {
    externalElapsedRef.current = Math.max(0, Math.floor(playbackTime));
    setIsExternalWindowOpen(true);
    setPlaying(true);
    setPlaybackTime(externalElapsedRef.current);
  };

  const stopExternalWindowSession = () => {
    if (externalPlaybackTimerRef.current) {
      clearInterval(externalPlaybackTimerRef.current);
      externalPlaybackTimerRef.current = null;
    }
    externalElapsedRef.current = Math.max(0, Math.floor(playbackTime));
    setIsExternalWindowOpen(false);
    setPlaying(false);
  };

  const closeExternalPlaybackWindow = () => {
    void (async () => {
      try {
        const existing = await WebviewWindow.getByLabel('external-playback');
        if (existing) {
          await existing.close();
        }
      } catch {
        // Ignore close errors and still reset local transport state.
      }
      externalWindowTargetRef.current = null;
      stopExternalWindowSession();
    })();
  };

  const enforceWindowChrome = async (win: WebviewWindow) => {
    try {
      await win.setFullscreen(false);
    } catch {
      // Ignore if host rejects fullscreen toggle.
    }
    try {
      await win.setDecorations(true);
    } catch {
      // Some hosts may reject decoration toggles; ignore.
    }
    try {
      await win.setResizable(true);
    } catch {
      // Ignore if host rejects this at runtime.
    }
    try {
      await win.setFocus();
    } catch {
      // Ignore focus errors.
    }
  };

  const toggleGlobalMute = () => {
    if (trailerVolume <= 0) {
      setTrailerVolume(lastNonZeroVolumeRef.current > 0 ? lastNonZeroVolumeRef.current : 72);
      return;
    }
    setTrailerVolume(0);
  };

  const openInBrowser = () => {
    const targetUrl = getExternalTargetUrl();
    if (!targetUrl) return;

    void (async () => {
      try {
        await openUrl(targetUrl);
      } catch (error) {
        try {
          window.open(targetUrl, '_blank', 'noopener,noreferrer');
        } catch {
          console.warn('Failed to open URL in browser.', error);
        }
      }
    })();
  };

  const openInFullscreenWindow = () => {
    const targetUrl = getExternalTargetUrl();
    if (!targetUrl) return;

    if (!(typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window)) {
      openInBrowser();
      return;
    }

    void (async () => {
      try {
        const existing = await WebviewWindow.getByLabel('external-playback');
        if (existing) {
          try {
            await existing.unminimize();
          } catch {
            // Ignore if the host does not support unminimize in this state.
          }

          if (externalWindowTargetRef.current !== targetUrl) {
            try {
              await redirectExternalPlaybackWindow(targetUrl);
            } catch {
              try {
                await existing.close();
              } catch {
                // Ignore close failures; creating a new window will still be attempted.
              }
              stopExternalWindowSession();
              externalWindowTargetRef.current = null;
            }
          }

          await enforceWindowChrome(existing);
          if (!isExternalWindowOpen) {
            startExternalWindowSession();
          }

          existing.once('tauri://destroyed', () => {
            externalWindowTargetRef.current = null;
            stopExternalWindowSession();
          });
          return;
        }

        externalWindowTargetRef.current = targetUrl;
        const playbackWindow = new WebviewWindow('external-playback', {
          url: targetUrl,
          title: 'External Playback',
          decorations: true,
          fullscreen: false,
          center: true,
          resizable: true,
          width: 1280,
          height: 820,
          minWidth: 960,
          minHeight: 680,
          focus: true,
        });

        playbackWindow.once('tauri://created', async () => {
          await enforceWindowChrome(playbackWindow);
          startExternalWindowSession();
        });

        playbackWindow.once('tauri://destroyed', () => {
          externalWindowTargetRef.current = null;
          stopExternalWindowSession();
        });

        playbackWindow.once('tauri://error', () => {
          try {
            externalWindowTargetRef.current = null;
            stopExternalWindowSession();
            openInBrowser();
          } catch {
            // Ignore fallback errors.
          }
        });

      } catch (error) {
        console.warn('Failed to open fullscreen playback window.', error);
        try {
          openInBrowser();
        } catch {
          return;
        }
      }
    })();
  };

  useEffect(() => {
    if (!isExternalWindowOpen) return;

    void (async () => {
      const existing = await WebviewWindow.getByLabel('external-playback');
      if (!existing) {
        externalWindowTargetRef.current = null;
        stopExternalWindowSession();
        return;
      }

      const targetUrl = getExternalTargetUrl();
      const shouldWaitForResolvedSource = Boolean(currentlyPlayingItem) && isResolvingPlaybackSource;
      if (shouldWaitForResolvedSource) {
        return;
      }

      const shouldKeepWindowOpen = Boolean(currentlyPlayingItem) && isFullscreenOnly && Boolean(targetUrl);
      if (!shouldKeepWindowOpen) {
        try {
          await existing.close();
        } catch {
          // Ignore close errors and still reset local transport state.
        }
        externalWindowTargetRef.current = null;
        stopExternalWindowSession();
        return;
      }
      if (!targetUrl) return;

      if (externalWindowTargetRef.current !== targetUrl) {
        try {
          await redirectExternalPlaybackWindow(targetUrl);
          await enforceWindowChrome(existing);
        } catch {
          try {
            await existing.close();
          } catch {
            // Ignore close failures; creating a new window will still be attempted.
          }
          stopExternalWindowSession();
          openInFullscreenWindow();
          return;
        }
      }

      externalElapsedRef.current = Math.max(0, Math.floor(playbackTime));
      setPlaybackTime(externalElapsedRef.current);
      setPlaying(true);
      await enforceWindowChrome(existing);
    })();
  }, [
    activePlaybackUrl,
    currentlyPlayingItem,
    currentlyPlayingKind,
    isExternalWindowOpen,
    isFullscreenOnly,
    isResolvingPlaybackSource,
    playbackTime,
    setPlaybackTime,
    setPlaying,
  ]);

  const runOpenPlaybackAction = () => {
    if (isFullscreenOnly) {
      openInFullscreenWindow();
      return;
    }
    openInBrowser();
  };

  const openPlaybackTooltip = isFullyUnsupported
    ? 'Fully Unsupported'
    : isFullscreenOnly
      ? 'Open Window'
      : canOpenPlaybackAction
        ? 'Open New Tab'
        : 'No active URL';

  const isExternalWindowTransport = isExternalWindowPlaybackActive;
  const disablePauseControl = isExternalWindowTransport;
  const hasRetainedFullscreenTime = isFullscreenOnlyAttached && !isExternalWindowTransport && playbackTime > 0;
  const externalWindowDurationSeconds = (() => {
    const itemMinutes = currentlyPlayingItem?.durationMinutes;
    const animeMinutes = currentlyPlayingItem?.anime.durationMinutes;
    const baseMinutes = Number.isFinite(itemMinutes as number)
      ? Number(itemMinutes)
      : Number.isFinite(animeMinutes as number)
        ? Number(animeMinutes)
        : 0;

    if (baseMinutes > 0) {
      return Math.round((baseMinutes + 1) * 60);
    }

    return 0;
  })();
  const currentTimeLabel = isTransportActive || hasRetainedFullscreenTime ? formatDuration(isExternalWindowTransport ? playbackTime : safeTime) : '0:00';
  const endTimeLabel = isExternalWindowTransport || hasRetainedFullscreenTime
    ? externalWindowDurationSeconds > 0
      ? formatDuration(externalWindowDurationSeconds)
      : '∞'
    : isTransportActive
      ? formatDuration(safeDuration)
      : '--:--';
  const sliderMax = isExternalWindowTransport || hasRetainedFullscreenTime
    ? Math.max(
        externalWindowDurationSeconds > 0 ? externalWindowDurationSeconds : 0,
        Math.ceil(playbackTime) + 1,
        60,
      )
    : safeDuration > 0
      ? safeDuration
      : 1;
  const sliderValue = isExternalWindowTransport
    ? Math.min(Math.max(0, playbackTime), sliderMax)
    : isTransportActive || hasRetainedFullscreenTime
      ? safeTime
      : 0;
  const isWindowToggleMode = isFullscreenOnly;
  const isWindowOpen = isExternalWindowOpen;
  const isSeekAllowed = hasPlaybackContext && !isExternalWindowTransport && playbackSupportMode === 'fully-supported';
  const canUsePrimaryWindowAction = isWindowToggleMode && canOpenPlaybackAction;
  const canUsePrimaryPlayPause = !isWindowToggleMode && hasPlaybackContext && !disablePauseControl;
  const playButtonEnabled = canUsePrimaryWindowAction || canUsePrimaryPlayPause;
  const hasNoSignalPlayback = !isWindowToggleMode && !hasPlaybackContext;
  const playButtonTooltip = isWindowToggleMode
    ? canOpenPlaybackAction
      ? isWindowOpen
        ? 'Close Window'
        : 'Open Window'
      : 'No active URL'
    : !isTransportActive
      ? 'No active playback'
      : disablePauseControl
        ? 'Controlled by Player Window'
        : 'Play / Pause';

  const canUseAppFullscreen = true;
  const appFullscreenTooltip = isAppFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen';
  const showControlBarSkipButton =
    Boolean(animeSkipButtonSegment) &&
    !isAppFullscreen &&
    playbackSupportMode === 'fully-supported' &&
    !isWindowToggleMode;

  const handleControlBarSkipClick = () => {
    if (!animeSkipButtonSegment) return;
    requestSeekTo(animeSkipButtonSegment.endTime);
    setAnimeSkipButtonSegment(null);
    void voteOnAniSkip('upvote', animeSkipButtonSegment.skipId);
  };

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const syncFullscreenState = () => {
      setIsAppFullscreen(Boolean(document.fullscreenElement));
    };

    syncFullscreenState();
    document.addEventListener('fullscreenchange', syncFullscreenState);
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreenState);
    };
  }, []);

  useEffect(() => {
    if (!isAppFullscreen) {
      if (fullscreenControlsHideTimerRef.current) {
        clearTimeout(fullscreenControlsHideTimerRef.current);
        fullscreenControlsHideTimerRef.current = null;
      }
      setIsFullscreenControlsVisible(true);
      return;
    }

    const revealControls = () => {
      setIsFullscreenControlsVisible(true);
      if (fullscreenControlsHideTimerRef.current) {
        clearTimeout(fullscreenControlsHideTimerRef.current);
      }
      fullscreenControlsHideTimerRef.current = setTimeout(() => {
        setIsFullscreenControlsVisible(false);
      }, 2000);
    };

    revealControls();
    document.addEventListener('mousemove', revealControls);
    document.addEventListener('mousedown', revealControls);
    document.addEventListener('touchstart', revealControls);
    document.addEventListener('keydown', revealControls);

    return () => {
      document.removeEventListener('mousemove', revealControls);
      document.removeEventListener('mousedown', revealControls);
      document.removeEventListener('touchstart', revealControls);
      document.removeEventListener('keydown', revealControls);
      if (fullscreenControlsHideTimerRef.current) {
        clearTimeout(fullscreenControlsHideTimerRef.current);
        fullscreenControlsHideTimerRef.current = null;
      }
    };
  }, [isAppFullscreen]);

  const toggleAppFullscreen = () => {
    if (typeof document === 'undefined') return;

    void (async () => {
      try {
        if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
          const appWindow = getCurrentWindow();
          const isWindowFullscreen = await appWindow.isFullscreen();

          if (isWindowFullscreen) {
            await appWindow.setFullscreen(false);
            if (wasMaximizedBeforeFullscreenRef.current) {
              await appWindow.maximize();
            }
            wasMaximizedBeforeFullscreenRef.current = false;
            setIsAppFullscreen(false);

            if (document.fullscreenElement) {
                await document.exitFullscreen();
            }
            return;
          }

          // Enter from normal windowed state first, then fullscreen to avoid maximize-induced bars.
          const isMaximized = await appWindow.isMaximized();
          wasMaximizedBeforeFullscreenRef.current = isMaximized;
          if (isMaximized) {
            await appWindow.unmaximize();
          }
          await appWindow.setFullscreen(true);
          setIsAppFullscreen(true);

          const fullscreenTarget =
          document.querySelector<HTMLElement>('.app-shell-wrap') ??
          document.querySelector<HTMLElement>('.right-now-video-player') ??
          document.querySelector<HTMLElement>('.right-now-video-frame-full');

          if (!fullscreenTarget) {
            console.warn('No active video element available for fullscreen.');
            return;
          }

          await fullscreenTarget.requestFullscreen();
        }
      } catch (error) {
        console.warn('Failed to toggle fullscreen mode.', error);
      }
    })();
  };

  const shouldHideInFullscreen = isAppFullscreen && !isFullscreenControlsVisible;

  return (
    <footer
      className={`vhs-panel mini-player grid h-full items-center gap-4 px-4 py-3 transition-all duration-200 ${shouldHideInFullscreen ? 'translate-y-full opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'}`}
      style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(220px, clamp(16rem, 50vw, 40rem)) minmax(0,1fr)' }}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="h-16 w-16 min-h-16 min-w-16 shrink-0 overflow-hidden rounded-lg">
          <img src={currentlyPlayingItem?.anime.image ?? '/assets/logo.png'} alt="" className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-cream/90">{displayAnimeTitle}</p>
          {japaneseTitle ? <p className="truncate text-[11px] text-amberline/80">{japaneseTitle}</p> : null}
          {currentlyPlayingItem?.kind === 'episode' ? (
            <>
              <p className="truncate text-xs text-cream/55" data-tooltip={episodeDisplayLabel} data-tooltip-sub={episodeDisplayJapanese || undefined}>
                {episodeDisplayLabel}
              </p>
              {episodeDisplayJapanese ? <p className="truncate text-[11px] text-amberline/80">{episodeDisplayJapanese}</p> : null}
            </>
          ) : (
            <p className="truncate text-xs text-cream/55">{displayTypeLabel}</p>
          )}
        </div>
      </div>

      <div className="player-transport-zone flex w-full min-w-0 max-w-none flex-col items-center gap-1.5 justify-self-center">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={`top-icon-btn h-8 w-8 retro-tooltip ${shuffleEnabled ? 'is-active' : ''}`}
            aria-label="Shuffle"
            data-tooltip={shuffleTooltip}
            onClick={() => void toggleShuffle()}
            disabled={false}
          >
            <Shuffle size={14} />
          </button>
          <button
            type="button"
            className="top-icon-btn h-8 w-8 retro-tooltip"
            aria-label="Previous"
            data-tooltip="Previous"
            onClick={() => void playPreviousInQueue()}
            disabled={false}
          ><SkipBack size={15} /></button>
          <button
            type="button"
            className={`retro-tooltip inline-flex h-10 w-10 items-center justify-center rounded-full transition ${playButtonEnabled ? 'bg-amberline text-ink hover:brightness-95' : 'bg-slate-500/45 text-cream/52 cursor-not-allowed'}`}
            onClick={() => {
              if (isWindowToggleMode) {
                if (!canOpenPlaybackAction) return;
                if (isWindowOpen) {
                  closeExternalPlaybackWindow();
                } else {
                  openInFullscreenWindow();
                }
                return;
              }
              if (disablePauseControl) return;
              setPlaying(!isPlaying);
            }}
            aria-label="Play or pause"
            data-tooltip={playButtonTooltip}
            disabled={!playButtonEnabled}
          >
            {hasNoSignalPlayback ? (
              <Play size={18} className="ml-0.5" />
            ) : isWindowToggleMode ? (
              isWindowOpen ? <X size={18} /> : <Expand size={17} />
            ) : disablePauseControl ? (
              <Play size={18} className="ml-0.5" />
            ) : isPlaying ? (
              <Pause size={18} />
            ) : (
              <Play size={18} className="ml-0.5" />
            )}
          </button>
          <button
            type="button"
            className="top-icon-btn h-8 w-8 retro-tooltip"
            aria-label="Next"
            data-tooltip="Next"
            onClick={() => void playNextInQueue()}
            disabled={false}
          ><SkipForward size={15} /></button>
          <button
            type="button"
            className={`top-icon-btn h-8 w-8 retro-tooltip ${repeatMode !== 'off' ? 'is-active' : ''}`}
            aria-label="Repeat"
            data-tooltip={repeatTooltip}
            onClick={() => void cycleRepeatMode()}
            disabled={false}
          >
            {repeatMode === 'one' ? <Repeat1 size={14} /> : <Repeat2 size={14} />}
          </button>
        </div>

        {showControlBarSkipButton && animeSkipButtonSegment ? (
          <div className={`player-skip-inline-wrap is-${animeSkipButtonSegment.type}`}>
            <button
              type="button"
              className="skip-btn-control is-mini is-inline retro-tooltip"
              aria-label={`Skip ${ANISKIP_LABELS[animeSkipButtonSegment.type]}`}
              data-tooltip={`Skip ${ANISKIP_LABELS[animeSkipButtonSegment.type]}`}
              onClick={handleControlBarSkipClick}
            >
              {`Skip ${ANISKIP_LABELS[animeSkipButtonSegment.type]}`}
            </button>
          </div>
        ) : null}

        <div className="flex w-full min-w-0 flex-col gap-1">
          <div className="flex w-full min-w-0 items-center gap-2 whitespace-nowrap font-mono text-[10px] text-cream/55">
            <span className="shrink-0">{currentTimeLabel}</span>
            <input
              className="player-time-slider"
              type="range"
              min={0}
              max={sliderMax}
              step={0.25}
              value={sliderValue}
              onChange={(event) => requestSeekTo(Number(event.target.value))}
              disabled={!isSeekAllowed}
              aria-label="Seek playback"
              data-tooltip={
                !hasPlaybackContext
                  ? 'No active playback'
                  : playbackSupportMode !== 'fully-supported'
                    ? 'Seek unavailable for this source'
                    : isExternalWindowTransport
                      ? 'Seek unavailable for player window'
                      : 'Seek Playback'
              }
            />
            <span className="shrink-0">{endTimeLabel}</span>
          </div>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2 justify-self-end">
        <div className="ml-1 flex w-[clamp(10rem,22vw,16rem)] items-center gap-2 text-amberline/85">
          <button
            type="button"
            className="top-icon-btn h-7 w-7 shrink-0 aspect-square rounded-full retro-tooltip tooltip-left"
            onClick={toggleAppFullscreen}
            disabled={!canUseAppFullscreen}
            aria-label={isAppFullscreen ? 'Exit fullscreen mode' : 'Enter fullscreen mode'}
            data-tooltip={appFullscreenTooltip}
          >
            {isAppFullscreen ? <Minimize size={13} /> : <Maximize size={13} />}
          </button>
          <button
            type="button"
            className="top-icon-btn h-7 w-7 shrink-0 aspect-square rounded-full retro-tooltip tooltip-left"
            onClick={runOpenPlaybackAction}
            disabled={!canOpenPlaybackAction}
            aria-label={isFullscreenOnly ? 'Open current media in new tab window' : 'Open current media in new tab'}
            data-tooltip={openPlaybackTooltip}
          >
            <SquareArrowOutUpRight size={13} />
          </button>
          <button
            type="button"
            className="top-icon-btn h-7 w-7 shrink-0 aspect-square rounded-full retro-tooltip tooltip-left"
            onClick={toggleGlobalMute}
            aria-label={trailerVolume <= 0 ? 'Unmute global volume' : 'Mute global volume'}
            data-tooltip={trailerVolume <= 0 ? 'Unmute' : 'Mute'}
          >
            {trailerVolume <= 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
          <input
            className="accent-amberline flex-1 min-w-0 retro-tooltip tooltip-left"
            type="range"
            min="0"
            max="100"
            value={trailerVolume}
            onChange={(event) => setTrailerVolume(Number(event.target.value))}
            aria-label="Volume"
            data-tooltip={`Volume: ${Math.max(0, Math.min(100, Math.round(trailerVolume)))}%`}
          />
        </div>
      </div>
    </footer>
  );
}
