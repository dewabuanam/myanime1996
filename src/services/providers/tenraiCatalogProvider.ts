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
} from '../tenrai';

export const tenraiCatalogProvider: CatalogProvider = {
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
