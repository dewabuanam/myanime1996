import { AlertTriangle } from 'lucide-react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  onCancel: () => void;
  onConfirm: () => void;
};

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel, open]);

  if (!open) return null;

  return createPortal(
    <div className="confirm-overlay" aria-hidden={false}>
      <button type="button" className="confirm-backdrop retro-tooltip" aria-label="Cancel confirmation" onClick={onCancel} data-tooltip="Cancel" />
      <section className="confirm-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <div className="confirm-icon-wrap">
          <AlertTriangle size={18} />
        </div>
        <h3 className="confirm-title">{title}</h3>
        <p className="confirm-message">{message}</p>
        <div className="confirm-actions">
          <button type="button" className="confirm-btn retro-tooltip" onClick={onCancel} data-tooltip={cancelLabel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`confirm-btn is-primary retro-tooltip ${tone === 'danger' ? 'is-danger' : ''}`}
            onClick={onConfirm}
            data-tooltip={confirmLabel}
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
