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
  /**
   * Segunda cantidad opcional asociada a una entrada, informativa (no
   * participa del saldo). Caso de uso: en Inventario de materia prima, los
   * kilos de cáscara obtenidos al ingresar un cítrico (columna "C (Cáscara)"
   * de la planilla), junto a los kilos de fruta que sí se acumulan en el
   * saldo. Sin uso en Productos terminados.
   */
  cantidadSecundaria?: number;
  /**
   * Si este movimiento lo generó otra sección automáticamente (ej. una venta
   * en Operaciones), referencia el origen para poder actualizarlo/borrarlo en
   * cascada si esa operación se edita o elimina, en vez de duplicarlo.
   */
  origenOperacionId?: number;
};

export type KardexFila = {
  id: string;
  fecha: string | null; // null = fila de Existencia Inicial
  entradaC: number | null;
  entradaPU: number | null;
  entradaPT: number | null;
  /** Ver `cantidadSecundaria` en KardexMovimiento. null salvo en filas de entrada que la informen. */
  entradaSecundariaC: number | null;
  salidaC: number | null;
  salidaPU: number | null;
  salidaPT: number | null;
  saldoC: number;
  saldoPU: number;
  saldoPT: number;
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Arma el kardex fila a fila (EI + movimientos), arrastrando el saldo acumulado. */
export function buildKardex(
  existenciaInicial: number,
  costoUnitario: number,
  movimientos: KardexMovimiento[]
): KardexFila[] {
  let saldoC = round2(existenciaInicial);
  const filas: KardexFila[] = [
    {
      id: "ei",
      fecha: null,
      entradaC: null,
      entradaPU: null,
      entradaPT: null,
      entradaSecundariaC: null,
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
      saldoC = round2(saldoC + m.cantidad);
      filas.push({
        id: `m-${m.id}`,
        fecha: m.fecha,
        entradaC: m.cantidad,
        entradaPU: pu || null,
        entradaPT: pu ? m.cantidad * pu : null,
        entradaSecundariaC: m.cantidadSecundaria ?? null,
        salidaC: null,
        salidaPU: null,
        salidaPT: null,
        saldoC,
        saldoPU: costoUnitario,
        saldoPT: saldoC * costoUnitario,
      });
    } else {
      saldoC = round2(saldoC - m.cantidad);
      filas.push({
        id: `m-${m.id}`,
        fecha: m.fecha,
        entradaC: null,
        entradaPU: null,
        entradaPT: null,
        entradaSecundariaC: null,
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
