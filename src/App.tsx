import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import AppShell from './components/AppShell';
import AnimeDetail from './pages/AnimeDetail';
import History from './pages/History';
import Home from './pages/Home';
import Library from './pages/Library';
import Login from './pages/Login';
import FullscreenPlayback from './pages/FullscreenPlayback';
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

  useEffect(() => {
    void initialize();
  }, [initialize]);

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
      </Route>
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}
