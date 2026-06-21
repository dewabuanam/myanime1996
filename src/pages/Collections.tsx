import { useAppStore } from '../state/appStore';

export default function Collections() {
  const playlists = useAppStore((state) => state.playlists);

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">User mixtapes</p>
        <h1 className="section-title">Collections</h1>
      </div>
      <div className="grid grid-cols-3 gap-4 max-xl:grid-cols-2 max-sm:grid-cols-1">
        {playlists.length ? playlists.map((playlist) => (
          <article key={playlist.id} className="app-card p-5">
            <h2 className="font-display text-2xl font-semibold uppercase leading-tight">{playlist.name}</h2>
            <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.12em] text-cream/45">
              {playlist.type} • {playlist.type === 'video' ? playlist.videoItems.length : playlist.animeIds.length} tapes
            </p>
          </article>
        )) : (
          <div className="app-card col-span-full p-6 font-mono text-sm uppercase tracking-[0.12em] text-cream/50">
            Playlist creation is wired for local storage state and ready for the next UI pass.
          </div>
        )}
      </div>
    </div>
  );
}
