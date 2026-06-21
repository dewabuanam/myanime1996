import { X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { LibraryStatus } from '../types/anime';

type LibraryStatusPickerModalProps = {
  open: boolean;
  title: string;
  initialStatus: LibraryStatus | null;
  onClose: () => void;
  onConfirm: (status: LibraryStatus) => void;
  onRemove?: () => void;
  anchorElement?: HTMLElement | null;
};

const LIBRARY_STATUS_OPTIONS: Array<{ value: LibraryStatus; label: string; description: string }> = [
  { value: 'watching', label: 'Watching', description: 'Track and receive updates for currently watched anime.' },
  { value: 'plan-to-watch', label: 'Plan to Watch', description: 'Save for later and start when ready.' },
  { value: 'on-hold', label: 'On-Hold', description: 'Paused for now, continue anytime.' },
  { value: 'dropped', label: 'Dropped', description: 'Stopped watching this title.' },
  { value: 'completed', label: 'Completed', description: 'Finished watching all available episodes.' },
];

export default function LibraryStatusPickerModal({
  open,
  title,
  initialStatus,
  onClose,
  onConfirm,
  onRemove,
  anchorElement,
}: LibraryStatusPickerModalProps) {
  const popupRef = useRef<HTMLElement | null>(null);
  const [position, setPosition] = useState({ top: 120, left: 120, width: 220 });
  const [isPositionReady, setPositionReady] = useState(false);

  const updatePosition = useCallback(() => {
    const popupWidth = 220;
    const popupHeightEstimate = 260;

    if (!anchorElement) {
      const centeredLeft = Math.max(8, Math.round((window.innerWidth - popupWidth) / 2));
      const centeredTop = Math.max(8, Math.round((window.innerHeight - popupHeightEstimate) / 2));
      setPosition({ top: centeredTop, left: centeredLeft, width: popupWidth });
      return;
    }

    const rect = anchorElement.getBoundingClientRect();
    const preferredRight = rect.right + 10;
    const canOpenRight = preferredRight + popupWidth <= window.innerWidth - 8;
    const left = canOpenRight ? preferredRight : Math.max(8, rect.left - popupWidth - 10);
    const top = Math.max(8, Math.min(rect.top - 4, window.innerHeight - popupHeightEstimate - 8));

    setPosition({ top: Math.round(top), left: Math.round(left), width: popupWidth });
  }, [anchorElement]);

  useLayoutEffect(() => {
    if (!open) {
      setPositionReady(false);
      return;
    }
    updatePosition();
    setPositionReady(true);
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      onClose();
    };
    const onDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (popupRef.current?.contains(target)) return;
      if (anchorElement?.contains(target)) return;
      onClose();
    };
    const onViewportUpdate = () => updatePosition();

    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onDocumentMouseDown);
    window.addEventListener('resize', onViewportUpdate);
    window.addEventListener('scroll', onViewportUpdate, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onDocumentMouseDown);
      window.removeEventListener('resize', onViewportUpdate);
      window.removeEventListener('scroll', onViewportUpdate, true);
    };
  }, [anchorElement, onClose, open, updatePosition]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0" style={{ zIndex: 2147483646 }} aria-hidden={false}>
      <section
        ref={popupRef}
        className="pointer-events-auto max-w-none rounded-xl border border-amberline/45 bg-[#0f0b09] p-2.5 shadow-[0_20px_56px_rgba(0,0,0,0.68)]"
        role="dialog"
        aria-modal="false"
        aria-label={title ? `Add ${title} to library` : 'Add to library'}
        style={{
          top: `${position.top}px`,
          left: `${position.left}px`,
          width: `${position.width}px`,
          position: 'fixed',
          margin: 0,
          zIndex: 2147483647,
          backgroundColor: '#0f0b09',
          backgroundImage: 'none',
          opacity: 1,
          visibility: isPositionReady ? 'visible' : 'hidden',
        }}
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="mb-1 flex justify-end">
          <button type="button" className="vhs-button-ghost h-6 w-6 p-0" onClick={onClose} aria-label="Close">
            <X size={12} />
          </button>
        </div>
        <div className="space-y-1">
          {LIBRARY_STATUS_OPTIONS.map((option) => {
            const active = initialStatus === option.value;
            const rowBackgroundColor = active ? '#2a1c12' : '#16110f';
            return (
              <button
                key={option.value}
                type="button"
                className={`relative z-[1] w-full cursor-pointer rounded-lg border px-2.5 py-2 text-left transition-colors ${
                  active ? 'border-amberline/45' : 'border-cream/12 hover:border-cream/28'
                }`}
                style={{ backgroundColor: rowBackgroundColor, opacity: 1 }}
                onClick={() => {
                  onConfirm(option.value);
                  onClose();
                }}
              >
                <p className="font-display text-[12px] uppercase tracking-[0.08em] text-cream">{option.label}</p>
              </button>
            );
          })}
        </div>
      </section>
    </div>,
    document.body,
  );
}
