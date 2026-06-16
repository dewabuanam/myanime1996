import { CalendarDays, ChevronDown, Clock3, List, Play, RotateCcw } from 'lucide-react';
import type { AnimeDetail, AnimeEpisode, AnimeEpisodePagination, TitleLanguage } from '../types/anime';
import { formatEpisodeDuration, formatEpisodeScoreOutOfTen } from '../utils/episodeFormatters';
import { getEpisodeDisplayTitles } from '../utils/episodeTitle';

type DetailEpisodeIcon = {
  iconDataUri: string;
  pluginName: string;
};

type RightNowDetailPaneProps = {
  detailAnimeView: AnimeDetail | null;
  detailYearLabel: string;
  detailEpisodeSearchQuery: string;
  onDetailEpisodeSearchQueryChange: (value: string) => void;
  detailEpisodePagination: AnimeEpisodePagination;
  isDetailLoading: boolean;
  onDetailEpisodePageChange: (page: number) => void;
  filteredDetailEpisodes: AnimeEpisode[];
  detailExpandedEpisode: number | null;
  detailLoadingEpisode: number | null;
  titleLanguage: TitleLanguage;
  detailEpisodeResolvedIconByEpisode: Record<number, DetailEpisodeIcon>;
  onPlayEpisode: (episodeNumber: number) => void;
  onToggleEpisodeExpand: (episodeNumber: number) => void;
};

