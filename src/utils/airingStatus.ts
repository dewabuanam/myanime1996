// The catalogue reports airing state as free text ("Finished Airing", "Currently
// Airing", "Not yet aired"), and older cached entries carry variants of the same
// three states. Cards want one short, predictable label, so normalise here rather
// than at every call site.

export type AiringStatusTone = 'airing' | 'completed' | 'upcoming' | 'unknown';

export type AiringStatusBadge = {
  label: string;
  tone: AiringStatusTone;
};

export function resolveAiringStatusBadge(status: string | undefined | null): AiringStatusBadge | null {
  const raw = status?.trim();
  if (!raw) return null;

  const normalized = raw.toLowerCase();

  if (normalized.includes('not yet') || normalized.includes('upcoming')) {
    return { label: 'Not Yet Aired', tone: 'upcoming' };
  }

  if (normalized.includes('finished') || normalized.includes('complete')) {
    return { label: 'Completed', tone: 'completed' };
  }

  if (normalized.includes('airing') || normalized.includes('ongoing') || normalized.includes('releasing')) {
    return { label: 'Airing', tone: 'airing' };
  }

  // An unrecognised state still says more than a blank slot, so pass it through.
  return { label: raw, tone: 'unknown' };
}
