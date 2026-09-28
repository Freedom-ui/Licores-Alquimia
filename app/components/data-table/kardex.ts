/**
 * Lógica de kardex (entradas/salidas con saldo acumulado), compartida por
 * las secciones que usan este patrón: Productos terminados e Inventario de
 * materia prima.
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
  /** Ídem `origenOperacionId`, pero para consumos generados por una Orden de producción. */
  origenOrdenId?: number;
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

/**
 * Arma el kardex fila a fila (EI + movimientos), arrastrando el saldo acumulado.
 *
 * - Los movimientos se ordenan por fecha (estable: a igual fecha se respeta
 *   el orden de carga). Sin esto, un movimiento generado automáticamente por
 *   otra sección con una fecha anterior quedaba al final, con el saldo
 *   arrastrado en un orden que no era el real.
 * - Valorización a costo promedio ponderado: `costoUnitario` es el costo de
 *   la existencia inicial; cada entrada con costo informado lo promedia con
 *   el saldo vigente, y las salidas se valorizan al costo vigente. Antes el
 *   costo quedaba fijo, y una compra a otro precio se veía en "Compras" pero
 *   no movía la valorización del saldo. Si todas las entradas tienen el mismo
 *   costo (o ninguna lo informa) el resultado es idéntico al de costo fijo.
 */
export function buildKardex(
  existenciaInicial: number,
  costoUnitario: number,
  movimientos: KardexMovimiento[]
): KardexFila[] {
  let saldoC = round2(existenciaInicial);
  let costo = costoUnitario;
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
      saldoPU: costo,
      saldoPT: saldoC * costo,
    },
  ];

  const ordenados = [...movimientos].sort((a, b) => {
    const fa = a.fecha ?? "";
    const fb = b.fecha ?? "";
    return fa < fb ? -1 : fa > fb ? 1 : 0;
  });

  for (const m of ordenados) {
    if (m.tipo === "entrada") {
      const pu = m.puEntrada ?? 0;
      // Un saldo negativo (consumo sin stock cargado) no pesa en el promedio.
      const existenteValorizable = Math.max(saldoC, 0);
      const cantidadTotal = existenteValorizable + m.cantidad;
      if (pu > 0 && cantidadTotal > 0) {
        // Redondeado a 4 decimales: promediar dos costos idénticos en punto
        // flotante da 2785.5499999… en vez de 2785.55, y el valor del saldo
        // terminaba un centavo abajo del de la planilla.
        costo = Math.round(((existenteValorizable * costo + m.cantidad * pu) / cantidadTotal) * 10000) / 10000;
      }
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
        saldoPU: costo,
        saldoPT: saldoC * costo,
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
        salidaPU: costo,
        salidaPT: m.cantidad * costo,
        saldoC,
        saldoPU: costo,
        saldoPT: saldoC * costo,
      });
    }
  }

  return filas;
}
