import { Unlock } from 'lucide-react';
import type { SourceResolveAttemptStatus, SourceResolveTrace } from '../types/plugin';

type SourceResolveLogPanelProps = {
  sourceResolveTrace: SourceResolveTrace | null;
  isResolvingSource: boolean;
  onClearRateLimit: (pluginId: string) => void;
  className?: string;
};

const sourceAttemptStatusLabel = (status: SourceResolveAttemptStatus) => {
  if (status === 'cache-hit') return 'Cache Hit';
  if (status === 'resolved') return 'Resolved';
  if (status === 'no-match') return 'No Match';
  if (status === 'error') return 'Error';
  return 'Skipped';
};

const isRateLimitError = (message: string) => {
  const lower = message.toLowerCase();
  return lower.includes('429') || lower.includes('rate limit') || lower.includes('cooldown');
};

export default function SourceResolveLogPanel({
  sourceResolveTrace,
  isResolvingSource,
  onClearRateLimit,
  className,
}: SourceResolveLogPanelProps) {
  const panelClassName = className ? `source-trace-panel ${className}` : 'source-trace-panel';

  return (
    <div className={panelClassName}>
      <div className="source-trace-header">
        <p className="source-trace-title">Source Resolve Log</p>
        <p className="source-trace-meta">
          Active: {sourceResolveTrace?.activePluginIds.length ?? 0}
          {sourceResolveTrace?.resolvedPluginId ? ` / Winner: ${sourceResolveTrace.resolvedPluginId}` : ''}
        </p>
      </div>

      <div className="source-trace-list">
        {isResolvingSource ? (
          <p className="source-trace-empty">Resolving source and collecting plugin attempt logs...</p>
        ) : sourceResolveTrace?.attempts.length ? (
          sourceResolveTrace.attempts.map((attempt) => (
            <div key={`${attempt.pluginId}-${attempt.order}-${attempt.status}`} className="source-trace-item">
              <div className="source-trace-item-head">
                <span className="source-trace-item-order">#{attempt.order}</span>
                <span className="source-trace-item-plugin">{attempt.pluginName}</span>
                <span className={`source-trace-item-status is-${attempt.status}`}>{sourceAttemptStatusLabel(attempt.status)}</span>
              </div>
              <p className="source-trace-item-message">{attempt.message}</p>
              {attempt.status === 'error' && isRateLimitError(attempt.message) ? (
                <button
                  type="button"
                  className="source-trace-rate-limit-clear-btn retro-tooltip"
                  onClick={() => onClearRateLimit(attempt.pluginId)}
                  aria-label={`Clear rate limit cooldown for ${attempt.pluginName}`}
                  data-tooltip={`Clear Rate Limit for ${attempt.pluginName}`}
                >
                  <Unlock size={10} />
                  <span>Clear Rate Limit</span>
                </button>
              ) : null}
              {attempt.steps?.length ? (
                <div className="source-trace-item-steps" aria-label="Resolve steps">
                  {attempt.steps.map((step, stepIndex) => (
                    <p key={`${attempt.pluginId}-${attempt.order}-step-${stepIndex}`} className="source-trace-step">
                      {stepIndex + 1}. {step}
                    </p>
                  ))}
                </div>
              ) : null}
              <p className="source-trace-item-meta">{attempt.durationMs}ms</p>
            </div>
          ))
        ) : (
          <p className="source-trace-empty">No plugin attempts yet for this item.</p>
        )}
      </div>
    </div>
  );
}