export default function RightNowDetailPane({
  detailAnimeView,
  detailYearLabel,
  detailEpisodeSearchQuery,
  onDetailEpisodeSearchQueryChange,
  detailEpisodePagination,
  isDetailLoading,
  onDetailEpisodePageChange,
  filteredDetailEpisodes,
  detailExpandedEpisode,
  detailLoadingEpisode,
  titleLanguage,
  detailEpisodeResolvedIconByEpisode,
  onPlayEpisode,
  onToggleEpisodeExpand,
}: RightNowDetailPaneProps) {
  if (isDetailLoading && !detailAnimeView) {
    return (
      <div className="space-y-3">
        <div className="h-40 animate-pulse rounded-2xl border border-cream/12 bg-black/35" />
        <div className="h-4 w-4/5 animate-pulse rounded bg-cream/12" />
        <div className="h-4 w-3/5 animate-pulse rounded bg-cream/10" />
        <div className="inline-flex items-center gap-2 text-cream/70">
          <RotateCcw size={13} className="animate-spin text-amberline" />
          <span className="font-mono text-[11px] uppercase tracking-[0.11em]">Loading detail...</span>
        </div>
      </div>
    );
  }

  if (!detailAnimeView) {
    return <p className="text-cream/72">Select an anime to view details and playback context.</p>;
  }

  return (
    <div className="space-y-2.5">
      <div className="relative overflow-hidden rounded-2xl border border-cream/12 bg-black/45">
        <img src={detailAnimeView.image} alt="" className="h-40 w-full object-cover" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
      </div>

      <p className="line-clamp-4 text-cream/72">{detailAnimeView.synopsis ?? 'Select an anime to view details and playback context.'}</p>

      <div className="flex flex-wrap gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-full border border-cream/15 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-cream/68 retro-tooltip" data-tooltip="Year">
          <CalendarDays size={11} className="text-amberline" /> {detailYearLabel}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-cream/15 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-cream/68 retro-tooltip" data-tooltip="Episodes">
          <List size={11} className="text-amberline" /> {detailAnimeView.episodes ?? '?'}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-cream/15 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-cream/68 retro-tooltip" data-tooltip="Status">
          <Clock3 size={11} className="text-amberline" /> {detailAnimeView.status ?? 'Unknown'}
        </span>
      </div>

      <div className="space-y-1.5 border-t border-cream/10 pt-2">
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <p className="font-mono text-[10px] uppercase tracking-[0.13em] text-amberline/75">Episodes</p>
          <div className="inline-flex flex-wrap items-center gap-1.5">
            <input
              type="search"
              value={detailEpisodeSearchQuery}
              onChange={(event) => onDetailEpisodeSearchQueryChange(event.target.value)}
              placeholder="Search episode # / title"
              className="w-40 rounded-md border border-cream/20 bg-black/25 px-2 py-1 text-[10px] font-mono uppercase tracking-[0.09em] text-cream/85 placeholder:text-cream/45 focus:border-amberline/55 focus:outline-none"
            />
            <label className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-[0.09em] text-cream/58">
              <span>Page</span>
              <select
                className="right-now-episode-page-select"
                value={detailEpisodePagination.page}
                onChange={(event) => onDetailEpisodePageChange(Number(event.target.value) || 1)}
                disabled={isDetailLoading || detailEpisodePagination.lastVisiblePage <= 1}
              >
                {Array.from({ length: Math.max(1, detailEpisodePagination.lastVisiblePage) }, (_, index) => {
                  const page = index + 1;
                  return (
                    <option key={page} value={page}>
                      {page}
                    </option>
                  );
                })}
              </select>
            </label>
          </div>
        </div>
        {isDetailLoading ? (
          <p className="text-cream/60">Loading episodes...</p>
        ) : filteredDetailEpisodes.length > 0 ? (
          filteredDetailEpisodes.map((episode) => {
            const isExpanded = detailExpandedEpisode === episode.episodeNumber;
            const labels = getEpisodeDisplayTitles(episode, detailAnimeView, titleLanguage);
            return (
              <article key={episode.episodeNumber} className="rounded-xl border border-cream/10 bg-carbon/35 px-2.5 py-2">
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    className="vhs-button-ghost px-2 py-1 text-[11px] retro-tooltip"
                    onClick={() => onPlayEpisode(episode.episodeNumber)}
                    data-tooltip={`Play Episode ${String(episode.episodeNumber).padStart(2, '0')}`}
                  >
                    <Play size={11} /> {String(episode.episodeNumber).padStart(2, '0')}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <p className="line-clamp-1 font-display text-sm uppercase text-cream">{labels.primary}</p>
                      {detailEpisodeResolvedIconByEpisode[episode.episodeNumber] ? (
                        <div
                          className="shrink-0 rounded-md bg-black/62 p-1 shadow-[0_4px_14px_rgba(0,0,0,0.45)] retro-tooltip"
                          data-tooltip={`${detailEpisodeResolvedIconByEpisode[episode.episodeNumber].pluginName} Available`}
                        >
                          <img
                            src={detailEpisodeResolvedIconByEpisode[episode.episodeNumber].iconDataUri}
                            alt="Resolved source"
                            className="h-4 w-4 rounded-sm object-contain"
                            loading="lazy"
                          />
                        </div>
                      ) : null}
                    </div>
                    {labels.secondary ? <p className="anime-card-jp line-clamp-1">{labels.secondary}</p> : null}
                    <div className="mt-1 flex flex-wrap gap-1 text-[10px] font-mono uppercase tracking-[0.09em] text-cream/55">
                      <span className="inline-flex items-center gap-1"><CalendarDays size={10} className="text-amberline" /> {episode.aired?.slice(0, 10) || 'TBA'}</span>
                      {episode.filler ? <span className="rounded-full bg-rust/80 px-1.5 py-0.5 text-white">Filler</span> : null}
                      {episode.recap ? <span className="rounded-full bg-amberline/85 px-1.5 py-0.5 text-ink">Recap</span> : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="vhs-button-ghost p-1.5 text-[10px] retro-tooltip"
                    onClick={() => onToggleEpisodeExpand(episode.episodeNumber)}
                    data-tooltip={isExpanded ? 'Collapse Episode' : 'Expand Episode'}
                    aria-label={isExpanded ? 'Collapse Episode' : 'Expand Episode'}
                  >
                    {detailLoadingEpisode === episode.episodeNumber ? (
                      <RotateCcw size={12} className="animate-spin" />
                    ) : (
                      <ChevronDown size={12} className={isExpanded ? 'rotate-180 transition-transform' : 'transition-transform'} />
                    )}
                  </button>
                </div>
                {isExpanded ? (
                  <div className="mt-1.5 rounded-lg border border-cream/10 bg-black/20 p-2">
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                      {formatEpisodeScoreOutOfTen(episode.score) ? (
                        <span className="inline-flex items-center rounded-full border border-cream/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.11em] text-cream/72">
                          Score {formatEpisodeScoreOutOfTen(episode.score)}
                        </span>
                      ) : null}
                      {episode.durationMinutes && episode.durationMinutes > 0 ? (
                        <span className="inline-flex items-center rounded-full border border-cream/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.11em] text-cream/72">
                          <Clock3 size={10} className="mr-1 text-amberline" /> {formatEpisodeDuration(episode.durationMinutes)}
                        </span>
                      ) : null}
                      {episode.forumUrl ? (
                        <a
                          href={episode.forumUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center rounded-full border border-amberline/55 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-amberline transition-colors hover:bg-amberline/12"
                        >
                          Forum Thread
                        </a>
                      ) : null}
                    </div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.13em] text-amberline/72">Synopsis</p>
                    <p className="mt-1 text-xs leading-5 text-cream/70">{episode.synopsis || 'No synopsis recorded for this episode.'}</p>
                  </div>
                ) : null}
              </article>
            );
          })
        ) : detailEpisodeSearchQuery.trim() ? (
          <p className="text-cream/60">No episodes match your search.</p>
        ) : (
          <p className="text-cream/60">No episode metadata available yet.</p>
        )}
      </div>
    </div>
  );
}
