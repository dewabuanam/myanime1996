import { getCurrentWindow } from '@tauri-apps/api/window';
import { LogicalPosition } from '@tauri-apps/api/dpi';
import { Bell, ChevronDown, ChevronLeft, ChevronRight, Languages, LogOut, Search, Settings } from 'lucide-react';
import { useEffect, useState, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useAppStore } from '../state/appStore';
import SearchDropdown from './SearchDropdown';
import AdvancedSearchModal from './AdvancedSearchModal';
import { useAnimeSearch } from '../hooks/useAnimeSearch';

const DRAG_START_DISTANCE_PX = 4;

export default function TopNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const navigationType = useNavigationType();
  const session = useAppStore((state) => state.session);
  const titleLanguage = useAppStore((state) => state.titleLanguage);
  const allowNsfw = useAppStore((state) => state.allowNsfw);
  const toggleTitleLanguage = useAppStore((state) => state.toggleTitleLanguage);
  const isProfilePopupOpen = useAppStore((state) => state.isProfilePopupOpen);
  const setProfilePopupOpen = useAppStore((state) => state.setProfilePopupOpen);
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen);
  const logout = useAppStore((state) => state.logout);
  const notifications = useAppStore((state) => state.libraryNotifications);
  const markLibraryNotificationRead = useAppStore((state) => state.markLibraryNotificationRead);
  const playLibraryNotification = useAppStore((state) => state.playLibraryNotification);
  const markAllLibraryNotificationsRead = useAppStore((state) => state.markAllLibraryNotificationsRead);
  const profileButtonRef = useRef<HTMLButtonElement | null>(null);
  const profilePopupRef = useRef<HTMLDivElement | null>(null);
  const notificationButtonRef = useRef<HTMLButtonElement | null>(null);
  const notificationPopupRef = useRef<HTMLDivElement | null>(null);
  const topSearchRef = useRef<HTMLLabelElement | null>(null);
  const [profilePopupPosition, setProfilePopupPosition] = useState({ top: 64, left: 0 });
  const [notificationPopupPosition, setNotificationPopupPosition] = useState({ top: 64, left: 0 });
  const [isNotificationPopupOpen, setNotificationPopupOpen] = useState(false);
  const [isSearchOpen, setSearchOpen] = useState(false);
  const [isAdvancedOpen, setAdvancedOpen] = useState(false);
  const [navigationStack, setNavigationStack] = useState<{ stack: string[]; index: number }>({ stack: [], index: -1 });

  const {
    query,
    setQuery,
    loading,
    recentSearches,
    clearRecent,
    previewResults,
    keywordSuggestions,
    submitCurrentQuery,
    runAdvancedSearch,
    genreBuckets,
    producerQuery,
    setProducerQuery,
    producerResults,
    selectedProducerIds,
    toggleProducer,
  } = useAnimeSearch();

  const unreadNotificationCount = notifications.filter((item) => !item.read).length;
  const canGoBack = navigationStack.index > 0;
  const canGoForward = navigationStack.index >= 0 && navigationStack.index < navigationStack.stack.length - 1;
  const topNotifications = [...notifications]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 5);
  const notificationPopupWidth = topNotifications.length === 0 ? 224 : 320;

  const updateProfilePopupPosition = () => {
    const anchor = profileButtonRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const popupWidth = 216;
    const nextLeft = Math.max(8, Math.min(rect.right - popupWidth, window.innerWidth - popupWidth - 8));
    const nextTop = Math.min(window.innerHeight - 8, rect.bottom + 8);
    setProfilePopupPosition({ top: Math.round(nextTop), left: Math.round(nextLeft) });
  };

  const updateNotificationPopupPosition = () => {
    const anchor = notificationButtonRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const nextLeft = Math.max(8, Math.min(rect.left - 6, window.innerWidth - notificationPopupWidth - 8));
    const nextTop = Math.min(window.innerHeight - 8, rect.bottom + 6);
    setNotificationPopupPosition({ top: Math.round(nextTop), left: Math.round(nextLeft) });
  };

  useEffect(() => {
    const routeEntry = `${location.pathname}${location.search}${location.hash}`;

    setNavigationStack((previous) => {
      if (previous.index < 0 || previous.stack.length === 0) {
        return { stack: [routeEntry], index: 0 };
      }

      if (navigationType === 'PUSH') {
        if (previous.stack[previous.index] === routeEntry) return previous;
        const baseStack = previous.stack.slice(0, previous.index + 1);
        return { stack: [...baseStack, routeEntry], index: baseStack.length };
      }

      if (navigationType === 'REPLACE') {
        if (previous.stack[previous.index] === routeEntry) return previous;
        const nextStack = [...previous.stack];
        nextStack[previous.index] = routeEntry;
        return { stack: nextStack, index: previous.index };
      }

      if (previous.stack[previous.index] === routeEntry) return previous;

      for (let index = previous.index - 1; index >= 0; index -= 1) {
        if (previous.stack[index] === routeEntry) {
          return { stack: previous.stack, index };
        }
      }

      for (let index = previous.index + 1; index < previous.stack.length; index += 1) {
        if (previous.stack[index] === routeEntry) {
          return { stack: previous.stack, index };
        }
      }

      const appendedStack = [...previous.stack, routeEntry];
      return { stack: appendedStack, index: appendedStack.length - 1 };
    });
  }, [location.hash, location.pathname, location.search, navigationType]);

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

  useEffect(() => {
    if (!isNotificationPopupOpen) return;

    updateNotificationPopupPosition();

    const onDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (notificationButtonRef.current?.contains(target)) return;
      if (notificationPopupRef.current?.contains(target)) return;
      setNotificationPopupOpen(false);
    };

    const onDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setNotificationPopupOpen(false);
    };

    const onViewportUpdate = () => updateNotificationPopupPosition();

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
  }, [isNotificationPopupOpen, notificationPopupWidth]);

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
      <button
        type="button"
        className="top-icon-btn retro-tooltip tooltip-down"
        aria-label="Back"
        aria-disabled={!canGoBack}
        data-tooltip="Back"
        data-tauri-drag-region="false"
        disabled={!canGoBack}
        onClick={() => {
          if (!canGoBack) return;
          navigate(-1);
        }}
      >
        <ChevronLeft size={16} />
      </button>
      <button
        type="button"
        className="top-icon-btn retro-tooltip tooltip-down"
        aria-label="Forward"
        aria-disabled={!canGoForward}
        data-tooltip="Forward"
        data-tauri-drag-region="false"
        disabled={!canGoForward}
        onClick={() => {
          if (!canGoForward) return;
          navigate(1);
        }}
      >
        <ChevronRight size={16} />
      </button>


      <label ref={topSearchRef} className="top-search ml-1 flex min-w-0 flex-1 items-center gap-2.5 rounded-full px-3 py-2" data-tauri-drag-region="false">
        <Search size={15} className="text-amberline/80" />
        <input
          type="text"
          placeholder="Search anime, movies, genres..."
          className="w-full bg-transparent text-sm text-cream/88 outline-none placeholder:text-cream/35"
          value={query}
          onFocus={() => setSearchOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setSearchOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void submitCurrentQuery().then(() => {
                const next = new URLSearchParams();
                next.set('q', query.trim());
                next.set('page', '1');
                next.set('limit', '24');
                navigate(`/search/results?${next.toString()}`);
                setSearchOpen(false);
              });
            }
          }}
        />
      </label>

      <button
        ref={notificationButtonRef}
        type="button"
        className="top-icon-btn retro-tooltip tooltip-down relative"
        aria-label="Notifications"
        data-tooltip="Notifications"
        data-tauri-drag-region="false"
        onClick={() => {
          if (!isNotificationPopupOpen) updateNotificationPopupPosition();
          setNotificationPopupOpen(!isNotificationPopupOpen);
        }}
      >
        <Bell size={15} />
        {unreadNotificationCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rust px-1 text-[9px] font-semibold text-white">
            {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
          </span>
        ) : null}
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

      {isNotificationPopupOpen &&
        createPortal(
          <div
            ref={notificationPopupRef}
            className="profile-popup profile-popup-portal p-3"
            role="menu"
            aria-label="Notifications"
            data-tauri-drag-region="false"
            style={{ top: `${notificationPopupPosition.top}px`, left: `${notificationPopupPosition.left}px`, width: `${notificationPopupWidth}px` }}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="profile-popup-eyebrow">Notifications</p>
              <button
                type="button"
                className="text-[10px] font-mono uppercase tracking-[0.12em] text-amberline"
                onClick={() => {
                  markAllLibraryNotificationsRead();
                  setNotificationPopupOpen(false);
                  navigate('/notifications');
                }}
              >
                Check All
              </button>
            </div>

            {topNotifications.length === 0 ? (
              <p className="text-xs text-cream/60">No notifications yet.</p>
            ) : (
              <div className="space-y-2">
                {topNotifications.map((item) => (
                  <div
                    key={item.id}
                    className={`group relative rounded-lg border ${item.read ? 'border-cream/12 bg-black/18' : 'border-amberline/35 bg-amberline/10'}`}
                  >
                    <button
                      type="button"
                      className="w-full p-2 pr-20 text-left"
                      onClick={() => {
                        void playLibraryNotification(item.id);
                        setNotificationPopupOpen(false);
                      }}
                    >
                      <div className="flex items-start gap-2">
                        {item.image ? <img src={item.image} alt="" className="h-12 w-9 rounded-sm object-cover" /> : null}
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-1 font-display text-[12px] uppercase text-cream">{item.title}</p>
                          <p className="line-clamp-2 text-[11px] text-cream/72">{item.message}</p>
                        </div>
                      </div>
                    </button>
                    {!item.read ? (
                      <button
                        type="button"
                        className="absolute right-2 top-2 rounded-md border border-amberline/45 bg-black/45 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.08em] text-amberline opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                        onClick={(event) => {
                          event.stopPropagation();
                          markLibraryNotificationRead(item.id);
                        }}
                      >
                        Mark Read
                      </button>
                    ) : null}
                    {!item.read ? (
                      <span className="absolute bottom-2 right-2 h-2 w-2 rounded-full bg-amberline/90" aria-hidden="true" />
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>,
          document.body,
        )}

      <SearchDropdown
        anchorRef={topSearchRef}
        open={isSearchOpen && !isAdvancedOpen}
        query={query}
        loading={loading}
        keywords={keywordSuggestions}
        results={previewResults}
        recentSearches={recentSearches}
        titleLanguage={titleLanguage}
        onClose={() => setSearchOpen(false)}
        onPickQuery={(value) => {
          setQuery(value);
          setSearchOpen(true);
        }}
        onClearRecent={() => {
          void clearRecent();
        }}
        onSubmitCurrentQuery={() => {
          void submitCurrentQuery().then(() => {
            const next = new URLSearchParams();
            next.set('q', query.trim());
            next.set('page', '1');
            next.set('limit', '24');
            navigate(`/search/results?${next.toString()}`);
            setSearchOpen(false);
          });
        }}
        onOpenAdvanced={() => {
          setAdvancedOpen(true);
          setSearchOpen(false);
        }}
      />

      <AdvancedSearchModal
        open={isAdvancedOpen}
        query={query}
        allowNsfw={allowNsfw}
        genres={genreBuckets.genres}
        themes={genreBuckets.themes}
        demographics={genreBuckets.demographics}
        explicitGenres={genreBuckets.explicitGenres}
        producerResults={producerResults}
        selectedProducerIds={selectedProducerIds}
        producerQuery={producerQuery}
        onClose={() => setAdvancedOpen(false)}
        onProducerQueryChange={setProducerQuery}
        onToggleProducer={toggleProducer}
        onSubmit={(payload) => {
          void runAdvancedSearch(payload).then(() => {
            const next = new URLSearchParams();
            next.set('q', payload.q);
            if (payload.type) next.set('type', payload.type);
            if (payload.status) next.set('status', payload.status);
            if (payload.rating) next.set('rating', payload.rating);
            if (payload.order_by) next.set('order_by', payload.order_by);
            if (payload.sort) next.set('sort', payload.sort);
            if (payload.min_score !== undefined) next.set('min_score', String(payload.min_score));
            if (payload.max_score !== undefined) next.set('max_score', String(payload.max_score));
            if (payload.genres?.length) next.set('genres', payload.genres.join(','));
            if (payload.genres_exclude?.length) next.set('genres_exclude', payload.genres_exclude.join(','));
            if (payload.producers?.length) next.set('producers', payload.producers.join(','));
            next.set('page', '1');
            next.set('limit', '24');
            navigate(`/search/results?${next.toString()}`);
            setAdvancedOpen(false);
          });
        }}
      />
    </div>
  );
}
