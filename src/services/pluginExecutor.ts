import type { PlayableItem } from '../types/anime';
import type {
  ImportedSourcePluginDefinition,
  PluginResolverRuntimeApi,
  PluginResolverRuntimeRequest,
  ResolvedSource,
  ResolvedSourceOption,
  ResolvedSubtitleTrack,
  SourceAudioLanguage,
} from '../types/plugin';

type ResolvePreferences = {
  audioLanguage?: SourceAudioLanguage;
  sourceOptionId?: string;
};

type PluginResolverFunction = (
  request: PluginResolverRuntimeRequest,
  api: PluginResolverRuntimeApi,
) => Promise<ResolvedSource | null> | ResolvedSource | null;

const compiledResolverCache = new Map<string, PluginResolverFunction>();

function isPluginRuntimeCacheKey(key: string) {
  return /^__myanime1996.*cache$/i.test(key);
}

function listPluginRuntimeCacheKeys() {
  const keys: string[] = [];
  for (const rawKey of Reflect.ownKeys(globalThis)) {
    if (typeof rawKey !== 'string') continue;
    if (!isPluginRuntimeCacheKey(rawKey)) continue;
    keys.push(rawKey);
  }
  return keys.sort((left, right) => left.localeCompare(right));
}

export function getPluginResolverCacheSnapshot(): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  for (const key of listPluginRuntimeCacheKeys()) {
    snapshot[key] = (globalThis as Record<string, unknown>)[key];
  }
  return snapshot;
}

export function clearPluginResolverCacheByKey(cacheKey: string): boolean {
  const trimmed = String(cacheKey || '').trim();
  if (!trimmed || !isPluginRuntimeCacheKey(trimmed)) return false;
  return Reflect.deleteProperty(globalThis, trimmed);
}

export function replacePluginResolverCacheByKey(cacheKey: string, value: unknown): boolean {
  const trimmed = String(cacheKey || '').trim();
  if (!trimmed || !isPluginRuntimeCacheKey(trimmed)) return false;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;

  try {
    (globalThis as Record<string, unknown>)[trimmed] = value;
    return true;
  } catch {
    return false;
  }
}

export function clearPluginResolverCaches(): void {
  compiledResolverCache.clear();

  for (const key of listPluginRuntimeCacheKeys()) {
    Reflect.deleteProperty(globalThis, key);
  }
}

/**
 * Clear only the rate-limit cooldown flag from all imported plugin global caches.
 * This allows the user to manually unblock a plugin that was rate-limited (HTTP 429)
 * without wiping the full resolve cache.
 */
export function clearPluginRateLimit(): void {
  for (const key of listPluginRuntimeCacheKeys()) {
    try {
      const cache = (globalThis as Record<string, unknown>)[key];
      if (cache && typeof cache === 'object' && 'rateLimit' in cache) {
        const rateLimit = (cache as Record<string, unknown>).rateLimit;
        if (rateLimit && typeof rateLimit === 'object') {
          (rateLimit as Record<string, number | string>).blockedUntil = 0;
          (rateLimit as Record<string, number | string>).reason = '';
        }
      }
    } catch {
      // Silently skip inaccessible or frozen caches.
    }
  }
}

export type PluginResolverExecution = {
  resolved: ResolvedSource | null;
  message: string;
  steps: string[];
};

type ResolverExecutionError = Error & {
  steps?: string[];
};

function parseDurationMinutes(rawDuration?: string): number | undefined {
  if (!rawDuration) return undefined;

  const text = rawDuration.toLowerCase();
  const hourMatch = text.match(/(\d+)\s*hr/);
  const minuteMatch = text.match(/(\d+)\s*min/);

  const hours = hourMatch ? Number(hourMatch[1]) : 0;
  const minutes = minuteMatch ? Number(minuteMatch[1]) : 0;
  const total = hours * 60 + minutes;

  return Number.isFinite(total) && total > 0 ? total : undefined;
}

function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wildcardPatternToRegex(pattern: string) {
  const escaped = pattern
    .split('*')
    .map((part) => escapeRegex(part))
    .join('.*');
  return new RegExp(`^${escaped}$`, 'i');
}

function toRequestUrl(input: RequestInfo | URL) {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  if ('url' in input && typeof input.url === 'string') return input.url;
  return '';
}

