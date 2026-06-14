import { X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useLocation } from 'react-router-dom';

function normalizeTargetUrl(value: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch {
    return '';
  }
  return '';
}

export default function FullscreenPlayback() {
  const location = useLocation();
  const [targetUrl, setTargetUrl] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setTargetUrl(normalizeTargetUrl(params.get('target')));
  }, [location.search]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    void (async () => {
      try {
        const appWindow = getCurrentWindow();
        unlisten = await appWindow.listen<{ url?: string }>('fullscreen-player:navigate', (event) => {
          setTargetUrl(normalizeTargetUrl(event.payload?.url ?? ''));
        });
      } catch (error) {
        console.warn('Failed to subscribe fullscreen player events.', error);
      }
    })();

    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      void getCurrentWindow().close();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const closeOverlay = () => {
    void getCurrentWindow().close();
  };

  const hasTarget = useMemo(() => targetUrl.trim().length > 0, [targetUrl]);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black text-cream">
      {hasTarget ? (
        <iframe
          className="h-full w-full border-0"
          src={targetUrl}
          title="Fullscreen Playback"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <div className="grid h-full w-full place-items-center bg-black text-cream/80">
          <p className="font-mono text-xs uppercase tracking-[0.2em]">No playback URL</p>
        </div>
      )}

      <button
        type="button"
        onClick={closeOverlay}
        className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-cream/40 bg-black/75 text-cream transition hover:bg-black/90"
        aria-label="Close fullscreen playback"
      >
        <X size={16} />
      </button>
    </main>
  );
}
