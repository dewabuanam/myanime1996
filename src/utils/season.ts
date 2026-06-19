import type { AnimeSummary } from '../types/anime';

export type SeasonKey = 'winter' | 'spring' | 'summer' | 'fall';

const SEASON_ORDER: SeasonKey[] = ['winter', 'spring', 'summer', 'fall'];

export function normalizeSeasonKey(value?: string | null): SeasonKey | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'winter' || normalized === 'spring' || normalized === 'summer' || normalized === 'fall') {
    return normalized;
  }
  if (normalized === 'autumn') return 'fall';
  return null;
}

export function getSeasonLabel(season: SeasonKey): string {
  if (season === 'winter') return 'Winter';
  if (season === 'spring') return 'Spring';
  if (season === 'summer') return 'Summer';
  return 'Fall';
}

export function getSeasonLabelUpper(season: SeasonKey): string {
  return getSeasonLabel(season).toUpperCase();
}

export function getCurrentSeasonYear(date = new Date()): { season: SeasonKey; year: number } {
  const month = date.getMonth() + 1;
  if (month >= 3 && month <= 5) return { season: 'spring', year: date.getFullYear() };
  if (month >= 6 && month <= 8) return { season: 'summer', year: date.getFullYear() };
  if (month >= 9 && month <= 11) return { season: 'fall', year: date.getFullYear() };
  return { season: 'winter', year: date.getFullYear() };
}

export function shiftSeason(baseSeason: SeasonKey, baseYear: number, offset: number): { season: SeasonKey; year: number } {
  const startIndex = SEASON_ORDER.indexOf(baseSeason);
  const absoluteIndex = startIndex + offset;
  const normalizedIndex = ((absoluteIndex % 4) + 4) % 4;
  const yearDelta = Math.floor(absoluteIndex / 4);
  return {
    season: SEASON_ORDER[normalizedIndex],
    year: baseYear + yearDelta,
  };
}

export function inferSeasonFromDate(dateText?: string): { season: SeasonKey; year: number } | null {
  if (!dateText) return null;
  const timestamp = Date.parse(dateText);
  if (!Number.isFinite(timestamp)) return null;
  const date = new Date(timestamp);
  return getCurrentSeasonYear(date);
}

export function resolveAnimeSeason(anime: Pick<AnimeSummary, 'season' | 'seasonYear' | 'year' | 'airingDate'>): { season: SeasonKey; year: number } | null {
  const season = normalizeSeasonKey(anime.season);
  const seasonYear = anime.seasonYear ?? anime.year;
  if (season && typeof seasonYear === 'number' && Number.isFinite(seasonYear)) {
    return {
      season,
      year: Math.floor(seasonYear),
    };
  }

  const inferred = inferSeasonFromDate(anime.airingDate);
  if (inferred) return inferred;

  if (typeof anime.year === 'number' && Number.isFinite(anime.year)) {
    return {
      season: 'winter',
      year: Math.floor(anime.year),
    };
  }

  return null;
}

export function buildSeasonSeeAllPath(year: number, season: SeasonKey): string {
  const params = new URLSearchParams({
    year: String(Math.floor(year)),
    season,
  });
  return `/see-all/season?${params.toString()}`;
}
