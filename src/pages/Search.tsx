import { useState } from 'react';
import AnimeCard from '../components/AnimeCard';
import SearchBar from '../components/SearchBar';
import { searchAnime } from '../services/catalogSource';
import type { AnimeSummary } from '../types/anime';

export default function Search() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AnimeSummary[]>([]);
  const [status, setStatus] = useState('Enter a title and scan the active source catalog.');

  const handleSearch = async () => {
    if (!query.trim()) return;
    setStatus('Tracking search signal...');
    try {
      const data = await searchAnime(query);
      setResults(data);
      setStatus(data.length ? `${data.length} tapes found.` : 'No tapes found on this frequency.');
    } catch {
      setStatus('Search failed. The active source may be rate limiting requests.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Archive scanner</p>
        <h1 className="section-title">Search</h1>
      </div>
      <SearchBar value={query} onChange={setQuery} onSubmit={handleSearch} />
      <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-cream/50">{status}</p>
      <div className="grid grid-cols-4 gap-4 max-2xl:grid-cols-3 max-xl:grid-cols-2 max-sm:grid-cols-1">
        {results.map((anime) => <AnimeCard key={anime.id} anime={anime} />)}
      </div>
    </div>
  );
}
