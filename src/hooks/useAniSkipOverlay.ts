import { useEffect, useRef, useState } from 'react';
import { ANISKIP_LABELS, voteOnAniSkip, type AniSkipType } from '../services/aniSkip';

const ANISKIP_OVERLAY_FADE_MS = 10000;

type UseAniSkipOverlayArgs = {
  requestSeekTo: (seconds: number) => void;
  setAnimeSkipButtonSegment: (segment: { type: AniSkipType; startTime: number; endTime: number; skipId: string } | null) => void;
};

type UseAniSkipOverlayResult = {
  activeAniSkipType: AniSkipType | null;
  setActiveAniSkipType: (type: AniSkipType | null) => void;
  isAniSkipOverlayFading: boolean;
  setIsAniSkipOverlayFading: (fading: boolean) => void;
  autoSkipToastLabel: string | null;
  clearAniSkipFadeTimer: () => void;
  restartAniSkipFadeTimer: () => void;
  performAniSkip: (type: AniSkipType, segment: { endTime: number; skipId: string }, shouldVote: boolean) => void;
};

export function useAniSkipOverlay({ requestSeekTo, setAnimeSkipButtonSegment }: UseAniSkipOverlayArgs): UseAniSkipOverlayResult {
  const aniSkipFadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aniSkipToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeAniSkipType, setActiveAniSkipType] = useState<AniSkipType | null>(null);
  const [isAniSkipOverlayFading, setIsAniSkipOverlayFading] = useState(false);
  const [autoSkipToastLabel, setAutoSkipToastLabel] = useState<string | null>(null);

  const clearAniSkipFadeTimer = () => {
    if (!aniSkipFadeTimerRef.current) return;
    clearTimeout(aniSkipFadeTimerRef.current);
    aniSkipFadeTimerRef.current = null;
  };

  const restartAniSkipFadeTimer = () => {
    clearAniSkipFadeTimer();
    setIsAniSkipOverlayFading(false);
    aniSkipFadeTimerRef.current = setTimeout(() => {
      setIsAniSkipOverlayFading(true);
      aniSkipFadeTimerRef.current = null;
    }, ANISKIP_OVERLAY_FADE_MS);
  };

  const showAniSkipToast = (type: AniSkipType) => {
    if (aniSkipToastTimerRef.current) {
      clearTimeout(aniSkipToastTimerRef.current);
      aniSkipToastTimerRef.current = null;
    }
    setAutoSkipToastLabel(ANISKIP_LABELS[type]);
    aniSkipToastTimerRef.current = setTimeout(() => {
      setAutoSkipToastLabel(null);
      aniSkipToastTimerRef.current = null;
    }, 2500);
  };

  const performAniSkip = (type: AniSkipType, segment: { endTime: number; skipId: string }, shouldVote: boolean) => {
    requestSeekTo(segment.endTime);
    setAnimeSkipButtonSegment(null);
    setActiveAniSkipType(null);
    setIsAniSkipOverlayFading(false);
    clearAniSkipFadeTimer();
    if (shouldVote) {
      void voteOnAniSkip('upvote', segment.skipId);
    }
    if (!shouldVote) {
      showAniSkipToast(type);
    }
  };

  useEffect(() => {
    return () => {
      clearAniSkipFadeTimer();
      if (aniSkipToastTimerRef.current) {
        clearTimeout(aniSkipToastTimerRef.current);
        aniSkipToastTimerRef.current = null;
      }
      setAnimeSkipButtonSegment(null);
    };
  }, [setAnimeSkipButtonSegment]);

  return {
    activeAniSkipType,
    setActiveAniSkipType,
    isAniSkipOverlayFading,
    setIsAniSkipOverlayFading,
    autoSkipToastLabel,
    clearAniSkipFadeTimer,
    restartAniSkipFadeTimer,
    performAniSkip,
  };
}
