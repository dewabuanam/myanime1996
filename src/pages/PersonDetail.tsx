import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Heart } from 'lucide-react';
import ImageLightbox, { type LightboxItem } from '../components/ImageLightbox';
import ProfilePicturesStrip from '../components/ProfilePicturesStrip';
import { getPersonDetail, getPersonPictures } from '../services/tenrai';
import { useAppStore } from '../state/appStore';
import type { MediaPicture, PersonDetail as PersonDetailData } from '../types/anime';

type LightboxState = { items: LightboxItem[]; index: number };

const ROLES_PAGE_SIZE = 24;

export default function PersonDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const personId = Math.max(0, Math.floor(Number(id) || 0));
  const selectAnime = useAppStore((state) => state.selectAnime);
  const openRightPanelWithView = useAppStore((state) => state.openRightPanelWithView);

  const [person, setPerson] = useState<PersonDetailData | null>(null);
  const [pictures, setPictures] = useState<MediaPicture[]>([]);
  const [isLoading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const [visibleRoles, setVisibleRoles] = useState(ROLES_PAGE_SIZE);
  const [roleQuery, setRoleQuery] = useState('');

  useEffect(() => {
    if (personId <= 0) {
      setLoading(false);
      return;
    }

    let alive = true;
    setLoading(true);
    setPerson(null);
    setPictures([]);
    setVisibleRoles(ROLES_PAGE_SIZE);
    setRoleQuery('');

    Promise.all([getPersonDetail(personId), getPersonPictures(personId)])
      .then(([detail, pictureList]) => {
        if (!alive) return;
        setPerson(detail);
        setPictures(pictureList);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [personId]);

  // A prolific actor's list runs to several hundred entries, so it filters and pages
  // rather than rendering the lot.
  const filteredRoles = useMemo(() => {
    const query = roleQuery.trim().toLowerCase();
    const roles = person?.voiceActingRoles ?? [];
    if (!query) return roles;
    return roles.filter(
      (role) => role.characterName.toLowerCase().includes(query) || role.animeTitle.toLowerCase().includes(query),
    );
  }, [person?.voiceActingRoles, roleQuery]);

  const openAnimeInPanel = async (animeId: number, title: string, image?: string) => {
    await selectAnime({
      id: animeId,
      tenraiId: animeId,
      title,
      image: image ?? '',
      synopsis: '',
      studios: [],
      genres: [],
    });
    await openRightPanelWithView('detail');
  };

  if (isLoading) {
    return <div className="app-card p-6 font-mono uppercase tracking-[0.14em] text-amberline">Loading person...</div>;
  }

  if (!person) {
    return <div className="app-card p-6 text-rust">That person could not be loaded.</div>;
  }

  const birthdayLabel = person.birthday
    ? new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(person.birthday))
    : null;

  return (
    <div className="space-y-5">
      <button type="button" className="vhs-button-ghost inline-flex items-center gap-1.5 px-2 py-1 text-[10px]" onClick={() => navigate(-1)}>
        <ArrowLeft size={12} /> Back
      </button>

      <section className="seeall-row-card app-card grid grid-cols-[240px_1fr] gap-5 overflow-hidden p-5 max-lg:grid-cols-1">
        <div className="relative aspect-[3/4] overflow-hidden border border-cream/15 bg-black/50">
          {person.image ? (
            <button
              type="button"
              className="absolute inset-0 z-[1] cursor-zoom-in"
              aria-label="Open portrait in fullscreen"
              onClick={() => setLightbox({ items: [{ src: person.image as string, label: person.name }], index: 0 })}
            >
              <img src={person.image} alt="" className="h-full w-full object-cover" />
            </button>
          ) : null}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
        </div>

        <div className="min-w-0">
          <p className="eyebrow">Person</p>
          <h1 className="mt-1.5 font-display text-4xl font-semibold uppercase leading-tight max-lg:text-3xl">{person.name}</h1>
          {person.alternateNames.length ? (
            <p className="anime-card-jp mt-1.5 line-clamp-2">{person.alternateNames.join(' · ')}</p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            {birthdayLabel ? (
              <span className="inline-flex items-center gap-1.5 border border-cream/20 px-2.5 py-1 text-xs text-cream/78">
                <CalendarDays size={12} className="text-amberline" /> {birthdayLabel}
              </span>
            ) : null}
            {typeof person.favorites === 'number' ? (
              <span className="inline-flex items-center gap-1.5 border border-cream/20 px-2.5 py-1 text-xs text-cream/78">
                <Heart size={12} className="text-amberline" /> {person.favorites.toLocaleString('en-US')} favorites
              </span>
            ) : null}
          </div>

          {person.about ? (
            <div className="mt-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.11em] text-cream/58">Details</p>
              <p className="mt-1.5 whitespace-pre-line text-justify text-cream/72">{person.about}</p>
            </div>
          ) : null}
        </div>
      </section>

      <ProfilePicturesStrip title="Pictures" subjectLabel={person.name} pictures={pictures} onOpenImages={(items, index) => setLightbox({ items, index })} />

      <section className="app-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.11em] text-cream/58">
            Voice Acting Roles <span className="text-cream/40">({person.voiceActingRoles.length})</span>
          </p>
          {person.voiceActingRoles.length > ROLES_PAGE_SIZE ? (
            <input
              type="search"
              value={roleQuery}
              onChange={(event) => {
                setRoleQuery(event.target.value);
                setVisibleRoles(ROLES_PAGE_SIZE);
              }}
              placeholder="Search character / anime"
              className="w-56 border border-cream/20 bg-black/25 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.09em] text-cream/85 placeholder:text-cream/45 focus:border-amberline/55 focus:outline-none"
            />
          ) : null}
        </div>

        {filteredRoles.length === 0 ? (
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.1em] text-cream/45">
            {person.voiceActingRoles.length === 0 ? 'No voice acting roles recorded.' : 'No roles match your search.'}
          </p>
        ) : (
          <>
            <div className="voice-role-list mt-2.5">
              {filteredRoles.slice(0, visibleRoles).map((role) => (
                <article key={`${role.animeId}-${role.characterId}`} className="voice-role-row">
                  <button
                    type="button"
                    className="voice-role-side"
                    onClick={() => navigate(`/character/${role.characterId}`)}
                    aria-label={`Open ${role.characterName}`}
                  >
                    <div className="voice-role-thumb">
                      {role.characterImage ? <img src={role.characterImage} alt="" loading="lazy" /> : <span className="anime-cast-tile-fallback">?</span>}
                    </div>
                    <div className="min-w-0">
                      <p className="voice-role-name line-clamp-2">{role.characterName}</p>
                      {role.role ? <p className="voice-role-meta line-clamp-1">{role.role}</p> : null}
                    </div>
                  </button>

                  <button
                    type="button"
                    className="voice-role-side voice-role-side-anime"
                    onClick={() => void openAnimeInPanel(role.animeId, role.animeTitle, role.animeImage)}
                    aria-label={`Open ${role.animeTitle} in the detail panel`}
                  >
                    <div className="min-w-0 text-right">
                      <p className="voice-role-name line-clamp-2">{role.animeTitle}</p>
                      <p className="voice-role-meta line-clamp-1">Anime</p>
                    </div>
                    <div className="voice-role-thumb">
                      {role.animeImage ? <img src={role.animeImage} alt="" loading="lazy" /> : <span className="anime-cast-tile-fallback">?</span>}
                    </div>
                  </button>
                </article>
              ))}
            </div>

            {visibleRoles < filteredRoles.length ? (
              <button
                type="button"
                className="anime-relations-toggle mt-2.5 inline-flex items-center gap-1.5"
                onClick={() => setVisibleRoles((current) => current + ROLES_PAGE_SIZE)}
              >
                Show {Math.min(ROLES_PAGE_SIZE, filteredRoles.length - visibleRoles)} more
              </button>
            ) : null}
          </>
        )}
      </section>

      {lightbox ? (
        <ImageLightbox
          items={lightbox.items}
          index={lightbox.index}
          onIndexChange={(index) => setLightbox((current) => (current ? { ...current, index } : current))}
          onClose={() => setLightbox(null)}
        />
      ) : null}
    </div>
  );
}
