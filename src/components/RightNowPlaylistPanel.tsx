import { Trash2, Upload } from 'lucide-react';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { PlaylistType } from '../types/anime';
import type { PlayableItem } from '../types/anime';
import { getDisplayTitle } from '../utils/title';
import { useAppStore } from '../state/appStore';
import { getAnimeDetails, resolveCanonicalDetailRouteId } from '../services/catalogSource';

type RightNowPlaylistPanelProps = {
  playlists: Array<{
    id: string;
    name: string;
    description: string;
    image: string;
    type: PlaylistType;
    animeIds: number[];
    animeItems: Array<{
      animeId: number;
      jikanId?: number;
      animeScheduleRoute?: string;
      title: string;
      titleEnglish?: string;
      titleJapanese?: string;
      image: string;
      mediaType?: string;
      currentEpisode?: number;
    }>;
    videoItems: PlayableItem[];
  }>;
  activePlaylistId: string | null;
  titleLanguage: 'japanese' | 'english';
  onSavePlaylistMeta: (playlistId: string, patch: { name: string; description: string; image: string; type: PlaylistType }) => void;
  onChangeTypeWithItems: (playlistId: string, targetType: PlaylistType) => void;
  onRemoveAnimeItem: (playlistId: string, animeId: number) => void;
  onRemoveVideoItem: (playlistId: string, queueItemId: string) => void;
  onEditingChange?: (editing: boolean) => void;
};

export type RightNowPlaylistPanelHandle = {
  toggleEdit: () => void;
};

