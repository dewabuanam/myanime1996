import { useMemo } from 'react';
import { useAppStore } from '../state/appStore';

export default function Notifications() {
  const notifications = useAppStore((state) => state.libraryNotifications);
  const playLibraryNotification = useAppStore((state) => state.playLibraryNotification);
  const markAllLibraryNotificationsRead = useAppStore((state) => state.markAllLibraryNotificationsRead);
  const clearLibraryNotifications = useAppStore((state) => state.clearLibraryNotifications);

  const sortedNotifications = useMemo(
    () => [...notifications].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
    [notifications],
  );

  return (
    <div className="space-y-6 px-6 pb-6 pt-4">
      <section className="hero-band relative overflow-hidden rounded-2xl px-6 py-6">
        <div className="absolute inset-0 bg-gradient-to-r from-[#0f0b09]/92 via-[#15100d]/84 to-[#1e160f]/45" />
        <div className="relative z-10">
          <p className="eyebrow">In-App Feed</p>
          <h1 className="section-title">Notifications</h1>
          <p className="mt-2 text-sm text-cream/70">Episode update alerts appear here with anime poster and timestamps.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="vhs-button-ghost px-3 py-2 text-xs" onClick={markAllLibraryNotificationsRead}>
              Mark All Read
            </button>
            <button type="button" className="vhs-button-ghost px-3 py-2 text-xs" onClick={() => void clearLibraryNotifications()}>
              Clear All
            </button>
          </div>
        </div>
      </section>

      <section className="app-card p-4">
        {sortedNotifications.length === 0 ? (
          <p className="text-sm text-cream/60">No notifications yet.</p>
        ) : (
          <div className="space-y-2">
            {sortedNotifications.map((item) => (
              <article
                key={item.id}
                className={`rounded-xl border px-3 py-2 ${item.read ? 'border-cream/12 bg-black/18' : 'border-amberline/40 bg-amberline/10'}`}
                onClick={() => void playLibraryNotification(item.id)}
              >
                <div className="flex items-start gap-3">
                  {item.image ? <img src={item.image} alt="" className="h-14 w-10 rounded-sm object-cover" /> : null}
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-sm uppercase text-cream">{item.title}</p>
                    <p className="text-xs text-cream/75">{item.message}</p>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-cream/55">{new Date(item.createdAt).toLocaleString()}</p>
                  </div>
                  {!item.read ? (
                    <button
                      type="button"
                      className="vhs-button-ghost px-2 py-1 text-[10px]"
                      onClick={(event) => {
                        event.stopPropagation();
                        void playLibraryNotification(item.id);
                      }}
                    >
                      Play
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
