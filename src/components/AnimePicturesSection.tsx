import { useEffect, useState } from 'react';
import CollapsibleDetailSection from './CollapsibleDetailSection';
import { getAnimePictures } from '../services/tenrai';
import type { MediaPicture } from '../types/anime';
import type { LightboxItem } from './ImageLightbox';

type AnimePicturesSectionProps = {
  animeId: number;
  animeTitle: string;
  /**
   * Opens the shared preview on the whole set, so a picture behaves exactly like the
   * poster and can be stepped through from wherever it was opened.
   */
  onOpenImages: (items: LightboxItem[], index: number) => void;
};

export default function AnimePicturesSection({ animeId, animeTitle, onOpenImages }: AnimePicturesSectionProps) {
  const [isOpen, setOpen] = useState(false);
  const [pictures, setPictures] = useState<MediaPicture[]>([]);
  const [isLoading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  // A different title starts over, collapsed, so switching anime never shows the
  // previous one's artwork.
  useEffect(() => {
    setOpen(false);
    setPictures([]);
    setHasLoaded(false);
  }, [animeId]);

  // Fetching waits for the first open: most visits never expand this.
  useEffect(() => {
    if (!isOpen || hasLoaded || animeId <= 0) return;

    let alive = true;
    setLoading(true);

    getAnimePictures(animeId)
      .then((result) => {
        if (!alive) return;
        setPictures(result);
        setHasLoaded(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [animeId, hasLoaded, isOpen]);

  return (
    <CollapsibleDetailSection
      title="Pictures"
      count={pictures.length}
      isOpen={isOpen}
      onToggle={() => setOpen((current) => !current)}
      isLoading={isLoading}
      loadingLabel="Pulling artwork..."
      emptyLabel="No extra artwork published for this title."
      isEmpty={hasLoaded && pictures.length === 0}
    >
      <div className="anime-pictures-grid">
        {pictures.map((picture, index) => (
          <button
            key={picture.imageUrl}
            type="button"
            className="anime-pictures-tile"
            aria-label={`Open picture ${index + 1} of ${pictures.length} in fullscreen`}
            onClick={() =>
              onOpenImages(
                // The grid shows the small variant; the preview deserves the big one.
                pictures.map((entry, entryIndex) => ({
                  src: entry.largeImageUrl || entry.imageUrl,
                  label: `${animeTitle} picture ${entryIndex + 1}`,
                })),
                index,
              )
            }
          >
            <img
              src={picture.smallImageUrl || picture.imageUrl}
              alt=""
              className="anime-pictures-tile-image"
              loading="lazy"
            />
          </button>
        ))}
      </div>
    </CollapsibleDetailSection>
  );
}
