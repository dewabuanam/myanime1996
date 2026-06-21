import * as dashjs from 'dashjs';
import Hls from 'hls.js';
import { useEffect, useRef, type MutableRefObject, type RefObject } from 'react';
import type { ResolvedSource, ResolvedSubtitleTrack } from '../types/plugin';

const SUBTITLE_OFF_ID = '__off__';

type HlsLoaderContext = {
  url: string;
  responseType?: string;
};

type HlsLoaderStats = {
  aborted: boolean;
  loaded: number;
  retry: number;
  tfirst: number;
  tload: number;
  total: number;
  trequest: number;
};

type HlsLoaderCallbacks = {
  onSuccess: (response: { data: string | ArrayBuffer; url: string }, stats: HlsLoaderStats, context: HlsLoaderContext) => void;
  onError: (
    error: { code: number; text: string },
    context: HlsLoaderContext,
    _networkDetails: unknown,
    stats: HlsLoaderStats,
  ) => void;
};

type UseHlsPlayerOptions = {
  sourceVideoRef: RefObject<HTMLVideoElement>;
  activeResolvedSource: ResolvedSource | null;
  subtitleTracks: ResolvedSubtitleTrack[];
  selectedSubtitleId: string | null;
  subtitleFontColor: string;
  subtitleFontSize: number;
  subtitleDropShadow: boolean;
  subtitleBackgroundHighlight: boolean;
  isPlaying: boolean;
  playbackTime: number;
  pendingAutoPlayAfterResolveRef: MutableRefObject<boolean>;
  setPlaying: (playing: boolean) => void;
};

