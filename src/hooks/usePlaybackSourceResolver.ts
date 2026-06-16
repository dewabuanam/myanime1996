import { useCallback, useEffect, useRef, useState } from 'react';
import { getLatestUpdatedAnime, refreshHomeShelvesIfNeeded } from '../services/catalogSource';
import { resolveSourceForPlayable, resolveSourceForPlayableWithTrace } from '../services/sourceResolver';
import type { BaseCatalogSource } from '../services/catalogSource';
import type { PlayableItem } from '../types/anime';
import type { ImportedSourcePluginDefinition, ResolvedSource, SourceAudioLanguage, SourceResolveTrace } from '../types/plugin';

const MIN_SOURCE_RESOLVE_VISIBLE_MS = 700;
const BACKGROUND_LATEST_RESOLVE_LIMIT = 5;
const HOME_REFRESH_LIMIT = 20;

type UsePlaybackSourceResolverArgs = {
  currentlyPlayingItem: PlayableItem | null;
  importedSourcePlugins: ImportedSourcePluginDefinition[];
  pluginPriority: string[];
  pluginEnabled: Record<string, boolean>;
  baseCatalogSource: BaseCatalogSource;
  preferredSourcePluginId: string | null;
  preferredAudioLanguage: SourceAudioLanguage;
  setResolvingPlaybackSource: (resolving: boolean) => void;
  setSelectedSourceOptionId: (optionId: string | null) => void;
  onPrimeResolvedEpisode: (playable: PlayableItem, isCancelled: () => boolean) => Promise<void>;
  onClearEpisodeMetadata: () => void;
};

type UsePlaybackSourceResolverResult = {
  resolvedSource: ResolvedSource | null;
  isResolvingSource: boolean;
  sourceResolveTrace: SourceResolveTrace | null;
  retrySourceResolve: () => void;
};

