export type ThemeId = 'myanime1996' | 'myanime2077' | 'myanime2026' | 'myanime2026dark';

export type ThemeOption = {
  value: ThemeId;
  label: string;
};

export type ThemeLogos = {
  primary: string;
  splash?: string;
};

export type ThemeDefinition = {
  id: ThemeId;
  label: string;
  logos: ThemeLogos;
};
