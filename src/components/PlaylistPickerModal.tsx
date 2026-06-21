import { Check, Plus, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type PlaylistPickerModalProps = {
  open: boolean;
  title: string;
  subjectImage?: string;
  anchorElement?: HTMLElement | null;
  playlists: Array<{
    id: string;
    name: string;
    image: string;
    type: 'anime' | 'video';
  }>;
  selectedPlaylistIds: string[];
  onClose: () => void;
  onConfirm: (playlistIds: string[]) => void;
  onCreatePlaylist: () => void;
};

export default function PlaylistPickerModal({
  open,
  title,
  subjectImage,
  anchorElement,
  playlists,
  selectedPlaylistIds,
  onClose,
  onConfirm,
  onCreatePlaylist,
}: PlaylistPickerModalProps) {
  const popupRef = useRef<HTMLElement | null>(null);
  const [position, setPosition] = useState({ top: 120, left: 120, width: 260 });
  const [isPositionReady, setPositionReady] = useState(false);
  const [localSelection, setLocalSelection] = useState<string[]>(selectedPlaylistIds);

  useEffect(() => {
    if (!open) return;
    setLocalSelection(selectedPlaylistIds);
  }, [open, selectedPlaylistIds]);

  const updatePosition = useCallback(() => {
    const popupWidth = 260;
    const popupHeightEstimate = 360;

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
        className="pointer-events-auto max-w-none border border-amberline/45 bg-[#0f0b09] p-2.5 shadow-[0_20px_56px_rgba(0,0,0,0.68)]"
        role="dialog"
        aria-modal="false"
        aria-label={title ? `Add ${title} to playlist` : 'Add to playlist'}
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
      >
        <div className="mb-2 flex items-start justify-between gap-2 border-b border-cream/12 pb-1.5">
          <div className="min-w-0 flex items-start gap-2">
            {subjectImage ? <img src={subjectImage} alt="" className="h-10 w-8 border border-cream/20 object-cover" /> : null}
            <div className="min-w-0">
              <p className="font-display text-[12px] uppercase tracking-[0.08em] text-cream">Add To Playlist</p>
              {title ? <p className="mt-0.5 line-clamp-1 font-mono text-[9px] uppercase tracking-[0.07em] text-cream/62">{title}</p> : null}
            </div>
          </div>
          <button type="button" className="vhs-button-ghost h-6 w-6 shrink-0 p-0" onClick={onClose} aria-label="Close">
            <X size={12} />
          </button>
        </div>

        <div className="mb-2 flex items-center justify-end">
          <button
            type="button"
            className="vhs-button-ghost inline-flex items-center gap-1.5 px-2 py-1 text-[10px]"
            onClick={() => onCreatePlaylist()}
          >
            <Plus size={11} />
            New Playlist
          </button>
        </div>

        <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
          {playlists.length ? playlists.map((playlist) => {
            const selected = localSelection.includes(playlist.id);
            return (
              <button
                key={playlist.id}
                type="button"
                className={`w-full border px-2 py-1.5 text-left transition-colors ${selected ? 'border-amberline/50 bg-amberline/12' : 'border-cream/12 bg-black/18 hover:border-cream/28'}`}
                onClick={() => {
                  setLocalSelection((current) =>
                    current.includes(playlist.id)
                      ? current.filter((id) => id !== playlist.id)
                      : [...current, playlist.id],
                  );
                }}
              >
                <div className="flex items-center gap-2">
                  <img src={playlist.image || '/assets/logo.png'} alt="" className="h-9 w-9 rounded-sm object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-cream/92">{playlist.name}</p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-cream/55">{playlist.type}</p>
                  </div>
                  {selected ? <Check size={12} className="text-amberline" /> : null}
                </div>
              </button>
            );
          }) : (
            <p className="py-4 text-center font-mono text-[10px] uppercase tracking-[0.1em] text-cream/50">
              No playlists yet.
            </p>
          )}
        </div>

        <div className="mt-2 flex items-center justify-end gap-2 border-t border-cream/12 pt-2">
          <button type="button" className="vhs-button-ghost px-2 py-1 text-[10px]" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="vhs-button px-2 py-1 text-[10px]"
            onClick={() => {
              onConfirm(localSelection);
              onClose();
            }}
          >
            Add
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