function isDeclaredPluginHost(plugin: ImportedSourcePluginDefinition, targetUrl: URL) {
  const hostRequirements = plugin.hostRequirements;
  if (!hostRequirements) return false;

  const connectAllowed = hostRequirements.connectSrcOrigins?.some((origin) => {
    try {
      return new URL(origin).origin === targetUrl.origin;
    } catch {
      return false;
    }
  });

  if (connectAllowed) return true;

  const httpAllowed = hostRequirements.httpAllowlist?.some((pattern) => {
    try {
      return wildcardPatternToRegex(pattern).test(targetUrl.toString());
    } catch {
      return false;
    }
  });

  return Boolean(httpAllowed);
}

function createResolverFetch(plugin: ImportedSourcePluginDefinition): typeof fetch {
  const warnedOrigins = new Set<string>();
  let nativeHttpAvailability: 'unknown' | 'supported' | 'unsupported' = 'unknown';

  const shouldUseNativeFallback = (input: RequestInfo | URL, init?: RequestInit) => {
    const rawUrl = toRequestUrl(input);
    if (!rawUrl) return false;

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return false;
    }

    if (!isDeclaredPluginHost(plugin, parsed)) return false;

    const method = (init?.method || 'GET').toUpperCase();
    return method === 'GET' || method === 'POST' || method === 'HEAD';
  };

  const toHeaderObject = (headersInit?: HeadersInit): Record<string, string> => {
    if (!headersInit) return {};
    const out: Record<string, string> = {};
    const headers = new Headers(headersInit);
    for (const [key, value] of headers.entries()) {
      out[key] = value;
    }
    return out;
  };

  const resolveBodyText = async (body?: BodyInit | null): Promise<string | undefined> => {
    if (body == null) return undefined;
    if (typeof body === 'string') return body;
    if (body instanceof URLSearchParams) return body.toString();
    if (body instanceof Blob) return await body.text();
    if (body instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(body));
    if (ArrayBuffer.isView(body)) {
      const bytes = new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
      return new TextDecoder().decode(bytes);
    }
    if (body instanceof FormData) {
      // KAA search uses JSON body. Skip native fallback for multipart bodies.
      return undefined;
    }
    return String(body);
  };

  const tryNativePluginFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response | null> => {
    if (nativeHttpAvailability === 'unsupported') {
      return null;
    }

    try {
      const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
      nativeHttpAvailability = 'supported';
      const url = toRequestUrl(input);
      const method = (init?.method || 'GET').toUpperCase();
      const headers = toHeaderObject(init?.headers);
      const body = await resolveBodyText(init?.body);

      return await tauriFetch(url, {
        method,
        headers,
        body,
        signal: init?.signal,
      });
    } catch (nativeError) {
      nativeHttpAvailability = 'unsupported';
      console.warn(`Native plugin fallback request failed for plugin ${plugin.id}.`, nativeError);
      return null;
    }
  };

  const warnUndeclaredHost = (input: RequestInfo | URL) => {
    const rawUrl = toRequestUrl(input);
    if (!rawUrl) return;

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return;
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;

    if (isDeclaredPluginHost(plugin, parsed)) return;

    if (warnedOrigins.has(parsed.origin)) return;
    warnedOrigins.add(parsed.origin);

    console.warn(
      `Plugin ${plugin.id} fetched undeclared host origin ${parsed.origin}. Add hostRequirements for better observability.`,
    );
  };

  return async (input, init) => {
    warnUndeclaredHost(input);
    const canUseNativeFallback = shouldUseNativeFallback(input, init);

    if (canUseNativeFallback) {
      const nativeFirstResponse = await tryNativePluginFetch(input, init);
      if (nativeFirstResponse?.ok) {
        return nativeFirstResponse;
      }
    }

    try {
      const response = await fetch(input, init);

      // Some providers (e.g., Cloudflare-protected subtitle endpoints) may return
      // bot-block pages to WebView fetch but succeed via native HTTP.
      if (
        canUseNativeFallback &&
        [401, 403, 429].includes(response.status)
      ) {
        const fallbackResponse = await tryNativePluginFetch(input, init);
        if (fallbackResponse?.ok) {
          return fallbackResponse;
        }
      }

      if (canUseNativeFallback && response.status >= 500) {
        const fallbackResponse = await tryNativePluginFetch(input, init);
        if (fallbackResponse?.ok) {
          return fallbackResponse;
        }
      }

      return response;
    } catch (error) {
      if (!canUseNativeFallback) {
        throw error;
      }

      const fallbackResponse = await tryNativePluginFetch(input, init);
      if (fallbackResponse) {
        return fallbackResponse;
      }

      throw error;
    }
  };
}

