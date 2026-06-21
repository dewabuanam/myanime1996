import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getSearchAnimeGenres,
  searchAnimeAdvanced,
  searchAnimeProducers,
  type AnimeGenre,
  type AnimeSearchQuery,
  type AnimeSearchResult,
  type ProducerSummary,
} from '../services/catalogSource';
import {
  addRecentSearch,
  getRecentSearches,
  clearRecentSearches,
  readSearchGenreCache,
  writeSearchGenreCache,
  readSearchProducerCache,
  writeSearchProducerCache,
} from '../services/searchStorage';
import type { AnimeSummary } from '../types/anime';
import { buildSearchKeywordSuggestions } from '../utils/search';
import { useAppStore } from '../state/appStore';

const INPUT_DEBOUNCE_MS = 3000;

export type SearchGenreBuckets = {
  genres: AnimeGenre[];
  themes: AnimeGenre[];
  demographics: AnimeGenre[];
  explicitGenres: AnimeGenre[];
};

type UseAnimeSearchResult = {
  query: string;
  setQuery: (value: string) => void;
  loading: boolean;
  recentSearches: string[];
  clearRecent: () => Promise<void>;
  previewResults: AnimeSummary[];
  keywordSuggestions: Array<{ label: string; reason: 'title' | 'synonym' }>;
  submitCurrentQuery: () => Promise<void>;
  runAdvancedSearch: (params: AnimeSearchQuery) => Promise<void>;
  lastSearchResult: AnimeSearchResult | null;
  genreBuckets: SearchGenreBuckets;
  producerQuery: string;
  setProducerQuery: (value: string) => void;
  producerResults: ProducerSummary[];
  selectedProducerIds: number[];
  toggleProducer: (producerId: number) => void;
};

function makeGenreCacheKey(filter: 'genres' | 'themes' | 'demographics' | 'explicit_genres', allowNsfw: boolean) {
  return `genres:${filter}:nsfw:${allowNsfw ? '1' : '0'}`;
}

function makeProducerCacheKey(query: string) {
  return `producers:${query.trim().toLowerCase()}`;
}

export function useAnimeSearch(): UseAnimeSearchResult {
  const allowNsfw = useAppStore((state) => state.allowNsfw);

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [previewResults, setPreviewResults] = useState<AnimeSummary[]>([]);
  const [lastSearchResult, setLastSearchResult] = useState<AnimeSearchResult | null>(null);
  const [genres, setGenres] = useState<AnimeGenre[]>([]);
  const [themes, setThemes] = useState<AnimeGenre[]>([]);
  const [demographics, setDemographics] = useState<AnimeGenre[]>([]);
  const [explicitGenres, setExplicitGenres] = useState<AnimeGenre[]>([]);
  const [producerQuery, setProducerQuery] = useState('');
  const [producerResults, setProducerResults] = useState<ProducerSummary[]>([]);
  const [selectedProducerIds, setSelectedProducerIds] = useState<number[]>([]);

  const debounceRef = useRef<number | null>(null);

  const refreshRecentSearches = useCallback(async () => {
    const recent = await getRecentSearches();
    setRecentSearches(recent.map((entry) => entry.query));
  }, []);

  const clearRecent = useCallback(async () => {
    await clearRecentSearches();
    setRecentSearches([]);
  }, []);

  const submitCurrentQuery = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    await addRecentSearch(trimmed);
    await refreshRecentSearches();
    const result = await searchAnimeAdvanced({ q: trimmed, page: 1, limit: 24 });
    setLastSearchResult(result);
  }, [query, refreshRecentSearches]);

  const runAdvancedSearch = useCallback(async (params: AnimeSearchQuery) => {
    const trimmed = params.q.trim();
    if (trimmed) {
      await addRecentSearch(trimmed);
      await refreshRecentSearches();
    }
    const result = await searchAnimeAdvanced({
      ...params,
      q: trimmed,
      page: params.page ?? 1,
      limit: params.limit ?? 24,
    });
    setLastSearchResult(result);
  }, [refreshRecentSearches]);

  useEffect(() => {
    void refreshRecentSearches();
  }, [refreshRecentSearches]);

  useEffect(() => {
    const loadGenres = async () => {
      const readOrFetch = async (filter: 'genres' | 'themes' | 'demographics' | 'explicit_genres') => {
        const key = makeGenreCacheKey(filter, allowNsfw);
        const cached = await readSearchGenreCache(key);
        if (cached && cached.length > 0) {
          return cached.map((entry) => ({ mal_id: entry.malId, name: entry.name, count: entry.count }));
        }

        const remote = await getSearchAnimeGenres(filter);
        await writeSearchGenreCache(
          key,
          remote.map((entry) => ({ malId: entry.mal_id, name: entry.name, count: entry.count })),
        );
        return remote;
      };

      const [genresData, themesData, demographicsData, explicitData] = await Promise.all([
        readOrFetch('genres'),
        readOrFetch('themes'),
        readOrFetch('demographics'),
        allowNsfw ? readOrFetch('explicit_genres') : Promise.resolve([]),
      ]);

      setGenres(genresData);
      setThemes(themesData);
      setDemographics(demographicsData);
      setExplicitGenres(explicitData);
    };

    void loadGenres();
  }, [allowNsfw]);

  useEffect(() => {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    const trimmed = query.trim();
    if (!trimmed) {
      setPreviewResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = window.setTimeout(() => {
      void searchAnimeAdvanced({ q: trimmed, page: 1, limit: 10 })
        .then((result) => {
          setPreviewResults(result.data.slice(0, 10));
        })
        .finally(() => {
          setLoading(false);
        });
    }, INPUT_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [query]);

  useEffect(() => {
    const trimmedProducerQuery = producerQuery.trim();
    if (!trimmedProducerQuery) {
      setProducerResults([]);
      return;
    }

    const cacheKey = makeProducerCacheKey(trimmedProducerQuery);
    let alive = true;

    const run = async () => {
      const cached = await readSearchProducerCache(cacheKey);
      if (cached && cached.length > 0) {
        if (!alive) return;
        setProducerResults(cached.map((entry) => ({
          mal_id: entry.malId,
          title: entry.title,
          favorites: entry.favorites,
          count: entry.count,
        })));
      }

      const remote = await searchAnimeProducers({ q: trimmedProducerQuery, limit: 20, page: 1 });
      if (!alive) return;
      setProducerResults(remote.data);
      await writeSearchProducerCache(
        cacheKey,
        remote.data.map((entry) => ({ malId: entry.mal_id, title: entry.title, favorites: entry.favorites, count: entry.count })),
      );
    };

    void run();

    return () => {
      alive = false;
    };
  }, [producerQuery]);

  const keywordSuggestions = useMemo(() => buildSearchKeywordSuggestions(query, previewResults, 4), [query, previewResults]);

  const genreBuckets = useMemo(
    () => ({ genres, themes, demographics, explicitGenres }),
    [demographics, explicitGenres, genres, themes],
  );

  return {
    query,
    setQuery,
    loading,
    recentSearches,
    clearRecent,
    previewResults,
    keywordSuggestions,
    submitCurrentQuery,
    runAdvancedSearch,
    lastSearchResult,
    genreBuckets,
    producerQuery,
    setProducerQuery,
    producerResults,
    selectedProducerIds,
    toggleProducer: (producerId: number) => {
      setSelectedProducerIds((prev) => {
        if (prev.includes(producerId)) {
          return prev.filter((item) => item !== producerId);
        }
        return [...prev, producerId];
      });
    },
  };
}