const RightNowPlaylistPanel = forwardRef<RightNowPlaylistPanelHandle, RightNowPlaylistPanelProps>(function RightNowPlaylistPanel({
  playlists,
  activePlaylistId,
  titleLanguage,
  onSavePlaylistMeta,
  onChangeTypeWithItems,
  onRemoveAnimeItem,
  onRemoveVideoItem,
  onEditingChange,
}: RightNowPlaylistPanelProps, ref) {
  const selectedAnime = useAppStore((state) => state.selectedAnime);
  const currentlyPlayingItem = useAppStore((state) => state.currentlyPlayingItem);
  const queue = useAppStore((state) => state.queue);
  const libraryItems = useAppStore((state) => state.libraryItems);
  const watchProgress = useAppStore((state) => state.watchProgress);

  const activePlaylist = useMemo(() => {
    if (!playlists.length) return null;
    return playlists.find((playlist) => playlist.id === activePlaylistId) ?? playlists[0];
  }, [activePlaylistId, playlists]);

  const animeMetaById = useMemo(() => {
    const map = new Map<number, { title: string; titleEnglish?: string; titleJapanese?: string; image: string; mediaType?: string; episode?: number }>();

    const addMeta = (anime: {
      id?: number;
      jikanId?: number;
      title?: string;
      titleEnglish?: string;
      titleJapanese?: string;
      image?: string;
      mediaType?: string;
      currentEpisode?: number;
    } | null | undefined, episodeOverride?: number) => {
      if (!anime) return;
      const rawAnimeId = Math.floor(Number(anime.id) || 0);
      const rawJikanId = Math.floor(Number(anime.jikanId) || 0);
      const canonicalAnimeId = rawJikanId > 0 ? rawJikanId : rawAnimeId;
      if (canonicalAnimeId <= 0) return;
      const prev = map.get(canonicalAnimeId);
      const nextEpisode = Math.max(0, Math.floor(Number(episodeOverride ?? anime.currentEpisode) || 0)) || prev?.episode;
      map.set(canonicalAnimeId, {
        title: anime.title || prev?.title || `Anime #${canonicalAnimeId}`,
        titleEnglish: anime.titleEnglish ?? prev?.titleEnglish,
        titleJapanese: anime.titleJapanese ?? prev?.titleJapanese,
        image: anime.image || prev?.image || '/assets/logo.png',
        mediaType: anime.mediaType ?? prev?.mediaType,
        episode: nextEpisode,
      });
    };

    addMeta(selectedAnime);
    addMeta(currentlyPlayingItem?.anime, currentlyPlayingItem?.episodeNumber);
    queue.forEach((item) => addMeta(item.anime, item.episodeNumber));

    Object.values(libraryItems).forEach((item) => {
      const canonicalAnimeId = Math.floor(Number(item.jikanId) || 0) || Math.floor(Number(item.animeId) || 0);
      if (canonicalAnimeId <= 0) return;
      const prev = map.get(canonicalAnimeId);
      map.set(canonicalAnimeId, {
        title: item.title || prev?.title || `Anime #${canonicalAnimeId}`,
        titleEnglish: item.titleEnglish ?? prev?.titleEnglish,
        titleJapanese: item.titleJapanese ?? prev?.titleJapanese,
        image: item.image || prev?.image || '/assets/logo.png',
        mediaType: item.mediaType ?? prev?.mediaType,
        episode: Math.max(0, Math.floor(Number(item.currentEpisode) || 0)) || prev?.episode,
      });
    });

    Object.values(watchProgress).forEach((entry) => {
      const canonicalAnimeId = Math.floor(Number(entry.jikanId) || 0) || Math.floor(Number(entry.animeId) || 0);
      if (canonicalAnimeId <= 0) return;
      const prev = map.get(canonicalAnimeId);
      map.set(canonicalAnimeId, {
        title: entry.title || prev?.title || `Anime #${canonicalAnimeId}`,
        titleEnglish: entry.titleEnglish ?? prev?.titleEnglish,
        titleJapanese: entry.titleJapanese ?? prev?.titleJapanese,
        image: entry.image || prev?.image || '/assets/logo.png',
        mediaType: prev?.mediaType,
        episode: Math.max(0, Math.floor(Number(entry.episode) || 0)) || prev?.episode,
      });
    });

    activePlaylist?.animeItems.forEach((entry) => {
      const canonicalAnimeId = Math.floor(Number(entry.animeId) || 0);
      if (canonicalAnimeId <= 0) return;
      const prev = map.get(canonicalAnimeId);
      map.set(canonicalAnimeId, {
        title: entry.title || prev?.title || `Anime #${canonicalAnimeId}`,
        titleEnglish: entry.titleEnglish ?? prev?.titleEnglish,
        titleJapanese: entry.titleJapanese ?? prev?.titleJapanese,
        image: entry.image || prev?.image || '/assets/logo.png',
        mediaType: entry.mediaType ?? prev?.mediaType,
        episode: Math.max(0, Math.floor(Number(entry.currentEpisode) || 0)) || prev?.episode,
      });
    });

    return map;
  }, [activePlaylist?.animeItems, currentlyPlayingItem, libraryItems, queue, selectedAnime, watchProgress]);

  const [resolvedAnimeMetaById, setResolvedAnimeMetaById] = useState<
    Record<number, { title: string; titleEnglish?: string; titleJapanese?: string; image: string; mediaType?: string; episode?: number }>
  >({});

  useEffect(() => {
    if (!activePlaylist || activePlaylist.type !== 'anime') return;

    const unresolvedIds = activePlaylist.animeIds.filter((animeId) => !animeMetaById.has(animeId));
    if (!unresolvedIds.length) return;

    let cancelled = false;

    const run = async () => {
      const resolvedEntries = await Promise.all(
        unresolvedIds.map(async (animeId) => {
          const canonicalDetailId = await resolveCanonicalDetailRouteId({ id: animeId, jikanId: animeId }).catch(() => animeId);
          const detail = await getAnimeDetails(canonicalDetailId ?? animeId).catch(() => null);
          if (!detail) return null;
          return {
            animeId,
            value: {
              title: detail.title,
              titleEnglish: detail.titleEnglish,
              titleJapanese: detail.titleJapanese,
              image: detail.image || '/assets/logo.png',
              mediaType: detail.mediaType,
              episode: detail.currentEpisode,
            },
          };
        }),
      );

      if (cancelled) return;
      const nextPatch: Record<number, { title: string; titleEnglish?: string; titleJapanese?: string; image: string; mediaType?: string; episode?: number }> = {};
      for (const entry of resolvedEntries) {
        if (!entry) continue;
        nextPatch[entry.animeId] = entry.value;
      }
      if (!Object.keys(nextPatch).length) return;
      setResolvedAnimeMetaById((previous) => ({ ...previous, ...nextPatch }));
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [activePlaylist, animeMetaById]);

  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftImage, setDraftImage] = useState('/assets/logo.png');
  const [draftType, setDraftType] = useState<PlaylistType>('anime');
  const [itemPage, setItemPage] = useState(1);

  const enterEditMode = () => {
    if (!activePlaylist) return;
    setDraftName(activePlaylist.name);
    setDraftDescription(activePlaylist.description || '');
    setDraftImage(activePlaylist.image || '/assets/logo.png');
    setDraftType(activePlaylist.type);
    setIsEditing(true);
  };

  const saveEditMode = () => {
    if (!activePlaylist) return;
    const hasItems = activePlaylist.type === 'video' ? activePlaylist.videoItems.length > 0 : activePlaylist.animeIds.length > 0;
    const typeChanged = draftType !== activePlaylist.type;

    if (hasItems && typeChanged) {
      onChangeTypeWithItems(activePlaylist.id, draftType);
      setIsEditing(false);
      return;
    }

    onSavePlaylistMeta(activePlaylist.id, {
      name: draftName,
      description: draftDescription,
      image: draftImage,
      type: draftType,
    });
    setIsEditing(false);
  };

  useImperativeHandle(ref, () => ({
    toggleEdit: () => {
      if (!activePlaylist) return;
      if (isEditing) {
        saveEditMode();
        return;
      }
      enterEditMode();
    },
  }));

  useEffect(() => {
    onEditingChange?.(isEditing);
  }, [isEditing, onEditingChange]);

  const activeCount = activePlaylist
    ? activePlaylist.type === 'video'
      ? activePlaylist.videoItems.length
      : activePlaylist.animeIds.length
    : 0;
  const isTypeLockedByContent = activeCount > 0;
  const PAGE_SIZE = 12;
  const totalPages = Math.max(1, Math.ceil(activeCount / PAGE_SIZE));
  const safePage = Math.max(1, Math.min(itemPage, totalPages));

  useEffect(() => {
    setItemPage(1);
  }, [activePlaylist?.id, activePlaylist?.type]);

  const pagedAnimeIds = useMemo(() => {
    if (!activePlaylist || activePlaylist.type !== 'anime') return [];
    const start = (safePage - 1) * PAGE_SIZE;
    return activePlaylist.animeIds.slice(start, start + PAGE_SIZE);
  }, [activePlaylist, safePage]);

  const pagedVideoItems = useMemo(() => {
    if (!activePlaylist || activePlaylist.type !== 'video') return [];
    const start = (safePage - 1) * PAGE_SIZE;
    return activePlaylist.videoItems.slice(start, start + PAGE_SIZE);
  }, [activePlaylist, safePage]);

  const handleUploadImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) return;
      setDraftImage(result);
    };
    reader.readAsDataURL(file);
    event.currentTarget.value = '';
  };

  return (
    <section className="space-y-3">
      {activePlaylist ? (
        <div className="space-y-3">
          {isEditing ? (
            <label className="advanced-search-field">
              <input
                value={draftName}
                onChange={(event) => setDraftName(event.currentTarget.value)}
                placeholder="Playlist name"
              />
            </label>
          ) : null}

          <div className="flex items-start gap-2.5">
            <div className="shrink-0">
              <img
                src={(isEditing ? draftImage : activePlaylist.image) || '/assets/logo.png'}
                alt=""
                className="h-20 w-16 border border-cream/14 object-cover"
              />
              {isEditing ? (
                <label className="vhs-button-ghost mt-1 inline-flex w-16 cursor-pointer items-center justify-center gap-1 px-1.5 py-1 text-[10px] retro-tooltip" data-tooltip="Upload Playlist Image">
                  <Upload size={11} /> Upload
                  <input type="file" accept="image/*" className="hidden" onChange={handleUploadImage} />
                </label>
              ) : null}
            </div>

            <div className="min-w-0 flex-1 space-y-1.5">
              {isEditing ? (
                <>
                  <label className="advanced-search-field">
                    <span>Playlist Type</span>
                    <select
                      value={draftType}
                      onChange={(event) => setDraftType(event.currentTarget.value as PlaylistType)}
                      disabled={isTypeLockedByContent}
                    >
                      <option value="anime">Anime playlist</option>
                      <option value="video">Video playlist</option>
                    </select>
                    {isTypeLockedByContent ? (
                      <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.08em] text-cream/45">
                        Type is locked while playlist has content.
                      </p>
                    ) : null}
                  </label>
                  <label className="advanced-search-field">
                    <span>Description</span>
                    <textarea
                      className="min-h-[92px] w-full resize-y border border-cream/20 bg-black/25 px-2 py-1 text-[10px] font-mono uppercase tracking-[0.09em] text-cream/85 placeholder:text-cream/45 focus:border-amberline/55 focus:outline-none"
                      value={draftDescription}
                      onChange={(event) => setDraftDescription(event.currentTarget.value)}
                      placeholder="Playlist description"
                    />
                  </label>
                </>
              ) : (
                <>
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-amberline/75">{activePlaylist.type} playlist</p>
                  {activePlaylist.description?.trim() ? (
                    <p className="line-clamp-4 text-sm leading-5 text-cream/68">{activePlaylist.description}</p>
                  ) : (
                    <p className="text-xs uppercase tracking-[0.1em] text-cream/45">No description yet.</p>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="border-t border-cream/12 pt-2" />

          <div className="space-y-1.5">
            {activePlaylist.type === 'anime'
              ? pagedAnimeIds.map((animeId) => {
                  const meta = animeMetaById.get(animeId) ?? resolvedAnimeMetaById[animeId];
                  return (
                  <div key={animeId} className="right-queue-item group flex items-center gap-2.5 px-2 py-1.5">
                    <img src={meta?.image || '/assets/logo.png'} alt="" className="right-queue-item-thumb" />
                    <div className="min-w-0 flex-1">
                      <p className="right-queue-item-title line-clamp-1">{getDisplayTitle({
                        title: meta?.title || `Anime #${animeId}`,
                        titleEnglish: meta?.titleEnglish,
                        titleJapanese: meta?.titleJapanese,
                      }, titleLanguage)}</p>
                      <p className="right-queue-item-type line-clamp-1">Anime</p>
                    </div>
                    <div className="right-queue-item-actions">
                      <button
                        type="button"
                        className="right-queue-item-action-btn retro-tooltip"
                        onClick={() => onRemoveAnimeItem(activePlaylist.id, animeId)}
                        aria-label="Remove anime from playlist"
                        data-tooltip="Remove"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                );
                })
              : pagedVideoItems.map((item) => (
                  <div key={item.id} className="right-queue-item group flex items-center gap-2.5 px-2 py-1.5">
                    <img src={item.anime.image || '/assets/logo.png'} alt="" className="right-queue-item-thumb" />
                    <div className="min-w-0 flex-1">
                      <p className="right-queue-item-title line-clamp-1">{getDisplayTitle(item.anime, titleLanguage)}</p>
                      <p className="right-queue-item-jp line-clamp-1">{item.anime.titleJapanese ?? 'No Japanese title'}</p>
                      <p className="right-queue-item-type line-clamp-1">{item.typeLabel}</p>
                    </div>
                    <div className="right-queue-item-actions">
                      <button
                        type="button"
                        className="right-queue-item-action-btn retro-tooltip"
                        onClick={() => onRemoveVideoItem(activePlaylist.id, item.id)}
                        aria-label="Remove video from playlist"
                        data-tooltip="Remove"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
            {activeCount === 0 ? (
              <p className="py-3 text-center font-mono text-[11px] uppercase tracking-[0.12em] text-cream/45">
                No items in this playlist.
              </p>
            ) : null}
            {activeCount > 0 ? (
              <div className="mt-1.5 flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  className="vhs-button-ghost px-2 py-1 text-[10px]"
                  disabled={safePage <= 1}
                  onClick={() => setItemPage((value) => Math.max(1, value - 1))}
                >
                  Prev
                </button>
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-cream/60">{safePage}/{totalPages}</span>
                <button
                  type="button"
                  className="vhs-button-ghost px-2 py-1 text-[10px]"
                  disabled={safePage >= totalPages}
                  onClick={() => setItemPage((value) => Math.min(totalPages, value + 1))}
                >
                  Next
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="app-card p-4 text-center font-mono text-[11px] uppercase tracking-[0.12em] text-cream/50">
          No playlists yet. Create your first playlist.
        </div>
      )}
    </section>
  );
});

export default RightNowPlaylistPanel;
