import { X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type {
  AnimeGenre,
  AnimeSearchQuery,
  AnimeSearchQueryRating,
  AnimeSearchQueryStatus,
  AnimeSearchQueryType,
  ProducerSummary,
} from '../services/catalogSource';

type AdvancedSearchModalProps = {
  open: boolean;
  query: string;
  allowNsfw: boolean;
  initialType?: AnimeSearchQueryType;
  initialStatus?: AnimeSearchQueryStatus;
  initialRating?: AnimeSearchQueryRating;
  initialMinScore?: number;
  initialMaxScore?: number;
  initialIncludeGenreIds?: number[];
  initialExcludeGenreIds?: number[];
  initialProducerIds?: number[];
  genres: AnimeGenre[];
  themes: AnimeGenre[];
  demographics: AnimeGenre[];
  explicitGenres: AnimeGenre[];
  producerResults: ProducerSummary[];
  selectedProducerIds?: number[];
  producerQuery: string;
  onClose: () => void;
  onProducerQueryChange: (value: string) => void;
  onToggleProducer?: (producerId: number) => void;
  onSubmit: (payload: AnimeSearchQuery) => void;
};

const TYPE_OPTIONS: AnimeSearchQueryType[] = ['TV', 'OVA', 'Movie', 'Special', 'ONA', 'Music', 'CM', 'PV', 'TV Special'];
const STATUS_OPTIONS: AnimeSearchQueryStatus[] = ['airing', 'complete', 'upcoming'];
const RATING_OPTIONS: AnimeSearchQueryRating[] = ['g', 'pg', 'pg13', 'r17', 'r', 'rx'];

type ToggleSet = Record<number, boolean>;

function toToggleSet(ids: number[]): ToggleSet {
  const next: ToggleSet = {};
  ids.forEach((id) => {
    next[id] = true;
  });
  return next;
}

function fromToggleSet(set: ToggleSet): number[] {
  return Object.entries(set)
    .filter(([, selected]) => selected)
    .map(([id]) => Number(id))
    .filter((id) => Number.isFinite(id));
}

export default function AdvancedSearchModal({
  open,
  query,
  allowNsfw,
  initialType,
  initialStatus,
  initialRating,
  initialMinScore,
  initialMaxScore,
  initialIncludeGenreIds,
  initialExcludeGenreIds,
  initialProducerIds,
  genres,
  themes,
  demographics,
  explicitGenres,
  producerResults,
  selectedProducerIds = [],
  producerQuery,
  onClose,
  onProducerQueryChange,
  onToggleProducer,
  onSubmit,
}: AdvancedSearchModalProps) {
  const queryInputRef = useRef<HTMLInputElement | null>(null);
  const [queryDraft, setQueryDraft] = useState(query);
  const [type, setType] = useState<AnimeSearchQueryType | ''>(initialType ?? '');
  const [status, setStatus] = useState<AnimeSearchQueryStatus | ''>(initialStatus ?? '');
  const [rating, setRating] = useState<AnimeSearchQueryRating | ''>(initialRating ?? '');
  const [minScore, setMinScore] = useState('');
  const [maxScore, setMaxScore] = useState('');
  const [includeGenreSet, setIncludeGenreSet] = useState<ToggleSet>({});
  const [excludeGenreSet, setExcludeGenreSet] = useState<ToggleSet>({});
  const [producerSet, setProducerSet] = useState<ToggleSet>(toToggleSet(initialProducerIds ?? selectedProducerIds));

  const selectedProducerIdsFromSet = useMemo(() => fromToggleSet(producerSet), [producerSet]);
  const selectedProducerResultMap = useMemo(() => {
    const map = new Map<number, ProducerSummary>();
    producerResults.forEach((producer) => {
      map.set(producer.mal_id, producer);
    });
    return map;
  }, [producerResults]);
  const selectedProducerPills = useMemo(
    () => selectedProducerIdsFromSet.map((id) => selectedProducerResultMap.get(id) ?? { mal_id: id, title: `Producer #${id}` }),
    [selectedProducerIdsFromSet, selectedProducerResultMap],
  );

  useEffect(() => {
    if (!open) return;
    setQueryDraft(query);
    setType(initialType ?? '');
    setStatus(initialStatus ?? '');
    setRating(initialRating ?? '');
    setMinScore(initialMinScore !== undefined ? String(initialMinScore) : '');
    setMaxScore(initialMaxScore !== undefined ? String(initialMaxScore) : '');
    setIncludeGenreSet(toToggleSet(initialIncludeGenreIds ?? []));
    setExcludeGenreSet(toToggleSet(initialExcludeGenreIds ?? []));
    setProducerSet(toToggleSet(initialProducerIds ?? selectedProducerIds));

    window.requestAnimationFrame(() => {
      queryInputRef.current?.focus();
      queryInputRef.current?.select();
    });
  }, [
    open,
    query,
    initialType,
    initialStatus,
    initialRating,
    initialMinScore,
    initialMaxScore,
    initialIncludeGenreIds,
    initialExcludeGenreIds,
    initialProducerIds,
    selectedProducerIds,
  ]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  const allGenreGroups = useMemo(() => {
    const merged: Array<{ label: string; items: AnimeGenre[] }> = [
      { label: 'Genres', items: genres },
      { label: 'Themes', items: themes },
      { label: 'Demographics', items: demographics },
    ];

    if (allowNsfw) {
      merged.push({ label: 'Explicit Genres', items: explicitGenres });
    }

    return merged;
  }, [allowNsfw, demographics, explicitGenres, genres, themes]);

  if (!open) return null;

  return createPortal(
    <div className="confirm-overlay" aria-hidden={false}>
      <button type="button" className="confirm-backdrop" aria-label="Close advanced search" onClick={onClose} />
      <section
        className="advanced-search-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Advanced search"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="advanced-search-header">
          <div>
            <p className="advanced-search-eyebrow">Search Control Deck</p>
            <h2 className="advanced-search-title">Advanced Search</h2>
          </div>
          <button type="button" className="advanced-search-close" onClick={onClose} aria-label="Close advanced search">
            <X size={15} />
          </button>
        </header>

        <div className="advanced-search-body">
          <label className="advanced-search-field">
            <span>Query</span>
            <input
              ref={queryInputRef}
              value={queryDraft}
              onChange={(event) => setQueryDraft(event.target.value)}
              placeholder="Search anime title..."
            />
          </label>

          <div className="advanced-search-grid-3">
            <label className="advanced-search-field">
              <span>Type</span>
              <select value={type} onChange={(event) => setType(event.target.value as AnimeSearchQueryType | '')}>
                <option value="">All</option>
                {TYPE_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="advanced-search-field">
              <span>Status</span>
              <select value={status} onChange={(event) => setStatus(event.target.value as AnimeSearchQueryStatus | '')}>
                <option value="">All</option>
                {STATUS_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="advanced-search-field">
              <span>Rating</span>
              <select value={rating} onChange={(event) => setRating(event.target.value as AnimeSearchQueryRating | '')}>
                <option value="">All</option>
                {RATING_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
          </div>

          <div className="advanced-search-grid-2">
            <label className="advanced-search-field">
              <span>Min score</span>
              <input value={minScore} onChange={(event) => setMinScore(event.target.value)} placeholder="0" />
            </label>
            <label className="advanced-search-field">
              <span>Max score</span>
              <input value={maxScore} onChange={(event) => setMaxScore(event.target.value)} placeholder="10" />
            </label>
          </div>

          <section className="advanced-search-section">
            <p className="advanced-search-section-title">Genre include</p>
            {allGenreGroups.map((group) => (
              <div key={group.label} className="advanced-search-group">
                <p className="advanced-search-group-title">{group.label}</p>
                <div className="advanced-search-chip-grid">
                  {group.items.map((genre) => {
                    const selected = Boolean(includeGenreSet[genre.mal_id]);
                    return (
                      <button
                        key={`${group.label}-${genre.mal_id}`}
                        type="button"
                        className={`advanced-search-chip ${selected ? 'is-active' : ''}`}
                        onClick={() => {
                          setIncludeGenreSet((prev) => ({ ...prev, [genre.mal_id]: !prev[genre.mal_id] }));
                        }}
                      >
                        {genre.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>

          <section className="advanced-search-section">
            <p className="advanced-search-section-title">Genre exclude</p>
            <div className="advanced-search-chip-grid">
              {allGenreGroups.flatMap((group) => group.items).map((genre) => {
                const selected = Boolean(excludeGenreSet[genre.mal_id]);
                return (
                  <button
                    key={`exclude-${genre.mal_id}`}
                    type="button"
                    className={`advanced-search-chip ${selected ? 'is-active' : ''}`}
                    onClick={() => {
                      setExcludeGenreSet((prev) => ({ ...prev, [genre.mal_id]: !prev[genre.mal_id] }));
                    }}
                  >
                    {genre.name}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="advanced-search-section">
            <p className="advanced-search-section-title">Producers</p>
            <label className="advanced-search-field">
              <span>Search producers</span>
              <input value={producerQuery} onChange={(event) => onProducerQueryChange(event.target.value)} placeholder="Type producer name..." />
            </label>
            {selectedProducerPills.length > 0 ? (
              <div className="advanced-search-group">
                <p className="advanced-search-group-title">Selected</p>
                <div className="advanced-search-chip-grid">
                  {selectedProducerPills.map((producer) => (
                    <button
                      key={`selected-${producer.mal_id}`}
                      type="button"
                      className="advanced-search-chip is-active"
                      onClick={() => {
                        setProducerSet((prev) => ({ ...prev, [producer.mal_id]: !prev[producer.mal_id] }));
                        onToggleProducer?.(producer.mal_id);
                      }}
                    >
                      {producer.title}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="advanced-search-chip-grid">
              {producerResults.map((producer) => {
                const selected = Boolean(producerSet[producer.mal_id]);
                return (
                  <button
                    key={producer.mal_id}
                    type="button"
                    className={`advanced-search-chip ${selected ? 'is-active' : ''}`}
                    onClick={() => {
                      setProducerSet((prev) => ({ ...prev, [producer.mal_id]: !prev[producer.mal_id] }));
                      onToggleProducer?.(producer.mal_id);
                    }}
                  >
                    {producer.title}
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        <footer className="advanced-search-footer">
          <button type="button" className="vhs-button-ghost" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="vhs-button"
            onClick={() => {
              const payload: AnimeSearchQuery = {
                q: queryDraft.trim(),
                type: type || undefined,
                status: status || undefined,
                rating: rating || undefined,
                min_score: minScore.trim() ? Number(minScore) : undefined,
                max_score: maxScore.trim() ? Number(maxScore) : undefined,
                genres: fromToggleSet(includeGenreSet),
                genres_exclude: fromToggleSet(excludeGenreSet),
                producers: fromToggleSet(producerSet),
              };
              onSubmit(payload);
            }}
          >
            Search all results
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
