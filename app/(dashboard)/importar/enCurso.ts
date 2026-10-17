// Si hay una planilla en revisión en /importar. La sidebar lo usa para que el
// aviso de "Cerrar sesión" diga que se pierde lo que se estaba importando.

import { useSyncExternalStore } from "react";

let activa = false;
const oyentes = new Set<() => void>();

export function marcarImportacionEnCurso(valor: boolean) {
  if (activa === valor) return;
  activa = valor;
  oyentes.forEach((f) => f());
}

function suscribir(f: () => void) {
  oyentes.add(f);
  return () => oyentes.delete(f);
}

export function useImportacionEnCurso(): boolean {
  return useSyncExternalStore(suscribir, () => activa, () => false);
}
