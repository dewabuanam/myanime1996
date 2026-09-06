import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronLeft, ChevronRight, Download, Minus, Plus, RotateCcw, X } from 'lucide-react';

// The poster preview grew zoom, pan, a save action and stepping through a set, and the
// pictures sections want exactly the same behaviour. Everything opens this.

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

export type LightboxItem = {
  src: string;
  /** Names the image for screen readers and seeds the suggested save filename. */
  label: string;
};

type ImageLightboxProps = {
  /** The whole set being previewed. A single entry hides the prev/next controls. */
  items: LightboxItem[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
};

type SaveState = 'idle' | 'saving' | 'saved' | 'failed';

function toSafeFileName(label: string, sourceUrl: string) {
  const extensionMatch = sourceUrl.split('?')[0].match(/\.(jpe?g|png|webp|gif|avif)$/i);
  const extension = extensionMatch ? extensionMatch[0].toLowerCase() : '.jpg';
  const base = label
    .trim()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .toLowerCase();
  return `${base || 'image'}${extension}`;
}

export default function ImageLightbox({ items, index, onIndexChange, onClose }: ImageLightboxProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setDragging] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const saveResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const total = items.length;
  const safeIndex = total > 0 ? Math.min(Math.max(index, 0), total - 1) : 0;
  const current = items[safeIndex];
  const canNavigate = total > 1;

  // Stepping wraps, so a set can be walked round in either direction without stopping
  // at the ends.
  const step = useCallback(
    (delta: number) => {
      if (!canNavigate) return;
      onIndexChange((safeIndex + delta + total) % total);
    },
    [canNavigate, onIndexChange, safeIndex, total],
  );

  // A new image starts fresh rather than inheriting the last one's zoom and offset.
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setSaveState('idle');
  }, [current?.src]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        step(-1);
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        step(1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, step]);

  useEffect(() => {
    return () => {
      if (saveResetTimerRef.current) clearTimeout(saveResetTimerRef.current);
    };
  }, []);

  const adjustZoom = (delta: number) => {
    setZoom((current) => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number((current + delta).toFixed(2))));
      if (next <= MIN_ZOOM) setPan({ x: 0, y: 0 });
      return next;
    });
  };

  const handleDragStart = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (zoom <= MIN_ZOOM) return;
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const startPan = { ...pan };
    setDragging(true);

    const onMove = (moveEvent: MouseEvent) => {
      setPan({
        x: startPan.x + (moveEvent.clientX - startX),
        y: startPan.y + (moveEvent.clientY - startY),
      });
    };
    const onUp = () => {
      setDragging(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const flashSaveState = (state: SaveState) => {
    setSaveState(state);
    if (saveResetTimerRef.current) clearTimeout(saveResetTimerRef.current);
    saveResetTimerRef.current = setTimeout(() => setSaveState('idle'), 2400);
  };

  const handleSave = async () => {
    if (saveState === 'saving' || !current) return;
    setSaveState('saving');

    try {
      const [{ save }, { writeFile }] = await Promise.all([
        import('@tauri-apps/plugin-dialog'),
        import('@tauri-apps/plugin-fs'),
      ]);

      const suggestedName = toSafeFileName(current.label, current.src);
      const targetPath = await save({
        defaultPath: suggestedName,
        filters: [{ name: 'Image', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }],
      });

      // A cancelled picker is not a failure, so the button goes quiet rather than red.
      if (!targetPath) {
        setSaveState('idle');
        return;
      }

      const response = await fetch(current.src);
      if (!response.ok) throw new Error(`Image request failed with ${response.status}`);

      await writeFile(targetPath, new Uint8Array(await response.arrayBuffer()));
      flashSaveState('saved');
    } catch (error) {
      console.warn('[ImageLightbox] Failed to save image:', error);
      flashSaveState('failed');
    }
  };

  if (!current) return null;

  const saveTooltip =
    saveState === 'saving'
      ? 'Saving image...'
      : saveState === 'saved'
        ? 'Image saved'
        : saveState === 'failed'
          ? 'Could not save image'
          : 'Save image';

  return createPortal(
    <div
      className="fixed inset-0 z-[220] bg-black/62 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={`${current.label} fullscreen preview`}
      onClick={onClose}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,0,0,0.08)_0%,rgba(0,0,0,0.42)_72%,rgba(0,0,0,0.62)_100%)]" />

      <div className="absolute right-3 top-3 z-[3] flex items-center gap-1.5">
        <button
          type="button"
          className={`vhs-button-ghost p-2 retro-tooltip ${saveState === 'saved' ? 'text-amberline' : ''} ${saveState === 'failed' ? 'text-rust' : ''}`}
          aria-label={saveTooltip}
          data-tooltip={saveTooltip}
          disabled={saveState === 'saving'}
          onClick={(event) => {
            event.stopPropagation();
            void handleSave();
          }}
        >
          {saveState === 'saved' ? <Check size={14} /> : <Download size={14} />}
        </button>
        <button
          type="button"
          className="vhs-button-ghost p-2"
          aria-label="Zoom out"
          onClick={(event) => {
            event.stopPropagation();
            adjustZoom(-0.2);
          }}
        >
          <Minus size={14} />
        </button>
        <button
          type="button"
          className="vhs-button-ghost p-2"
          aria-label="Reset zoom"
          onClick={(event) => {
            event.stopPropagation();
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
        >
          <RotateCcw size={14} />
        </button>
        <button
          type="button"
          className="vhs-button-ghost p-2"
          aria-label="Zoom in"
          onClick={(event) => {
            event.stopPropagation();
            adjustZoom(0.2);
          }}
        >
          <Plus size={14} />
        </button>
        <button
          type="button"
          className="vhs-button-ghost p-2"
          aria-label="Close preview"
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
        >
          <X size={14} />
        </button>
      </div>

      {canNavigate ? (
        <>
          <button
            type="button"
            className="image-lightbox-step image-lightbox-step-prev"
            aria-label="Previous image"
            onClick={(event) => {
              event.stopPropagation();
              step(-1);
            }}
          >
            <ChevronLeft size={22} />
          </button>
          <button
            type="button"
            className="image-lightbox-step image-lightbox-step-next"
            aria-label="Next image"
            onClick={(event) => {
              event.stopPropagation();
              step(1);
            }}
          >
            <ChevronRight size={22} />
          </button>
        </>
      ) : null}

      <div
        className={`flex h-full w-full items-center justify-center p-5 ${zoom > MIN_ZOOM ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'}`}
        onClick={(event) => event.stopPropagation()}
        onMouseDown={handleDragStart}
        onWheel={(event) => {
          event.preventDefault();
          adjustZoom(event.deltaY < 0 ? 0.15 : -0.15);
        }}
      >
        <img
          src={current.src}
          alt={`${current.label} fullscreen`}
          draggable={false}
          className="max-h-[92vh] max-w-[92vw] border border-amberline/45 object-contain shadow-[0_16px_42px_rgba(0,0,0,0.6)]"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: 'center center' }}
        />
      </div>

      <p className="pointer-events-none absolute bottom-3 left-1/2 z-[3] -translate-x-1/2 border border-amberline/35 bg-black/60 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-cream/84">
        {canNavigate ? `${safeIndex + 1} / ${total} · ` : ''}Zoom {Math.round(zoom * 100)}%
        {canNavigate ? ' · Arrow keys to step' : ''} · Mouse wheel, buttons, drag to pan
      </p>
    </div>,
    document.body,
  );
}
