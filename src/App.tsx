import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import AppShell from './components/AppShell';
import AnimeDetail from './pages/AnimeDetail';
import History from './pages/History';
import Home from './pages/Home';
import Library from './pages/Library';
import Login from './pages/Login';
import FullscreenPlayback from './pages/FullscreenPlayback';
import Notifications from './pages/Notifications';
import Search from './pages/Search';
import SearchResults from './pages/SearchResults';
import SeeAll from './pages/SeeAll';
import { useAppStore } from './state/appStore';

function ProtectedShell() {
  const session = useAppStore((state) => state.session);
  const location = useLocation();

  if (!session) return <Navigate to="/login" replace state={{ from: location }} />;
  return <AppShell />;
}

export default function App() {
  const hydrated = useAppStore((state) => state.hydrated);
  const initialize = useAppStore((state) => state.initialize);
  const startupHandoffDoneRef = useRef(false);

  const completeStartupHandoff = async () => {
    if (startupHandoffDoneRef.current) return;

    try {
      await invoke('complete_startup_handoff');
      startupHandoffDoneRef.current = true;
    } catch (error) {
      console.warn('Failed to complete splashscreen handoff.', error);
    }
  };

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const ctrlOrMeta = event.ctrlKey || event.metaKey;
      const blockedShortcut =
        key === 'f12' ||
        (ctrlOrMeta && key === 'p') ||
        (ctrlOrMeta && key === 'u') ||
        (ctrlOrMeta && event.shiftKey && (key === 'i' || key === 'j' || key === 'c'));

      if (blockedShortcut) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void completeStartupHandoff();

    const retryId = window.setInterval(() => {
      if (startupHandoffDoneRef.current) {
        window.clearInterval(retryId);
        return;
      }
      void completeStartupHandoff();
    }, 800);

    return () => {
      window.clearInterval(retryId);
    };
  }, [hydrated]);

  if (!hydrated) {
    return (
      <main className="grid min-h-screen place-items-center bg-ink text-amberline">
        <div className="vhs-card px-8 py-6 text-center font-mono uppercase tracking-[0.35em]">
          Tuning tape...
        </div>
      </main>
    );
  }

  return (
    <Routes>
      <Route path="/fullscreen-player" element={<FullscreenPlayback />} />
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedShell />}>
        <Route path="/home" element={<Home />} />
        <Route path="/library" element={<Library />} />
        <Route path="/anime/:id" element={<AnimeDetail />} />
        <Route path="/history" element={<History />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/search" element={<Search />} />
        <Route path="/search/results" element={<SearchResults />} />
        <Route path="/see-all/:type" element={<SeeAll />} />
      </Route>
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}
