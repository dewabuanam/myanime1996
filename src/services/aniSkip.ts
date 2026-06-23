export type AniSkipType = 'op' | 'ed' | 'recap';

export type AniSkipSegment = {
  startTime: number;
  endTime: number;
  skipId: string;
};

export type AniSkipSegmentMap = Partial<Record<AniSkipType, AniSkipSegment>>;

import type { CachedPayload } from '../types/anime';
import { getStoredValue, setStoredValue } from './store';

type AniSkipApiResult = {
  interval?: {
    startTime?: unknown;
    endTime?: unknown;
  };
  skipType?: unknown;
  skipId?: unknown;
};

type AniSkipApiResponse = {
  found?: unknown;
  results?: unknown;
};

export type AniSkipApiHealthEvent = {
  service: 'aniSkip';
  status: 'success' | 'failure' | 'rate-limited';
  path: string;
  occurredAt: number;
  statusCode?: number;
};

type AniSkipApiHealthListener = (event: AniSkipApiHealthEvent) => void;

const ANISKIP_BASE_URL = 'https://api.aniskip.com/v2';
const ANISKIP_TYPES: AniSkipType[] = ['op', 'ed', 'recap'];
const ANISKIP_CACHE_TTL_MS = 1000 * 60 * 60 * 24;
const ANISKIP_CACHE_KEY = 'aniSkipCache';
type AniSkipCacheStore = Record<string, CachedPayload<AniSkipSegmentMap>>;

const cache = new Map<string, { expiresAt: number; value: AniSkipSegmentMap }>();
const inFlight = new Map<string, Promise<AniSkipSegmentMap>>();
const aniSkipApiHealthListeners = new Set<AniSkipApiHealthListener>();

export const ANISKIP_LABELS: Record<AniSkipType, string> = {
  op: 'Opening',
  ed: 'Ending',
  recap: 'Recap',
};

function notifyAniSkipApiHealth(status: AniSkipApiHealthEvent['status'], path: string, statusCode?: number) {
  if (!aniSkipApiHealthListeners.size) return;

  const event: AniSkipApiHealthEvent = {
    service: 'aniSkip',
    status,
    path,
    occurredAt: Date.now(),
    ...(typeof statusCode === 'number' ? { statusCode } : {}),
  };

  for (const listener of aniSkipApiHealthListeners) {
    listener(event);
  }
}

export function onAniSkipApiHealth(listener: AniSkipApiHealthListener) {
  aniSkipApiHealthListeners.add(listener);
  return () => {
    aniSkipApiHealthListeners.delete(listener);
  };
}

function isFinitePositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function toEpisodeLengthParam(seconds: number) {
  // AniSkip matching in this app is intentionally pinned to 0.
  void seconds;
  return '0';
}

function toCacheKey(malId: number, episodeNumber: number, episodeLength: number) {
  return `${malId}:${episodeNumber}:${toEpisodeLengthParam(episodeLength)}`;
}

async function getStoredAniSkipCache() {
  return getStoredValue(ANISKIP_CACHE_KEY, {} as Record<string, CachedPayload<unknown>>) as Promise<AniSkipCacheStore>;
}

async function readCachedAniSkip(key: string): Promise<AniSkipSegmentMap | null> {
  const now = Date.now();

  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const storedCache = await getStoredAniSkipCache();
  const stored = storedCache[key];
  if (!stored) return null;

  if (stored.expiresAt <= now) {
    const next = { ...storedCache };
    delete next[key];
    await setStoredValue(ANISKIP_CACHE_KEY, next);
    return null;
  }

  cache.set(key, {
    value: stored.value,
    expiresAt: stored.expiresAt,
  });
  return stored.value;
}

async function writeCachedAniSkip(key: string, value: AniSkipSegmentMap) {
  const now = Date.now();
  const payload: CachedPayload<AniSkipSegmentMap> = {
    value,
    savedAt: now,
    expiresAt: now + ANISKIP_CACHE_TTL_MS,
  };

  cache.set(key, {
    value,
    expiresAt: payload.expiresAt,
  });

  const storedCache = await getStoredAniSkipCache();
  await setStoredValue(ANISKIP_CACHE_KEY, {
    ...storedCache,
    [key]: payload,
  });
}

