import { EllipsisVertical, List, ScrollText } from 'lucide-react';
import type { ReactNode, Ref } from 'react';
import type { AnimeSummary, PlayableKind } from '../types/anime';
import type { SourceResolveTrace } from '../types/plugin';
import SourceResolveLogPanel from './SourceResolveLogPanel';
import WindowControls from './WindowControls';

type RightNowHeaderSectionProps = {
  isRightPanelFullpage: boolean;
  isPluginsView: boolean;
  showNowPlayingPane: boolean;
  isPlaying: boolean;
  isFullNowPlayingView: boolean;
  showVideoOverlayControls: boolean;
  isFullQueueDrawerOpen: boolean;
  onToggleQueueDrawer: () => void;
  queueToggleRef: Ref<HTMLButtonElement>;
  onToggleRightPanelFullpage: () => void;
  isNonTrailerPlayback: boolean;
  isSourceLogOpen: boolean;
  onToggleSourceLog: () => void;
  logToggleRef: Ref<HTMLButtonElement>;
  isPaneLayoutMenuOpen: boolean;
  onTogglePaneLayoutMenu: () => void;
  onClosePaneLayoutMenu: () => void;
  paneLayoutMenuRef: Ref<HTMLDivElement>;
  fallbackDisplayTitle: string;
  fallbackDisplayJapanese: string;
  currentlyPlayingKind: PlayableKind | undefined;
  fallbackTypeLabel: string;
  episodeDisplayJapanese: string;
  sourceResolveControls: ReactNode;
  sourceResolveTrace: SourceResolveTrace | null;
  isResolvingSource: boolean;
  onClearRateLimit: (pluginId: string) => void;
  detailAnimeView: AnimeSummary | null;
  detailDisplayTitle: string;
};

