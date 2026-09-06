import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { MediaPicture } from '../types/anime';
import type { LightboxItem } from './ImageLightbox';

// The character and person pages both show their subject's gallery. Unlike the detail
// pane's section this one is already loaded by the time the page renders, so it only
// has to collapse, not fetch.

type ProfilePicturesStripProps = {
  title: string;
  /** Names the subject when an image opens fullscreen. */
  subjectLabel: string;
  pictures: MediaPicture[];
  onOpenImages: (items: LightboxItem[], index: number) => void;
};

export default function ProfilePicturesStrip({ title, subjectLabel, pictures, onOpenImages }: ProfilePicturesStripProps) {
  const [isOpen, setOpen] = useState(true);

  if (pictures.length === 0) return null;

  return (
    <section className="app-card p-5">
      <button
        type="button"
        className="anime-detail-section-head flex w-full items-center justify-between gap-2"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={isOpen}
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.11em] text-cream/58">
          {title} <span className="text-cream/40">({pictures.length})</span>
        </p>
        <span className="anime-detail-section-toggle inline-flex items-center gap-1">
          {isOpen ? 'Hide' : 'Show'}
          <ChevronDown size={13} className={isOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
        </span>
      </button>

      {isOpen ? (
        <div className="anime-pictures-grid mt-2.5">
          {pictures.map((picture, index) => (
            <button
              key={picture.imageUrl}
              type="button"
              className="anime-pictures-tile"
              aria-label={`Open picture ${index + 1} of ${pictures.length} in fullscreen`}
              onClick={() =>
                onOpenImages(
                  pictures.map((entry, entryIndex) => ({
                    src: entry.largeImageUrl || entry.imageUrl,
                    label: `${subjectLabel} picture ${entryIndex + 1}`,
                  })),
                  index,
                )
              }
            >
              <img src={picture.smallImageUrl || picture.imageUrl} alt="" className="anime-pictures-tile-image" loading="lazy" />
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
