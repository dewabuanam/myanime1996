const RECENT_RELEASE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const UPCOMING_WINDOW_MS = 24 * 60 * 60 * 1000;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseLocalDateOnly(raw: string): number | null {
  const [yearText, monthText, dayText] = raw.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;

  // Build date-only values in local time so release comparisons respect user locale.
  const localDate = new Date(year, month - 1, day, 0, 0, 0, 0);
  const timestamp = localDate.getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function parseServerDateInput(input?: string): number | null {
  const raw = input?.trim();
  if (!raw) return null;

  if (DATE_ONLY_RE.test(raw)) {
    return parseLocalDateOnly(raw);
  }

  // If source omits timezone, Date.parse treats date-time values as local time.
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function parseReleaseTimestamp(input?: string): number | null {
  return parseServerDateInput(input);
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