function createResolverNativeFetchText(
  plugin: ImportedSourcePluginDefinition,
  signal: AbortSignal,
): PluginResolverRuntimeApi['nativeFetchText'] {
  const toHeaderObject = (headersInit?: HeadersInit): Record<string, string> => {
    if (!headersInit) return {};
    const out: Record<string, string> = {};
    const headers = new Headers(headersInit);
    for (const [key, value] of headers.entries()) {
      out[key] = value;
    }
    return out;
  };

  return async (url, init) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`Invalid URL passed to nativeFetchText: ${url}`);
    }

    if (!isDeclaredPluginHost(plugin, parsed)) {
      throw new Error(`nativeFetchText blocked undeclared host: ${parsed.origin}`);
    }

    const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
    const method = (init?.method || 'GET').toUpperCase() as 'GET' | 'POST' | 'HEAD';
    const headers = toHeaderObject(init?.headers);
    const response = await tauriFetch(url, {
      method,
      headers,
      body: init?.body,
      signal,
    });
    const text = await response.text();
    const responseHeaders: Record<string, string> = {};
    try {
      for (const [key, value] of response.headers.entries()) {
        responseHeaders[key.toLowerCase()] = value;
      }
    } catch {
      // Ignore header parsing issues and return text payload regardless.
    }

    return {
      ok: response.ok,
      status: response.status,
      text,
      headers: responseHeaders,
    };
  };
}

function makeCompiledResolverKey(plugin: ImportedSourcePluginDefinition) {
  return `${plugin.id}:${plugin.version}:${plugin.resolver.code}`;
}

function compileResolver(plugin: ImportedSourcePluginDefinition): PluginResolverFunction {
  const cacheKey = makeCompiledResolverKey(plugin);
  const existing = compiledResolverCache.get(cacheKey);
  if (existing) return existing;

  const compiled = Function(`return (${plugin.resolver.code});`)();
  if (typeof compiled !== 'function') {
    throw new Error(`Plugin ${plugin.id} resolver code did not evaluate to a function.`);
  }

  const typed = compiled as PluginResolverFunction;
  compiledResolverCache.set(cacheKey, typed);
  return typed;
}

function normalizeAudioLanguage(value: unknown): SourceAudioLanguage | undefined {
  if (value === 'sub' || value === 'dub') return value;
  return undefined;
}

function normalizeServer(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeRequestHeaders(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;

  const headers: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(value as Record<string, unknown>)) {
    const name = String(key || '').trim();
    if (!name) continue;
    const text = String(rawValue ?? '').trim();
    if (!text) continue;
    headers[name] = text;
  }

  return Object.keys(headers).length > 0 ? headers : undefined;
}

function normalizeSubtitleTrack(value: unknown): ResolvedSubtitleTrack | null {
  if (!value || typeof value !== 'object') return null;

  const candidate = value as Partial<ResolvedSubtitleTrack>;
  const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
  const language = typeof candidate.language === 'string' ? candidate.language.trim() : '';
  const label = typeof candidate.label === 'string' ? candidate.label.trim() : '';
  const url = typeof candidate.url === 'string' && candidate.url.trim().length > 0 ? candidate.url.trim() : undefined;

  if (!id || !language || !label) return null;

  return {
    id,
    language,
    label,
    url,
    isDefault: candidate.isDefault === true,
  };
}

