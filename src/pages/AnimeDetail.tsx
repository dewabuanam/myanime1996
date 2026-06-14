import { Heart, Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getAnimeDetails } from '../services/catalogSource';
import { useAppStore } from '../state/appStore';
import type { AnimeDetail as AnimeDetailType } from '../types/anime';
import { getDisplayTitle } from '../utils/title';

export default function AnimeDetail() {
  const { id } = useParams();
  const [anime, setAnime] = useState<AnimeDetailType | null>(null);
  const [error, setError] = useState('');
  const selectAnime = useAppStore((state) => state.selectAnime);
  const toggleFavorite = useAppStore((state) => state.toggleFavorite);
  const favorites = useAppStore((state) => state.favorites);
  const titleLanguage = useAppStore((state) => state.titleLanguage);

  useEffect(() => {
    let alive = true;
    if (!id) return;
    async function load() {
      try {
        const data = await getAnimeDetails(id!);
        if (alive) setAnime(data);
      } catch {
        if (alive) setError('Could not load this tape from the active source.');
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, [id]);

  if (error) return <div className="app-card p-6 text-rust">{error}</div>;
  if (!anime) return <div className="app-card p-6 font-mono uppercase tracking-[0.14em] text-amberline">Loading tape details...</div>;

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-[320px_1fr] gap-6 max-lg:grid-cols-1">
        <img src={anime.image} alt="" className="app-card aspect-[3/4] w-full object-cover" />
        <div className="app-card p-6">
          <p className="eyebrow">Tape #{anime.id}</p>
          <h1 className="mt-2 font-display text-4xl font-semibold uppercase leading-tight max-lg:text-3xl">{getDisplayTitle(anime, titleLanguage)}</h1>
          {anime.titleJapanese && <p className="mt-2 font-mono text-sm uppercase tracking-[0.14em] text-amberline/70">{anime.titleJapanese}</p>}
          <p className="mt-5 text-base leading-6 text-cream/68">{anime.synopsis}</p>
          <div className="mt-6 flex flex-wrap gap-2">
            {anime.genres.map((genre) => <span key={genre} className="rounded-full border border-cream/15 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.12em] text-cream/60">{genre}</span>)}
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <button type="button" onClick={() => void selectAnime(anime)} className="vhs-button retro-tooltip" data-tooltip="Cue Tape"><Play size={18} /> Cue Tape</button>
            <button type="button" onClick={() => void toggleFavorite(anime.id)} className="vhs-button-ghost py-3 retro-tooltip" data-tooltip={favorites.includes(anime.id) ? 'Remove Favorite' : 'Add Favorite'}>
              <Heart size={17} className={favorites.includes(anime.id) ? 'fill-rust text-rust' : ''} /> {favorites.includes(anime.id) ? 'Favorited' : 'Favorite'}
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-5 max-xl:grid-cols-1">
        <div className="app-card p-5">
          <h2 className="section-title text-2xl">Trailer</h2>
          {anime.trailerUrl ? (
            <a href={anime.trailerUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex text-amberline underline decoration-ember/50 underline-offset-4">
              Open trailer source
            </a>
          ) : (
            <p className="mt-4 text-cream/55">No trailer recorded on this tape.</p>
          )}
        </div>
        <div className="app-card p-5">
          <h2 className="section-title text-2xl">Episodes</h2>
          <div className="mt-4 grid grid-cols-3 gap-2 max-sm:grid-cols-2">
            {Array.from({ length: Math.min(anime.episodes ?? 12, 12) }).map((_, index) => (
              <button key={index} type="button" className="vhs-button-ghost justify-start rounded-2xl py-3 retro-tooltip" data-tooltip={`Play Episode ${String(index + 1).padStart(2, '0')}`}>EP {String(index + 1).padStart(2, '0')}</button>
            ))}
          </div>
          <p className="mt-4 font-mono text-xs uppercase tracking-[0.16em] text-cream/45">Metadata only. Add licensed sources later if available.</p>
        </div>
      </section>
    </div>
  );
}
