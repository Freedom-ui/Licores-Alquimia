// De los bloques detectados a registros con los nombres de campo de la app
// (todavía sin validar: eso lo hace planificar.ts con las reglas de la app).
// Acá se resuelven las particularidades de la planilla:
//  - Productos: el formato está en una columna sin encabezado ("x UNIDAD 500 cc")
//    que se arrastra hacia abajo, y el nombre trae el tamaño al final.
//  - Proveedores: "CBU ó ALIAS" en una sola celda.
//  - Compras: dos bloques (operaciones y trazabilidad) unidos por el N° de OP;
//    el medio de pago es la columna marcada con "x"; los kilos de cáscara están
//    en el inventario de esa materia prima.
//  - Órdenes: maestro-detalle (fila de la orden + insumos debajo, con su propio
//    sub-encabezado "DESCRIPCION / CANTIDAD / COSTO TOTAL").
//  - Inventarios: solo la fila "EI" (existencia inicial) y el saldo final.

import { seccionDef } from "./secciones";
import { celda, subtitulo } from "./detectar";
import { a2, aFecha, aNumero, aTexto, claveEnc, esMarca } from "./normalizar";
import type { Deteccion, Extraccion, Hoja, Insumo, Referencias, Registro, SeccionId, SeccionRegistro, Valor } from "./tipos";

type Fila = { r: number; v: Record<string, Valor> };

const origen = (d: Deteccion, r: number) => ({ hoja: d.bloque.hoja, fila: r + 1 });
// Única en toda la importación: incluye el bloque (hoja + celda de la marca), porque
// en una misma hoja hay varios bloques lado a lado con datos en las mismas filas
// (ej. los inventarios de cada materia prima tienen su fila EI en la fila 5).
const claveRegistro = (seccion: SeccionRegistro, d: Deteccion, r: number) => `${seccion}:${d.bloque.id}:${r + 1}`;

/** Filas con datos de un bloque, con los valores por campo. Saltea vacías y encabezados repetidos. */
function filasDe(h: Hoja, d: Deteccion, seccion: SeccionId): Fila[] {
  const def = seccionDef(seccion);
  const mapeadas = d.columnas.filter((c) => c.campo);
  const out: Fila[] = [];
  for (let r = d.filaDatos; r < h.filas.length; r++) {
    if (!h.filas[r]) continue;
    const v: Record<string, Valor> = {};
    let pareceEncabezado = 0;
    for (const c of mapeadas) {
      const valor = celda(h, r, c.col);
      v[c.campo!] = valor;
      const campo = def.campos.find((x) => x.id === c.campo)!;
      if (typeof valor === "string" && campo.sinonimos.includes(claveEnc(valor))) pareceEncabezado++;
    }
    if (pareceEncabezado >= 2) continue;
    if (!def.significativos.some((id) => v[id] !== null && v[id] !== undefined)) continue;
    out.push({ r, v });
  }
  return out;
}

const hojaDe = (hojas: Hoja[], d: Deteccion) => hojas.find((h) => h.nombre === d.bloque.hoja)!;
const colDe = (d: Deteccion, campo: string) => d.columnas.find((c) => c.campo === campo)?.col;

// ── Productos ───────────────────────────────────────────────────────────────

const TAMANIO_RE = /\s+(\d+([.,]\d+)?\s*(cc|ml|cm3|l|lt|lts|litros?)\b.*)$/i;

/** "x UNIDAD 750 cc Premium" → "750 cc Premium"; "5000 CC" → "5000 cc". */
export function limpiarFormato(t: string): string {
  return aTexto(t)
    .replace(/^x\s*unidad(es)?\s*/i, "")
    .replace(/\b(\d+([.,]\d+)?)\s*(cc|ml|cm3)\b/gi, (_, n: string, _d, u: string) => `${n} ${u.toLowerCase()}`)
    .replace(/\bprem\b\.?/i, "Premium")
    .trim();
}

/** Separa el tamaño del nombre: "Licor Fino de Limón 500 cc" → ["Licor Fino de Limón", "500 cc"]. */
export function separarNombreProducto(nombre: string): [string, string] {
  const t = aTexto(nombre);
  const m = TAMANIO_RE.exec(t);
  return m ? [t.slice(0, m.index).replace(/[,\s]+$/, ""), limpiarFormato(m[1])] : [t, ""];
}