function normalizeSegment(result: AniSkipApiResult): { type: AniSkipType; segment: AniSkipSegment } | null {
  if (typeof result.skipType !== 'string' || !ANISKIP_TYPES.includes(result.skipType as AniSkipType)) {
    return null;
  }

  const startTime = result.interval?.startTime;
  const endTime = result.interval?.endTime;
  if (!isFiniteNonNegativeNumber(startTime) || !isFinitePositiveNumber(endTime) || endTime <= startTime) {
    return null;
  }

  if (typeof result.skipId !== 'string' || result.skipId.trim().length === 0) {
    return null;
  }

  return {
    type: result.skipType as AniSkipType,
    segment: {
      startTime,
      endTime,
      skipId: result.skipId,
    },
  };
}

async function fetchAniSkipSegmentsUncached(malId: number, episodeNumber: number, episodeLength: number): Promise<AniSkipSegmentMap> {
  const params = new URLSearchParams();
  for (const type of ANISKIP_TYPES) {
    params.append('types[]', type);
  }
  params.set('episodeLength', toEpisodeLengthParam(episodeLength));

  const path = `/skip-times/${malId}/${episodeNumber}`;
  let response: Response;
  try {
    response = await fetch(`${ANISKIP_BASE_URL}${path}?${params.toString()}`, {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    notifyAniSkipApiHealth('failure', path);
    return {};
  }

  if (!response.ok) {
    if (response.status === 429) {
      notifyAniSkipApiHealth('rate-limited', path, response.status);
    } else {
      notifyAniSkipApiHealth('failure', path, response.status);
    }
    return {};
  }

  notifyAniSkipApiHealth('success', path, response.status);

  const json = (await response.json()) as AniSkipApiResponse;
  if (json.found !== true || !Array.isArray(json.results) || json.results.length === 0) {
    return {};
  }

  const next: AniSkipSegmentMap = {};
  for (const entry of json.results as AniSkipApiResult[]) {
    const normalized = normalizeSegment(entry);
    if (!normalized) continue;
    next[normalized.type] = normalized.segment;
  }

  return next;
}

export async function probeAniSkipApiHealth() {
  const params = new URLSearchParams();
  for (const type of ANISKIP_TYPES) {
    params.append('types[]', type);
  }
  params.set('episodeLength', '0');

  const path = '/skip-times/1/1';
  let response: Response;
  try {
    response = await fetch(`${ANISKIP_BASE_URL}${path}?${params.toString()}`, {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    notifyAniSkipApiHealth('failure', path);
    throw new Error('AniSkip request failed: network');
  }

  if (!response.ok) {
    if (response.status === 429) {
      notifyAniSkipApiHealth('rate-limited', path, response.status);
    } else {
      notifyAniSkipApiHealth('failure', path, response.status);
    }
    throw new Error(`AniSkip request failed: ${response.status}`);
  }

  notifyAniSkipApiHealth('success', path, response.status);
}

export async function fetchAniSkipSegments(
  malId: number,
  episodeNumber: number,
  episodeLength: number,
): Promise<AniSkipSegmentMap> {
  if (!Number.isInteger(malId) || malId <= 0) return {};
  if (!Number.isInteger(episodeNumber) || episodeNumber <= 0) return {};
  if (!isFiniteNonNegativeNumber(episodeLength)) return {};

  const key = toCacheKey(malId, episodeNumber, episodeLength);
  const cached = await readCachedAniSkip(key);
  if (cached) {
    return cached;
  }

  const pending = inFlight.get(key);
  if (pending) {
    return pending;
  }

  const request = fetchAniSkipSegmentsUncached(malId, episodeNumber, episodeLength)
    .then(async (value) => {
      await writeCachedAniSkip(key, value);
      return value;
    })
    .catch(() => ({}))
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, request);
  return request;
}

export async function clearAniSkipDataCache() {
  cache.clear();
  inFlight.clear();
  await setStoredValue(ANISKIP_CACHE_KEY, {} as Record<string, CachedPayload<unknown>>);
}

export async function voteOnAniSkip(voteType: 'upvote' | 'downvote', skipId: string): Promise<void> {
  if (!skipId.trim()) return;
  try {
    await fetch(`${ANISKIP_BASE_URL}/skip-times/vote/${skipId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voteType }),
    });
  } catch {
    // Voting should never affect playback UX.
  }
}
