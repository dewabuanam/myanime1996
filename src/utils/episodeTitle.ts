import type { AnimeEpisode, AnimeSummary, TitleLanguage } from '../types/anime';

interface EpisodeTitleDisplay {
  primary: string;
  secondary?: string;
}

const isFilled = (value?: string) => Boolean(value?.trim());

export function getEpisodeDisplayTitles(
  episode: AnimeEpisode,
  anime: Pick<AnimeSummary, 'title' | 'titleEnglish' | 'titleJapanese'>,
  language: TitleLanguage,
): EpisodeTitleDisplay {
  const episodeTitle = episode.title?.trim();
  const episodeTitleRomaji = episode.titleRomanji?.trim();
  const episodeTitleJapanese = episode.titleJapanese?.trim();

  if (language === 'english') {
    const primary = episodeTitle || episodeTitleRomaji || anime.titleEnglish || anime.title;
    const secondary = episodeTitleJapanese || anime.titleJapanese?.trim();
    return {
      primary,
      secondary: isFilled(secondary) ? secondary : undefined,
    };
  }

  const primary = episodeTitleRomaji || episodeTitle || anime.title;
  const secondary = episodeTitleJapanese || anime.titleJapanese?.trim();
  return {
    primary,
    secondary: isFilled(secondary) ? secondary : undefined,
  };
}
