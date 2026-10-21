/** Filas por página de las tablas (DataTable). */
export const FILAS_POR_PAGINA = 50;

/**
 * Números de página a mostrar en el paginador (base 0), con "…" donde se
 * saltean: siempre la primera, la última y las vecinas de la actual.
 * Ej. actual 9 de 34 → 0 … 8 9 10 … 33.
 */
export function paginasVisibles(actual: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);
  const set = new Set([0, total - 1, actual - 1, actual, actual + 1]);
  // Cerca de las puntas se muestran 5 seguidas, así el paginador no cambia tanto de ancho.
  if (actual <= 3) [1, 2, 3, 4].forEach((i) => set.add(i));
  if (actual >= total - 4) [total - 5, total - 4, total - 3, total - 2].forEach((i) => set.add(i));
  const paginas = [...set].filter((i) => i >= 0 && i < total).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  paginas.forEach((p, i) => {
    if (i > 0 && p - paginas[i - 1] > 1) out.push("…");
    out.push(p);
  });
  return out;
}

/** Claves entre dos posiciones de la lista (inclusive), en el orden de la lista. */
export function rango<K>(claves: K[], desde: K, hasta: K): K[] {
  const a = claves.indexOf(desde);
  const b = claves.indexOf(hasta);
  if (a === -1 || b === -1) return b === -1 ? [] : [hasta];
  return claves.slice(Math.min(a, b), Math.max(a, b) + 1);
}
