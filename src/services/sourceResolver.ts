import type { PlayableItem } from '../types/anime';
import type {
  ImportedSourcePluginDefinition,
  ResolvedSource,
  SourceAudioLanguage,
  SourceResolveAttemptLog,
  SourcePluginInfo,
  SourceResolveTrace,
} from '../types/plugin';
import { executeImportedPluginResolver } from './pluginExecutor';
import { getAnimeDetails } from './catalogSource';
import { getCachedResolvedSource, setCachedResolvedSource } from './sourceCache';
import type { BaseCatalogSource } from './catalogSource';

type ResolverTraceError = Error & {
  steps?: string[];
};

function toIconDataUri(plugin: ImportedSourcePluginDefinition) {
  if (!plugin.iconPng?.dataBase64) return undefined;
  return `data:${plugin.iconPng.mimeType};base64,${plugin.iconPng.dataBase64}`;
}

function toDisplayPluginName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return 'Unknown Plugin';

  // Keep plugin artifacts flexible but avoid repeating generic trailing "Source" in UI labels.
  return trimmed.replace(/\s+source\s*$/i, '');
}

export function getAvailableSourcePlugins(importedPlugins: ImportedSourcePluginDefinition[]): SourcePluginInfo[] {
  return importedPlugins.map((plugin) => ({
    id: plugin.id,
    name: toDisplayPluginName(plugin.name),
    version: plugin.version,
    iconDataUri: toIconDataUri(plugin),
  }));
}

export function getDefaultPluginPriority(importedPlugins: ImportedSourcePluginDefinition[]): string[] {
  return importedPlugins.map((plugin) => plugin.id);
}

type ResolveSourceOptions = {
  importedPlugins: ImportedSourcePluginDefinition[];
  pluginPriority: string[];
  pluginEnabled: Record<string, boolean>;
  baseCatalogSource: BaseCatalogSource;
  preferredSourcePluginId?: string;
  preferredAudioLanguage?: SourceAudioLanguage;
  selectedSourceOptionId?: string;
};

function nowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

async function hydratePlayableItemDuration(item: PlayableItem): Promise<PlayableItem> {
  if (item.kind === 'trailer') return item;

  const hasDuration =
    Number(item.durationMinutes || 0) > 0 ||
    Number(item.anime.durationMinutes || 0) > 0 ||
    Boolean(item.anime.duration?.trim());

  if (hasDuration) return item;

  try {
    const detail = await getAnimeDetails(item.anime.id);
    const durationMinutes = detail.durationMinutes;
    const duration = detail.duration;

    if (!durationMinutes && !duration) {
      return item;
    }

    return {
      ...item,
      durationMinutes: item.durationMinutes ?? durationMinutes,
      anime: {
        ...item.anime,
        duration: item.anime.duration ?? duration,
        durationMinutes: item.anime.durationMinutes ?? durationMinutes,
      },
    };
  } catch {
    return item;
  }
}

