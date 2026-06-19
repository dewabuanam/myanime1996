export function formatEpisodeTotalLabel(currentEpisodes?: number | null, totalEpisodesOrStatus?: number | string | null, status?: string) {
  console.log('formatEpisodeTotalLabel called with', { currentEpisodes, totalEpisodesOrStatus, status });
  const totalEpisodes = typeof totalEpisodesOrStatus === 'number' ? totalEpisodesOrStatus : undefined;
  const resolvedStatus = typeof totalEpisodesOrStatus === 'string' ? totalEpisodesOrStatus : status;

  const safeCurrentEpisodes = currentEpisodes === undefined || currentEpisodes === null || !Number.isFinite(currentEpisodes) || currentEpisodes < 0 ? "?" : Math.floor(currentEpisodes);
  const safeTotalEpisodes = totalEpisodes && Number.isFinite(totalEpisodes) && totalEpisodes > 0 ? Math.max(1, Math.floor(totalEpisodes)) : null;
  const normalizedStatus = resolvedStatus?.trim().toLowerCase() ?? '';
  const isOpenEnded =
    totalEpisodesOrStatus == null;

  console.log('formatEpisodeTotalLabel', { currentEpisodes, totalEpisodesOrStatus, status, safeCurrentEpisodes, safeTotalEpisodes, normalizedStatus, isOpenEnded });
  if (safeTotalEpisodes) return `${safeCurrentEpisodes}/${safeTotalEpisodes}`;
  if (isOpenEnded) return `${safeCurrentEpisodes}/?`;
  return `${safeCurrentEpisodes}/${safeTotalEpisodes}`;
}
