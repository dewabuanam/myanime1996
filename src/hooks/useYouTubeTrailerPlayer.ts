import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import { ensureYouTubeApiReady } from '../services/youtubeApiLoader';

const YOUTUBE_EMBED_HOST = 'www.youtube-nocookie.com';

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
  }
}

type UseYouTubeTrailerPlayerArgs = {
  currentlyPlayingKind: string | undefined;
  hasTrailerPlayback: boolean;
  trailerVideoId: string;
  trailerVolume: number;
  playbackTime: number;
  isPlaying: boolean;
  setTrailerPlayerReady: (ready: boolean) => void;
  setPlaybackDuration: (duration: number) => void;
  setPlaybackTime: (time: number) => void;
  setPlaying: (playing: boolean) => void;
  playNextInQueue: (userTriggered?: boolean) => Promise<void> | void;
  resetPlaybackTransport: () => void;
};

type UseYouTubeTrailerPlayerResult = {
  trailerPlayerMountRef: MutableRefObject<HTMLDivElement | null>;
  syncTrailerPlaybackState: (playing: boolean) => void;
  syncTrailerVolume: (volume: number) => void;
  seekTrailer: (seconds: number) => boolean;
};

export function useYouTubeTrailerPlayer({
  currentlyPlayingKind,
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
}: UseYouTubeTrailerPlayerArgs): UseYouTubeTrailerPlayerResult {
  const trailerPlayerMountRef = useRef<HTMLDivElement | null>(null);
  const trailerPlayerRef = useRef<YouTubePlayerLike | null>(null);
  const trailerPlayerDestroyedRef = useRef(false);
  const trailerPlayerSessionRef = useRef(0);
  const trailerSyncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const latestPlaybackTimeRef = useRef(playbackTime);
  const latestIsPlayingRef = useRef(isPlaying);

  useEffect(() => {
    latestPlaybackTimeRef.current = playbackTime;
  }, [playbackTime]);

  useEffect(() => {
    latestIsPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const destroyTrailerPlayer = useCallback(() => {
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
  }, [setPlaybackTime]);

  useEffect(() => {
    if (currentlyPlayingKind !== 'trailer') {
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
            const resumeAt = Math.max(0, latestPlaybackTimeRef.current);
            if (resumeAt > 0.25) {
              event.target.seekTo(resumeAt, true);
              setPlaybackTime(resumeAt);
            } else {
              setPlaybackTime(event.target.getCurrentTime() || 0);
            }
            if (latestIsPlayingRef.current) {
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
    currentlyPlayingKind,
    destroyTrailerPlayer,
    hasTrailerPlayback,
    playNextInQueue,
    resetPlaybackTransport,
    setPlaybackDuration,
    setPlaybackTime,
    setPlaying,
    setTrailerPlayerReady,
    trailerVideoId,
    trailerVolume,
  ]);

  const syncTrailerPlaybackState = useCallback(
    (playing: boolean) => {
      if (trailerPlayerDestroyedRef.current) return;
      const player = trailerPlayerRef.current;
      if (!player) return;
      try {
        if (playing) {
          player.playVideo();
          return;
        }
        player.pauseVideo();
      } catch {
        setPlaying(false);
      }
    },
    [setPlaying],
  );

  const syncTrailerVolume = useCallback((volume: number) => {
    if (trailerPlayerDestroyedRef.current) return;
    const player = trailerPlayerRef.current;
    if (!player) return;
    try {
      player.setVolume(volume);
    } catch {
      // Ignore transient player errors while switching playback modes.
    }
  }, []);

  const seekTrailer = useCallback((seconds: number) => {
    if (trailerPlayerDestroyedRef.current) return false;
    const player = trailerPlayerRef.current;
    if (!player) return false;
    try {
      player.seekTo(seconds, true);
    } catch {
      // Ignore transient player errors while switching playback modes.
    }
    return true;
  }, []);

  return {
    trailerPlayerMountRef,
    syncTrailerPlaybackState,
    syncTrailerVolume,
    seekTrailer,
  };
}
