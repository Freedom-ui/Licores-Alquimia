"use client";

import { useEffect, type ReactNode } from "react";

export default function ModalShell({
  open,
  eyebrow,
  title,
  onClose,
  children,
  width = 440,
}: {
  open: boolean;
  /** Texto pequeño arriba del título (ej. el nombre de la sección: "Clientes"). */
  eyebrow?: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Ancho máximo del modal en px. Escala con la cantidad de campos del formulario. */
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="rf-overlay" onClick={onClose}>
      <div className="rf-modal" style={{ maxWidth: width }} onClick={(e) => e.stopPropagation()}>
        <div className="rf-modal-header">
          <div className="rf-modal-heading">
            {eyebrow && <div className="rf-modal-eyebrow">{eyebrow}</div>}
            <h2>{title}</h2>
          </div>
          <button type="button" className="rf-close-btn" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
