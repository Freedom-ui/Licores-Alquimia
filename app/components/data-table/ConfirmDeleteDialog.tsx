"use client";

import ModalShell from "./ModalShell";

export default function ConfirmDeleteDialog({
  open,
  title,
  message,
  error,
  confirming,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  message: string;
  error?: string | null;
  confirming?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ModalShell open={open} title={title} onClose={onCancel}>
      <div className="cf-body">
        <p className="cf-message">{message}</p>

        {error && <div className="rf-error">{error}</div>}

        <div className="rf-actions-row">
          <button type="button" className="rf-cancel-btn" onClick={onCancel} disabled={confirming}>
            Cancelar
          </button>
          <button type="button" className="cf-danger-btn" onClick={onConfirm} disabled={confirming}>
            {confirming ? "Eliminando…" : "Eliminar"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
