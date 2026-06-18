import { RotateCcw } from 'lucide-react';
import type { SourceAudioLanguage } from '../types/plugin';
import { SourceSelectorField, type LogoSelectItem } from './SourceSelector';

type RightNowSourceResolveControlsProps = {
  isNonTrailerPlayback: boolean;
  showVideoOverlayControls: boolean;
  preferredSourcePluginId: string | null;
  onPreferredSourcePluginChange: (pluginId: string | null) => void;
  sourceSelectorItems: LogoSelectItem[];
  sourcePluginsCount: number;
  preferredAudioLanguage: SourceAudioLanguage;
  onPreferredAudioLanguageChange: (language: SourceAudioLanguage) => void;
  audioSelectorItems: LogoSelectItem[];
  sourceOptionsCount: number;
  activeResolvedSourceOptionId: string | null;
  onSelectedSourceOptionChange: (optionId: string | null) => void;
  optionSelectorItems: LogoSelectItem[];
  subtitleTracksCount: number;
  selectedSubtitleId: string | null;
  onSelectedSubtitleChange: (subtitleId: string | null) => void;
  subtitleSelectorItems: LogoSelectItem[];
  onRetrySourceResolve: () => void;
  isResolvingSource: boolean;
};

export default function RightNowSourceResolveControls({
  isNonTrailerPlayback,
  showVideoOverlayControls,
  preferredSourcePluginId,
  onPreferredSourcePluginChange,
  sourceSelectorItems,
  sourcePluginsCount,
  preferredAudioLanguage,
  onPreferredAudioLanguageChange,
  audioSelectorItems,
  sourceOptionsCount,
  activeResolvedSourceOptionId,
  onSelectedSourceOptionChange,
  optionSelectorItems,
  subtitleTracksCount,
  selectedSubtitleId,
  onSelectedSubtitleChange,
  subtitleSelectorItems,
  onRetrySourceResolve,
  isResolvingSource,
}: RightNowSourceResolveControlsProps) {
  if (!isNonTrailerPlayback) {
    return null;
  }

  return (
    <div className={`${showVideoOverlayControls ? 'right-now-full-overlay-row' : 'mt-2 flex flex-wrap items-center gap-1.5'}`}>
      <SourceSelectorField
        label="Source"
        ariaLabel="Choose source plugin preference"
        value={preferredSourcePluginId ?? 'auto'}
        onChange={(value) => {
          onPreferredSourcePluginChange(value === 'auto' ? null : value);
        }}
        items={sourceSelectorItems}
        disabled={sourcePluginsCount === 0}
        placeholder="No Plugins"
      />
      <SourceSelectorField
        label="Audio"
        ariaLabel="Preferred audio language"
        value={preferredAudioLanguage}
        onChange={(value) => {
          const next = value === 'dub' ? 'dub' : 'sub';
          onPreferredAudioLanguageChange(next);
        }}
        items={audioSelectorItems}
        disabled={!isNonTrailerPlayback}
      />
      {sourceOptionsCount > 0 ? (
        <SourceSelectorField
          label="Server"
          ariaLabel="Choose active source server"
          value={activeResolvedSourceOptionId ?? 'auto'}
          onChange={(value) => {
            onSelectedSourceOptionChange(value === 'auto' ? null : value);
          }}
          items={optionSelectorItems}
        />
      ) : null}
      {subtitleTracksCount > 0 ? (
        <SourceSelectorField
          label="Subtitles"
          ariaLabel="Choose subtitle track"
          value={selectedSubtitleId ?? 'auto'}
          onChange={(value) => {
            onSelectedSubtitleChange(value === 'auto' ? null : value);
          }}
          items={subtitleSelectorItems}
        />
      ) : null}
      <button
        type="button"
        className={`${showVideoOverlayControls ? 'source-log-btn right-now-full-overlay-retry-btn' : 'source-log-btn right-now-retry-btn'} retro-tooltip`}
        onClick={onRetrySourceResolve}
        aria-label="Retry source resolve"
        data-tooltip={isResolvingSource ? 'Retrying Source Resolve...' : 'Retry Source Resolve'}
        disabled={isResolvingSource || sourcePluginsCount === 0}
      >
        <RotateCcw size={12} className={isResolvingSource ? 'animate-spin' : undefined} />
      </button>
    </div>
  );
}
