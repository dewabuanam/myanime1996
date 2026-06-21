import type { AnimeSummary } from '../types/anime';

export type SearchKeywordSuggestion = {
  label: string;
  reason: 'title' | 'synonym';
};

function tokenize(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2);
}

export function buildSearchKeywordSuggestions(query: string, items: AnimeSummary[], max = 4): SearchKeywordSuggestion[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return [];

  const seen = new Set<string>();
  const suggestions: SearchKeywordSuggestion[] = [];

  for (const anime of items) {
    const titleCandidates = [anime.title, anime.titleEnglish, anime.titleJapanese].filter((part): part is string => Boolean(part));
    for (const title of titleCandidates) {
      const lower = title.toLowerCase();
      if (!lower.includes(normalizedQuery)) continue;
      if (seen.has(lower)) continue;
      seen.add(lower);
      suggestions.push({ label: title, reason: 'title' });
      if (suggestions.length >= max) return suggestions;
    }

    for (const synonym of anime.titleSynonyms ?? []) {
      const lower = synonym.toLowerCase();
      if (!lower.includes(normalizedQuery)) continue;
      if (seen.has(lower)) continue;
      seen.add(lower);
      suggestions.push({ label: synonym, reason: 'synonym' });
      if (suggestions.length >= max) return suggestions;
    }

    if (suggestions.length >= max) return suggestions;
  }

  const tokens = new Set<string>();
  for (const anime of items) {
    tokenize(anime.title).forEach((token) => {
      if (token.includes(normalizedQuery) || normalizedQuery.includes(token)) {
        tokens.add(token);
      }
    });
  }

  for (const token of tokens) {
    if (suggestions.length >= max) break;
    if (seen.has(token)) continue;
    seen.add(token);
    suggestions.push({ label: token, reason: 'title' });
  }

  return suggestions;
}

export function buildSearchQueryString(params: Record<string, string | number | boolean | undefined | null>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.trim().length === 0) continue;
    query.set(key, String(value));
  }
  return query.toString();
}