function extraerProductos(h: Hoja, d: Deteccion): Registro[] {
  const filas = filasDe(h, d, "productos");
  // Columna de formato sin encabezado: la que tiene "x UNIDAD …" (se arrastra hacia abajo).
  let colFormato = colDe(d, "formato");
  if (colFormato === undefined) {
    for (let c = d.bloque.col0; c <= d.bloque.col1 && colFormato === undefined; c++) {
      for (let r = d.filaDatos; r < Math.min(h.filas.length, d.filaDatos + 30); r++) {
        if (/^x\s*unidad/i.test(aTexto(celda(h, r, c)))) {
          colFormato = c;
          break;
        }
      }
    }
  }
  let formatoActual = "";
  const conFormatoArrastrado = colDe(d, "formato") === undefined;
  return filas.map(({ r, v }) => {
    const enCelda = colFormato !== undefined ? aTexto(celda(h, r, colFormato)) : "";
    if (enCelda) formatoActual = limpiarFormato(enCelda);
    const [nombre, tamanio] = separarNombreProducto(aTexto(v.nombre));
    const formato = (conFormatoArrastrado ? formatoActual : limpiarFormato(enCelda)) || tamanio;
    return {
      seccion: "productos",
      clave: claveRegistro("productos", d, r),
      origen: origen(d, r),
      v: {
        nombre,
        formato,
        nombreExcel: aTexto(v.nombre),
        codigoBarras: aTexto(v.codigoBarras).replace(/^\*+|\*+$/g, ""),
        precioUnitario: aNumero(v.precioUnitario),
      },
    };
  });
}

// ── Catálogos simples ───────────────────────────────────────────────────────

const ALIAS_VALIDO = /^[a-z0-9.-]{6,20}$/i;
/** Parece un alias aunque no diga "alias": palabras unidas por puntos ("dual.adrice.gaje.mp"), con letras y sin @. */
const pareceAlias = (t: string) => ALIAS_VALIDO.test(t) && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(t) && /[a-z]/i.test(t);
/** Hasta dónde llega lo que sigue a "alias:": la próxima barra, punto y coma, coma o la palabra CBU/CVU. */
const FIN_ALIAS = /[\/|;,\n]|\b(cbu|cvu)\b/i;

/**
 * Saca el CBU y el alias de una celda escrita a mano, ej. "Bco Macro CBU
 * 2859063773759020882451 / alias:la colmena.mp". El resto (banco, "CBU",
 * "alias:", barras, dos puntos) es texto explicativo y se ignora.
 *  - CBU (o CVU): una tira de 22 números (puede tener espacios, puntos o
 *    guiones en el medio). Si hay una tira larga que no llega a 22, se toma
 *    igual: la regla de la app la rechaza y queda un aviso con el motivo.
 *  - Alias: lo que sigue a "alias" (sin los espacios: "la colmena.mp" →
 *    "lacolmena.mp", con aviso) o, si no dice "alias", una palabra con
 *    puntos que parezca un alias. `soloAlias`: la celda es de una columna de
 *    alias, así que una sola palabra sin puntos también vale.
 * `aliasAjustado`: el alias se armó sacando espacios (hay que revisarlo).
 */
export function separarCbuAlias(t: string, soloAlias = false): { cbu: string; alias: string; aliasAjustado: boolean } {
  const texto = aTexto(t);
  // CBU: la tira con exactamente 22 números; si no hay, la más larga de 18 o más.
  const tiras = [...texto.matchAll(/\d(?:[\s.-]?\d)+/g)].map((m) => m[0].replace(/\D/g, "")).filter((d) => d.length >= 18);
  const cbu = tiras.find((d) => d.length === 22) ?? tiras.sort((a, b) => b.length - a.length)[0] ?? "";

  let alias = "";
  let aliasAjustado = false;
  const trasPalabra = /\balias\b\s*[:=.-]?\s*/i.exec(texto);
  if (trasPalabra) {
    const resto = texto.slice(trasPalabra.index + trasPalabra[0].length);
    const fin = FIN_ALIAS.exec(resto);
    const tramo = (fin ? resto.slice(0, fin.index) : resto).trim().replace(/[.:]+$/, "");
    const palabras = tramo.split(/\s+/).filter(Boolean);
    const junto = palabras.join("");
    if (palabras.length > 1 && ALIAS_VALIDO.test(junto)) {
      alias = junto;
      aliasAjustado = true;
    } else {
      alias = palabras.find((p) => ALIAS_VALIDO.test(p)) ?? "";
    }
  }
  if (!alias) {
    const palabras = texto.split(/[\s\/|;,]+|:\s*/).map((p) => p.replace(/^[.:-]+|[.:-]+$/g, "")).filter(Boolean);
    alias = palabras.find((p) => !/^[\d.-]+$/.test(p) && pareceAlias(p)) ?? "";
    if (!alias && soloAlias && !cbu && palabras.length === 1 && ALIAS_VALIDO.test(palabras[0]) && /[a-z]/i.test(palabras[0])) alias = palabras[0];
  }
  return { cbu, alias, aliasAjustado };
}

