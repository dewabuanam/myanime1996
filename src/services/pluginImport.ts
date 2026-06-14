import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import type { ImportedSourcePluginDefinition, PluginHostRequirements, PluginIconPng, SourcePluginArtifact } from '../types/plugin';

function isBase64(value: string) {
  return /^[A-Za-z0-9+/=\s]+$/.test(value);
}

function validateIcon(icon: unknown): PluginIconPng | undefined {
  if (!icon || typeof icon !== 'object') return undefined;
  const candidate = icon as Partial<PluginIconPng>;
  if (candidate.mimeType !== 'image/png') {
    throw new Error('Plugin icon must use image/png mime type.');
  }
  if (!candidate.dataBase64 || typeof candidate.dataBase64 !== 'string' || !isBase64(candidate.dataBase64)) {
    throw new Error('Plugin icon base64 payload is invalid.');
  }
  if (candidate.width !== undefined && typeof candidate.width !== 'number') {
    throw new Error('Plugin icon width must be a number when provided.');
  }
  if (candidate.height !== undefined && typeof candidate.height !== 'number') {
    throw new Error('Plugin icon height must be a number when provided.');
  }
  return {
    mimeType: 'image/png',
    dataBase64: candidate.dataBase64,
    width: candidate.width,
    height: candidate.height,
  };
}

function normalizeStringArray(value: unknown, fieldName: string) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new Error(`Plugin ${fieldName} must be an array of strings when provided.`);
  }

  const result = value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  const unique = Array.from(new Set(result));
  return unique.length > 0 ? unique : undefined;
}

function validateHostRequirements(value: unknown): PluginHostRequirements | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object') {
    throw new Error('Plugin hostRequirements must be an object when provided.');
  }

  const candidate = value as Partial<PluginHostRequirements>;
  const connectSrcOrigins = normalizeStringArray(candidate.connectSrcOrigins, 'hostRequirements.connectSrcOrigins');
  const frameSrcOrigins = normalizeStringArray(candidate.frameSrcOrigins, 'hostRequirements.frameSrcOrigins');
  const httpAllowlist = normalizeStringArray(candidate.httpAllowlist, 'hostRequirements.httpAllowlist');

  if (!connectSrcOrigins && !frameSrcOrigins && !httpAllowlist) {
    return undefined;
  }

  return {
    connectSrcOrigins,
    frameSrcOrigins,
    httpAllowlist,
  };
}

export function parseSourcePluginArtifact(rawText: string): ImportedSourcePluginDefinition {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('Plugin artifact is not valid JSON.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Plugin artifact payload is empty.');
  }

  const artifact = parsed as Partial<SourcePluginArtifact>;
  if (artifact.schemaVersion !== 2) {
    throw new Error('Unsupported plugin artifact schema version. Use schemaVersion 2 plugin artifacts.');
  }
  if (artifact.compatibilityApiVersion !== '1.0') {
    throw new Error('Unsupported plugin compatibilityApiVersion. This app currently supports 1.0 only.');
  }
  if (!artifact.plugin || typeof artifact.plugin !== 'object') {
    throw new Error('Plugin artifact is missing plugin metadata.');
  }

  const plugin = artifact.plugin as Partial<ImportedSourcePluginDefinition>;

  if (!plugin.id || typeof plugin.id !== 'string') {
    throw new Error('Plugin id is required.');
  }
  if (!plugin.name || typeof plugin.name !== 'string') {
    throw new Error('Plugin name is required.');
  }
  if (!plugin.version || typeof plugin.version !== 'string') {
    throw new Error('Plugin version is required.');
  }
  if (plugin.compatibilityApiVersion !== '1.0') {
    throw new Error('Plugin compatibilityApiVersion must be 1.0.');
  }
  if (!plugin.resolver || typeof plugin.resolver !== 'object') {
    throw new Error('Plugin resolver configuration is required.');
  }

  const resolver = plugin.resolver as Partial<ImportedSourcePluginDefinition['resolver']>;
  if (resolver.kind !== 'inline-js') {
    throw new Error('Plugin resolver kind must be inline-js.');
  }
  if (!resolver.code || typeof resolver.code !== 'string' || resolver.code.trim().length === 0) {
    throw new Error('Plugin resolver code is required.');
  }
  if (resolver.timeoutMs !== undefined && (typeof resolver.timeoutMs !== 'number' || resolver.timeoutMs < 500 || resolver.timeoutMs > 25000)) {
    throw new Error('Plugin resolver timeoutMs must be a number between 500 and 25000.');
  }

  const iconPng = validateIcon(plugin.iconPng);
  const hostRequirements = validateHostRequirements(plugin.hostRequirements);
  if (!hostRequirements) {
    console.warn(`Plugin ${plugin.id} does not declare hostRequirements. Runtime is allowed but host observability will be limited.`);
  }

  return {
    id: plugin.id,
    name: plugin.name,
    version: plugin.version,
    compatibilityApiVersion: '1.0',
    iconPng,
    hostRequirements,
    resolver: {
      kind: 'inline-js',
      code: resolver.code,
      timeoutMs: resolver.timeoutMs,
    },
  };
}

export async function importSourcePluginFromPicker(): Promise<ImportedSourcePluginDefinition | null> {
  const filePath = await open({
    title: 'Import Source Plugin Artifact',
    multiple: false,
    filters: [
      {
        name: 'Source Plugin Artifact',
        extensions: ['json'],
      },
    ],
  });

  if (!filePath || Array.isArray(filePath)) {
    return null;
  }

  const fileText = await readTextFile(filePath);
  return parseSourcePluginArtifact(fileText);
}
