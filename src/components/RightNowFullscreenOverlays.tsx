import { List, ScrollText } from 'lucide-react';
import type { ReactNode, RefObject } from 'react';
import { ANISKIP_LABELS, type AniSkipType } from '../services/aniSkip';

type AniSkipSegment = {
  startTime: number;
  endTime: number;
  skipId: string;
};

type RightNowFullscreenOverlaysProps = {
  showVideoOverlayControls: boolean;
  isFullscreenOverlayVisible: boolean;
  sourceResolveControls: ReactNode;
  isFullQueueDrawerOpen: boolean;
  isSourceLogOpen: boolean;
  isNonTrailerPlayback: boolean;
  queueToggleRef: RefObject<HTMLButtonElement>;
  logToggleRef: RefObject<HTMLButtonElement>;
  onToggleQueueDrawer: () => void;
  onToggleSourceLog: () => void;
  activeAniSkipType: AniSkipType | null;
  activeAniSkipSegment: AniSkipSegment | null;
  playbackSupportMode: 'fully-supported' | 'fullscreen-only' | 'fully-unsupported';
  isAniSkipOverlayFading: boolean;
  onAniSkipOverlayPointerEnter: () => void;
  onAniSkipOverlayFocus: () => void;
  onAniSkipOverlayClick: () => void;
};

export default function RightNowFullscreenOverlays({
  showVideoOverlayControls,
  isFullscreenOverlayVisible,
  sourceResolveControls,
  isFullQueueDrawerOpen,
  isSourceLogOpen,
  isNonTrailerPlayback,
  queueToggleRef,
  logToggleRef,
  onToggleQueueDrawer,
  onToggleSourceLog,
  activeAniSkipType,
  activeAniSkipSegment,
  playbackSupportMode,
  isAniSkipOverlayFading,
  onAniSkipOverlayPointerEnter,
  onAniSkipOverlayFocus,
  onAniSkipOverlayClick,
}: RightNowFullscreenOverlaysProps) {
  if (!showVideoOverlayControls) {
    return null;
  }

  const showFullscreenAniSkipButton =
    Boolean(activeAniSkipType) &&
    Boolean(activeAniSkipSegment) &&
    playbackSupportMode === 'fully-supported';

  return (
    <>
      <div className={`right-now-full-overlay-top-left right-now-static-overlay ${isFullscreenOverlayVisible ? '' : 'is-hidden'}`}>
        {sourceResolveControls}
      </div>

      <div className={`right-now-full-overlay-top-right right-now-static-overlay ${isFullscreenOverlayVisible ? '' : 'is-hidden'}`}>
        <div className="right-now-full-overlay-actions">
          <button
            type="button"
            className={`source-log-btn retro-tooltip ${isFullQueueDrawerOpen ? 'is-active' : ''}`}
            ref={queueToggleRef}
            onClick={onToggleQueueDrawer}
            aria-label={isFullQueueDrawerOpen ? 'Close queue drawer' : 'Open queue drawer'}
            data-tooltip={isFullQueueDrawerOpen ? 'Close Queue Drawer' : 'Open Queue Drawer'}
          >
            <List size={13} />
          </button>

          {isNonTrailerPlayback ? (
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
        </div>
      </div>

      {showFullscreenAniSkipButton && activeAniSkipType && activeAniSkipSegment ? (
        <div className="aniskip-overlay-wrap right-now-static-overlay">
          <button
            type="button"
            className={`aniskip-overlay-btn ${isAniSkipOverlayFading ? 'is-fading' : ''}`}
            onMouseEnter={onAniSkipOverlayPointerEnter}
            onFocus={onAniSkipOverlayFocus}
            onClick={onAniSkipOverlayClick}
            aria-label={`Skip ${ANISKIP_LABELS[activeAniSkipType]}`}
          >
            {`Skip ${ANISKIP_LABELS[activeAniSkipType]}`}
          </button>
        </div>
      ) : null}
    </>
  );
}
