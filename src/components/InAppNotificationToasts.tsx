import { BookmarkPlus, ListPlus, X } from 'lucide-react';
import { useAppStore } from '../state/appStore';

export default function InAppNotificationToasts() {
  const actionToasts = useAppStore((state) => state.actionToasts);
  const dismissActionToast = useAppStore((state) => state.dismissActionToast);

  if (actionToasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-[108px] right-4 z-[150] flex w-[min(92vw,340px)] flex-col gap-2">
      {actionToasts.map((toast) => {
        const Icon = toast.kind === 'library' ? BookmarkPlus : ListPlus;
        const label = toast.kind === 'library' ? 'Library Updated' : 'Queue Updated';

        return (
          <div
            key={toast.id}
            className="pointer-events-auto rounded-xl border border-amberline/45 bg-[rgba(28,18,12,0.92)] px-3 py-2 shadow-[0_10px_26px_rgba(0,0,0,0.5)]"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-start gap-2">
              <div className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-amberline/45 bg-black/30 text-amberline">
                <Icon size={13} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-amberline/85">{label}</p>
                <p className="line-clamp-2 text-xs text-cream/88">{toast.message}</p>
              </div>
              <button
                type="button"
                className="vhs-button-ghost p-1"
                aria-label="Dismiss toast"
                onClick={() => dismissActionToast(toast.id)}
              >
                <X size={12} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
