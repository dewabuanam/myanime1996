import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';

// Pictures and cast both hang off the detail pane behind a hide/show button and only
// fetch once opened, so they share this shell rather than each rolling their own.

type CollapsibleDetailSectionProps = {
  title: string;
  /** Rendered next to the title once known, e.g. the number of items. */
  count?: number;
  isOpen: boolean;
  onToggle: () => void;
  isLoading?: boolean;
  loadingLabel?: string;
  emptyLabel?: string;
  /** Undefined until the section has been opened and its first fetch resolved. */
  isEmpty?: boolean;
  children: ReactNode;
};

export default function CollapsibleDetailSection({
  title,
  count,
  isOpen,
  onToggle,
  isLoading = false,
  loadingLabel = 'Loading...',
  emptyLabel = 'Nothing to show here.',
  isEmpty = false,
  children,
}: CollapsibleDetailSectionProps) {
  return (
    <section className="anime-detail-section mt-4">
      <button
        type="button"
        className="anime-detail-section-head flex w-full items-center justify-between gap-2"
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.11em] text-cream/58">
          {title}
          {typeof count === 'number' && count > 0 ? <span className="text-cream/40"> ({count})</span> : null}
        </p>
        <span className="anime-detail-section-toggle inline-flex items-center gap-1">
          {isOpen ? 'Hide' : 'Show'}
          <ChevronDown size={13} className={isOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
        </span>
      </button>

      {isOpen ? (
        <div className="mt-2">
          {isLoading ? (
            <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-cream/45">{loadingLabel}</p>
          ) : isEmpty ? (
            <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-cream/45">{emptyLabel}</p>
          ) : (
            children
          )}
        </div>
      ) : null}
    </section>
  );
}
