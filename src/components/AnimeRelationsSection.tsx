import { ChevronDown } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SeasonLinkBadge from './SeasonLinkBadge';
import {
  buildRelationChain,
  sortRelationChain,
  type RelationChainNode,
  type RelationSort,
} from '../services/animeRelations';
import type { AnimeDetail } from '../types/anime';

type AnimeRelationsSectionProps = {
  anime: AnimeDetail;
};

// Collapsed height shows a single row on a typical detail pane; the rest is one click
// away rather than pushing the synopsis and genres far down the page.
const COLLAPSED_COUNT = 6;

function tileTitle(node: RelationChainNode) {
  return node.titleEnglish?.trim() || node.title;
}

export default function AnimeRelationsSection({ anime }: AnimeRelationsSectionProps) {
  const navigate = useNavigate();
  const [chain, setChain] = useState<RelationChainNode[]>([]);
  const [isLoading, setLoading] = useState(false);
  const [isExpanded, setExpanded] = useState(false);
  const [sort, setSort] = useState<RelationSort>('chronology');

  useEffect(() => {
    let alive = true;
    setChain([]);
    setExpanded(false);

    // Nothing to walk if the catalogue reports no prequel or sequel for this title.
    const hasChainLink = (anime.relations ?? []).some((group) => {
      const relation = group.relation.trim().toLowerCase();
      return relation === 'prequel' || relation === 'sequel';
    });
    if (!hasChainLink) return () => { alive = false; };

    setLoading(true);
    buildRelationChain(anime)
      .then((result) => {
        if (!alive) return;
        setChain(result.length > 1 ? result : []);
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
  }, [anime]);

  const sorted = useMemo(() => sortRelationChain(chain, sort), [chain, sort]);
  const visible = isExpanded ? sorted : sorted.slice(0, COLLAPSED_COUNT);
  const hiddenCount = sorted.length - visible.length;

  if (isLoading && chain.length === 0) {
    return (
      <div className="anime-relations mt-4">
        <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.11em] text-cream/58">Relations</p>
        <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-cream/45">Tracing the franchise line...</p>
      </div>
    );
  }

  if (sorted.length === 0) return null;

  return (
    <section className="anime-relations mt-4">
      <div className="anime-relations-head mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.11em] text-cream/58">
          Relations <span className="text-cream/40">({sorted.length})</span>
        </p>
        <div className="inline-flex items-center gap-1.5">
          <button
            type="button"
            className={`anime-relations-sort-btn retro-tooltip ${sort === 'chronology' ? 'is-active' : ''}`}
            data-tooltip="Order along the prequel to sequel chain"
            onClick={() => setSort('chronology')}
          >
            Chronology
          </button>
          <button
            type="button"
            className={`anime-relations-sort-btn retro-tooltip ${sort === 'release' ? 'is-active' : ''}`}
            data-tooltip="Order by air date"
            onClick={() => setSort('release')}
          >
            Release
          </button>
        </div>
      </div>

      <div className="anime-relations-grid">
        {visible.map((node) => (
          <button
            key={node.id}
            type="button"
            className={`anime-relations-tile ${node.isCurrent ? 'is-current' : ''}`}
            onClick={() => navigate(`/anime/${node.id}`)}
            aria-label={tileTitle(node)}
            aria-current={node.isCurrent ? 'true' : undefined}
          >
            <div className="anime-card-poster-wrap anime-relations-tile-poster">
              <img src={node.image} alt="" className="anime-card-poster" loading="lazy" />
            </div>
            <div className="anime-card-copy anime-relations-tile-copy mt-1.5">
              <p className="anime-card-title line-clamp-2">{tileTitle(node)}</p>
              <p className="anime-card-jp line-clamp-1">{node.titleJapanese || '　'}</p>
              <div className="anime-relations-tile-meta mt-1 flex flex-wrap items-center gap-1">
                {node.season && node.seasonYear ? (
                  <SeasonLinkBadge season={node.season} year={node.seasonYear} variant="compact" />
                ) : null}
                <span className="anime-relations-tile-year">{node.year ?? 'TBA'}</span>
              </div>
            </div>
          </button>
        ))}
      </div>

      {hiddenCount > 0 || isExpanded ? (
        <button
          type="button"
          className="anime-relations-toggle mt-2 inline-flex items-center gap-1.5"
          onClick={() => setExpanded((value) => !value)}
        >
          <ChevronDown size={13} className={isExpanded ? 'rotate-180 transition-transform' : 'transition-transform'} />
          {isExpanded ? 'Show less' : `Show ${hiddenCount} more`}
        </button>
      ) : null}
    </section>
  );
}
