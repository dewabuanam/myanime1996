import { AlertTriangle, ExternalLink, KeyRound, Settings, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { openUrl } from '@tauri-apps/plugin-opener';
import { DEFAULT_ANIMESCHEDULE_TOKEN } from '../services/animeSchedule';
import { useAppStore } from '../state/appStore';

const ANIME_SCHEDULE_HOME_URL = 'https://animeschedule.net';
const ANIME_SCHEDULE_API_URL = 'https://animeschedule.net/api';

async function openExternalUrl(url: string) {
  try {
    await openUrl(url);
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export default function AnimeScheduleRateLimitGuideModal() {
  const isOpen = useAppStore((state) => state.isAnimeScheduleRateLimitGuideOpen);
  const closeGuide = useAppStore((state) => state.closeAnimeScheduleRateLimitGuide);
  const dismissForToday = useAppStore((state) => state.dismissAnimeScheduleRateLimitGuideForToday);
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen);

  const [isDismissing, setIsDismissing] = useState(false);
  const trimmedDefaultToken = useMemo(() => DEFAULT_ANIMESCHEDULE_TOKEN.trim(), []);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeGuide();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeGuide, isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[240]">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-[1px]"
        aria-label="Close AnimeSchedule rate-limit guide"
        onClick={closeGuide}
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-label="AnimeSchedule rate-limit guide"
        className="absolute left-1/2 top-1/2 w-[min(56rem,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-amberline/35 bg-[#110d0a]/95 text-cream shadow-[0_22px_56px_rgba(0,0,0,0.56)]"
      >
        <header className="flex items-start justify-between gap-4 border-b border-amberline/20 bg-gradient-to-r from-amberline/15 via-rust/12 to-transparent px-5 py-4">
          <div className="space-y-1">
            <p className="font-mono text-[11px] uppercase tracking-[0.13em] text-amberline/85">Schedule API Guide</p>
            <h2 className="flex items-center gap-2 font-display text-2xl uppercase tracking-[0.04em] text-amberline">
              <AlertTriangle size={20} />
              AnimeSchedule Rate Limit Detected
            </h2>
            <p className="text-sm text-cream/80">This happens when too many requests hit AnimeSchedule in a short window or when shared tokens get overloaded.</p>
          </div>

          <button
            type="button"
            className="rounded-lg border border-cream/20 bg-black/25 p-2 text-cream/80 transition-colors hover:border-cream/45 hover:text-cream"
            onClick={closeGuide}
            aria-label="Close guide"
          >
            <X size={16} />
          </button>
        </header>

        <div className="max-h-[72vh] space-y-5 overflow-y-auto px-5 py-4">
          <section className="rounded-xl border border-cream/15 bg-black/25 p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.13em] text-amberline/80">Why It Happened</p>
            <ul className="mt-2 space-y-1.5 text-sm text-cream/80">
              <li>1. The AnimeSchedule API temporarily blocked requests with HTTP 429 (Too Many Requests).</li>
              <li>2. This can happen if your app sends bursts or uses a shared/default token with high traffic.</li>
              <li>3. The app will still try fallback sources, but updating your own token improves reliability.</li>
            </ul>
          </section>

          <section className="rounded-xl border border-cream/15 bg-black/25 p-4">
            <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.13em] text-amberline/80">
              <KeyRound size={14} />
              Step-by-Step: Generate and Use Your API Token
            </p>
            <ol className="mt-2 space-y-2 text-sm text-cream/82">
              <li>1. Open AnimeSchedule website and log in. If you do not have an account yet, create one first.</li>
              <li>2. Go to the API/account area and generate your personal API token.</li>
              <li>3. Copy the generated token.</li>
              <li>4. In this app, open Settings {'->'} Base Source.</li>
              <li>5. Find AnimeSchedule API Token, paste your token, then click Save Token.</li>
              <li>6. Reload shelves or wait for refresh; rate-limit issues should happen less often.</li>
            </ol>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg border border-cream/25 bg-black/30 px-3 py-2 text-xs uppercase tracking-[0.11em] text-cream/90 transition-colors hover:border-amberline/55 hover:text-amberline"
                onClick={() => void openExternalUrl(ANIME_SCHEDULE_HOME_URL)}
              >
                <ExternalLink size={13} />
                Open AnimeSchedule
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg border border-cream/25 bg-black/30 px-3 py-2 text-xs uppercase tracking-[0.11em] text-cream/90 transition-colors hover:border-amberline/55 hover:text-amberline"
                onClick={() => void openExternalUrl(ANIME_SCHEDULE_API_URL)}
              >
                <ExternalLink size={13} />
                Open API Page
              </button>
            </div>
          </section>

          <section className="rounded-xl border border-cream/15 bg-black/25 p-4 text-sm text-cream/80">
            <p className="font-mono text-[11px] uppercase tracking-[0.13em] text-amberline/80">Default Token Reference</p>
            <p className="mt-2">Built-in default token (shared fallback):</p>
            <p className="mt-1 break-all rounded-lg border border-cream/15 bg-black/35 px-3 py-2 font-mono text-[12px] text-amberline/90">
              {trimmedDefaultToken}
            </p>
            <p className="mt-2 text-cream/70">Tip: You can keep using this, but your own token is usually more stable during busy periods.</p>
          </section>
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-amberline/20 px-5 py-4">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-cream/25 bg-black/30 px-3 py-2 text-xs uppercase tracking-[0.11em] text-cream/90 transition-colors hover:border-cream/45"
            onClick={() => {
              closeGuide();
              setSettingsOpen(true);
            }}
          >
            <Settings size={13} />
            Open Settings
          </button>
          <button
            type="button"
            className="rounded-lg border border-cream/25 bg-black/30 px-3 py-2 text-xs uppercase tracking-[0.11em] text-cream/90 transition-colors hover:border-cream/45"
            onClick={closeGuide}
          >
            Close
          </button>
          <button
            type="button"
            className="rounded-lg border border-amberline/45 bg-amberline/15 px-3 py-2 text-xs uppercase tracking-[0.11em] text-amberline transition-colors hover:bg-amberline/20 disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isDismissing}
            onClick={() => {
              setIsDismissing(true);
              void dismissForToday().finally(() => {
                setIsDismissing(false);
              });
            }}
          >
            {isDismissing ? 'Saving...' : "Don't Show This For Today"}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
