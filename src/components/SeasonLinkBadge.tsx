import { Flower2, Leaf, Snowflake, Sun } from 'lucide-react';
import { Link } from 'react-router-dom';
import { buildSeasonSeeAllPath, getSeasonLabel, type SeasonKey } from '../utils/season';

type SeasonLinkBadgeProps = {
  season: SeasonKey;
  year: number;
  variant?: 'compact' | 'full';
  showLabel?: boolean;
  className?: string;
  interaction?: 'link' | 'action';
  onActivate?: () => void;
};

function getSeasonIcon(season: SeasonKey) {
  if (season === 'winter') return Snowflake;
  if (season === 'spring') return Flower2;
  if (season === 'summer') return Sun;
  return Leaf;
}

export default function SeasonLinkBadge({
  season,
  year,
  variant = 'compact',
  showLabel = false,
  className = '',
  interaction = 'link',
  onActivate,
}: SeasonLinkBadgeProps) {
  const Icon = getSeasonIcon(season);
  const nextClassName = `season-link-badge ${variant === 'compact' ? 'is-compact' : 'is-full'} ${interaction === 'action' ? 'is-action' : ''} ${className}`.trim();

  if (interaction === 'action') {
    return (
      <span
        role="link"
        tabIndex={0}
        className={nextClassName}
        onClick={(event) => {
          event.stopPropagation();
          onActivate?.();
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          event.stopPropagation();
          onActivate?.();
        }}
      >
        <span className={`season-link-badge-icon is-${season}`} aria-hidden="true">
          <Icon size={12} />
        </span>
        <span className="season-link-badge-text">
          {showLabel ? `${getSeasonLabel(season)} ` : ''}
          {year}
        </span>
      </span>
    );
  }

  return (
    <Link to={buildSeasonSeeAllPath(year, season)} className={nextClassName}>
      <span className={`season-link-badge-icon is-${season}`} aria-hidden="true">
        <Icon size={12} />
      </span>
      <span className="season-link-badge-text">
        {showLabel ? `${getSeasonLabel(season)} ` : ''}
        {year}
      </span>
    </Link>
  );
}
