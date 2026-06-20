import type { PlayableItem } from './anime';

export type ResolvedSourceType = 'embed' | 'direct';
export type SourceAudioLanguage = 'sub' | 'dub';

export interface PluginResolveRequest {
  item: PlayableItem;
}

export interface PluginResolverRuntimeItem {
  animeId: number;
  title: string;
  titleJapanese?: string;
  titleEnglish?: string;
  durationMinutes?: number;
  episodeNumber: number;
  kind: Exclude<PlayableItem['kind'], 'trailer'>;
}

export interface PluginResolverRuntimeRequest {
  item: PluginResolverRuntimeItem;
  preferences?: {
    audioLanguage?: SourceAudioLanguage;
    sourceOptionId?: string;
    optionMeta?: unknown;
  };
}

export interface PluginResolverRuntimeApi {
  fetch: typeof fetch;
  nativeFetchText?: (
    url: string,
    init?: {
      method?: 'GET' | 'POST' | 'HEAD';
      headers?: Record<string, string>;
      body?: string;
    },
  ) => Promise<{
    ok: boolean;
    status: number;
    text: string;
    headers?: Record<string, string>;
  }>;
  URL: typeof URL;
  URLSearchParams: typeof URLSearchParams;
  JSON: JSON;
  signal: AbortSignal;
  logStep?: (message: string) => void;
}

export interface PluginIconPng {
  mimeType: 'image/png';
  dataBase64: string;
  width?: number;
  height?: number;
}

export interface PluginIconSvg {
  mimeType: 'image/svg+xml';
  dataBase64: string;
  width?: number;
  height?: number;
}

export interface PluginHostRequirements {
  connectSrcOrigins?: string[];
  frameSrcOrigins?: string[];
  httpAllowlist?: string[];
}

export interface ImportedSourcePluginDefinition {
  id: string;
  name: string;
  version: string;
  compatibilityApiVersion: '1.0';
  iconPng?: PluginIconPng;
  iconSvg?: PluginIconSvg;
  hostRequirements?: PluginHostRequirements;
  resolver: {
    kind: 'inline-js';
    code: string;
    timeoutMs?: number;
  };
  optionResolver?: {
    kind: 'inline-js';
    code: string;
    timeoutMs?: number;
  };
}

export interface SourcePluginArtifact {
  schemaVersion: 2;
  compatibilityApiVersion: '1.0';
  plugin: ImportedSourcePluginDefinition;
}

export interface ResolvedSource {
  type: ResolvedSourceType;
  url: string;
  pluginId: string;
  label?: string;
  language?: SourceAudioLanguage;
  server?: string;
  requestHeaders?: Record<string, string>;
  selectedOptionId?: string;
  options?: ResolvedSourceOption[];
  controllable?: boolean;
  subtitles?: ResolvedSubtitleTrack[];
}

export interface ResolvedSubtitleTrack {
  id: string;
  language: string;
  label: string;
  url?: string;
  isDefault?: boolean;
}

export interface ResolvedSourceOption {
  id: string;
  type: ResolvedSourceType;
  url: string;
  label?: string;
  language?: SourceAudioLanguage;
  server?: string;
  requestHeaders?: Record<string, string>;
  controllable?: boolean;
  subtitles?: ResolvedSubtitleTrack[];
  optionMeta?: unknown;
}

export type SourceResolveAttemptStatus =
  | 'cache-hit'
  | 'resolved'
  | 'no-match'
  | 'error'
  | 'skipped-not-loaded';

export interface SourceResolveAttemptLog {
  pluginId: string;
  pluginName: string;
  order: number;
  status: SourceResolveAttemptStatus;
  durationMs: number;
  message: string;
  steps?: string[];
}

export interface SourceResolveTrace {
  createdAt: string;
  activePluginIds: string[];
  preferredSourcePluginId?: string;
  preferredAudioLanguage?: SourceAudioLanguage;
  attempts: SourceResolveAttemptLog[];
  resolvedPluginId?: string;
  resolvedLabel?: string;
  resolvedLanguage?: SourceAudioLanguage;
}

export interface SourcePlugin {
  id: string;
  name: string;
  resolveSource: (request: PluginResolveRequest) => Promise<ResolvedSource | null>;
  canResolve?: (request: PluginResolveRequest) => Promise<boolean> | boolean;
}

export interface SourcePluginInfo {
  id: string;
  name: string;
  version: string;
  iconDataUri?: string;
}