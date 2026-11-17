import { useEffect, useId, useRef, type ReactNode } from 'react';

/**
 * A modal asking the viewer to confirm something, e.g. deleting a post. Esc, the backdrop or Cancel dismiss it;
 * Cancel has focus to start with, so a stray Enter doesn't confirm.
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel = 'Confirm',
  danger,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  title: string;
  children?: ReactNode;
  confirmLabel?: string;
  /** Style the confirm button as destructive. */
  danger?: boolean;
  /** Disable the buttons while the action runs. */
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
    else dialog.setAttribute('open', '');
    return () => {
      if (dialog.open && typeof dialog.close === 'function') dialog.close();
    };
  }, []);

  const cancel = () => !busy && onCancel();

  return (
    <dialog
      ref={dialogRef}
      className="confirm-dialog card"
      aria-labelledby={titleId}
      aria-describedby={children ? bodyId : undefined}
      // Esc fires `cancel` on a modal dialog.
      onCancel={(e) => {
        e.preventDefault();
        cancel();
      }}
      onClick={(e) => e.target === dialogRef.current && cancel()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          // Don't let a details pane behind us close too.
          e.preventDefault();
          e.stopPropagation();
          cancel();
        }
      }}
    >
      <h3 id={titleId}>{title}</h3>
      {children && <div id={bodyId} className="confirm-body">{children}</div>}
      {error && <p className="error small-text" role="alert">{error}</p>}
      <div className="confirm-actions">
        <button type="button" className="ghost" onClick={cancel} disabled={busy} autoFocus>
          Cancel
        </button>
        <button type="button" className={danger ? 'danger-solid' : undefined} onClick={onConfirm} disabled={busy}>
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
