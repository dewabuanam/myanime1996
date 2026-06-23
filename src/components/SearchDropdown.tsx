import { Loader2, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../state/appStore';
import type { AnimeSummary } from '../types/anime';
import type { SearchKeywordSuggestion } from '../utils/search';
import { getDisplayTitle } from '../utils/title';

type SearchDropdownProps = {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  query: string;
  loading: boolean;
  keywords: SearchKeywordSuggestion[];
  results: AnimeSummary[];
  recentSearches: string[];
  titleLanguage: 'japanese' | 'english';
  onClose: () => void;
  onPickQuery: (value: string) => void;
  onClearRecent: () => void;
  onSubmitCurrentQuery: () => void;
  onOpenAdvanced: () => void;
};

export default function SearchDropdown({
  anchorRef,
  open,
  query,
  loading,
  keywords,
  results,
  recentSearches,
  titleLanguage,
  onClose,
  onPickQuery,
  onClearRecent,
  onSubmitCurrentQuery,
  onOpenAdvanced,
}: SearchDropdownProps) {
  const navigate = useNavigate();
  const selectAnime = useAppStore((state) => state.selectAnime);
  const openRightPanelWithView = useAppStore((state) => state.openRightPanelWithView);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ top: 64, left: 0, width: 560 });

  const hasQuery = query.trim().length > 0;

  const windowResults = useMemo(() => results.slice(0, 10), [results]);

  const updatePosition = () => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    const minWidth = Math.max(360, Math.floor(rect.width));
    const maxWidth = Math.min(760, window.innerWidth - 16);
    const width = Math.max(minWidth, Math.min(maxWidth, 620));
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const top = Math.min(window.innerHeight - 8, rect.bottom + 8);

    setPosition({ top: Math.round(top), left: Math.round(left), width: Math.round(width) });
  };

  useEffect(() => {
    if (!open) return;

    updatePosition();

    const onDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      onClose();
    };

    const onDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    const onViewportUpdate = () => updatePosition();

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
  }, [anchorRef, onClose, open]);

  if (!open) return null;

  return createPortal(
    <section
      ref={dropdownRef}
      className="search-dropdown search-dropdown-panel"
      style={{ top: `${position.top}px`, left: `${position.left}px`, width: `${position.width}px` }}
      role="dialog"
      aria-label="Search suggestions"
    >
      <div className="search-dropdown-scroll">
        {!hasQuery ? (
          <div className="search-dropdown-block">
            <div className="search-dropdown-head">
              <p className="search-dropdown-eyebrow">Recent searches</p>
              <button type="button" className="search-dropdown-clear" onClick={onClearRecent}>Clear recent</button>
            </div>
            {recentSearches.length ? (
              <div className="search-dropdown-list">
                {recentSearches.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className="search-dropdown-pill"
                    onClick={() => {
                      onClose();
                      const next = new URLSearchParams();
                      next.set('q', item);
                      next.set('page', '1');
                      next.set('limit', '24');
                      navigate(`/search/results?${next.toString()}`);
                    }}
                  >
                    <Search size={12} />
                    <span>{item}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="search-dropdown-empty">No recent searches yet.</p>
            )}
          </div>
        ) : (
          <>
            <div className="search-dropdown-block">
              <div className="search-dropdown-head">
                <p className="search-dropdown-eyebrow">Matching words</p>
                {loading ? <Loader2 size={13} className="animate-spin text-amberline/80" /> : null}
              </div>
              {loading ? (
                <p className="search-dropdown-empty">Searching...</p>
              ) : keywords.length ? (
                <div className="search-dropdown-list">
                  {keywords.map((keyword) => (
                    <button key={`${keyword.reason}-${keyword.label}`} type="button" className="search-dropdown-pill" onClick={() => onPickQuery(keyword.label)}>
                      <Search size={12} />
                      <span>{keyword.label}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="search-dropdown-empty">No keyword matches found.</p>
              )}
            </div>

            <div className="search-dropdown-block">
              <div className="search-dropdown-head">
                <p className="search-dropdown-eyebrow">Anime results</p>
                <p className="search-dropdown-meta">{windowResults.length} / 10 shown</p>
              </div>
              {loading ? (
                <p className="search-dropdown-empty">Searching...</p>
              ) : windowResults.length ? (
                <div className="search-dropdown-anime-list">
                  {windowResults.map((anime) => {
                    const routeId = anime.jikanId ?? anime.id;
                    return (
                      <button
                        key={`${anime.id}-${anime.jikanId ?? 'none'}`}
                        type="button"
                        className="search-dropdown-anime"
                        onClick={() => {
                          onClose();
                          void selectAnime({
                            ...anime,
                            id: routeId,
                            jikanId: routeId,
                          }).then(() => openRightPanelWithView('detail'));
                        }}
                      >
                        <img src={anime.image} alt="" className="search-dropdown-thumb" />
                        <span className="search-dropdown-title">{getDisplayTitle(anime, titleLanguage)}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="search-dropdown-empty">No anime matches found.</p>
              )}
            </div>
          </>
        )}
      </div>

      <div className="search-dropdown-footer">
        <button type="button" className="search-dropdown-action" onClick={onSubmitCurrentQuery}>
          Show all
        </button>
        <button type="button" className="search-dropdown-action" onClick={onOpenAdvanced}>
          Advance search
        </button>
        <button type="button" className="search-dropdown-close" aria-label="Close search" onClick={onClose}>
          <X size={14} />
        </button>
      </div>
    </section>,
    document.body,
  );
}