export function usePlaybackSourceResolver({
  currentlyPlayingItem,
  importedSourcePlugins,
  pluginPriority,
  pluginEnabled,
  baseCatalogSource,
  preferredSourcePluginId,
  preferredAudioLanguage,
  setResolvingPlaybackSource,
  setSelectedSourceOptionId,
  onPrimeResolvedEpisode,
  onClearEpisodeMetadata,
}: UsePlaybackSourceResolverArgs): UsePlaybackSourceResolverResult {
  const [resolvedSource, setResolvedSource] = useState<ResolvedSource | null>(null);
  const [isResolvingSource, setIsResolvingSource] = useState(false);
  const [sourceResolveTrace, setSourceResolveTrace] = useState<SourceResolveTrace | null>(null);
  const [sourceResolveRetryToken, setSourceResolveRetryToken] = useState(0);
  const lastBackgroundResolveKeyRef = useRef<string | null>(null);
  const onPrimeResolvedEpisodeRef = useRef(onPrimeResolvedEpisode);
  const onClearEpisodeMetadataRef = useRef(onClearEpisodeMetadata);

  useEffect(() => {
    onPrimeResolvedEpisodeRef.current = onPrimeResolvedEpisode;
  }, [onPrimeResolvedEpisode]);

  useEffect(() => {
    onClearEpisodeMetadataRef.current = onClearEpisodeMetadata;
  }, [onClearEpisodeMetadata]);

  const retrySourceResolve = useCallback(() => {
    setSourceResolveRetryToken((value) => value + 1);
  }, []);

  useEffect(() => {
    const playable = currentlyPlayingItem;
    if (!playable || playable.kind === 'trailer') {
      setResolvingPlaybackSource(false);
      setResolvedSource(null);
      setIsResolvingSource(false);
      setSourceResolveTrace(null);
      setSelectedSourceOptionId(null);
      return;
    }

    if (importedSourcePlugins.length === 0) {
      setResolvingPlaybackSource(false);
      setResolvedSource(null);
      setIsResolvingSource(false);
      setSourceResolveTrace({
        createdAt: new Date().toISOString(),
        activePluginIds: [],
        preferredSourcePluginId: preferredSourcePluginId ?? undefined,
        preferredAudioLanguage,
        attempts: [],
      });
      return;
    }

    let cancelled = false;
    setResolvingPlaybackSource(true);
    setIsResolvingSource(true);
    setResolvedSource(null);
    const initialTrace: SourceResolveTrace = {
      createdAt: new Date().toISOString(),
      activePluginIds: [],
      preferredSourcePluginId: preferredSourcePluginId ?? undefined,
      preferredAudioLanguage,
      attempts: [],
    };
    setSourceResolveTrace(initialTrace);
    setSelectedSourceOptionId(null);
    const resolveStartedAt = Date.now();

    const runResolve = async () => {
      const { resolved, trace } = await resolveSourceForPlayableWithTrace(
        playable,
        {
          importedPlugins: importedSourcePlugins,
          pluginPriority,
          pluginEnabled,
          baseCatalogSource,
          preferredSourcePluginId: preferredSourcePluginId ?? undefined,
          preferredAudioLanguage,
        },
        (attempt) => {
          if (cancelled) return;
          setSourceResolveTrace((current) => {
            if (!current) return current;
            return {
              ...current,
              attempts: [...current.attempts, attempt],
            };
          });
        },
      );

      const elapsedMs = Date.now() - resolveStartedAt;
      const remainingMs = Math.max(0, MIN_SOURCE_RESOLVE_VISIBLE_MS - elapsedMs);
      if (remainingMs > 0) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, remainingMs);
        });
      }

      if (cancelled) return;

      if (resolved && playable.kind === 'episode') {
        await onPrimeResolvedEpisodeRef.current(playable, () => cancelled);
      } else {
        onClearEpisodeMetadataRef.current();
      }

      setResolvedSource(resolved);
      setSourceResolveTrace((current) => {
        if (!current) return trace;
        return {
          ...trace,
          attempts: current.attempts.length > 0 ? current.attempts : trace.attempts,
        };
      });
      setIsResolvingSource(false);
      setResolvingPlaybackSource(false);
    };

    void runResolve();

    return () => {
      cancelled = true;
    };
  }, [
    baseCatalogSource,
    currentlyPlayingItem,
    importedSourcePlugins,
    pluginEnabled,
    pluginPriority,
    preferredAudioLanguage,
    preferredSourcePluginId,
    setResolvingPlaybackSource,
    setSelectedSourceOptionId,
    sourceResolveRetryToken,
  ]);

  useEffect(() => {
    if (!currentlyPlayingItem || currentlyPlayingItem.kind !== 'episode') return;
    if (!resolvedSource) return;
    if (!importedSourcePlugins.length) return;

    const currentEpisode = Math.max(1, Math.round(currentlyPlayingItem.episodeNumber ?? 1));
    const totalEpisodes = Math.max(0, Math.round(currentlyPlayingItem.anime.episodes ?? 0));

    const preferenceSignature = [
      preferredAudioLanguage,
      preferredSourcePluginId ?? 'auto',
      baseCatalogSource,
      importedSourcePlugins.map((plugin) => plugin.id).join(','),
      pluginPriority.join(','),
      Object.entries(pluginEnabled)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, enabled]) => `${id}:${enabled ? '1' : '0'}`)
        .join(','),
    ].join('::');

    const backgroundResolveKey = `${currentlyPlayingItem.id}::${preferenceSignature}`;
    if (lastBackgroundResolveKeyRef.current === backgroundResolveKey) {
      return;
    }
    lastBackgroundResolveKeyRef.current = backgroundResolveKey;

    const toEpisodePlayableItem = (anime: PlayableItem['anime'], episodeNumber: number, scope: string): PlayableItem => ({
      id: `${anime.id}:episode:ep-${episodeNumber}:${scope}`,
      anime,
      kind: 'episode',
      sourceKind: 'episode-card',
      title: anime.title,
      titleJapanese: anime.titleJapanese,
      durationMinutes: anime.durationMinutes,
      episodeNumber,
      typeLabel: `Episode ${episodeNumber}`,
      createdAt: new Date().toISOString(),
    });

    const neighborEpisodes = [currentEpisode - 1, currentEpisode + 1].filter(
      (episodeNumber, index, list) =>
        episodeNumber >= 1 &&
        (totalEpisodes <= 0 || episodeNumber <= totalEpisodes) &&
        list.indexOf(episodeNumber) === index,
    );

    for (const episodeNumber of neighborEpisodes) {
      const neighborItem = toEpisodePlayableItem(currentlyPlayingItem.anime, episodeNumber, 'neighbor-prefetch');
      void resolveSourceForPlayable(neighborItem, {
        importedPlugins: importedSourcePlugins,
        pluginPriority,
        pluginEnabled,
        baseCatalogSource,
        preferredSourcePluginId: preferredSourcePluginId ?? undefined,
        preferredAudioLanguage,
      }).catch(() => {
        // Neighbor prefetch should stay silent and never block active playback.
      });
    }

    let cancelled = false;
    const prefetchLatestUpdates = async () => {
      try {
        await refreshHomeShelvesIfNeeded(HOME_REFRESH_LIMIT);
        const latestUpdated = await getLatestUpdatedAnime(BACKGROUND_LATEST_RESOLVE_LIMIT);
        if (cancelled || latestUpdated.length === 0) return;

        const seen = new Set<string>();
        const latestItems = latestUpdated
          .slice(0, BACKGROUND_LATEST_RESOLVE_LIMIT)
          .map((anime) => {
            const episodeNumber = Math.max(1, Math.round(anime.episodes ?? 1));
            return toEpisodePlayableItem(anime, episodeNumber, 'latest-prefetch');
          })
          .filter((item) => {
            const identity = `${item.anime.id}:${item.episodeNumber ?? 1}`;
            if (seen.has(identity)) return false;
            seen.add(identity);
            return true;
          });

        for (const item of latestItems) {
          if (cancelled) return;
          void resolveSourceForPlayable(item, {
            importedPlugins: importedSourcePlugins,
            pluginPriority,
            pluginEnabled,
            baseCatalogSource,
            preferredSourcePluginId: preferredSourcePluginId ?? undefined,
            preferredAudioLanguage,
          }).catch(() => {
            // Latest-update prefetch should stay silent and never block active playback.
          });
        }
      } catch {
        // Ignore refresh/fetch failures for background prefetch.
      }
    };

    void prefetchLatestUpdates();

    return () => {
      cancelled = true;
    };
  }, [
    baseCatalogSource,
    currentlyPlayingItem,
    importedSourcePlugins,
    pluginEnabled,
    pluginPriority,
    preferredAudioLanguage,
    preferredSourcePluginId,
    resolvedSource,
  ]);

  useEffect(() => {
    return () => {
      setResolvingPlaybackSource(false);
    };
  }, [setResolvingPlaybackSource]);

  return {
    resolvedSource,
    isResolvingSource,
    sourceResolveTrace,
    retrySourceResolve,
  };
}
