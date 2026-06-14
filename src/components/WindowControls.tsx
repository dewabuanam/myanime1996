import { getCurrentWindow } from '@tauri-apps/api/window';
import type { MouseEvent as ReactMouseEvent } from 'react';

export default function WindowControls() {
  const withWindow = async (action: (appWindow: ReturnType<typeof getCurrentWindow>) => Promise<void>) => {
    try {
      const appWindow = getCurrentWindow();
      await action(appWindow);
    } catch (error) {
      console.warn('Window control action failed.', error);
    }
  };

  const stopDragCapture = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div className="mac-controls" data-tauri-drag-region="false">
      <button
        type="button"
        className="mac-dot mac-dot-close retro-tooltip tooltip-down tooltip-right"
        onMouseDown={stopDragCapture}
        onClick={() => void withWindow((appWindow) => appWindow.close())}
        data-tauri-drag-region="false"
        aria-label="Close"
        data-tooltip="Close"
      />
      <button
        type="button"
        className="mac-dot mac-dot-max retro-tooltip tooltip-down tooltip-right"
        onMouseDown={stopDragCapture}
        onClick={() => void withWindow((appWindow) => appWindow.toggleMaximize())}
        data-tauri-drag-region="false"
        aria-label="Maximize or restore"
        data-tooltip="Maximize / Restore"
      />
      <button
        type="button"
        className="mac-dot mac-dot-min retro-tooltip tooltip-down"
        onMouseDown={stopDragCapture}
        onClick={() => void withWindow((appWindow) => appWindow.minimize())}
        data-tauri-drag-region="false"
        aria-label="Minimize"
        data-tooltip="Minimize"
      />
    </div>
  );
}
