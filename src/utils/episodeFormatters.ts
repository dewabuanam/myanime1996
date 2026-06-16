export function formatEpisodeDuration(durationMinutes?: number) {
  if (durationMinutes && durationMinutes > 0) return `${durationMinutes}m`;
  return 'Unknown';
}

export function formatEpisodeScoreOutOfTen(score?: number | null) {
  if (score === null || score === undefined || !Number.isFinite(score)) return null;
  const scaled = Math.max(0, Math.min(10, score * 2));
  return scaled.toFixed(2);
}

export function formatAnimeYear(year?: number, aired?: string) {
  if (year && Number.isFinite(year) && year > 0) return String(Math.floor(year));
  if (!aired) return 'TBA';
  const match = aired.match(/(19|20)\d{2}/);
  return match ? match[0] : 'TBA';
}
