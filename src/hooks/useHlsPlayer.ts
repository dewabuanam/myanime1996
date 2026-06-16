import Hls from 'hls.js';
import { useEffect, useRef, type MutableRefObject, type RefObject } from 'react';
import type { ResolvedSource } from '../types/plugin';

type UseHlsPlayerOptions = {
  sourceVideoRef: RefObject<HTMLVideoElement>;
  activeResolvedSource: ResolvedSource | null;
  isPlaying: boolean;
  playbackTime: number;
  pendingAutoPlayAfterResolveRef: MutableRefObject<boolean>;
  setPlaying: (playing: boolean) => void;
};

export function useHlsPlayer({
  sourceVideoRef,
  activeResolvedSource,
  isPlaying,
  playbackTime,
  pendingAutoPlayAfterResolveRef,
  setPlaying,
}: UseHlsPlayerOptions) {
  const latestPlaybackTimeRef = useRef(playbackTime);

  useEffect(() => {
    latestPlaybackTimeRef.current = Math.max(0, playbackTime);
  }, [playbackTime]);

  useEffect(() => {
    const video = sourceVideoRef.current;
    if (!video) return;

    const url = activeResolvedSource?.type === 'direct' ? (activeResolvedSource.url || '').trim() : '';

    // Guard against empty/blanks URLs and non-http schemes.
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

      // attachMedia must happen before loadSource (hls.js API contract).
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
  }, [activeResolvedSource?.type, activeResolvedSource?.url, pendingAutoPlayAfterResolveRef, setPlaying, sourceVideoRef]);
}
