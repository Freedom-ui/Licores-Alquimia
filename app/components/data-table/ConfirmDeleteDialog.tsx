"use client";

import ModalShell from "./ModalShell";

export default function ConfirmDeleteDialog({
  open,
  sectionTitle,
  message,
  error,
  confirming,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  /** Nombre de la sección (ej. "Clientes"), se muestra como eyebrow del modal. */
  sectionTitle: string;
  message: string;
  error?: string | null;
  confirming?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ModalShell open={open} eyebrow={sectionTitle} title="Eliminar registro" width={440} onClose={onCancel}>
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
