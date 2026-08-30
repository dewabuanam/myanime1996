import type { AnimeDetail, AnimeRelationGroup } from '../types/anime';
import { getAnimeDetails } from './tenrai';
import { resolveAnimeSeason, type SeasonKey } from '../utils/season';

// A franchise line is walked like a linked list: from the anime being viewed, follow
// Prequel links backwards and Sequel links forwards until the chain runs out. Each hop
// costs one /anime/{id}/full request, which is cached and also carries everything the
// tile needs to render, so a revisit is free.

export type RelationChainNode = {
  id: number;
  title: string;
  titleEnglish?: string;
  titleJapanese?: string;
  image?: string;
  year?: number;
  season?: SeasonKey;
  seasonYear?: number;
  airingDate?: string;
  mediaType?: string;
  episodes?: number;
  /** How this entry connects to the one before it in the chain. */
  link: 'prequel' | 'sequel' | 'self';
  isCurrent: boolean;
};

export type RelationSort = 'chronology' | 'release';

// A franchise can be long (Gundam, Precure), but each hop is a request. This bounds the
// walk in both directions so a pathological chain cannot hammer the API.
const MAX_HOPS_PER_DIRECTION = 12;

const PREQUEL = 'prequel';
const SEQUEL = 'sequel';

function firstAnimeEntryId(groups: AnimeRelationGroup[] | undefined, relation: string): number | null {
  if (!groups) return null;
  const group = groups.find((candidate) => candidate.relation.trim().toLowerCase() === relation);
  if (!group) return null;
  const entry = group.entries.find((candidate) => candidate.type === 'anime');
  return entry ? entry.id : null;
}

function toNode(detail: AnimeDetail, link: RelationChainNode['link'], isCurrent: boolean): RelationChainNode {
  const season = resolveAnimeSeason(detail);
  return {
    id: detail.id,
    title: detail.title,
    titleEnglish: detail.titleEnglish,
    titleJapanese: detail.titleJapanese,
    image: detail.image,
    year: detail.year ?? season?.year,
    season: season?.season,
    seasonYear: season?.year,
    airingDate: detail.airingDate,
    mediaType: detail.mediaType,
    episodes: detail.episodes,
    link,
    isCurrent,
  };
}

/**
 * Walks the prequel/sequel chain around `root` and returns it in story order.
 * `root` is the already-loaded detail for the anime on screen, so viewing a title
 * costs no extra request for its own node.
 */
export async function buildRelationChain(root: AnimeDetail): Promise<RelationChainNode[]> {
  const visited = new Set<number>([root.id]);
  const before: RelationChainNode[] = [];
  const after: RelationChainNode[] = [];

  const walk = async (
    startFrom: AnimeDetail,
    relation: typeof PREQUEL | typeof SEQUEL,
    sink: RelationChainNode[],
  ) => {
    let current = startFrom;
    for (let hop = 0; hop < MAX_HOPS_PER_DIRECTION; hop += 1) {
      const nextId = firstAnimeEntryId(current.relations, relation);
      // A cycle (or a title that lists itself) ends the walk rather than looping.
      if (!nextId || visited.has(nextId)) return;
      visited.add(nextId);

      let next: AnimeDetail;
      try {
        next = await getAnimeDetails(nextId);
      } catch {
        // A broken link ends this direction; the rest of the chain still renders.
        return;
      }

      sink.push(toNode(next, relation === PREQUEL ? 'prequel' : 'sequel', false));
      current = next;
    }
  };

  await walk(root, PREQUEL, before);
  await walk(root, SEQUEL, after);

  // `before` came out nearest-first while walking backwards; reverse it so the chain
  // reads oldest to newest.
  before.reverse();

  return [...before, toNode(root, 'self', true), ...after];
}

function releaseTimestamp(node: RelationChainNode): number {
  if (node.airingDate) {
    const parsed = Date.parse(node.airingDate);
    if (!Number.isNaN(parsed)) return parsed;
  }
  if (typeof node.seasonYear === 'number') return Date.UTC(node.seasonYear, 0, 1);
  if (typeof node.year === 'number') return Date.UTC(node.year, 0, 1);
  return Number.MAX_SAFE_INTEGER;
}

export function sortRelationChain(chain: RelationChainNode[], sort: RelationSort): RelationChainNode[] {
  if (sort === 'chronology') return chain;
  return [...chain].sort((a, b) => releaseTimestamp(a) - releaseTimestamp(b));
}