function extraerSimple(h: Hoja, d: Deteccion, seccion: "materiaPrima" | "proveedores" | "clientes"): Registro[] {
  return filasDe(h, d, seccion).map(({ r, v }) => {
    const valores: Record<string, Valor> = {};
    for (const [k, x] of Object.entries(v)) valores[k] = typeof x === "number" && !/precio/i.test(k) ? String(x) : x;
    if (seccion === "proveedores") {
      // "CBU ó ALIAS" en una celda, o columnas separadas que también pueden traer texto de más.
      const enCbuAlias = separarCbuAlias(aTexto(v.cbuAlias));
      const enCbu = separarCbuAlias(aTexto(v.cbu));
      const enAlias = separarCbuAlias(aTexto(v.alias), true);
      valores.cbu = enCbu.cbu || enCbuAlias.cbu || enAlias.cbu;
      const deDonde = [enAlias, enCbuAlias, enCbu].find((x) => x.alias);
      valores.alias = deDonde?.alias ?? "";
      if (deDonde?.aliasAjustado) valores.aliasAjustado = "x";
      valores.cbuAliasOriginal = [aTexto(v.cbuAlias), aTexto(v.cbu), aTexto(v.alias)].filter(Boolean).join(" / ");
      delete valores.cbuAlias;
    }
    if (seccion === "clientes") {
      valores.precioTradicional = aNumero(v.precioTradicional);
      valores.precioPremium = aNumero(v.precioPremium);
    }
    return { seccion, clave: claveRegistro(seccion, d, r), origen: origen(d, r), v: valores };
  });
}

// ── Compras ─────────────────────────────────────────────────────────────────

function medioDePago(v: Record<string, Valor>): string {
  const marcado = (["MPR", "MPA", "CDNI", "EFE"] as const).find((m) => esMarca(v[`pago${m}`] ?? null));
  return marcado ?? aTexto(v.medioPago);
}

const CAMPOS_TRAZABILIDAD = ["lote", "proveedor", "comprobanteForm", "comprobanteTipo", "comprobanteNumero"];

type Cascaras = Map<string, number>;
const claveCascara = (materia: string, fecha: string, cantidad: number) => `${claveEnc(materia)}|${fecha}|${a2(cantidad)}`;

function extraerCompras(h: Hoja, d: Deteccion, trazabilidad: Map<number, Record<string, Valor>>, cascaras: Cascaras): Registro[] {
  return filasDe(h, d, "compras").map(({ r, v }) => {
    const numero = aNumero(v.numero);
    const traz = numero !== null && !Number.isNaN(numero) ? trazabilidad.get(numero) : undefined;
    const de = (campo: string) => (v[campo] !== null && v[campo] !== undefined ? v[campo] : (traz?.[campo] ?? null));
    const cantidad = aNumero(v.cantidad);
    const total = aNumero(v.total);
    let costoUnitario = aNumero(v.costoUnitario);
    if (costoUnitario === null && total !== null && cantidad) costoUnitario = total / cantidad;
    const fecha = aFecha(v.fecha);
    const materia = aTexto(v.materiaPrima);
    const valores: Record<string, Valor> = {
      numero,
      fecha,
      materiaPrima: materia,
      cantidad,
      costoUnitario,
      total,
      medioPago: medioDePago(v) || (traz ? medioDePago(traz) : ""),
      cantidadCascara: cantidad !== null && !Number.isNaN(cantidad) ? (cascaras.get(claveCascara(materia, fecha, cantidad)) ?? null) : null,
    };
    for (const campo of CAMPOS_TRAZABILIDAD) valores[campo] = aTexto(de(campo));
    return { seccion: "compras", clave: claveRegistro("compras", d, r), origen: origen(d, r), v: valores };
  });
}

// ── Órdenes de producción ───────────────────────────────────────────────────

