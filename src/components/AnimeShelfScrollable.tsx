import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

type AnimeShelfScrollableProps<T> = {
  items: T[];
  trackClassName: string;
  renderItem: (item: T, index: number) => ReactNode;
  resetKey?: string | number;
};

export default function AnimeShelfScrollable<T>({ items, trackClassName, renderItem, resetKey }: AnimeShelfScrollableProps<T>) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const getScrollStep = (track: HTMLDivElement) => {
    const firstCard = track.firstElementChild as HTMLElement | null;
    if (!firstCard) return 220;

    const cardWidth = firstCard.getBoundingClientRect().width;
    const styles = window.getComputedStyle(track);
    const gap = Number.parseFloat(styles.columnGap || styles.gap || '0') || 0;
    return Math.max(1, Math.round(cardWidth + gap));
  };

  const updateScrollState = () => {
    const track = trackRef.current;
    if (!track) return;
    const maxScrollLeft = track.scrollWidth - track.clientWidth;
    setCanScrollLeft(track.scrollLeft > 2);
    setCanScrollRight(maxScrollLeft - track.scrollLeft > 2);
  };

  const resetToLeft = () => {
    const track = trackRef.current;
    if (!track) return;

    // Ensure shelf starts from the left edge after first render or data reset.
    track.scrollLeft = 0;
    setCanScrollLeft(false);

    const frame = requestAnimationFrame(() => updateScrollState());
    return () => cancelAnimationFrame(frame);
  };

  useLayoutEffect(() => {
    return resetToLeft();
  }, []);

  useLayoutEffect(() => {
    if (resetKey === undefined) return;
    return resetToLeft();
  }, [resetKey]);

  useEffect(() => {
    updateScrollState();
    const track = trackRef.current;
    if (!track) return;

    const onScroll = () => updateScrollState();
    track.addEventListener('scroll', onScroll, { passive: true });

    const resizeObserver = new ResizeObserver(() => updateScrollState());
    resizeObserver.observe(track);

    return () => {
      track.removeEventListener('scroll', onScroll);
      resizeObserver.disconnect();
    };
  }, [items]);

  const scrollLeft = () => {
    const track = trackRef.current;
    if (!track) return;
    const scrollByAmount = getScrollStep(track);
    track.scrollBy({ left: -scrollByAmount, behavior: 'smooth' });
  };

  const scrollRight = () => {
    const track = trackRef.current;
    if (!track) return;
    const scrollByAmount = getScrollStep(track);
    track.scrollBy({ left: scrollByAmount, behavior: 'smooth' });
  };

  return (
    <div className="anime-shelf-scroller">
      {canScrollLeft && (
        <button
          type="button"
          className="anime-shelf-arrow anime-shelf-arrow-left retro-tooltip"
          onClick={scrollLeft}
          aria-label="Scroll left"
          data-tooltip="Scroll Left"
        >
          <ChevronLeft size={18} />
        </button>
      )}

      <div ref={trackRef} className={trackClassName}>
        {items.map((item, index) => renderItem(item, index))}
      </div>

      {canScrollRight && (
        <button
          type="button"
          className="anime-shelf-arrow anime-shelf-arrow-right retro-tooltip"
          onClick={scrollRight}
          aria-label="Scroll right"
          data-tooltip="Scroll Right"
        >
          <ChevronRight size={18} />
        </button>
      )}
    </div>
  );
}
