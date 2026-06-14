import { ArrowDown, ArrowUp, Download, ToggleLeft, ToggleRight, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { getAvailableSourcePlugins } from '../services/sourceResolver';
import { useAppStore } from '../state/appStore';

export default function PluginsPanel() {
  const importedSourcePlugins = useAppStore((state) => state.importedSourcePlugins);
  const pluginPriority = useAppStore((state) => state.pluginPriority);
  const pluginEnabled = useAppStore((state) => state.pluginEnabled);
  const preferredSourcePluginId = useAppStore((state) => state.preferredSourcePluginId);
  const importSourcePluginFromFile = useAppStore((state) => state.importSourcePluginFromFile);
  const removeSourcePlugin = useAppStore((state) => state.removeSourcePlugin);
  const setPluginPriority = useAppStore((state) => state.setPluginPriority);
  const setPluginEnabled = useAppStore((state) => state.setPluginEnabled);
  const setPreferredSourcePluginId = useAppStore((state) => state.setPreferredSourcePluginId);
  const [feedback, setFeedback] = useState<string>('');
  const [isImporting, setIsImporting] = useState(false);

  const availablePlugins = useMemo(() => getAvailableSourcePlugins(importedSourcePlugins), [importedSourcePlugins]);
  const orderedIds = [...pluginPriority];
  for (const plugin of availablePlugins) {
    if (!orderedIds.includes(plugin.id)) {
      orderedIds.push(plugin.id);
    }
  }

  const orderedPlugins = orderedIds
    .map((id) => availablePlugins.find((plugin) => plugin.id === id))
    .filter((plugin): plugin is (typeof availablePlugins)[number] => Boolean(plugin));

  const movePlugin = (pluginId: string, direction: -1 | 1) => {
    const fromIndex = orderedIds.indexOf(pluginId);
    if (fromIndex < 0) return;
    const toIndex = fromIndex + direction;
    if (toIndex < 0 || toIndex >= orderedIds.length) return;

    const next = [...orderedIds];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    void setPluginPriority(next);
  };

  const handleImport = async () => {
    setFeedback('');
    setIsImporting(true);
    try {
      const beforeCount = importedSourcePlugins.length;
      await importSourcePluginFromFile();
      const afterCount = useAppStore.getState().importedSourcePlugins.length;
      if (afterCount > beforeCount) {
        setFeedback('Plugin imported successfully.');
      } else {
        setFeedback('Import canceled.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to import plugin artifact.';
      setFeedback(message);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <section className="plugins-panel space-y-3">
      <div className="plugins-header-wrap">
        <p className="font-mono text-[10px] uppercase tracking-[0.13em] text-amberline/70">Plugin Sources</p>
        <p className="text-cream/72">Start with zero plugins. Import artifact output from the external plugin repo to enable sources.</p>
      </div>

      <div className="plugins-toolbar">
        <button
          type="button"
          className="plugin-import-btn retro-tooltip"
          onClick={() => void handleImport()}
          disabled={isImporting}
          data-tooltip="Import Plugin Artifact"
          aria-label="Import plugin artifact"
        >
          <Download size={13} /> {isImporting ? 'Importing...' : 'Import Plugin'}
        </button>
        {feedback ? <p className="plugins-feedback-text">{feedback}</p> : null}
      </div>

      <div className="space-y-2">
        {orderedPlugins.length === 0 ? <p className="plugins-empty-state">No plugins installed. Import a plugin artifact to begin.</p> : null}
        {orderedPlugins.map((plugin, index) => {
          const enabled = pluginEnabled[plugin.id] !== false;
          const isPreferred = preferredSourcePluginId === plugin.id;
          return (
            <div key={plugin.id} className="plugin-row">
              <div className="plugin-icon-shell" aria-hidden="true">
                {plugin.iconDataUri ? <img src={plugin.iconDataUri} alt="" className="plugin-icon-image" /> : <span className="plugin-icon-fallback" />}
              </div>

              <div className="plugin-row-main">
                <p className="plugin-row-title">{plugin.name}</p>
                <p className="plugin-row-meta">id: {plugin.id} • v{plugin.version}</p>
              </div>

              <div className="plugin-row-actions">
                <button
                  type="button"
                  className="plugin-row-btn retro-tooltip"
                  aria-label={`Move ${plugin.name} up`}
                  data-tooltip="Move Up"
                  onClick={() => movePlugin(plugin.id, -1)}
                  disabled={index === 0}
                >
                  <ArrowUp size={12} />
                </button>
                <button
                  type="button"
                  className="plugin-row-btn retro-tooltip"
                  aria-label={`Move ${plugin.name} down`}
                  data-tooltip="Move Down"
                  onClick={() => movePlugin(plugin.id, 1)}
                  disabled={index === orderedPlugins.length - 1}
                >
                  <ArrowDown size={12} />
                </button>
                <button
                  type="button"
                  className={`plugin-row-btn plugin-enable-btn retro-tooltip ${enabled ? 'is-enabled' : 'is-disabled'}`}
                  aria-label={`${enabled ? 'Disable' : 'Enable'} ${plugin.name}`}
                  data-tooltip={enabled ? 'Disable Plugin' : 'Enable Plugin'}
                  onClick={() => void setPluginEnabled(plugin.id, !enabled)}
                >
                  {enabled ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                </button>
                <button
                  type="button"
                  className={`plugin-row-btn plugin-prefer-btn retro-tooltip ${isPreferred ? 'is-preferred' : ''}`}
                  aria-label={isPreferred ? `Use auto source instead of ${plugin.name}` : `Prefer ${plugin.name}`}
                  data-tooltip={isPreferred ? 'Using Preferred Source' : 'Set as Preferred Source'}
                  onClick={() => void setPreferredSourcePluginId(isPreferred ? null : plugin.id)}
                  disabled={!enabled}
                >
                  Prefer
                </button>
                <button
                  type="button"
                  className="plugin-row-btn plugin-remove-btn retro-tooltip"
                  aria-label={`Remove ${plugin.name}`}
                  data-tooltip="Uninstall Plugin"
                  onClick={() => void removeSourcePlugin(plugin.id)}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