export async function resolveSourceForPlayableWithTrace(
  item: PlayableItem,
  options: ResolveSourceOptions,
  onAttempt?: (attempt: SourceResolveAttemptLog) => void,
): Promise<{ resolved: ResolvedSource | null; trace: SourceResolveTrace }> {
  const trace: SourceResolveTrace = {
    createdAt: new Date().toISOString(),
    activePluginIds: [],
    preferredSourcePluginId: options.preferredSourcePluginId,
    preferredAudioLanguage: options.preferredAudioLanguage,
    attempts: [],
  };

  if (item.kind === 'trailer') {
    return { resolved: null, trace };
  }

  if (!options.importedPlugins.length) {
    return { resolved: null, trace };
  }

  const resolverItem = await hydratePlayableItemDuration(item);

  const pluginById = new Map(options.importedPlugins.map((plugin) => [plugin.id, plugin]));
  const orderedIds = [...options.pluginPriority];

  for (const plugin of options.importedPlugins) {
    if (!orderedIds.includes(plugin.id)) {
      orderedIds.push(plugin.id);
    }
  }

  const enabledIds = orderedIds.filter((id) => {
    const explicit = options.pluginEnabled[id];
    return explicit !== false;
  });

  let candidateIds = enabledIds;
  if (options.preferredSourcePluginId && enabledIds.includes(options.preferredSourcePluginId)) {
    candidateIds = [
      options.preferredSourcePluginId,
      ...enabledIds.filter((id) => id !== options.preferredSourcePluginId),
    ];
  }

  trace.activePluginIds = candidateIds;

  for (const [index, pluginId] of candidateIds.entries()) {
    const plugin = pluginById.get(pluginId);

    if (!plugin) {
      const attempt: SourceResolveAttemptLog = {
        pluginId,
        pluginName: pluginId,
        order: index + 1,
        status: 'skipped-not-loaded',
        durationMs: 0,
        message: 'Plugin id present in active order but definition is not loaded.',
      };
      trace.attempts.push(attempt);
      onAttempt?.(attempt);
      continue;
    }

    const startedAt = nowMs();

    try {
      const identity = {
        pluginId,
        provider: options.baseCatalogSource,
        animeId: resolverItem.anime.id,
        title: resolverItem.title,
        episodeNumber: resolverItem.episodeNumber ?? 1,
        language: options.preferredAudioLanguage,
        sourceOptionId: options.selectedSourceOptionId,
      };

      const cached = await getCachedResolvedSource(identity);
      if (cached) {
        const attempt: SourceResolveAttemptLog = {
          pluginId,
          pluginName: plugin.name,
          order: index + 1,
          status: 'cache-hit',
          durationMs: Math.round(nowMs() - startedAt),
          message: 'Cache hit for this item identity. Resolver execution skipped.',
        };
        trace.attempts.push(attempt);
        onAttempt?.(attempt);
        trace.resolvedPluginId = pluginId;
        trace.resolvedLabel = cached.label ?? plugin.name;
        trace.resolvedLanguage = cached.language;
        return { resolved: cached, trace };
      }

      const execution = await executeImportedPluginResolver(plugin, resolverItem, {
        audioLanguage: options.preferredAudioLanguage,
      });
      if (execution.resolved) {
        await setCachedResolvedSource(identity, execution.resolved);
        const attempt: SourceResolveAttemptLog = {
          pluginId,
          pluginName: plugin.name,
          order: index + 1,
          status: 'resolved',
          durationMs: Math.round(nowMs() - startedAt),
          message: execution.message,
          steps: execution.steps,
        };
        trace.attempts.push(attempt);
        onAttempt?.(attempt);
        trace.resolvedPluginId = pluginId;
        trace.resolvedLabel = execution.resolved.label ?? plugin.name;
        trace.resolvedLanguage = execution.resolved.language;
        return { resolved: execution.resolved, trace };
      }

      const attempt: SourceResolveAttemptLog = {
        pluginId,
        pluginName: plugin.name,
        order: index + 1,
        status: 'no-match',
        durationMs: Math.round(nowMs() - startedAt),
        message: execution.message,
        steps: execution.steps,
      };
      trace.attempts.push(attempt);
      onAttempt?.(attempt);
    } catch (error) {
      const traceError = error as ResolverTraceError;
      const attempt: SourceResolveAttemptLog = {
        pluginId,
        pluginName: plugin.name,
        order: index + 1,
        status: 'error',
        durationMs: Math.round(nowMs() - startedAt),
        message: error instanceof Error ? error.message : 'Resolver execution failed.',
        steps: Array.isArray(traceError?.steps)
          ? traceError.steps
              .map((entry) => String(entry || '').trim())
              .filter((entry) => entry.length > 0)
              .slice(0, 80)
          : undefined,
      };
      trace.attempts.push(attempt);
      onAttempt?.(attempt);
    }
  }

  return { resolved: null, trace };
}

export async function resolveSourceForPlayable(item: PlayableItem, options: ResolveSourceOptions): Promise<ResolvedSource | null> {
  const { resolved } = await resolveSourceForPlayableWithTrace(item, options);
  return resolved;
}