function normalizeSubtitleTracks(value: unknown): ResolvedSubtitleTrack[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const tracks: ResolvedSubtitleTrack[] = [];
  const seen = new Set<string>();

  for (const entry of value) {
    const normalized = normalizeSubtitleTrack(entry);
    if (!normalized) continue;
    if (seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    tracks.push(normalized);
  }

  return tracks.length > 0 ? tracks : undefined;
}

function normalizeSourceOption(
  plugin: ImportedSourcePluginDefinition,
  value: unknown,
  index: number,
): ResolvedSourceOption | null {
  if (!value || typeof value !== 'object') return null;

  const candidate = value as Partial<ResolvedSourceOption>;
  if (!candidate.url || typeof candidate.url !== 'string') return null;

  const type = candidate.type === 'direct' ? 'direct' : 'embed';
  const defaultId = `${plugin.id}-option-${index + 1}`;
  const rawId = typeof candidate.id === 'string' ? candidate.id.trim() : '';
  const language = normalizeAudioLanguage(candidate.language);
  const server = normalizeServer(candidate.server);
  const requestHeaders = normalizeRequestHeaders(candidate.requestHeaders ?? (candidate as { headers?: unknown }).headers);
  const subtitles = normalizeSubtitleTracks(candidate.subtitles);

  return {
    id: rawId.length > 0 ? rawId : defaultId,
    type,
    url: candidate.url,
    label: typeof candidate.label === 'string' && candidate.label.trim().length > 0 ? candidate.label : plugin.name,
    language,
    server,
    requestHeaders,
    controllable: typeof candidate.controllable === 'boolean' ? candidate.controllable : type === 'direct',
    subtitles,
    optionMeta: candidate.optionMeta,
  };
}

function normalizeSourceOptions(plugin: ImportedSourcePluginDefinition, value: unknown): ResolvedSourceOption[] {
  if (!Array.isArray(value)) return [];

  const options: ResolvedSourceOption[] = [];
  const seen = new Set<string>();

  for (const [index, entry] of value.entries()) {
    const normalized = normalizeSourceOption(plugin, entry, index);
    if (!normalized) continue;
    if (seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    options.push(normalized);
  }

  return options;
}

function chooseSourceOption(
  options: ResolvedSourceOption[],
  preferences?: ResolvePreferences,
  selectedOptionId?: string,
): ResolvedSourceOption | null {
  if (!options.length) return null;

  const requestedId = selectedOptionId?.trim();
  if (requestedId) {
    const byId = options.find((option) => option.id === requestedId);
    if (byId) return byId;
  }

  const preferredLanguage = normalizeAudioLanguage(preferences?.audioLanguage);

  if (preferredLanguage) {
    const languageMatch = options.find((option) => option.language === preferredLanguage);
    if (languageMatch) return languageMatch;
  }

  return options[0] ?? null;
}

function buildResolvedFromOption(
  plugin: ImportedSourcePluginDefinition,
  selected: ResolvedSourceOption,
  options: ResolvedSourceOption[],
): ResolvedSource {
  return {
    type: selected.type,
    url: selected.url,
    pluginId: plugin.id,
    label: selected.label,
    language: selected.language,
    server: selected.server,
    requestHeaders: selected.requestHeaders,
    selectedOptionId: selected.id,
    options,
    controllable: selected.controllable,
    subtitles: selected.subtitles,
  };
}

function normalizeResolvedSource(plugin: ImportedSourcePluginDefinition, value: unknown): ResolvedSource | null {
  if (!value || typeof value !== 'object') return null;

  const candidate = value as Partial<ResolvedSource>;
  if (!candidate.url || typeof candidate.url !== 'string') return null;

  const type = candidate.type === 'direct' ? 'direct' : 'embed';
  const language = normalizeAudioLanguage(candidate.language);
  const server = normalizeServer(candidate.server);
  const requestHeaders = normalizeRequestHeaders(candidate.requestHeaders ?? (candidate as { headers?: unknown }).headers);
  const subtitles = normalizeSubtitleTracks(candidate.subtitles);

  return {
    type,
    url: candidate.url,
    pluginId: plugin.id,
    label: typeof candidate.label === 'string' && candidate.label.trim().length > 0 ? candidate.label : plugin.name,
    language,
    server,
    requestHeaders,
    controllable: typeof candidate.controllable === 'boolean' ? candidate.controllable : type === 'direct',
    subtitles,
  };
}

function normalizeSteps(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry || '').trim())
    .filter((entry) => entry.length > 0)
    .slice(0, 80);
}

function normalizeExecution(
  plugin: ImportedSourcePluginDefinition,
  output: unknown,
  preferences?: ResolvePreferences,
): PluginResolverExecution {
  const candidate = output && typeof output === 'object' ? (output as Record<string, unknown>) : null;

  const sourceOptions = normalizeSourceOptions(plugin, candidate?.sources);
  if (sourceOptions.length) {
    const selected = chooseSourceOption(
      sourceOptions,
      preferences,
      typeof candidate?.selectedOptionId === 'string' ? candidate.selectedOptionId : undefined,
    );
    if (selected) {
      const fallbackMessage =
        typeof candidate?.message === 'string' && candidate.message.trim().length > 0
          ? candidate.message.trim()
          : `Plugin returned ${sourceOptions.length} source option(s).`;
      return {
        resolved: buildResolvedFromOption(plugin, selected, sourceOptions),
        message: fallbackMessage,
        steps: normalizeSteps(candidate?.steps),
      };
    }
  }

  const directResolved = normalizeResolvedSource(plugin, output);
  if (directResolved) {
    return {
      resolved: directResolved,
      message: 'Plugin returned a playable source.',
      steps: normalizeSteps(candidate?.steps),
    };
  }

  const nestedResolved = normalizeResolvedSource(plugin, candidate?.source);
  const fallbackMessage =
    typeof candidate?.message === 'string' && candidate.message.trim().length > 0
      ? candidate.message.trim()
      : typeof candidate?.noMatchReason === 'string' && candidate.noMatchReason.trim().length > 0
        ? candidate.noMatchReason.trim()
        : 'Plugin returned no playable source for this item.';

  if (nestedResolved) {
    return {
      resolved: nestedResolved,
      message: fallbackMessage,
      steps: normalizeSteps(candidate?.steps),
    };
  }

  return {
    resolved: null,
    message: fallbackMessage,
    steps: normalizeSteps(candidate?.steps),
  };
}

