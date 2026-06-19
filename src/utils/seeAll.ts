export type SeeAllType =
  | 'season'
  | 'upcoming-update'
  | 'latest'
  | 'promo'
  | 'airing'
  | 'popular'
  | 'upcoming';

export type SeeAllSort = 'top-rated' | 'newest' | 'az';

export const SEE_ALL_DEFAULT_SORT: SeeAllSort = 'top-rated';

export const SEE_ALL_SORT_OPTIONS: Array<{ key: SeeAllSort; label: string }> = [
  { key: 'top-rated', label: 'Top Rated' },
  { key: 'newest', label: 'Newest' },
  { key: 'az', label: 'A-Z' },
];

export const SEE_ALL_TYPE_META: Record<SeeAllType, { title: string; ranked: boolean }> = {
  season: { title: 'Current Season', ranked: false },
  'upcoming-update': { title: 'Upcoming Update', ranked: false },
  latest: { title: 'Latest Update', ranked: false },
  promo: { title: 'Latest Promo', ranked: false },
  airing: { title: 'Top Airing', ranked: true },
  popular: { title: 'Popular on My Anime 1996', ranked: false },
  upcoming: { title: 'Top Upcoming', ranked: true },
};

export const HERO_SEE_ALL_SHORTCUTS: Array<{ type: SeeAllType; label: string }> = [
  { type: 'season', label: 'Current Season' },
  { type: 'latest', label: 'Latest Update' },
  { type: 'upcoming-update', label: 'Upcoming Update' },
];

export const HOME_SHELF_TO_SEE_ALL_TYPE: Partial<Record<string, SeeAllType>> = {
  season: 'season',
  'upcoming-update': 'upcoming-update',
  latest: 'latest',
  promo: 'promo',
  airing: 'airing',
  popular: 'popular',
  upcoming: 'upcoming',
};

export const SEE_ALL_SORT_DISABLED_TYPES: SeeAllType[] = ['upcoming-update', 'latest', 'promo'];

export const isSeeAllType = (value: string | undefined): value is SeeAllType => {
  if (!value) return false;
  return value in SEE_ALL_TYPE_META;
};

export const isSeeAllSort = (value: string | undefined): value is SeeAllSort => {
  if (!value) return false;
  return SEE_ALL_SORT_OPTIONS.some((option) => option.key === value);
};
