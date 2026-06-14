import type { CatalogProvider } from './catalogProviderTypes';
import {
  getAnimeScheduleAnimeDetails,
  getAnimeScheduleLatestPromoAnime,
  getAnimeScheduleSeasonalAnime,
  getLatestReleasedTimetableAnime,
  getUpcomingTimetableAnime,
  getAnimeScheduleTopAiringAnime,
  getAnimeScheduleTopAnime,
  getAnimeScheduleTopUpcomingAnime,
  refreshAnimeScheduleHomeIfNeeded,
  searchAnimeScheduleAnime,
} from '../animeSchedule';

export const animeScheduleCatalogProvider: CatalogProvider = {
  getTopAnime: getAnimeScheduleTopAnime,
  getSeasonalAnime: getAnimeScheduleSeasonalAnime,
  getLatestUpdatedAnime: getLatestReleasedTimetableAnime,
  getUpcomingUpdatedAnime: getUpcomingTimetableAnime,
  getLatestPromoAnime: getAnimeScheduleLatestPromoAnime,
  getTopAiringAnime: getAnimeScheduleTopAiringAnime,
  getTopUpcomingAnime: getAnimeScheduleTopUpcomingAnime,
  searchAnime: searchAnimeScheduleAnime,
  getAnimeDetails: getAnimeScheduleAnimeDetails,
  refreshHomeShelvesIfNeeded: async (limit = 20, callbacks = {}) => {
    await refreshAnimeScheduleHomeIfNeeded(limit, callbacks.onLatestUpdated, callbacks.onUpcomingUpdated, callbacks.onLatestPromo);
  },
};
