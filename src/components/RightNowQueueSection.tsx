import { EllipsisVertical, ListX, Play, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { PlayableItem, TitleLanguage } from '../types/anime';
import { getDisplayTitle } from '../utils/title';

type RightNowQueueSectionProps = {
  queueUpcoming: PlayableItem[];
  titleLanguage: TitleLanguage;
  openMenuQueueItemId: string | null;
  onToggleMenu: (queueItemId: string) => void;
  onClearQueue: () => void;
  onPlayFromQueue: (queueItemId: string) => void;
  onRemoveFromQueue: (queueItemId: string) => void;
};

export default function RightNowQueueSection({
  queueUpcoming,
  titleLanguage,
  openMenuQueueItemId,
  onToggleMenu,
  onClearQueue,
  onPlayFromQueue,
  onRemoveFromQueue,
}: RightNowQueueSectionProps) {
  const PAGE_SIZE = 12;
  const [queuePage, setQueuePage] = useState(1);
  const totalQueuePages = Math.max(1, Math.ceil(queueUpcoming.length / PAGE_SIZE));
  const safeQueuePage = Math.max(1, Math.min(queuePage, totalQueuePages));
  const pagedQueueItems = useMemo(() => {
    const start = (safeQueuePage - 1) * PAGE_SIZE;
    return queueUpcoming.slice(start, start + PAGE_SIZE);
  }, [queueUpcoming, safeQueuePage]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.13em] text-amberline/70">Next in Queue</p>
        <button
          type="button"
          className="right-queue-clear-btn retro-tooltip"
          onClick={onClearQueue}
          aria-label="Clear queue"
          data-tooltip="Clear Queue"
        >
          <ListX size={12} /> Clear Queue
        </button>
      </div>

      {queueUpcoming.length > 0 ? (
        <div className="space-y-1.5">
          {pagedQueueItems.map((queueItem) => (
            <div key={queueItem.id} className="right-queue-item group">
              <img src={queueItem.anime.image} alt="" className="right-queue-item-thumb" />
              <div className="min-w-0 flex-1">
                <p className="right-queue-item-title line-clamp-1">{getDisplayTitle(queueItem.anime, titleLanguage)}</p>
                <p className="right-queue-item-jp line-clamp-1">{queueItem.anime.titleJapanese ?? 'No Japanese title'}</p>
                <p className="right-queue-item-type line-clamp-1">{queueItem.typeLabel}</p>
              </div>

              <div className="right-queue-item-actions">
                <button
                  type="button"
                  className="right-queue-item-action-btn retro-tooltip"
                  onClick={() => onPlayFromQueue(queueItem.id)}
                  aria-label="Play from queue"
                  data-tooltip="Play from Queue"
                >
                  <Play size={13} />
                </button>

                <button
                  type="button"
                  className="right-queue-item-action-btn right-queue-item-menu-trigger retro-tooltip"
                  aria-label="Queue item options"
                  data-tooltip="Queue Item Options"
                  onClick={() => onToggleMenu(queueItem.id)}
                >
                  <EllipsisVertical size={13} />
                </button>
              </div>

              {openMenuQueueItemId === queueItem.id ? (
                <div className="right-queue-item-menu" role="menu" aria-label="Queue item options">
                  <button
                    type="button"
                    className="right-queue-item-menu-btn retro-tooltip"
                    onClick={() => onRemoveFromQueue(queueItem.id)}
                    data-tooltip="Remove from Queue"
                  >
                    <Trash2 size={12} /> Remove from Queue
                  </button>
                </div>
              ) : null}
            </div>
          ))}
          <div className="mt-1.5 flex items-center justify-end gap-1.5">
            <button
              type="button"
              className="vhs-button-ghost px-2 py-1 text-[10px]"
              disabled={safeQueuePage <= 1}
              onClick={() => setQueuePage((value) => Math.max(1, value - 1))}
            >
              Prev
            </button>
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-cream/60">{safeQueuePage}/{totalQueuePages}</span>
            <button
              type="button"
              className="vhs-button-ghost px-2 py-1 text-[10px]"
              disabled={safeQueuePage >= totalQueuePages}
              onClick={() => setQueuePage((value) => Math.min(totalQueuePages, value + 1))}
            >
              Next
            </button>
          </div>
        </div>
      ) : (
        <p className="text-cream/72">Queue is empty. Use Add to Queue on cards or hover preview.</p>
      )}
    </div>
  );
}
