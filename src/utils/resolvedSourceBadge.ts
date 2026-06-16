import type { CachedPayload } from '../types/anime';
import type { ResolvedSource, SourcePluginInfo } from '../types/plugin';
import { getStoredValue } from '../services/store';

export type SourceResolveCacheMap = Record<string, CachedPayload<ResolvedSource>>;

export type AnimeResolvedPluginSnapshot = {
  animePluginIds: Set<string>;
  episodePluginIds: Map<number, Set<string>>;
};

export type AnimeResolveLookup = {
  animeIds: number[];
  titles?: string[];
};

function normalizeTitle(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(normalizedTitle: string): string[] {
  return normalizedTitle
    .split(' ')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length >= 2);
}

function hasStrongTokenOverlap(left: string, right: string): boolean {
  const leftTokens = tokenize(left);
  const rightTokens = tokenize(right);
  if (!leftTokens.length || !rightTokens.length) return false;

  const rightSet = new Set(rightTokens);
  let overlap = 0;
  for (const token of leftTokens) {
    if (rightSet.has(token)) overlap += 1;
  }

  const ratio = overlap / Math.max(leftTokens.length, rightTokens.length);
  return ratio >= 0.6;
}

function titleMatches(cacheTitle: string, lookupTitles: string[]): boolean {
  if (!cacheTitle || lookupTitles.length === 0) return false;
  if (lookupTitles.includes(cacheTitle)) return true;

  for (const title of lookupTitles) {
    if (!title) continue;
    if (title.includes(cacheTitle) || cacheTitle.includes(title)) return true;
    if (hasStrongTokenOverlap(cacheTitle, title)) return true;
  }

  return false;
}

export async function readResolvedSourceCache(): Promise<SourceResolveCacheMap> {
  return getStoredValue('sourceResolveCache', {} as SourceResolveCacheMap);
}

export function buildActiveOrderedPluginIds(
  sourcePlugins: SourcePluginInfo[],
  pluginPriority: string[],
  pluginEnabled: Record<string, boolean>,
): string[] {
  const ordered = [...pluginPriority];
  for (const plugin of sourcePlugins) {
    if (!ordered.includes(plugin.id)) {
      ordered.push(plugin.id);
    }
  }

  return ordered.filter((id) => pluginEnabled[id] !== false);
}

export function pickPriorityPluginId(resolvedPluginIds: Set<string>, activeOrderedPluginIds: string[]): string | null {
  for (const pluginId of activeOrderedPluginIds) {
    if (resolvedPluginIds.has(pluginId)) return pluginId;
  }
  return null;
}

export function collectResolvedPluginsForAnime(cache: SourceResolveCacheMap, lookup: AnimeResolveLookup): AnimeResolvedPluginSnapshot {
  const animePluginIds = new Set<string>();
  const episodePluginIds = new Map<number, Set<string>>();
  const now = Date.now();
  const animeIdSet = new Set(
    lookup.animeIds
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0)
      .map((value) => Math.floor(value)),
  );
  const lookupTitles = (lookup.titles ?? []).map((entry) => normalizeTitle(entry)).filter((entry) => entry.length > 0);

  for (const [cacheKey, payload] of Object.entries(cache)) {
    if (!payload || payload.expiresAt <= now) continue;

    const parts = cacheKey.split('::');
    if (parts.length < 5) continue;

    const pluginId = String(parts[1] || '').trim();
    const cacheAnimeId = Number(parts[2]);
    const cacheTitle = normalizeTitle(String(parts[3] || ''));
    const episodeNumber = Number(parts[4]);
    const idMatched = Number.isFinite(cacheAnimeId) && animeIdSet.has(Math.floor(cacheAnimeId));
    const titleMatched = cacheTitle.length > 0 && titleMatches(cacheTitle, lookupTitles);
    if (!pluginId || (!idMatched && !titleMatched)) continue;

    animePluginIds.add(pluginId);

    if (Number.isFinite(episodeNumber) && episodeNumber > 0) {
      const normalizedEpisode = Math.floor(episodeNumber);
      const set = episodePluginIds.get(normalizedEpisode) ?? new Set<string>();
      set.add(pluginId);
      episodePluginIds.set(normalizedEpisode, set);
    }
  }

  return { animePluginIds, episodePluginIds };
}
