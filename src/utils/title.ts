import type { TitleLanguage } from '../types/anime';

type TitleLike = {
  title: string;
  titleEnglish?: string;
  titleJapanese?: string;
};

export function getDisplayTitle(item: TitleLike | null | undefined, language: TitleLanguage): string {
  if (!item) return '';
  if (language === 'english') {
    const english = item.titleEnglish?.trim();
    if (english) return english;
  }
  return item.title;
}