/** Columnas de los insumos: mapeadas por encabezado o por el sub-encabezado "DESCRIPCION / CANTIDAD / COSTO" dentro de los datos. */
function columnasInsumos(h: Hoja, d: Deteccion): { desc: number; cant: number; costo: number | undefined } | null {
  const desc = colDe(d, "insumo");
  const cant = colDe(d, "insumoCantidad");
  if (desc !== undefined && cant !== undefined) return { desc, cant, costo: colDe(d, "insumoCosto") };
  for (let r = d.filaDatos; r < Math.min(h.filas.length, d.filaDatos + 20); r++) {
    for (let c = d.bloque.col0; c < d.bloque.col1; c++) {
      if (claveEnc(celda(h, r, c)) === "descripcion" && claveEnc(celda(h, r, c + 1)).startsWith("cantidad")) {
        return { desc: c, cant: c + 1, costo: claveEnc(celda(h, r, c + 2)).includes("costo") ? c + 2 : undefined };
      }
    }
  }
  return null;
}

function extraerOrdenes(h: Hoja, d: Deteccion): Registro[] {
  const col = (campo: string) => colDe(d, campo);
  const cNumero = col("numero");
  const cProducto = col("producto");
  if (cNumero === undefined || cProducto === undefined) return [];
  const insumosCols = columnasInsumos(h, d);
  const out: Registro[] = [];
  let actual: Registro | null = null;
  const leer = (r: number, campo: string): Valor => {
    const c = col(campo);
    return c === undefined ? null : celda(h, r, c);
  };

  for (let r = d.filaDatos; r < h.filas.length; r++) {
    if (!h.filas[r]) continue;
    const numero = aNumero(celda(h, r, cNumero));
    const producto = celda(h, r, cProducto);
    if (numero !== null && !Number.isNaN(numero) && typeof producto === "string") {
      if (!actual || actual.v.numero !== numero) {
        actual = {
          seccion: "ordenes",
          clave: claveRegistro("ordenes", d, r),
          origen: origen(d, r),
          v: {
            numero,
            producto: aTexto(producto),
            fechaMaceracion: aFecha(leer(r, "fechaMaceracion")),
            fechaEmbotellado: aFecha(leer(r, "fechaEmbotellado")),
            cantidadProducida: aNumero(leer(r, "cantidadProducida")),
            responsable: aTexto(leer(r, "responsable")),
            costoEI: null,
          },
          insumos: [],
        };
        out.push(actual);
      }
    } else if (actual && claveEnc(producto).startsWith("ei total")) {
      // "EI - TOTAL $" y en la fila de abajo el monto: costo de existencia inicial (no es un insumo).
      actual.v.costoEI = aNumero(celda(h, r + 1, cProducto));
    }
    if (actual && insumosCols) {
      const desc = celda(h, r, insumosCols.desc);
      // El sub-encabezado ("DESCRIPCION") y el encabezado repetido de cada orden ("INSUMOS") no son insumos.
      if (typeof desc === "string" && !["descripcion", "insumos", "insumo"].includes(claveEnc(desc))) {
        const insumo: Insumo = {
          origen: origen(d, r),
          v: {
            materiaPrima: aTexto(desc),
            cantidad: aNumero(celda(h, r, insumosCols.cant)),
            costoTotal: insumosCols.costo !== undefined ? aNumero(celda(h, r, insumosCols.costo)) : null,
          },
        };
        actual.insumos!.push(insumo);
      }
    }
  }
  return out;
}

// ── Ventas ──────────────────────────────────────────────────────────────────

function extraerVentas(h: Hoja, d: Deteccion): Registro[] {
  return filasDe(h, d, "ventas").map(({ r, v }) => {
    const cantidad = aNumero(v.cantidad);
    const total = aNumero(v.total);
    let pu = aNumero(v.pu);
    if (pu === null && total !== null && cantidad) pu = total / cantidad;
    return {
      seccion: "ventas",
      clave: claveRegistro("ventas", d, r),
      origen: origen(d, r),
      v: {
        numero: aNumero(v.numero),
        fecha: aFecha(v.fecha),
        cliente: aTexto(v.cliente),
        vendedor: aTexto(v.vendedor),
        cantidad,
        producto: aTexto(v.producto),
        canal: aTexto(v.canal),
        condicion: aTexto(v.condicion),
        pu,
        total,
      },
    };
  });
}

// ── Inventarios ─────────────────────────────────────────────────────────────

const esEI = (v: Valor) => claveEnc(v) === "ei";

