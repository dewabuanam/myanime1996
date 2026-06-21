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
    <div className="seeall-page space-y-4 pb-8">
      <section className="seeall-header notifications-header px-6 py-5">
        <div>
          <p className="eyebrow">In-App Feed</p>
          <h1 className="section-title">Notifications</h1>
          <p className="seeall-subtitle">Episode update alerts appear here with anime poster and timestamps.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="vhs-button-ghost px-3 py-2 text-xs" onClick={markAllLibraryNotificationsRead}>
            Mark All Read
          </button>
          <button type="button" className="vhs-button-ghost px-3 py-2 text-xs" onClick={() => void clearLibraryNotifications()}>
            Clear All
          </button>
        </div>
      </section>

      <section className="notifications-content space-y-2 px-6 notifications-scrollable">
        {sortedNotifications.length === 0 ? (
          <div className="app-card p-6 font-mono text-sm uppercase tracking-[0.12em] text-cream/50">No notifications yet.</div>
        ) : (
          <div className="space-y-2">
            {sortedNotifications.map((item) => (
              <article
                key={item.id}
                className={`notifications-item border px-3 py-2 ${item.read ? 'is-read' : 'is-unread'}`}
                onClick={() => void playLibraryNotification(item.id)}
              >
                <div className="flex items-start gap-3">
                  {item.image ? <img src={item.image} alt="" className="notifications-item-image h-14 w-10 object-cover" /> : null}
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
