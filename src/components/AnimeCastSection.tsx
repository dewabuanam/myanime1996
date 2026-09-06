import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CollapsibleDetailSection from './CollapsibleDetailSection';
import { getAnimeCharacters, getAnimeStaff } from '../services/tenrai';
import type { AnimeCharacterEntry, AnimeStaffEntry } from '../types/anime';

type AnimeCastSectionProps = {
  animeId: number;
  /** Tiles shown before "show more". The narrow panel fits fewer than the page. */
  collapsedCount?: number;
};

const DEFAULT_COLLAPSED_COUNT = 8;

type CastTab = 'characters' | 'staff';

export default function AnimeCastSection({ animeId, collapsedCount }: AnimeCastSectionProps) {
  const navigate = useNavigate();
  const [isOpen, setOpen] = useState(false);
  const [tab, setTab] = useState<CastTab>('characters');
  const [characters, setCharacters] = useState<AnimeCharacterEntry[]>([]);
  const [staff, setStaff] = useState<AnimeStaffEntry[]>([]);
  const [isLoading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isShowingAll, setShowingAll] = useState(false);

  useEffect(() => {
    setOpen(false);
    setCharacters([]);
    setStaff([]);
    setHasLoaded(false);
    setShowingAll(false);
    setTab('characters');
  }, [animeId]);

  // Both lists load together on the first open: the tabs switch instantly afterwards,
  // and it is two requests either way once someone looks at both.
  useEffect(() => {
    if (!isOpen || hasLoaded || animeId <= 0) return;

    let alive = true;
    setLoading(true);

    Promise.all([getAnimeCharacters(animeId), getAnimeStaff(animeId)])
      .then(([characterList, staffList]) => {
        if (!alive) return;
        setCharacters(characterList);
        setStaff(staffList);
        setHasLoaded(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [animeId, hasLoaded, isOpen]);

  const collapseAt = Math.max(1, collapsedCount ?? DEFAULT_COLLAPSED_COUNT);
  const activeCount = tab === 'characters' ? characters.length : staff.length;
  const visibleCharacters = isShowingAll ? characters : characters.slice(0, collapseAt);
  const visibleStaff = isShowingAll ? staff : staff.slice(0, collapseAt);
  const hiddenCount = activeCount - (tab === 'characters' ? visibleCharacters.length : visibleStaff.length);

  return (
    <CollapsibleDetailSection
      title="Characters & Staff"
      count={hasLoaded ? characters.length + staff.length : undefined}
      isOpen={isOpen}
      onToggle={() => setOpen((current) => !current)}
      isLoading={isLoading}
      loadingLabel="Pulling cast list..."
      emptyLabel="No cast or staff recorded for this title."
      isEmpty={hasLoaded && characters.length === 0 && staff.length === 0}
    >
      <div className="anime-cast-tabs mb-2 inline-flex items-center gap-1.5">
        <button
          type="button"
          className={`anime-relations-sort-btn ${tab === 'characters' ? 'is-active' : ''}`}
          onClick={() => {
            setTab('characters');
            setShowingAll(false);
          }}
        >
          Characters ({characters.length})
        </button>
        <button
          type="button"
          className={`anime-relations-sort-btn ${tab === 'staff' ? 'is-active' : ''}`}
          onClick={() => {
            setTab('staff');
            setShowingAll(false);
          }}
        >
          Staff ({staff.length})
        </button>
      </div>

      <div className="anime-cast-grid">
        {tab === 'characters'
          ? visibleCharacters.map((entry) => {
              // The Japanese cast is what a viewer usually means by "who voices them",
              // so it leads; the character's own page lists every language.
              const leadActor =
                entry.voiceActors.find((actor) => actor.language.toLowerCase() === 'japanese') ?? entry.voiceActors[0];

              return (
                <button
                  key={`character-${entry.characterId}`}
                  type="button"
                  className="anime-cast-tile"
                  onClick={() => navigate(`/character/${entry.characterId}`)}
                  aria-label={`Open ${entry.name}`}
                >
                  <div className="anime-cast-tile-portrait">
                    {entry.image ? <img src={entry.image} alt="" loading="lazy" /> : <span className="anime-cast-tile-fallback">?</span>}
                  </div>
                  <div className="anime-cast-tile-copy">
                    <p className="anime-cast-tile-name line-clamp-2">{entry.name}</p>
                    {entry.role ? <p className="anime-cast-tile-meta line-clamp-1">{entry.role}</p> : null}
                    {leadActor ? <p className="anime-cast-tile-sub line-clamp-1">{leadActor.name}</p> : null}
                  </div>
                </button>
              );
            })
          : visibleStaff.map((entry) => (
              <button
                key={`staff-${entry.personId}`}
                type="button"
                className="anime-cast-tile"
                onClick={() => navigate(`/person/${entry.personId}`)}
                aria-label={`Open ${entry.name}`}
              >
                <div className="anime-cast-tile-portrait">
                  {entry.image ? <img src={entry.image} alt="" loading="lazy" /> : <span className="anime-cast-tile-fallback">?</span>}
                </div>
                <div className="anime-cast-tile-copy">
                  <p className="anime-cast-tile-name line-clamp-2">{entry.name}</p>
                  {entry.positions.length ? (
                    <p className="anime-cast-tile-meta line-clamp-2">{entry.positions.join(', ')}</p>
                  ) : null}
                </div>
              </button>
            ))}
      </div>

      {hiddenCount > 0 || isShowingAll ? (
        <button
          type="button"
          className="anime-relations-toggle mt-2 inline-flex items-center gap-1.5"
          onClick={() => setShowingAll((current) => !current)}
        >
          {isShowingAll ? 'Show less' : `Show ${hiddenCount} more`}
        </button>
      ) : null}
    </CollapsibleDetailSection>
  );
}
