import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CollapsibleDetailSection from './CollapsibleDetailSection';
import SeasonLinkBadge from './SeasonLinkBadge';
import {
  buildRelationChain,
  sortRelationChain,
  type RelationChainNode,
  type RelationSort,
} from '../services/animeRelations';
import { useAppStore } from '../state/appStore';
import type { AnimeDetail } from '../types/anime';
import { getDisplayTitle } from '../utils/title';

type AnimeRelationsSectionProps = {
  anime: AnimeDetail;
  /**
   * Where a tile should take the user. The right panel swaps its own detail view rather
   * than navigating away; the full page routes to the entry.
   */
  onSelect?: (node: RelationChainNode) => void;
};

export default function AnimeRelationsSection({ anime, onSelect }: AnimeRelationsSectionProps) {
  const navigate = useNavigate();
  const [chain, setChain] = useState<RelationChainNode[]>([]);
  const [isLoading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [sort, setSort] = useState<RelationSort>('release');
  // Whether the section is shown is a stored preference rather than local state, so it
  // survives moving between titles and restarts, and page and panel stay in step.
  const isShown = useAppStore((state) => state.relationsExpanded);
  const setRelationsExpanded = useAppStore((state) => state.setRelationsExpanded);
  // Tiles follow the same romaji/english preference as every other card in the app.
  const titleLanguage = useAppStore((state) => state.titleLanguage);

  // Nothing to walk if the catalogue reports no prequel or sequel for this title, and
  // knowing that costs no request, so the section can hide itself entirely.
  const hasChainLink = useMemo(
    () =>
      (anime.relations ?? []).some((group) => {
        const relation = group.relation.trim().toLowerCase();
        return relation === 'prequel' || relation === 'sequel';
      }),
    [anime.relations],
  );

  useEffect(() => {
    setChain([]);
    setHasLoaded(false);
  }, [anime.id]);

  // Walking the chain costs one request per hop, so it waits until the section is shown.
  useEffect(() => {
    if (!isShown || hasLoaded || !hasChainLink) return;

    let alive = true;
    setLoading(true);

    buildRelationChain(anime)
      .then((result) => {
        if (!alive) return;
        setChain(result.length > 1 ? result : []);
        setHasLoaded(true);
      })
      .catch(() => {
        if (alive) setChain([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [anime, hasChainLink, hasLoaded, isShown]);

  const sorted = useMemo(() => sortRelationChain(chain, sort), [chain, sort]);

  if (!hasChainLink) return null;

  return (
    <CollapsibleDetailSection
      title="Relations"
      count={sorted.length}
      isOpen={isShown}
      onToggle={() => void setRelationsExpanded(!isShown)}
      isLoading={isLoading}
      loadingLabel="Tracing the franchise line..."
      emptyLabel="No connected entries found."
      isEmpty={hasLoaded && sorted.length === 0}
    >
      <div className="anime-relations-head mb-2 inline-flex items-center gap-1.5">
        <button
          type="button"
          className={`anime-relations-sort-btn retro-tooltip ${sort === 'release' ? 'is-active' : ''}`}
          data-tooltip="Order by air date"
          onClick={() => setSort('release')}
        >
          Release
        </button>
        <button
          type="button"
          className={`anime-relations-sort-btn retro-tooltip ${sort === 'chronology' ? 'is-active' : ''}`}
          data-tooltip="Order along the prequel to sequel chain"
          onClick={() => setSort('chronology')}
        >
          Chronology
        </button>
      </div>

      <div className="anime-relations-grid">
        {sorted.map((node) => {
          const tileTitle = getDisplayTitle(node, titleLanguage);
          return (
            <button
              key={node.id}
              type="button"
              className={`anime-relations-tile ${node.isCurrent ? 'is-current' : ''}`}
              onClick={() => (onSelect ? onSelect(node) : navigate(`/anime/${node.id}`))}
              aria-label={tileTitle}
              aria-current={node.isCurrent ? 'true' : undefined}
            >
              <div className="anime-card-poster-wrap anime-relations-tile-poster">
                <img src={node.image} alt="" className="anime-card-poster" loading="lazy" />
              </div>
              <div className="anime-card-copy anime-relations-tile-copy mt-1.5">
                <p className="anime-card-title line-clamp-2">{tileTitle}</p>
                <p className="anime-card-jp line-clamp-1">{node.titleJapanese || '　'}</p>
                <div className="anime-relations-tile-meta mt-1 flex flex-wrap items-center gap-1">
                  {node.season && node.seasonYear ? (
                    <SeasonLinkBadge season={node.season} year={node.seasonYear} variant="compact" />
                  ) : (
                    <span className="anime-relations-tile-year">{node.year ?? 'TBA'}</span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </CollapsibleDetailSection>
  );
}
