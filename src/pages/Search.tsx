import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AdvancedSearchModal from '../components/AdvancedSearchModal';
import SearchBar from '../components/SearchBar';
import SearchDropdown from '../components/SearchDropdown';
import { useAnimeSearch } from '../hooks/useAnimeSearch';
import { useAppStore } from '../state/appStore';

export default function Search() {
  const navigate = useNavigate();
  const titleLanguage = useAppStore((state) => state.titleLanguage);
  const allowNsfw = useAppStore((state) => state.allowNsfw);
  const searchAnchorRef = useRef<HTMLDivElement | null>(null);
  const [isSearchOpen, setSearchOpen] = useState(false);
  const [isAdvancedOpen, setAdvancedOpen] = useState(false);
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

  const handleSearch = async () => {
    if (!query.trim()) return;
    await submitCurrentQuery();
    const next = new URLSearchParams();
    next.set('q', query.trim());
    next.set('page', '1');
    next.set('limit', '24');
    navigate(`/search/results?${next.toString()}`);
    setSearchOpen(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Archive scanner</p>
        <h1 className="section-title">Search</h1>
      </div>
      <div ref={searchAnchorRef}>
        <SearchBar
          value={query}
          onChange={(value) => {
            setQuery(value);
            setSearchOpen(true);
          }}
          onSubmit={handleSearch}
          onFocus={() => setSearchOpen(true)}
        />
      </div>

      <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-cream/50">
        {loading ? 'Scanning signal...' : 'Type a title and wait 3 seconds for quick results.'}
      </p>

      <SearchDropdown
        anchorRef={searchAnchorRef}
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
          void handleSearch();
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
