import AnimeRow from '../components/AnimeRow';
import { useAppStore } from '../state/appStore';

export default function Library() {
  const history = useAppStore((state) => state.watchHistory);
  const favorites = useAppStore((state) => state.favorites);

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Local shelf</p>
        <h1 className="section-title">Library</h1>
      </div>
      <AnimeRow title="Watch Later" progress={history.slice(0, 8)} />
      <div className="app-card p-6">
        <h2 className="section-title text-2xl">Favorites</h2>
        <p className="mt-3 font-mono text-sm uppercase tracking-[0.12em] text-cream/50">
          {favorites.length ? `${favorites.length} favorite tape IDs stored locally: ${favorites.join(', ')}` : 'Favorite anime from detail pages to build this shelf.'}
        </p>
      </div>
    </div>
  );
}
