const RECENT_RELEASE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const UPCOMING_WINDOW_MS = 24 * 60 * 60 * 1000;
const HAS_TIMEZONE_SUFFIX_RE = /(Z|[+-]\d{2}:?\d{2})$/i;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeServerDateInput(input?: string) {
  const raw = input?.trim();
  if (!raw) return null;

  if (DATE_ONLY_RE.test(raw)) {
    return `${raw}T00:00:00Z`;
  }

  if (raw.includes('T') && !HAS_TIMEZONE_SUFFIX_RE.test(raw)) {
    return `${raw}Z`;
  }

  return raw;
}

export function parseReleaseTimestamp(input?: string): number | null {
  const normalized = normalizeServerDateInput(input);
  if (!normalized) return null;

  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function isUpcomingByReleaseTime(input?: string, now = Date.now()) {
  const timestamp = parseReleaseTimestamp(input);
  return timestamp !== null ? timestamp > now : false;
}

export function isUpcomingWithin24Hours(input?: string, now = Date.now()) {
  const timestamp = parseReleaseTimestamp(input);
  if (timestamp === null || timestamp <= now) return false;
  return timestamp - now <= UPCOMING_WINDOW_MS;
}

export function isRecentReleaseWithinWeek(input?: string, now = Date.now()) {
  const timestamp = parseReleaseTimestamp(input);
  if (timestamp === null || timestamp > now) return false;
  return now - timestamp <= RECENT_RELEASE_WINDOW_MS;
}

export function formatReleaseDateTimeLocal(input?: string) {
  const timestamp = parseReleaseTimestamp(input);
  if (timestamp === null) return null;

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

export function getReleaseBadgeLabel(
  airingDate: string | undefined,
  mediaType: string | undefined,
  watchedCompleted = false,
): 'UPCOMING' | 'NEW EPISODE' | 'NEW RELEASE' | null {
  if (watchedCompleted) {
    return null;
  }

  if (isUpcomingWithin24Hours(airingDate)) {
    return 'UPCOMING';
  }

  if (!isRecentReleaseWithinWeek(airingDate)) {
    return null;
  }

  return mediaType?.trim().toLowerCase() === 'tv' ? 'NEW EPISODE' : 'NEW RELEASE';
}