function extraerInventarioMP(h: Hoja, d: Deteccion, cascaras: Cascaras, saldos: Referencias["saldosMP"]): Registro[] {
  const materia = subtitulo(d.bloque);
  const filas = filasDe(h, d, "inventarioMP");
  const out: Registro[] = [];
  let ultimoSaldo: number | null = null;
  for (const { r, v } of filas) {
    if (esEI(v.fecha)) {
      const existencia = aNumero(v.saldo) ?? aNumero(v.cantidad);
      const costo = aNumero(v.saldoCu) ?? aNumero(v.cu);
      if (existencia && existencia > 0) {
        out.push({
          seccion: "existenciaMP",
          clave: claveRegistro("existenciaMP", d, r),
          origen: origen(d, r),
          v: { materiaPrima: materia, existenciaInicial: existencia, costoUnitario: costo },
        });
      }
      ultimoSaldo = existencia ?? 0;
      continue;
    }
    const fecha = aFecha(v.fecha);
    if (!/^\d{4}-/.test(fecha)) continue;
    // Una celda con 0 se lee vacía: el saldo de una fila con movimiento y sin saldo es 0.
    ultimoSaldo = aNumero(v.saldo) ?? 0;
    const cantidad = aNumero(v.cantidad);
    const cascara = aNumero(v.cascara);
    if (cantidad && cascara) cascaras.set(claveCascara(materia, fecha, cantidad), cascara);
  }
  if (ultimoSaldo !== null) saldos.push({ materia, saldo: ultimoSaldo });
  return out;
}

function extraerInventarioPT(h: Hoja, d: Deteccion): Registro[] {
  const producto = subtitulo(d.bloque);
  return filasDe(h, d, "inventarioPT")
    .filter(({ v }) => esEI(v.fecha) && (aNumero(v.saldo) ?? 0) > 0)
    .map(({ r, v }) => ({
      seccion: "existenciaPT" as const,
      clave: claveRegistro("existenciaPT", d, r),
      origen: origen(d, r),
      v: {
        producto,
        lote: aNumero(v.lote),
        existenciaInicial: aNumero(v.saldo),
        costoUnitario: aNumero(v.saldoPu),
        fechaVencimiento: aFecha(v.vencimiento),
      },
    }));
}

// ── Todo junto ──────────────────────────────────────────────────────────────

export function extraer(hojas: Hoja[], detecciones: Deteccion[]): Extraccion {
  const usadas = detecciones.filter((d) => d.seccion !== null);
  const de = (s: SeccionId) => usadas.filter((d) => d.seccion === s);
  const registros: Registro[] = [];
  const referencias: Referencias = { totalCompras: null, totalVentas: null, unidadesVendidas: null, saldosMP: [] };

  // Inventarios primero: de ahí salen los kilos de cáscara de las compras.
  const cascaras: Cascaras = new Map();
  for (const d of de("inventarioMP")) registros.push(...extraerInventarioMP(hojaDe(hojas, d), d, cascaras, referencias.saldosMP));
  for (const d of de("inventarioPT")) registros.push(...extraerInventarioPT(hojaDe(hojas, d), d));

  for (const d of de("materiaPrima")) registros.push(...extraerSimple(hojaDe(hojas, d), d, "materiaPrima"));
  for (const d of de("productos")) registros.push(...extraerProductos(hojaDe(hojas, d), d));
  for (const d of de("proveedores")) registros.push(...extraerSimple(hojaDe(hojas, d), d, "proveedores"));
  for (const d of de("clientes")) registros.push(...extraerSimple(hojaDe(hojas, d), d, "clientes"));

  const trazabilidad = new Map<number, Record<string, Valor>>();
  for (const d of de("comprasTrazabilidad")) {
    for (const { v } of filasDe(hojaDe(hojas, d), d, "comprasTrazabilidad")) {
      const n = aNumero(v.numero);
      if (n !== null && !Number.isNaN(n)) trazabilidad.set(n, v);
    }
  }
  const compras = de("compras").flatMap((d) => extraerCompras(hojaDe(hojas, d), d, trazabilidad, cascaras));
  registros.push(...compras);
  registros.push(...de("ordenes").flatMap((d) => extraerOrdenes(hojaDe(hojas, d), d)));
  const ventas = de("ventas").flatMap((d) => extraerVentas(hojaDe(hojas, d), d));
  registros.push(...ventas);

  const suma = (rs: Registro[], f: (r: Registro) => number | null) =>
    rs.length ? rs.reduce((s, r) => s + (f(r) ?? 0), 0) : null;
  const num = (v: Valor) => {
    const n = aNumero(v);
    return n === null || Number.isNaN(n) ? null : n;
  };
  referencias.totalCompras = suma(compras, (r) => num(r.v.total) ?? (num(r.v.cantidad) ?? 0) * (num(r.v.costoUnitario) ?? 0));
  referencias.totalVentas = suma(ventas, (r) => num(r.v.total) ?? (num(r.v.cantidad) ?? 0) * (num(r.v.pu) ?? 0));
  referencias.unidadesVendidas = suma(ventas, (r) => num(r.v.cantidad));

  return { registros, referencias };
}
