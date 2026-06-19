import type { AnimeSummary } from '../types/anime';

function normalizeScore(value: number | undefined) {
  return Number.isFinite(value) ? (value as number) : -1;
}

function normalizePopularity(value: number | undefined) {
  if (!Number.isFinite(value) || (value as number) <= 0) return Number.MAX_SAFE_INTEGER;
  return value as number;
}

export function compareByScoreThenPopularity(a: AnimeSummary, b: AnimeSummary) {
  const scoreDiff = normalizeScore(b.score) - normalizeScore(a.score);
  if (scoreDiff !== 0) return scoreDiff;

  const popularityDiff = normalizePopularity(a.popularity) - normalizePopularity(b.popularity);
  if (popularityDiff !== 0) return popularityDiff;

  return a.id - b.id;
}

export function sortByScoreThenPopularity(list: AnimeSummary[]) {
  return [...list].sort(compareByScoreThenPopularity);
}
