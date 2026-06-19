import { ChevronDown, Clapperboard, ListFilter } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  HERO_SEE_ALL_SHORTCUTS,
  type SeeAllSort,
  type SeeAllType,
} from '../utils/seeAll';

type HeroSeeAllMenuProps = {
  onNavigate: (type: SeeAllType, sort?: SeeAllSort) => void;
};

export default function HeroSeeAllMenu({ onNavigate }: HeroSeeAllMenuProps) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 96, left: 0 });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const updateMenuPosition = () => {
    const anchor = triggerRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const menuWidth = 300;
    const nextLeft = Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8));
    const nextTop = Math.min(window.innerHeight - 8, rect.bottom + 8);
    setMenuPosition({ top: Math.round(nextTop), left: Math.round(nextLeft) });
  };

  useEffect(() => {
    if (!open) return;

    updateMenuPosition();

    const onDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };

    const onDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
    };

    const onViewportUpdate = () => updateMenuPosition();

    document.addEventListener('mousedown', onDocumentMouseDown);
    window.addEventListener('keydown', onDocumentKeyDown);
    window.addEventListener('resize', onViewportUpdate);
    window.addEventListener('scroll', onViewportUpdate, true);

    return () => {
      document.removeEventListener('mousedown', onDocumentMouseDown);
      window.removeEventListener('keydown', onDocumentKeyDown);
      window.removeEventListener('resize', onViewportUpdate);
      window.removeEventListener('scroll', onViewportUpdate, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="hero-seeall-menu-trigger retro-tooltip tooltip-down tooltip-left"
        data-tooltip="Open Shelf Menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          if (!open) updateMenuPosition();
          setOpen(!open);
        }}
      >
        <ListFilter size={15} />
        Menu
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open
        ? createPortal(
            <div
              ref={menuRef}
              className="hero-seeall-menu"
              role="menu"
              aria-label="Hero see all shortcuts"
              style={{ top: `${menuPosition.top}px`, left: `${menuPosition.left}px` }}
            >
              <p className="hero-seeall-menu-eyebrow">Browse Shelves</p>
              <div className="hero-seeall-menu-grid">
                {HERO_SEE_ALL_SHORTCUTS.map((entry) => (
                  <button
                    key={entry.type}
                    type="button"
                    className="hero-seeall-menu-link"
                    role="menuitem"
                    onClick={() => {
                      setOpen(false);
                      onNavigate(entry.type);
                    }}
                  >
                    <Clapperboard size={13} />
                    {entry.label}
                  </button>
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
