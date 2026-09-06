import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Heart } from 'lucide-react';
import ImageLightbox from '../components/ImageLightbox';
import ProfilePicturesStrip from '../components/ProfilePicturesStrip';
import { getCharacterDetail, getCharacterPictures } from '../services/tenrai';
import type { CharacterDetail as CharacterDetailData, MediaPicture } from '../types/anime';

type LightboxImage = { src: string; label: string; positionLabel?: string };

export default function CharacterDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const characterId = Math.max(0, Math.floor(Number(id) || 0));

  const [character, setCharacter] = useState<CharacterDetailData | null>(null);
  const [pictures, setPictures] = useState<MediaPicture[]>([]);
  const [isLoading, setLoading] = useState(true);
  const [lightboxImage, setLightboxImage] = useState<LightboxImage | null>(null);

  useEffect(() => {
    if (characterId <= 0) {
      setLoading(false);
      return;
    }

    let alive = true;
    setLoading(true);
    setCharacter(null);
    setPictures([]);

    Promise.all([getCharacterDetail(characterId), getCharacterPictures(characterId)])
      .then(([detail, pictureList]) => {
        if (!alive) return;
        setCharacter(detail);
        setPictures(pictureList);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [characterId]);

  if (isLoading) {
    return <div className="app-card p-6 font-mono uppercase tracking-[0.14em] text-amberline">Loading character...</div>;
  }

  if (!character) {
    return <div className="app-card p-6 text-rust">That character could not be loaded.</div>;
  }

  return (
    <div className="space-y-5">
      <button type="button" className="vhs-button-ghost inline-flex items-center gap-1.5 px-2 py-1 text-[10px]" onClick={() => navigate(-1)}>
        <ArrowLeft size={12} /> Back
      </button>

      <section className="seeall-row-card app-card grid grid-cols-[240px_1fr] gap-5 overflow-hidden p-5 max-lg:grid-cols-1">
        <div className="relative aspect-[3/4] overflow-hidden border border-cream/15 bg-black/50">
          {character.image ? (
            <button
              type="button"
              className="absolute inset-0 z-[1] cursor-zoom-in"
              aria-label="Open portrait in fullscreen"
              onClick={() => setLightboxImage({ src: character.image as string, label: character.name })}
            >
              <img src={character.image} alt="" className="h-full w-full object-cover" />
            </button>
          ) : null}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
        </div>

        <div className="min-w-0">
          <p className="eyebrow">Character</p>
          <h1 className="mt-1.5 font-display text-4xl font-semibold uppercase leading-tight max-lg:text-3xl">{character.name}</h1>
          {character.nameKanji ? <p className="anime-card-jp mt-1.5">{character.nameKanji}</p> : null}

          <div className="mt-4 flex flex-wrap gap-2">
            {typeof character.favorites === 'number' ? (
              <span className="inline-flex items-center gap-1.5 border border-cream/20 px-2.5 py-1 text-xs text-cream/78">
                <Heart size={12} className="text-amberline" /> {character.favorites.toLocaleString('en-US')} favorites
              </span>
            ) : null}
            {character.nicknames.map((nickname) => (
              <span key={nickname} className="inline-flex items-center border border-amberline/40 bg-amberline/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.09em] text-amberline/95">
                {nickname}
              </span>
            ))}
          </div>

          {character.about ? (
            <div className="mt-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.11em] text-cream/58">Details</p>
              <p className="mt-1.5 whitespace-pre-line text-justify text-cream/72">{character.about}</p>
            </div>
          ) : null}
        </div>
      </section>

      <ProfilePicturesStrip
        title="Pictures"
        subjectLabel={character.name}
        pictures={pictures}
        onOpenImage={setLightboxImage}
      />

      <section className="app-card p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.11em] text-cream/58">
          Voice Actors <span className="text-cream/40">({character.voiceActors.length})</span>
        </p>

        {character.voiceActors.length === 0 ? (
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.1em] text-cream/45">No voice actors recorded.</p>
        ) : (
          <div className="anime-cast-grid mt-2.5">
            {character.voiceActors.map((actor) => (
              <button
                key={`${actor.personId}-${actor.language}`}
                type="button"
                className="anime-cast-tile"
                onClick={() => navigate(`/person/${actor.personId}`)}
                aria-label={`Open ${actor.name}`}
              >
                <div className="anime-cast-tile-portrait">
                  {actor.image ? <img src={actor.image} alt="" loading="lazy" /> : <span className="anime-cast-tile-fallback">?</span>}
                </div>
                <div className="anime-cast-tile-copy">
                  <p className="anime-cast-tile-name line-clamp-2">{actor.name}</p>
                  <p className="anime-cast-tile-meta line-clamp-1">{actor.language}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {lightboxImage ? (
        <ImageLightbox
          src={lightboxImage.src}
          label={lightboxImage.label}
          positionLabel={lightboxImage.positionLabel}
          onClose={() => setLightboxImage(null)}
        />
      ) : null}
    </div>
  );
}
