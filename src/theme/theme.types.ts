export type ThemeId = 'myanime1996' | 'myanime2077';

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
