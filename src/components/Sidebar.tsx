import { History, Home, Library, ListMusic, Plus } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useAppStore } from '../state/appStore';
import WindowControls from './WindowControls';

const navItems = [
  { to: '/home', label: 'Home', icon: Home },
  { to: '/library', label: 'Library', icon: Library },
  { to: '/history', label: 'History', icon: History },
];

const playlistEntries = [
  { id: '90s', name: '90s Classics', count: 42 },
  { id: 'movie-night', name: 'Movie Night', count: 31 },
  { id: 'mecha', name: 'Mecha Collection', count: 28 },
  { id: 'chill', name: 'Chill Anime', count: 35 },
  { id: 'op-ed', name: 'Opening & Ending', count: 64 },
  { id: 'favorites', name: 'All Time Favorites', count: 102 },
];

export default function Sidebar() {
  const playlists = useAppStore((state) => state.playlists);
  const isSidebarCompact = useAppStore((state) => state.isSidebarCompact);
  const isRightPanelFullpage = useAppStore((state) => state.isRightPanelFullpage);
  const toggleSidebarCompact = useAppStore((state) => state.toggleSidebarCompact);
  const sidebarPlaylists = playlists.length
    ? playlists.map((playlist) => ({ id: playlist.id, name: playlist.name, count: playlist.animeIds.length }))
    : playlistEntries;

  return (
    <aside className="vhs-panel jb-sidebar flex h-full min-h-0 flex-col p-3">
      <div className={`sidebar-drag-zone flex items-center ${isSidebarCompact ? 'gap-3 px-1' : 'gap-2'}`}>
        {!isRightPanelFullpage ? <WindowControls /> : null}
        <div className="h-full flex-1" data-tauri-drag-region />
      </div>
      {!isSidebarCompact && (
        <div className="mt-3 p-2.5" data-tauri-drag-region>
          <img src="/assets/logo.png" alt="My Anime 1996" className="logo-glow mx-auto h-auto w-full" />
        </div>
      )}

      {isSidebarCompact ? (
        <div className="mt-4 flex min-h-0 flex-1 flex-col pb-2">
          <nav className="jb-sidebar-nav space-y-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={`${item.label}-${item.to}`}
                  to={item.to}
                  className={({ isActive }) =>
                    `jb-sidebar-item retro-tooltip tooltip-down justify-center px-0 ${isActive ? 'is-active' : ''}`
                  }
                  data-tooltip={item.label}
                >
                  <Icon size={17} />
                </NavLink>
              );
            })}
          </nav>

          <section className="jb-sidebar-rail mt-3 flex flex-col items-center gap-2">
            <button
              type="button"
              className="jb-rail-btn jb-rail-btn-add retro-tooltip tooltip-right h-10 w-10"
              aria-label="Add playlist"
              data-tooltip="Add Playlist"
            >
              <Plus size={15} />
            </button>

            {sidebarPlaylists.map((playlist) => (
              <button
                key={playlist.id}
                type="button"
                className="jb-rail-btn retro-tooltip tooltip-right h-10 w-10 text-cream/75 transition hover:text-cream focus:outline-none focus-visible:outline-none"
                data-tooltip={`${playlist.name} (${playlist.count})`}
                aria-label={playlist.name}
              >
                <span className="block h-full w-full overflow-hidden rounded-sm">
                  <img src="/assets/logo.png" alt="" className="h-full w-full object-cover opacity-90" />
                </span>
              </button>
            ))}
          </section>
        </div>
      ) : (
        <>
          <nav className="jb-sidebar-nav mt-4 space-y-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={`${item.label}-${item.to}`}
                  to={item.to}
                  className={({ isActive }) => `jb-sidebar-item ${isActive ? 'is-active' : ''}`}
                >
                  <Icon size={17} />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>

          <section className="mt-4 flex min-h-0 flex-1 flex-col px-1">
            <div className="jb-section-head mb-2.5 flex items-center justify-between text-amberline/85">
              <div className="flex items-center gap-2">
                <ListMusic size={16} />
                <h2 className="font-mono text-[11px] uppercase tracking-[0.18em]">Playlists</h2>
              </div>
              <button
                type="button"
                className="jb-mini-icon-btn retro-tooltip tooltip-left"
                aria-label="Add playlist"
                data-tooltip="Add Playlist"
              >
                <Plus size={15} />
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overflow-x-hidden pr-1 text-sm text-cream/65">
              {sidebarPlaylists.map((playlist) => (
                <button
                  key={playlist.id}
                  type="button"
                  className="jb-playlist-item retro-tooltip tooltip-left flex w-full items-center gap-2.5 px-2 py-1.5 text-left"
                  data-tooltip={`${playlist.name} (${playlist.count})`}
                >
                  <img src="/assets/logo.png" alt="" className="h-9 w-9 rounded-md object-cover opacity-90" />
                  <div className="min-w-0">
                    <p className="truncate text-sm text-cream/90">{playlist.name}</p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-cream/50">{playlist.count} titles</p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        </>
      )}

      {!isSidebarCompact && (
        <div className="mt-auto flex justify-start pt-3">
          <button
            type="button"
            className="top-icon-btn jb-sidebar-toggle h-8 w-8 retro-tooltip tooltip-right"
            aria-label="Compact"
            data-tooltip="Compact"
            onClick={() => void toggleSidebarCompact()}
          >
            <span className="left-panel-toggle-icon" aria-hidden="true" />
          </button>
        </div>
      )}

      {isSidebarCompact && (
        <div className="mt-auto flex justify-center pt-3">
          <button
            type="button"
            className="top-icon-btn jb-sidebar-toggle h-8 w-8 retro-tooltip tooltip-right"
            aria-label="Extend"
            data-tooltip="Extend"
            onClick={() => void toggleSidebarCompact()}
          >
            <span className="left-panel-toggle-icon" aria-hidden="true" />
          </button>
        </div>
      )}
    </aside>
  );
}
