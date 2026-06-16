import { getCurrentWindow } from '@tauri-apps/api/window';
import { LogicalPosition } from '@tauri-apps/api/dpi';
import { Bell, ChevronDown, ChevronLeft, ChevronRight, Languages, LogOut, Search, Settings } from 'lucide-react';
import { useEffect, useState, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '../state/appStore';

const DRAG_START_DISTANCE_PX = 4;

export default function TopNavigation() {
  const session = useAppStore((state) => state.session);
  const titleLanguage = useAppStore((state) => state.titleLanguage);
  const toggleTitleLanguage = useAppStore((state) => state.toggleTitleLanguage);
  const isProfilePopupOpen = useAppStore((state) => state.isProfilePopupOpen);
  const setProfilePopupOpen = useAppStore((state) => state.setProfilePopupOpen);
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen);
  const logout = useAppStore((state) => state.logout);
  const profileButtonRef = useRef<HTMLButtonElement | null>(null);
  const profilePopupRef = useRef<HTMLDivElement | null>(null);
  const [profilePopupPosition, setProfilePopupPosition] = useState({ top: 64, left: 0 });

  const updateProfilePopupPosition = () => {
    const anchor = profileButtonRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const popupWidth = 216;
    const nextLeft = Math.max(8, Math.min(rect.right - popupWidth, window.innerWidth - popupWidth - 8));
    const nextTop = Math.min(window.innerHeight - 8, rect.bottom + 8);
    setProfilePopupPosition({ top: Math.round(nextTop), left: Math.round(nextLeft) });
  };

  useEffect(() => {
    if (!isProfilePopupOpen) return;

    updateProfilePopupPosition();

    const onDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (profileButtonRef.current?.contains(target)) return;
      if (profilePopupRef.current?.contains(target)) return;
      setProfilePopupOpen(false);
    };

    const onDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setProfilePopupOpen(false);
    };

    const onViewportUpdate = () => updateProfilePopupPosition();

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
  }, [isProfilePopupOpen, setProfilePopupOpen]);

  const startWindowDragFromPointer = async (pointer: Pick<MouseEvent, 'clientX' | 'clientY' | 'screenX' | 'screenY'>) => {
    try {
      const appWindow = getCurrentWindow();
      const isMaximized = await appWindow.isMaximized();
      if (isMaximized) {
        const ratioX = Math.min(Math.max(pointer.clientX / Math.max(window.innerWidth, 1), 0), 1);
        const gripOffsetY = Math.min(Math.max(pointer.clientY, 6), 34);
        await appWindow.toggleMaximize();

        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        });

        const restoredWidth = Math.max(window.innerWidth, 1);
        const offsetX = Math.round(restoredWidth * ratioX);
        const nextX = Math.round(pointer.screenX - offsetX);
        const nextY = Math.round(pointer.screenY - gripOffsetY);
        await appWindow.setPosition(new LogicalPosition(nextX, nextY));
      }
      await appWindow.startDragging();
    } catch (error) {
      console.warn('Top bar drag failed.', error);
    }
  };

  const handleTopBarMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;

    const target = event.target as HTMLElement;
    if (target.closest('[data-tauri-drag-region="false"]')) return;

    event.preventDefault();

    const startX = event.clientX;
    const startY = event.clientY;
    let dragStarted = false;

    const cleanup = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    const onMouseMove = (moveEvent: MouseEvent) => {
      if ((moveEvent.buttons & 1) === 0) {
        cleanup();
        return;
      }

      const movedX = Math.abs(moveEvent.clientX - startX);
      const movedY = Math.abs(moveEvent.clientY - startY);
      if (dragStarted || Math.max(movedX, movedY) < DRAG_START_DISTANCE_PX) return;

      dragStarted = true;
      cleanup();
      void startWindowDragFromPointer(moveEvent);
    };

    const onMouseUp = () => {
      cleanup();
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleTopBarDoubleClick = async (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-tauri-drag-region="false"]')) return;

    try {
      const appWindow = getCurrentWindow();
      await appWindow.toggleMaximize();
    } catch (error) {
      console.warn('Top bar double-click maximize failed.', error);
    }
  };

  return (
    <div
      className="top-nav z-40 flex h-14 items-center gap-3 px-6"
      onMouseDown={(event) => void handleTopBarMouseDown(event)}
      onDoubleClick={(event) => void handleTopBarDoubleClick(event)}
    >
      <button
        type="button"
        className="top-icon-btn retro-tooltip tooltip-down"
        aria-label="Settings"
        data-tooltip="Settings"
        data-tauri-drag-region="false"
        onClick={() => {
          setProfilePopupOpen(false);
          setSettingsOpen(true);
        }}
      >
        <Settings size={16} />
      </button>
      <button type="button" className="top-icon-btn retro-tooltip tooltip-down" aria-label="Back" data-tooltip="Back" data-tauri-drag-region="false">
        <ChevronLeft size={16} />
      </button>
      <button type="button" className="top-icon-btn retro-tooltip tooltip-down" aria-label="Forward" data-tooltip="Forward" data-tauri-drag-region="false">
        <ChevronRight size={16} />
      </button>

      <label className="top-search ml-1 flex min-w-0 flex-1 items-center gap-2.5 rounded-full px-3 py-2" data-tauri-drag-region="false">
        <Search size={15} className="text-amberline/80" />
        <input
          type="text"
          placeholder="Search anime, movies, genres..."
          className="w-full bg-transparent text-sm text-cream/88 outline-none placeholder:text-cream/35"
        />
      </label>

      <button type="button" className="top-icon-btn retro-tooltip tooltip-down" aria-label="Notifications" data-tooltip="Notifications" data-tauri-drag-region="false">
        <Bell size={15} />
      </button>

      <button
        type="button"
        className="top-icon-btn top-language-btn retro-tooltip tooltip-down"
        aria-label="Toggle title language"
        data-tooltip={`Title Language: ${titleLanguage === 'english' ? 'English' : 'Romaji'}`}
        data-tauri-drag-region="false"
        onClick={() => void toggleTitleLanguage()}
      >
        <Languages size={15} />
      </button>

      <button
        ref={profileButtonRef}
        type="button"
        className="top-profile-btn retro-tooltip tooltip-down tooltip-left"
        aria-label="Profile menu"
        aria-expanded={isProfilePopupOpen}
        data-tooltip="Profile Menu"
        data-tauri-drag-region="false"
        onClick={() => {
          if (!isProfilePopupOpen) updateProfilePopupPosition();
          setProfilePopupOpen(!isProfilePopupOpen);
        }}
      >
        <img src="/assets/logo.png" alt="User avatar" className="h-7 w-7 rounded-full object-cover" />
        <ChevronDown size={14} className={`text-cream/70 transition-transform ${isProfilePopupOpen ? 'rotate-180' : ''}`} />
      </button>
      {isProfilePopupOpen &&
        createPortal(
          <div
            ref={profilePopupRef}
            className="profile-popup profile-popup-portal"
            role="menu"
            aria-label="Profile options"
            data-tauri-drag-region="false"
            style={{ top: `${profilePopupPosition.top}px`, left: `${profilePopupPosition.left}px` }}
          >
            <p className="profile-popup-eyebrow">Profile</p>
            <p className="profile-popup-name">{session?.mode === 'email' ? session.email ?? 'Local user' : 'Guest Session'}</p>
            <p className="profile-popup-meta">{session?.id ? `ID ${session.id.slice(0, 10)}` : 'Offline mode'}</p>
            <button
              type="button"
              className="profile-popup-logout retro-tooltip tooltip-left"
              data-tauri-drag-region="false"
              data-tooltip="Log Out"
              onClick={() => {
                setProfilePopupOpen(false);
                void logout();
              }}
            >
              <LogOut size={13} />
              Log out
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
