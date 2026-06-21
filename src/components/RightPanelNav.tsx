import { Info, ListMusic, Plug } from 'lucide-react';
import type { RightPanelView } from '../types/anime';
import { useAppStore } from '../state/appStore';

export default function RightPanelNav() {
  const isRightPanelHidden = useAppStore((state) => state.isRightPanelHidden);
  const rightPanelView = useAppStore((state) => state.rightPanelView);
  const isPlaying = useAppStore((state) => state.isPlaying);
  const setRightPanelHidden = useAppStore((state) => state.setRightPanelHidden);
  const openRightPanelWithView = useAppStore((state) => state.openRightPanelWithView);

  const handleViewButtonClick = (view: RightPanelView) => {
    if (!isRightPanelHidden && rightPanelView === view) {
      void setRightPanelHidden(true);
      return;
    }
    void openRightPanelWithView(view);
  };

  return (
    <nav className="right-panel-mini-nav" aria-label="Right panel quick controls">
      <div className="right-panel-mini-nav-group">
        <button
          type="button"
          className={`right-panel-mini-btn retro-tooltip ${!isRightPanelHidden && rightPanelView === 'now-playing' ? 'is-active' : ''}`}
          aria-label="Open now playing panel"
          data-tooltip={!isRightPanelHidden && rightPanelView === 'now-playing' ? 'Hide Right Panel' : 'Now Playing'}
          onClick={() => handleViewButtonClick('now-playing')}
        >
          <span className={`right-nav-now-indicator ${isPlaying ? 'is-playing' : ''}`} aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>
        <button
          type="button"
          className={`right-panel-mini-btn retro-tooltip ${!isRightPanelHidden && rightPanelView === 'detail' ? 'is-active' : ''}`}
          aria-label="Open detail panel"
          data-tooltip={!isRightPanelHidden && rightPanelView === 'detail' ? 'Hide Right Panel' : 'Detail'}
          onClick={() => handleViewButtonClick('detail')}
        >
          <Info size={13} />
        </button>
        <button
          type="button"
          className={`right-panel-mini-btn retro-tooltip ${!isRightPanelHidden && rightPanelView === 'playlist' ? 'is-active' : ''}`}
          aria-label="Open playlist panel"
          data-tooltip={!isRightPanelHidden && rightPanelView === 'playlist' ? 'Hide Right Panel' : 'Playlist'}
          onClick={() => handleViewButtonClick('playlist')}
        >
          <ListMusic size={13} />
        </button>
        <button
          type="button"
          className={`right-panel-mini-btn retro-tooltip ${!isRightPanelHidden && rightPanelView === 'plugins' ? 'is-active' : ''}`}
          aria-label="Open plugins panel"
          data-tooltip={!isRightPanelHidden && rightPanelView === 'plugins' ? 'Hide Right Panel' : 'Plugins'}
          onClick={() => handleViewButtonClick('plugins')}
        >
          <Plug size={13} />
        </button>
      </div>
    </nav>
  );
}