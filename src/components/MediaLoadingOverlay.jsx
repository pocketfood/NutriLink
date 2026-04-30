export default function MediaLoadingOverlay({ visible, percent, label = 'Loading' }) {
  if (!visible) return null;

  const hasPercent = Number.isFinite(percent);
  const safePercent = hasPercent ? Math.min(100, Math.max(0, Math.round(percent))) : null;
  const remainingPercent = hasPercent ? Math.max(0, 100 - safePercent) : null;

  return (
    <div className="media-loading-overlay" role="status" aria-live="polite">
      <div className="media-loading-panel">
        <div className="media-loading-spinner" aria-hidden="true" />
        <div className="media-loading-copy">
          <div className="media-loading-label">{label}</div>
          <div className="media-loading-percent">
            {hasPercent ? `${safePercent}% loaded, ${remainingPercent}% left` : 'Loading media'}
          </div>
        </div>
      </div>
      {hasPercent && (
        <div className="media-loading-track" aria-hidden="true">
          <div className="media-loading-fill" style={{ width: `${safePercent}%` }} />
        </div>
      )}
    </div>
  );
}
