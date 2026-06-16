import Hls from 'hls.js';
import { useEffect, type MutableRefObject, type RefObject } from 'react';
import type { ResolvedSource } from '../types/plugin';

type UseHlsPlayerOptions = {
  sourceVideoRef: RefObject<HTMLVideoElement>;
  activeResolvedSource: ResolvedSource | null;
  isPlaying: boolean;
  pendingAutoPlayAfterResolveRef: MutableRefObject<boolean>;
  setPlaying: (playing: boolean) => void;
};

export function useHlsPlayer({
  sourceVideoRef,
  activeResolvedSource,
  isPlaying,
  pendingAutoPlayAfterResolveRef,
  setPlaying,
}: UseHlsPlayerOptions) {
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
      video.src = url;
    }
  }, [activeResolvedSource?.type, activeResolvedSource?.url, isPlaying, pendingAutoPlayAfterResolveRef, setPlaying, sourceVideoRef]);
}