export function useHlsPlayer({
  sourceVideoRef,
  activeResolvedSource,
  subtitleTracks,
  selectedSubtitleId,
  subtitleFontColor,
  subtitleFontSize,
  subtitleDropShadow,
  subtitleBackgroundHighlight,
  isPlaying,
  playbackTime,
  pendingAutoPlayAfterResolveRef,
  setPlaying,
}: UseHlsPlayerOptions) {
  const latestPlaybackTimeRef = useRef(playbackTime);
  const hlsRef = useRef<Hls | null>(null);
  const dashRef = useRef<dashjs.MediaPlayerClass | null>(null);

  const isDashUrl = (url: string) => /\.mpd(?:$|\?)/i.test(url);
  const isHlsUrl = (url: string) => /\.m3u8(?:$|\?)/i.test(url);

  const normalizeRequestHeaders = (value?: Record<string, string>) => {
    if (!value) return undefined;
    const out: Record<string, string> = {};
    for (const [key, raw] of Object.entries(value)) {
      const name = String(key || '').trim();
      const text = String(raw || '').trim();
      if (!name || !text) continue;
      out[name] = text;
    }
    return Object.keys(out).length ? out : undefined;
  };

  const createNativeAwareHlsLoaderClass = (requestHeaders?: Record<string, string>) => {
    const normalizedHeaders = normalizeRequestHeaders(requestHeaders);

    return class NativeAwareHlsLoader {
      private abortController: AbortController | null = null;
      private destroyed = false;

      destroy() {
        this.destroyed = true;
        this.abort();
      }

      abort() {
        if (this.abortController) {
          try {
            this.abortController.abort();
          } catch {
            // Ignore abort races.
          }
        }
        this.abortController = null;
      }

      load(context: HlsLoaderContext, _config: unknown, callbacks: HlsLoaderCallbacks) {
        this.abort();
        this.abortController = new AbortController();
        const signal = this.abortController.signal;
        const startedAt = performance.now();

        const stats: HlsLoaderStats = {
          aborted: false,
          loaded: 0,
          retry: 0,
          tfirst: 0,
          tload: 0,
          total: 0,
          trequest: startedAt,
        };

        const finalizeSuccess = (data: string | ArrayBuffer, finalUrl: string) => {
          if (this.destroyed) return;
          const endedAt = performance.now();
          const size = typeof data === 'string' ? data.length : data.byteLength;
          stats.tfirst = endedAt;
          stats.tload = endedAt;
          stats.loaded = size;
          stats.total = size;
          callbacks.onSuccess({ data, url: finalUrl || context.url }, stats, context);
        };

        const finalizeError = (code: number, text: string) => {
          if (this.destroyed) return;
          const endedAt = performance.now();
          stats.tfirst = endedAt;
          stats.tload = endedAt;
          callbacks.onError({ code, text }, context, null, stats);
        };

        const loadViaBrowserFetch = async () => {
          const response = await fetch(context.url, {
            method: 'GET',
            headers: normalizedHeaders,
            signal,
          });
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const responseType = String(context.responseType || '').toLowerCase();
          if (responseType === 'arraybuffer') {
            return {
              data: await response.arrayBuffer(),
              url: response.url || context.url,
            };
          }
          return {
            data: await response.text(),
            url: response.url || context.url,
          };
        };

        const loadViaNativeHttp = async () => {
          const { fetch: nativeFetch } = await import('@tauri-apps/plugin-http');
          const response = await nativeFetch(context.url, {
            method: 'GET',
            headers: normalizedHeaders,
            signal,
          });
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const responseType = String(context.responseType || '').toLowerCase();
          if (responseType === 'arraybuffer') {
            return {
              data: await response.arrayBuffer(),
              url: response.url || context.url,
            };
          }
          return {
            data: await response.text(),
            url: response.url || context.url,
          };
        };

        void (async () => {
          try {
            const nativeResult = await loadViaNativeHttp();
            finalizeSuccess(nativeResult.data, nativeResult.url);
          } catch {
            try {
              const fallbackResult = await loadViaBrowserFetch();
              finalizeSuccess(fallbackResult.data, fallbackResult.url);
            } catch (error) {
              const detail = error instanceof Error ? error.message : String(error);
              const code = /HTTP\s+(\d+)/i.exec(detail)?.[1];
              finalizeError(code ? Number(code) : 0, detail || 'HLS request failed');
            }
          }
        })();
      }
    };
  };

  const applySelectedTextTrackMode = (
    video: HTMLVideoElement,
    selectedTrack: ResolvedSubtitleTrack | null,
    disableSubtitles = false,
  ) => {
    const textTracks = Array.from(video.textTracks || []);
    for (const track of textTracks) {
      track.mode = 'disabled';
    }

    if (!textTracks.length || disableSubtitles) return;

    const target = selectedTrack ?? subtitleTracks.find((track) => track.isDefault) ?? subtitleTracks[0] ?? null;
    if (!target) return;

    for (const track of textTracks) {
      const id = String(track.id || '').trim();
      const label = String(track.label || '').trim().toLowerCase();
      const language = String(track.language || '').trim().toLowerCase();
      if (
        id === target.id ||
        label === target.label.trim().toLowerCase() ||
        language === target.language.trim().toLowerCase()
      ) {
        track.mode = 'showing';
        return;
      }
    }
  };

  const applySubtitleStyle = () => {
    if (typeof document === 'undefined') return;

    const styleId = 'myanime1996-subtitle-style';
    let styleElement = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = styleId;
      document.head.appendChild(styleElement);
    }

    const textShadow = subtitleDropShadow ? '0 1px 2px rgba(0, 0, 0, 0.9), 0 0 6px rgba(0, 0, 0, 0.75)' : 'none';
    const backgroundColor = subtitleBackgroundHighlight ? 'rgba(0, 0, 0, 0.72)' : 'transparent';
    styleElement.textContent = `.right-now-video-native::cue { color: ${subtitleFontColor}; font-size: ${subtitleFontSize}px; text-shadow: ${textShadow}; background-color: ${backgroundColor}; }`;
  };

  const applySubtitleTracks = (video: HTMLVideoElement) => {
    const managedTracks = Array.from(video.querySelectorAll('track[data-myanime1996-subtitle="managed"]'));
    for (const track of managedTracks) {
      track.remove();
    }

    if (!subtitleTracks.length) {
      for (const textTrack of Array.from(video.textTracks || [])) {
        textTrack.mode = 'disabled';
      }
      return;
    }

    const subtitlesDisabled = selectedSubtitleId === SUBTITLE_OFF_ID;
    const selectedTrack = subtitlesDisabled
      ? null
      : selectedSubtitleId
      ? subtitleTracks.find((track) => track.id === selectedSubtitleId) ?? null
      : subtitleTracks.find((track) => track.isDefault) ?? null;

    for (const subtitle of subtitleTracks) {
      if (!subtitle.url) continue;
      const trackElement = document.createElement('track');
      trackElement.kind = 'subtitles';
      trackElement.id = subtitle.id;
      trackElement.label = subtitle.label;
      trackElement.srclang = subtitle.language;
      trackElement.src = subtitle.url;
      trackElement.default = subtitlesDisabled
        ? false
        : selectedTrack
          ? selectedTrack.id === subtitle.id
          : Boolean(subtitle.isDefault);
      trackElement.setAttribute('data-myanime1996-subtitle', 'managed');
      trackElement.setAttribute('data-subtitle-id', subtitle.id);
      video.appendChild(trackElement);
    }
  };

  useEffect(() => {
    latestPlaybackTimeRef.current = Math.max(0, playbackTime);
  }, [playbackTime]);

  useEffect(() => {
    const video = sourceVideoRef.current;
    if (!video) return;

    const url = activeResolvedSource?.type === 'direct' ? (activeResolvedSource.url || '').trim() : '';
    const requestHeaders = normalizeRequestHeaders(activeResolvedSource?.requestHeaders);

    // Guard against empty/blanks URLs and non-http schemes.
    if (!url || !/^https?:\/\//.test(url)) return;

    video.crossOrigin = 'anonymous';

    if (isDashUrl(url)) {
      const player = dashjs.MediaPlayer().create();
      dashRef.current = player;

      player.updateSettings({
        streaming: {
          abr: {
            autoSwitchBitrate: {
              video: true,
              audio: true,
            },
          },
        },
      });

      player.on(dashjs.MediaPlayer.events.ERROR, (event: unknown) => {
        console.warn('DASH playback error:', event);
      });

      player.on(dashjs.MediaPlayer.events.STREAM_INITIALIZED, () => {
        const resumeTime = Math.max(0, latestPlaybackTimeRef.current);
        if (resumeTime > 0.25) {
          try {
            video.currentTime = resumeTime;
          } catch {
            // Ignore seek timing failures while metadata is stabilizing.
          }
        }

        if (isPlaying || pendingAutoPlayAfterResolveRef.current) {
          void video
            .play()
            .then(() => {
              pendingAutoPlayAfterResolveRef.current = false;
            })
            .catch((err) => {
              console.warn('DASH autoplay rejected:', err);
              setPlaying(false);
            });
        }
      });

      player.initialize(video, url, false);

      return () => {
        dashRef.current = null;
        try {
          player.reset();
        } catch {
          // Ignore reset errors during teardown.
        }
      };
    }

    if (isHlsUrl(url) && Hls.isSupported()) {
      const NativeAwareLoader = createNativeAwareHlsLoaderClass(requestHeaders);
      const hls = new Hls({
        enableWorker: false,
        lowLatencyMode: false,
        debug: false,
        loader: NativeAwareLoader as unknown as typeof Hls.DefaultConfig.loader,
        xhrSetup: (xhr) => {
          xhr.withCredentials = false;
          if (!requestHeaders) return;
          for (const [name, value] of Object.entries(requestHeaders)) {
            try {
              xhr.setRequestHeader(name, value);
            } catch {
              // Ignore forbidden browser-managed header names.
            }
          }
        },
      });

      // attachMedia must happen before loadSource (hls.js API contract).
      hls.attachMedia(video);
      hls.loadSource(url);
      hlsRef.current = hls;

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
              break;
          }
        } else {
          console.warn('HLS non-fatal error:', data.type, data.details);
        }
      });

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        const resumeTime = Math.max(0, latestPlaybackTimeRef.current);
        if (resumeTime > 0.25) {
          try {
            video.currentTime = resumeTime;
          } catch {
            // Ignore seek timing failures while metadata is stabilizing.
          }
        }

        // Manifest loaded; attempt autoplay if player is in playing state.
        if (isPlaying || pendingAutoPlayAfterResolveRef.current) {
          void video
            .play()
            .then(() => {
              pendingAutoPlayAfterResolveRef.current = false;
            })
            .catch((err) => {
              console.warn('HLS autoplay rejected:', err);
              setPlaying(false);
            });
        }
      });

      return () => {
        hlsRef.current = null;
        hls.destroy();
      };
    }

    // HLS unsupported; fall back to native video src.
    if (!video.src || video.src !== url) {
      const resumeTime = Math.max(0, latestPlaybackTimeRef.current);
      video.src = url;
      if (resumeTime > 0.25) {
        const onLoadedMetadata = () => {
          try {
            video.currentTime = resumeTime;
          } catch {
            // Ignore if the browser blocks this seek moment.
          }
        };
        video.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
      }
    }
  }, [
    activeResolvedSource?.type,
    activeResolvedSource?.url,
    JSON.stringify(activeResolvedSource?.requestHeaders || {}),
    pendingAutoPlayAfterResolveRef,
    setPlaying,
    sourceVideoRef,
  ]);

  useEffect(() => {
    applySubtitleStyle();
  }, [subtitleBackgroundHighlight, subtitleDropShadow, subtitleFontColor, subtitleFontSize]);

  useEffect(() => {
    const video = sourceVideoRef.current;
    if (!video) return;

    applySubtitleTracks(video);

    const hls = hlsRef.current;
    const dash = dashRef.current;
    if (!hls && !dash) return;
    if (subtitleTracks.length === 0) return;

    const subtitlesDisabled = selectedSubtitleId === SUBTITLE_OFF_ID;

    const selectedTrack = subtitlesDisabled
      ? null
      : selectedSubtitleId
      ? subtitleTracks.find((track) => track.id === selectedSubtitleId) ?? null
      : subtitleTracks.find((track) => track.isDefault) ?? null;

    applySelectedTextTrackMode(video, selectedTrack, subtitlesDisabled);
    const deferredApply = () => applySelectedTextTrackMode(video, selectedTrack, subtitlesDisabled);
    const timeoutId = window.setTimeout(deferredApply, 180);
    const rafId = window.requestAnimationFrame(deferredApply);

    if (subtitlesDisabled && hls) {
      hls.subtitleTrack = -1;
    }

    if (selectedTrack && hls) {
      const languageNeedle = selectedTrack.language.toLowerCase();
      const subtitleTrackIndex = hls.subtitleTracks.findIndex((track) => {
        const language = String(track?.lang || '').toLowerCase();
        const name = String(track?.name || '').toLowerCase();
        return language === languageNeedle || name.includes(languageNeedle);
      });

      if (subtitleTrackIndex >= 0) {
        hls.subtitleTrack = subtitleTrackIndex;
      }
      return () => {
        window.clearTimeout(timeoutId);
        window.cancelAnimationFrame(rafId);
      };
    }

    if (selectedTrack && dash && typeof dash.getTracksFor === 'function' && typeof dash.setCurrentTrack === 'function') {
      const languageNeedle = selectedTrack.language.toLowerCase();
      const textTracks = dash.getTracksFor('text') || [];
      const track = textTracks.find((entry) => {
        const language = String(entry?.lang || '').toLowerCase();
        const label = String(entry?.labels?.[0]?.text || '').toLowerCase();
        return language === languageNeedle || label.includes(languageNeedle);
      });
      if (track) {
        dash.setCurrentTrack(track);
      }
    }

    return () => {
      window.clearTimeout(timeoutId);
      window.cancelAnimationFrame(rafId);
    };
  }, [selectedSubtitleId, sourceVideoRef, subtitleTracks]);
}