export default function RightNowHeaderSection({
  isRightPanelFullpage,
  isPluginsView,
  showNowPlayingPane,
  isPlaying,
  isFullNowPlayingView,
  showVideoOverlayControls,
  isFullQueueDrawerOpen,
  onToggleQueueDrawer,
  queueToggleRef,
  onToggleRightPanelFullpage,
  isNonTrailerPlayback,
  isSourceLogOpen,
  onToggleSourceLog,
  logToggleRef,
  isPaneLayoutMenuOpen,
  onTogglePaneLayoutMenu,
  onClosePaneLayoutMenu,
  paneLayoutMenuRef,
  fallbackDisplayTitle,
  fallbackDisplayJapanese,
  currentlyPlayingKind,
  fallbackTypeLabel,
  episodeDisplayJapanese,
  sourceResolveControls,
  sourceResolveTrace,
  isResolvingSource,
  onClearRateLimit,
  detailAnimeView,
  detailDisplayTitle,
}: RightNowHeaderSectionProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2">
          {isRightPanelFullpage ? <WindowControls /> : null}
          <p className="eyebrow">{isPluginsView ? 'Plugins' : showNowPlayingPane ? 'Now Playing' : 'Anime Detail'}</p>
          {showNowPlayingPane ? (
            <span className={`right-now-indicator ${isPlaying ? 'is-playing' : ''}`} aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          ) : null}
        </div>
        <div className="inline-flex items-center gap-1.5">
          {isFullNowPlayingView && !showVideoOverlayControls ? (
            <button
              type="button"
              className={`right-panel-fullpage-btn retro-tooltip ${isFullQueueDrawerOpen ? 'is-active' : ''}`}
              ref={queueToggleRef}
              onClick={onToggleQueueDrawer}
              aria-label={isFullQueueDrawerOpen ? 'Close queue drawer' : 'Open queue drawer'}
              data-tooltip={isFullQueueDrawerOpen ? 'Close Queue Drawer' : 'Open Queue Drawer'}
            >
              <List size={13} />
            </button>
          ) : null}
          {showNowPlayingPane ? (
            <button
              type="button"
              className={`right-panel-mode-btn retro-tooltip ${isRightPanelFullpage ? 'is-full' : 'is-docked'}`}
              onClick={onToggleRightPanelFullpage}
              aria-label={isRightPanelFullpage ? 'Switch to docked panel mode' : 'Switch to expanded panel mode'}
              data-tooltip={isRightPanelFullpage ? 'Switch to Docked Panel' : 'Switch to Expanded Panel'}
            >
              {isRightPanelFullpage ? (
                <svg viewBox="0 0 20 20" aria-hidden="true" className="right-panel-mode-icon" focusable="false">
                  <rect x="3" y="4" width="14" height="12" rx="1.6" className="mode-frame" />
                  <path d="M11.8 5.4h4.2v9.2h-4.2z" className="mode-pane" />
                  <path d="M6 7.2h3.1v1.1H6zM6 9.5h3.1v1.1H6zM6 11.8h3.1v1.1H6z" className="mode-line" />
                </svg>
              ) : (
                <svg viewBox="0 0 20 20" aria-hidden="true" className="right-panel-mode-icon" focusable="false">
                  <rect x="3" y="4" width="14" height="12" rx="1.6" className="mode-frame" />
                  <path d="M4.6 5.4h10.8v9.2H4.6z" className="mode-pane" />
                  <path d="M6.3 7.1h7.4v1.1H6.3zM6.3 9.45h7.4v1.1H6.3zM6.3 11.8h5.1v1.1H6.3z" className="mode-line" />
                </svg>
              )}
            </button>
          ) : null}
          {showNowPlayingPane && isNonTrailerPlayback && !showVideoOverlayControls ? (
            <button
              type="button"
              ref={logToggleRef}
              className={`source-log-btn retro-tooltip ${isSourceLogOpen ? 'is-active' : ''}`}
              onClick={onToggleSourceLog}
              aria-label={isSourceLogOpen ? 'Hide source resolve log' : 'Show source resolve log'}
              data-tooltip={isSourceLogOpen ? 'Hide Source Log' : 'Show Source Log'}
            >
              <ScrollText size={12} />
            </button>
          ) : null}
          <div ref={paneLayoutMenuRef} className="relative">
            <button
              type="button"
              className="right-panel-fullpage-btn retro-tooltip"
              aria-label="Pane layout options"
              data-tooltip="Pane Layout"
              onClick={onTogglePaneLayoutMenu}
            >
              <EllipsisVertical size={13} />
            </button>
            {isPaneLayoutMenuOpen ? (
              <div className="right-pane-layout-menu" role="menu" aria-label="Pane layout options">
                <button type="button" role="menuitem" className="right-pane-layout-btn is-active" onClick={onClosePaneLayoutMenu}>
                  Full Right Panel
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {showNowPlayingPane ? (
        <>
          <h2 className="anime-card-title line-clamp-2">{fallbackDisplayTitle}</h2>
          <p className="anime-card-jp mt-0.5 line-clamp-1">{fallbackDisplayJapanese}</p>
          {currentlyPlayingKind === 'episode' ? (
            <>
              <p className="anime-card-video-badge mt-1 block max-w-full line-clamp-1" data-tooltip={fallbackTypeLabel} data-tooltip-sub={episodeDisplayJapanese || undefined}>
                {fallbackTypeLabel}
              </p>
              {episodeDisplayJapanese ? <p className="anime-card-jp mt-0.5 line-clamp-1 text-amberline/80">{episodeDisplayJapanese}</p> : null}
            </>
          ) : (
            <p className="anime-card-video-badge mt-1 inline-flex">{fallbackTypeLabel}</p>
          )}
          {!showVideoOverlayControls ? sourceResolveControls : null}
          {isNonTrailerPlayback && isSourceLogOpen && !showVideoOverlayControls ? (
            <SourceResolveLogPanel
              sourceResolveTrace={sourceResolveTrace}
              isResolvingSource={isResolvingSource}
              onClearRateLimit={onClearRateLimit}
            />
          ) : null}
        </>
      ) : isPluginsView ? (
        <>
          <h2 className="line-clamp-2 font-display text-xl font-semibold uppercase text-cream">Plugin Sources</h2>
          <p className="mt-0.5 text-xs text-cream/68">Manage source priority and preferred plugin.</p>
        </>
      ) : (
        <>
          <h2 className="line-clamp-2 font-display text-xl font-semibold uppercase text-cream">{detailDisplayTitle}</h2>
          {detailAnimeView ? <p className="anime-card-jp mt-0.5 line-clamp-1">{detailAnimeView.titleJapanese}</p> : null}
        </>
      )}
    </div>
  );
}