async function runWithTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Plugin resolver timed out.')), timeoutMs);
  });

  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function buildTimeoutSteps(
  plugin: ImportedSourcePluginDefinition,
  request: PluginResolverRuntimeRequest,
  timeoutMs: number,
): string[] {
  const item = request.item;
  const title = item.titleEnglish || item.title || 'unknown-title';
  const episode = Math.max(1, Number(item.episodeNumber || 1));

  return [
    `Resolver timeout reached after ${timeoutMs}ms.`,
    `Plugin id: ${plugin.id}.`,
    `Item: ${title} (episode ${episode}, kind=${item.kind}).`,
    'Resolver work was aborted by timeout signal.',
    'Consider reducing network fan-out or increasing plugin timeoutMs if endpoint latency is expected.',
  ];
}

function normalizeRuntimeStep(message: unknown): string {
  return String(message ?? '').trim();
}

export async function executeImportedPluginResolver(
  plugin: ImportedSourcePluginDefinition,
  item: PlayableItem,
  preferences?: ResolvePreferences,
): Promise<PluginResolverExecution> {
  if (item.kind === 'trailer') {
    return {
      resolved: null,
      message: 'Trailer items are skipped by imported source resolvers.',
      steps: ['Skip: trailer playback uses direct trailer source.'],
    };
  }

  const resolver = compileResolver(plugin);
  const controller = new AbortController();
  const timeoutMs = plugin.resolver.timeoutMs ?? 5000;

  const request: PluginResolverRuntimeRequest = {
    item: {
      animeId: item.anime.id,
      title: item.title || item.anime.title || item.anime.titleEnglish || item.anime.titleJapanese || 'Unknown Title',
      titleJapanese: item.titleJapanese || item.anime.titleJapanese,
      titleEnglish: item.anime.titleEnglish || item.anime.title || item.title,
      durationMinutes: item.durationMinutes ?? item.anime.durationMinutes ?? parseDurationMinutes(item.anime.duration),
      episodeNumber: item.episodeNumber ?? 1,
      kind: item.kind,
    },
    preferences: {
      audioLanguage: preferences?.audioLanguage,
      sourceOptionId: preferences?.sourceOptionId,
    },
  };

  const runtimeSteps: string[] = [];
  const appendRuntimeStep = (message: string) => {
    const text = normalizeRuntimeStep(message);
    if (!text) return;
    if (runtimeSteps.length >= 80) return;
    runtimeSteps.push(text);
  };

  const api: PluginResolverRuntimeApi = {
    fetch: createResolverFetch(plugin),
    nativeFetchText: createResolverNativeFetchText(plugin, controller.signal),
    URL,
    URLSearchParams,
    JSON,
    signal: controller.signal,
    logStep: appendRuntimeStep,
  };

  try {
    try {
      const output = await runWithTimeout(Promise.resolve(resolver(request, api)), timeoutMs);
      return normalizeExecution(plugin, output, preferences);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === 'Plugin resolver timed out.') {
        const timeoutError = new Error(message) as ResolverExecutionError;
        timeoutError.steps = [...runtimeSteps, ...buildTimeoutSteps(plugin, request, timeoutMs)].slice(0, 80);
        throw timeoutError;
      }

      if (error instanceof Error && runtimeSteps.length > 0) {
        const executionError = error as ResolverExecutionError;
        executionError.steps = [...runtimeSteps, ...(executionError.steps ?? [])].slice(0, 80);
      }
      throw error;
    }
  } finally {
    controller.abort();
  }
}
