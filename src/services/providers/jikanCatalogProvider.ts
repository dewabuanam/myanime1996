import type { CatalogProvider } from './catalogProviderTypes';
import {
  getAnimeDetails,
  getLatestPromoAnime,
  getLatestUpdatedAnime,
  getSeasonalAnime,
  getTopAiringAnime,
  getTopAnime,
  getTopUpcomingAnime,
  refreshHomeShelvesIfNeeded,
  searchAnime,
} from '../jikan';

export const jikanCatalogProvider: CatalogProvider = {
  getTopAnime,
  getSeasonalAnime,
  getLatestUpdatedAnime,
  getUpcomingUpdatedAnime: getTopUpcomingAnime,
  getLatestPromoAnime,
  getTopAiringAnime,
  getTopUpcomingAnime,
  searchAnime,
  getAnimeDetails,
  refreshHomeShelvesIfNeeded,
};
