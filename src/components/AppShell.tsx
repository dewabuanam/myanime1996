import { getCurrentWindow } from '@tauri-apps/api/window';
import { LogicalPosition } from '@tauri-apps/api/dpi';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import BottomPlayer from './BottomPlayer';
import GlobalTooltip from './GlobalTooltip';
import RightPanelNav from './RightPanelNav';
import RightNowPlaying from './RightNowPlaying';
import SettingsModal from './SettingsModal';
import Sidebar from './Sidebar';
import TopNavigation from './TopNavigation';
import { useAppStore } from '../state/appStore';

const DRAG_START_DISTANCE_PX = 4;
const RIGHT_PANEL_MIN_WIDTH_PX = 260;
const RIGHT_PANEL_MAX_WIDTH_PX = 560;
const MAIN_CONTENT_MIN_WIDTH_PX = 420;
const RIGHT_RAIL_WIDTH_PX = 56;
const SIDEBAR_EXPANDED_WIDTH_PX = 220;
const SIDEBAR_COMPACT_WIDTH_PX = 88;

export default function AppShell() {
  const isSidebarCompact = useAppStore((state) => state.isSidebarCompact);
  const isRightPanelHidden = useAppStore((state) => state.isRightPanelHidden);
  const isRightPanelFullpage = useAppStore((state) => state.isRightPanelFullpage);
  const rightPanelWidth = useAppStore((state) => state.rightPanelWidth);
  const setRightPanelWidth = useAppStore((state) => state.setRightPanelWidth);
  const compactSidebarWidth = '88px';
  const rightRailWidth = '56px';

  useEffect(() => {
    if (isRightPanelHidden || isRightPanelFullpage) return;

    const clampRightPanelToViewport = () => {
      const sidebarWidthPx = isSidebarCompact ? SIDEBAR_COMPACT_WIDTH_PX : SIDEBAR_EXPANDED_WIDTH_PX;
      const availableForPanel = Math.floor(window.innerWidth - sidebarWidthPx - RIGHT_RAIL_WIDTH_PX - MAIN_CONTENT_MIN_WIDTH_PX);
      const viewportMaxWidth = Math.max(
        RIGHT_PANEL_MIN_WIDTH_PX,
        Math.min(RIGHT_PANEL_MAX_WIDTH_PX, availableForPanel),
      );

      if (rightPanelWidth > viewportMaxWidth) {
        void setRightPanelWidth(viewportMaxWidth);
      }
    };

    clampRightPanelToViewport();
    window.addEventListener('resize', clampRightPanelToViewport);
    return () => {
      window.removeEventListener('resize', clampRightPanelToViewport);
    };
  }, [isRightPanelFullpage, isRightPanelHidden, isSidebarCompact, rightPanelWidth, setRightPanelWidth]);

  const shellGridColumns = isRightPanelHidden
    ? `${isSidebarCompact ? compactSidebarWidth : '220px'} minmax(0,1fr) 0px ${rightRailWidth}`
    : `${isSidebarCompact ? compactSidebarWidth : '220px'} minmax(0,1fr) ${rightPanelWidth}px ${rightRailWidth}`;

  const handleRightResizeStart = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (isRightPanelHidden || isRightPanelFullpage) return;
    event.preventDefault();

    const startX = event.clientX;
    const startWidth = rightPanelWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = startX - moveEvent.clientX;
      const nextWidth = startWidth + deltaX;
      void setRightPanelWidth(nextWidth);
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const startWindowDragFromPointer = async (pointer: Pick<MouseEvent, 'clientX' | 'clientY' | 'screenX' | 'screenY'>) => {
    try {
      const appWindow = getCurrentWindow();
      const isMaximized = await appWindow.isMaximized();
      if (isMaximized) {
        const ratioX = Math.min(Math.max(pointer.clientX / Math.max(window.innerWidth, 1), 0), 1);
        const gripOffsetY = Math.min(Math.max(pointer.clientY, 6), 34);
        await appWindow.toggleMaximize();

        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        });

        const restoredWidth = Math.max(window.innerWidth, 1);
        const offsetX = Math.round(restoredWidth * ratioX);
        const nextX = Math.round(pointer.screenX - offsetX);
        const nextY = Math.round(pointer.screenY - gripOffsetY);
        await appWindow.setPosition(new LogicalPosition(nextX, nextY));
      }
      await appWindow.startDragging();
    } catch (error) {
      console.warn('Top edge drag failed.', error);
    }
  };

  const handleTopEdgeMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();

    const startX = event.clientX;
    const startY = event.clientY;
    let dragStarted = false;

    const cleanup = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    const onMouseMove = (moveEvent: MouseEvent) => {
      if ((moveEvent.buttons & 1) === 0) {
        cleanup();
        return;
      }

      const movedX = Math.abs(moveEvent.clientX - startX);
      const movedY = Math.abs(moveEvent.clientY - startY);
      if (dragStarted || Math.max(movedX, movedY) < DRAG_START_DISTANCE_PX) return;

      dragStarted = true;
      cleanup();
      void startWindowDragFromPointer(moveEvent);
    };

    const onMouseUp = () => {
      cleanup();
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleTopEdgeDoubleClick = async () => {
    try {
      const appWindow = getCurrentWindow();
      await appWindow.toggleMaximize();
    } catch (error) {
      console.warn('Top edge double-click maximize failed.', error);
    }
  };

  return (
    <div className="app-noise h-full min-h-0 overflow-hidden bg-ink text-cream">
      <div className="app-shell-wrap relative mx-auto h-full w-full">
        <div
          className="top-edge-drag-zone"
          onMouseDown={(event) => void handleTopEdgeMouseDown(event)}
          onDoubleClick={() => void handleTopEdgeDoubleClick()}
          aria-hidden="true"
        />
        <div className="app-shell-grid grid h-full grid-rows-[minmax(0,1fr)_96px] gap-0 p-0" style={{ gridTemplateColumns: shellGridColumns }}>
          
          {!isRightPanelFullpage ? 
          (
            <div className={`min-h-0 ${isRightPanelFullpage ? 'pointer-events-none opacity-0' : ''}`}>
                <Sidebar />
            </div>
          )
          : null}
          
          {!isRightPanelFullpage ? 
          (
            <main className={`app-main app-main-shell grid min-h-0 grid-rows-[56px_minmax(0,1fr)] overflow-hidden ${isRightPanelFullpage ? 'pointer-events-none opacity-0' : ''}`}>
                <TopNavigation />
                <div className="app-main-scroll min-h-0 overflow-y-auto overflow-x-hidden">
                <Outlet />
                </div>
            </main>
          )
          : null}
          <div
            className={`right-panel-host relative h-full min-h-0 overflow-hidden ${isRightPanelHidden ? 'pointer-events-none opacity-0' : ''} ${isRightPanelFullpage ? 'col-start-1 col-end-5 row-start-1 row-end-2 z-40 app-right-panel-fullpage-host' : ''}`}
          >
            {!isRightPanelHidden && !isRightPanelFullpage ? (
              <div
                className="right-panel-resizer"
                onMouseDown={handleRightResizeStart}
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize now playing panel"
              />
            ) : null}
            <RightNowPlaying />
          </div>
          {!isRightPanelFullpage ? (
            <div className="right-rail-wrap min-h-0">
              <RightPanelNav />
            </div>
          ) : null}
          <div className="bottom-player-host col-span-4">
            <BottomPlayer />
          </div>
        </div>
        <GlobalTooltip />
        <SettingsModal />
      </div>
    </div>
  );
}
