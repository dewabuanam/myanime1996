import type { UpcomingSeasonFilter } from '../state/appStore';

export const UPCOMING_FILTER_OPTIONS: Array<{ value: UpcomingSeasonFilter; label: string }> = [
  { value: 'all', label: 'All Bands' },
  { value: 'tv', label: 'TV' },
  { value: 'movie', label: 'Movie' },
  { value: 'ova', label: 'OVA' },
  { value: 'special', label: 'Special' },
  { value: 'ona', label: 'ONA' },
  { value: 'music', label: 'Music' },
];
