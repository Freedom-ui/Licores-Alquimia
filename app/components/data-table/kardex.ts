/**
 * Lógica de kardex (entradas/salidas con saldo acumulado), compartida por
 * cualquier sección que necesite este patrón: Productos terminados hoy,
 * Inventario de materia prima después.
 */

export type KardexMovimiento = {
  id: number;
  /** null = fila de "Existencia Inicial" (EI), sin fecha. */
  fecha: string | null;
  tipo: "entrada" | "salida";
  cantidad: number;
  /** Costo cargado en la entrada (sin valor si no se informó). */
  puEntrada?: number;
};

export type KardexFila = {
  id: string;
  fecha: string | null; // null = fila de Existencia Inicial
  entradaC: number | null;
  entradaPU: number | null;
  entradaPT: number | null;
  salidaC: number | null;
  salidaPU: number | null;
  salidaPT: number | null;
  saldoC: number;
  saldoPU: number;
  saldoPT: number;
};

/** Arma el kardex fila a fila (EI + movimientos), arrastrando el saldo acumulado. */
export function buildKardex(
  existenciaInicial: number,
  costoUnitario: number,
  movimientos: KardexMovimiento[]
): KardexFila[] {
  let saldoC = existenciaInicial;
  const filas: KardexFila[] = [
    {
      id: "ei",
      fecha: null,
      entradaC: null,
      entradaPU: null,
      entradaPT: null,
      salidaC: null,
      salidaPU: null,
      salidaPT: null,
      saldoC,
      saldoPU: costoUnitario,
      saldoPT: saldoC * costoUnitario,
    },
  ];

  for (const m of movimientos) {
    if (m.tipo === "entrada") {
      const pu = m.puEntrada ?? 0;
      saldoC += m.cantidad;
      filas.push({
        id: `m-${m.id}`,
        fecha: m.fecha,
        entradaC: m.cantidad,
        entradaPU: pu || null,
        entradaPT: pu ? m.cantidad * pu : null,
        salidaC: null,
        salidaPU: null,
        salidaPT: null,
        saldoC,
        saldoPU: costoUnitario,
        saldoPT: saldoC * costoUnitario,
      });
    } else {
      saldoC -= m.cantidad;
      filas.push({
        id: `m-${m.id}`,
        fecha: m.fecha,
        entradaC: null,
        entradaPU: null,
        entradaPT: null,
        salidaC: m.cantidad,
        salidaPU: costoUnitario,
        salidaPT: m.cantidad * costoUnitario,
        saldoC,
        saldoPU: costoUnitario,
        saldoPT: saldoC * costoUnitario,
      });
    }
  }

  return filas;
}
