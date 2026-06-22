import type { ThemeDefinition, ThemeId, ThemeOption } from './theme.types';
import myanime1996Theme from './themes/myanime1996';
import myanime2077Theme from './themes/myanime2077';

export const DEFAULT_THEME_ID: ThemeId = 'myanime1996';

const THEME_DEFINITIONS: ThemeDefinition[] = [myanime1996Theme, myanime2077Theme];

const THEME_BY_ID = new Map<ThemeId, ThemeDefinition>(
  THEME_DEFINITIONS.map((theme) => [theme.id, theme]),
);

export function isThemeId(value: string): value is ThemeId {
  return THEME_BY_ID.has(value as ThemeId);
}

export function normalizeThemeId(value: string | null | undefined): ThemeId {
  if (!value) return DEFAULT_THEME_ID;
  return isThemeId(value) ? value : DEFAULT_THEME_ID;
}

export function resolveTheme(value: string | null | undefined): ThemeDefinition {
  const normalized = normalizeThemeId(value);
  return THEME_BY_ID.get(normalized) ?? myanime1996Theme;
}

export function listThemeOptions(): ThemeOption[] {
  return THEME_DEFINITIONS.map((theme) => ({
    value: theme.id,
    label: theme.label,
  }));
}

const THEME_STYLESHEET_LOADERS: Record<ThemeId, () => Promise<unknown>> = {
  myanime1996: () => import('./styles/myanime1996.css'),
  myanime2077: () => import('./styles/myanime2077.css'),
};

const loadedThemeStylesheets = new Set<ThemeId>();

export function applyThemeStylesheets(value: string | null | undefined): void {
  const themeId = normalizeThemeId(value);
  if (loadedThemeStylesheets.has(themeId)) return;

  const load = THEME_STYLESHEET_LOADERS[themeId];
  void load();
  loadedThemeStylesheets.add(themeId);
}

export const APP_THEMES = THEME_DEFINITIONS;
