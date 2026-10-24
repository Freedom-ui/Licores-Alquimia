// Importación de la planilla: lectura, detección, extracción y plan.
//
// Se arma en memoria un libro que imita la planilla Alquimia (bloques lado a
// lado con "Pagina Principal", encabezados en dos filas, columna de
// navegación, formato de producto sin encabezado, compras partidas en dos
// bloques, órdenes maestro-detalle con encabezado repetido, inventario con
// fila EI, un bloque señuelo y una hoja auxiliar). La planilla real del
// cliente no está en el repo: con PLANILLA_REAL=<ruta al .xlsx> se prueba
// también contra ella.

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { leerCsv, leerLibro } from "./leer";
import { analizarLibro, detectarBloques, motivoSinTablas, reasignar } from "./detectar";
import { extraer, limpiarFormato, separarCbuAlias, separarNombreProducto } from "./extraer";
import { aplicarCorrecciones, claveEleccion, conflictosSinElegir, hayCambios, planificar, PROVEEDOR_SIN_IDENTIFICAR } from "./planificar";
import { HOJAS_PLANTILLA } from "./plantilla";
import { aFecha, aNumero, buscarParecido, claveEnc, inferirUnidad, opcionDe, SINONIMOS_IVA } from "./normalizar";
import { CONDICIONES_IVA } from "../clientes/data";
import { aplicar } from "../_dominio/acciones";
import { DETALLE_VACIO, detalleConPlan, detalleDeLectura, leerDetalle, totalesDePlan } from "./historial";
import type { Hoja, Registro } from "./tipos";

// ── Armado del libro de prueba ──────────────────────────────────────────────

type Celda = string | number | null | { fecha: string };
const fecha = (iso: string): Celda => ({ fecha: iso });
const serial = (iso: string) => Math.round((Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 86_400_000);

/** Una hoja a partir de bloques de celdas puestos en una posición ("FF2"). */
function hoja(bloques: [string, Celda[][]][], combinadas: string[] = []): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  let maxR = 0;
  let maxC = 0;
  for (const [origen, filas] of bloques) {
    const o = XLSX.utils.decode_cell(origen);
    filas.forEach((fila, i) =>
      fila.forEach((v, j) => {
        if (v === null) return;
        const r = o.r + i;
        const c = o.c + j;
        maxR = Math.max(maxR, r);
        maxC = Math.max(maxC, c);
        const ref = XLSX.utils.encode_cell({ r, c });
        ws[ref] =
          typeof v === "object" ? { t: "n", v: serial(v.fecha), z: "m/d/yy" } : typeof v === "number" ? { t: "n", v } : { t: "s", v };
      })
    );
  }
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } });
  ws["!merges"] = combinadas.map((r) => XLSX.utils.decode_range(r));
  return ws;
}

const PP = "Pagina Principal";

function libroAlquimia(): ArrayBuffer {
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    wb,
    hoja([
      ["A2", [[PP, "BASE DE DATOS PRODUCTOS"], ["BASE DE DATOS", null, "PRODUCTOS", "CODIGO DE BARRAS", " PRECIO UNITARIO "]]],
      [
        "A4",
        [
          ["PRODUCTOS", "x UNIDAD 500 cc", "Licor Fino de Limón 500 cc", "2611122201TRA", 10000],
          ["VENDEDORES", null, "Licor Fino de Limón, con M. y J. 500 cc", "*2611122201LMJ*", 10000],
          ["PROVEEDORES", "x UNIDAD 750 cc Premium", "Licor Fino de Limón 750 cc Prem", "2611122201TRAPREM", 25000],
        ],
      ],
      ["G2", [[PP, "BASE DE DATOS PROVEEDORES"], ["BASE DE DATOS", "RAZON SOCIAL", "CONTACTO", "PRODUCTO", "CUIT / CUIL", "MAIL", "TEL / CEL", "CBU ó ALIAS"]]],
      [
        "H4",
        [
          ["GRUPO PRIMUS", "Ana", "ALCOHOL", "30 - 71826240 - 9", null, "223 - 448 - 1763", "Bco Galicia CBU 0070095520000006196217"],
          ["LODISER", null, "AZUCAR", null, "info@lodiser.com.ar", "(0223) 478-3408 / 09", "MP Alias: dual.adrice.gaje.mp"],
        ],
      ],
      ["P2", [[PP, "BASE DE DATOS DISTRIBUIDORES Y CLIENTES"], ["BASE DE DATOS", "RAZON SOCIAL", "APELLIDO Y NOMBRE", "COND. IVA", "CUIT", "$ TRAD", " $ PREM "]]],
      [
        "Q4",
        [
          ["PARTICULAR", null, null, null, 10000, null],
          ["CAVA MITRE", "FRANCISCO", "RI", "20 - 39098613 - 1", 6800, 17000],
        ],
      ],
      ["X2", [[PP, "MATERIAS PRIMAS"], ["BASE DE DATOS", "Alcohol"], [null, "Azúcar"], [null, "Limón"], [null, "Env. 500 ml Ambar"]]],
      ["Z2", [[PP, "VENDEDORES / ACTIVADORES / PRE-VENTISTAS"], ["BASE DE DATOS", "NOMBRE Y APELLIDO", "SALARIO", "COMISION $"], [null, "ALQUIMIA"], [null, "MONEY, LEANDRO"]]],
    ]),
    "BASES DE DATOS"
  );

  XLSX.utils.book_append_sheet(
    wb,
    hoja(
      [
        // Libro de compras - operaciones (encabezado en 2 filas, columna de navegación A, "H o j a" en B).
        ["A2", [[PP, null, "LIBRO DE COMPRAS - OPERACIONES"]]],
        ["A3", [["CUENTAS DE ACTIVO", null, "Nº DE", null, null, null, "PRECIO UNITARIO", null, null, null, "REC."]]],
        ["A4", [[null, null, "OP.", "DESCRIPCION", "FECHA", "C", "PU", "PT", "PU FINAL", "PT FINAL", "X"]]],
        [
          "A5",
          [
            ["DISPONIBILIDADES", "H o j a", 1, "Alcohol", fecha("2026-08-02"), 16.2, 2785.55, 45125.91, 2785.55, 45125.91, "x"],
            ["CREDITOS", null, 2, "Limón", fecha("2026-08-05"), 13.6, 1018.38, 13849.97, 1018.38, 13849.97, "x"],
            ["INVERSIONES", null, 3, "Alcohol", fecha("2026-08-26"), 10.8, 2785.55, 30083.94, 2785.55, 30083.94, "x"],
            [null, null, 4, "Azúcar", fecha("2026-08-05"), 25, null, null, null, null, null],
            [null, null, 5],
            [null, null, 6],
          ],
        ],
        // Libro de compras - trazabilidad.
        ["M2", [[PP, null, "LIBRO DE COMPRAS - TRAZABILIDAD"]]],
        ["M3", [["CUENTAS DE ACTIVO", "Nº DE", "LOTE", "PROVEEDOR", null, null, null, "MEDIO DE PAGO (X)", null, null, null]]],
        ["M4", [[null, "OP.", "PRODUCTO", "NOMBRE - RAZON SOCIAL", "FORM.", "TIPO", "Nº", "MPR", "MPA", "CDNI", "EFE"]]],
        [
          "M5",
          [
            [null, 1, "CE2210281", "GRUPO PRIMUS", null, null, null, "x", null, null, null],
            [null, 2, null, null, null, null, null, null, null, null, "x"],
            [null, 3, "L19/11/25", "Grupo Primus SA", "FACTURA", "A", "0004 - 00010377", null, "X", null, null],
            [null, 4, "L20/01/26M1", "PROVEEDOR NUEVO", null, null, null, "x", null, null, null],
          ],
        ],
        // Orden de producción (maestro-detalle + encabezado repetido).
        ["Y2", [[PP, "ORDEN DE PRODUCCION"]]],
        ["Y3", [["CUENTAS DE ACTIVO", "O.P.", null, "FECHA DE", "FECHA DE", "EMBOTELLADO", "INSUMOS", null, null]]],
        ["Y4", [[null, "Nº", "PRODUCTO", "MACERACION", "EMBOTELLADO", "CANTIDAD", null, null, null]]],
        [
          "Y5",
          [
            [null, 1, "Licor Fino de Limón 500 cc", fecha("2026-08-20"), fecha("2026-09-05"), 27, "DESCRIPCION", "CANTIDAD", "COSTO TOTAL"],
            [null, null, null, null, null, null, "Alcohol", 20, 55711],
            [null, null, "EI - TOTAL $", null, null, null, "Limón", 0.18, 183.31],
            [null, null, 1500, null, null, null, "Env. 500 ml Ambar", 27, 30879.36],
            [null, null, null, null, null, null, null, null, null],
            [null, "ORDEN DE PRODUCCION"],
            [null, "O.P.", null, "FECHA DE", "FECHA DE", "EMBOTELLADO", "INSUMOS"],
            [null, "Nº", "PRODUCTO", "MACERACION", "EMBOTELLADO", "CANTIDAD"],
            [null, 2, "Licor Fino de Limón 750 cc Prem", fecha("2026-09-01"), null, null, "DESCRIPCION", "CANTIDAD", "COSTO TOTAL"],
            [null, null, null, null, null, null, "Alcohol", 2, 5571.1],
          ],
        ],
        // Inventario de Limón: fila EI y cáscara de la compra.
        ["AI2", [[PP, null, null, "INVENTARIO DE MATERIAS PRIMAS:", "Limón"]]],
        ["AI3", [["CUENTAS DE ACTIVO", null, "INGRESOS S/INSUMO", null, "COMPRAS", null, "CONSUMOS", "SALDO", null]]],
        ["AI4", [[null, "FECHA", "C", "C (Cáscara)", "CU", "CT", "C", "C.", "CU."]]],
        [
          "AI5",
          [
            [null, "EI", 4.03, 0.32, 794.18, null, null, 0.32, 794.18],
            [null, fecha("2026-08-05"), 13.6, 1.14, 1018.38, 13849.97, null, 1.46, 1018.38],
            [null, fecha("2026-08-20"), null, null, null, null, 0.18, 1.28, 1018.38],
          ],
        ],
        // Inventario de productos terminados: lote previo (EI).
        ["AS2", [[PP, null, null, "INVENTARIO DE PRODUCTOS TERMINADOS:", "Licor Fino de Limón 500 cc"]]],
        ["AS3", [["CUENTAS DE ACTIVO", "Nº", "FECHA", "FECHA", "SALDO", null]]],
        ["AS4", [[null, "LOTE", "EMB./VTA.", "VENCIM.", "C", "PU"]]],
        ["AS5", [[null, 8, "EI", null, 53, 3490.82]]],
      ],
      ["G3:J3", "S3:V3", "AK3:AL3", "AP3:AQ3", "AW3:AX3"]
    ),
    "CUENTAS DE ACTIVO"
  );

  XLSX.utils.book_append_sheet(
    wb,
    hoja([
      ["A2", [[PP, null, "LIBRO DE VENTAS - OPERACIONES"]]],
      ["A3", [["CUENTAS DE RESULTADO", null, "OP", null, null, null, null, null, "CONDICIONES DE VENTA", null, null, null]]],
      ["A4", [[null, null, "Nº", "FECHA", "CLIENTE", "VENDEDOR", "CANTIDAD", "DESCRIPCION", "CANAL", "CONDICION", "PU", "SUB TOTAL"]]],
      [
        "A5",
        [
          ["VENTAS", "H o j a", 1, fecha("2026-08-08"), "PARTICULAR", "MONEY, LEANDRO", 1, "Licor Fino de Limón 500 cc", "x MENOR", "CONTADO", 10000, 10000],
          [null, null, 2, fecha("2026-09-06"), "CAVA MITRE", "ALQUIMIA", 2, "Licor Fino de Limón, con M. y J. 500 cc", "x MAYOR", "CREDITO", 6800, 13600],
          [null, null, 3, fecha("2026-09-07"), "BAR NUEVO", "JABIF, MARIANO", 3, "Licor Fino de Limon 500cc", "x MENOR", "CONTADO", 10000, 30000],
          [null, null, 4, fecha("2026-09-08"), "PARTICULAR", "ALQUIMIA", 1, "Licor de frambuesa 700 cc", "x MENOR", "CONTADO", 9000, 9000],
          [null, null, "Nº", "FECHA", "CLIENTE", "VENDEDOR", "CANTIDAD", "DESCRIPCION"],
        ],
      ],
      // Señuelo: un costeo con columna "Materia prima" y "Unidad" (no es el catálogo).
      ["O2", [[PP, "COSTEO POR LINEA DE PRODUCTO - LICOR FINO DE LIMON"], [null, "MATERIA PRIMA", "UNIDAD", "CU"], [null, "Alcohol", "Lts", 2785], [null, "Azúcar", "Kg", 1350]]],
    ]),
    "CUENTAS DE RESULTADO"
  );

  // Hoja auxiliar de cálculos (se saltea por el nombre).
  XLSX.utils.book_append_sheet(wb, hoja([["A1", [["COMPRAS"], ["FECHA", "DESCRIPCION", "C", "PT"], [fecha("2026-08-02"), "Alcohol", 16.2, 45125.91]]]]), "..");

  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

const hojas = leerLibro(libroAlquimia());
const detecciones = analizarLibro(hojas);
const extraccion = extraer(hojas, detecciones);
const plan = planificar(extraccion);
const regs = (s: Registro["seccion"]) => extraccion.registros.filter((r) => r.seccion === s);

// ── Valores ─────────────────────────────────────────────────────────────────

describe("normalizar", () => {
  it("lee números con o sin formato", () => {
    expect(aNumero("$ 10,000.00")).toBe(10000);
    expect(aNumero("10.000,50")).toBe(10000.5);
    expect(aNumero("16,2")).toBe(16.2);
    expect(aNumero("1.234.567")).toBe(1234567);
    expect(aNumero(" - ")).toBeNull();
    expect(aNumero("abc")).toBeNaN();
  });

  it("lee fechas día/mes, seriales de Excel y deja lo inválido como está", () => {
    expect(aFecha("02/08/2026")).toBe("2026-08-02");
    expect(aFecha("8/25/26")).toBe("2026-08-25");
    expect(aFecha(46236)).toBe("2026-08-02");
    expect(aFecha("2026-08-02")).toBe("2026-08-02");
    expect(aFecha("31/02/2026")).toBe("31/02/2026");
    expect(aFecha(null)).toBe("");
  });

  it("normaliza encabezados", () => {
    expect(claveEnc("Nº DE OP.")).toBe("n de op");
    expect(claveEnc("CBU ó ALIAS")).toBe("cbu o alias");
    expect(claveEnc("C (Cáscara)")).toBe("c cascara");
  });

  it("elige opciones de listas cerradas y nombres parecidos", () => {
    expect(opcionDe("RI", CONDICIONES_IVA, SINONIMOS_IVA)).toBe("R. Inscripto");
    expect(buscarParecido("Licor Fino de Limon 500cc", [{ n: "Licor Fino de Limón 500 cc" }], (x) => [x.n])?.exacto).toBe(false);
    expect(buscarParecido("Frambuesa", [{ n: "Licor Fino de Limón 500 cc" }], (x) => [x.n])).toBeNull();
  });

  it("deduce la unidad por el nombre", () => {
    expect(inferirUnidad("Alcohol")).toBe("Litros");
    expect(inferirUnidad("Etiq. LIM x 500 cc")).toBe("Unidades");
    expect(inferirUnidad("Env. 750 ml Transp. c/tapón")).toBe("Unidades");
    expect(inferirUnidad("Limón")).toBe("Kilogramos");
  });

  it("separa formato, nombre y datos bancarios", () => {
    expect(limpiarFormato("x UNIDAD 5000 CC")).toBe("5000 cc");
    expect(separarNombreProducto("Licor Fino de Limón, con M. y J. 750 cc Prem")).toEqual(["Licor Fino de Limón, con M. y J.", "750 cc Premium"]);
    expect(separarCbuAlias("Bco Galicia / CBU 0070199620000004630951 / Alias: CIBARTSRL")).toEqual({
      cbu: "0070199620000004630951",
      alias: "CIBARTSRL",
      aliasAjustado: false,
    });
  });

  it("saca CBU y alias de una celda escrita a mano e ignora el resto", () => {
    const sep = (t: string, soloAlias = false) => separarCbuAlias(t, soloAlias);
    // El caso del cliente: banco, "CBU", "alias:" pegado y un espacio dentro del alias.
    expect(sep("Bco Macro CBU 2859063773759020882451 / alias:la colmena.mp")).toEqual({ cbu: "2859063773759020882451", alias: "lacolmena.mp", aliasAjustado: true });
    // CBU con espacios o guiones en el medio; alias sin la palabra "alias".
    expect(sep("CBU: 0070 1996 2000 0004 6309 51 - dual.adrice.gaje.mp")).toEqual({ cbu: "0070199620000004630951", alias: "dual.adrice.gaje.mp", aliasAjustado: false });
    expect(sep("Santander 0720-0000-8800-0001-2345-67 alias = MI.ALIAS.MP.")).toMatchObject({ cbu: "0720000088000001234567", alias: "MI.ALIAS.MP" });
    // Alias primero y CBU después.
    expect(sep("Alias: casa.lopez / CBU 0110599520000012345678")).toMatchObject({ cbu: "0110599520000012345678", alias: "casa.lopez" });
    // Una tira que no llega a 22 números se toma igual (la regla la rechaza con aviso).
    expect(sep("Bco Credicoop - CBU 19100896550089012697")).toMatchObject({ cbu: "19100896550089012697", alias: "" });
    // Lo que no es CBU ni alias: CUIT, teléfonos, abreviaturas, emails.
    expect(sep("Bco. Nación S.A. CUIT 30-71826240-9 tel 223-478-3408 pagos@proveedor.com")).toEqual({ cbu: "", alias: "", aliasAjustado: false });
    // Columna de alias: una sola palabra sin puntos también vale.
    expect(sep("CIBARTSRL", true)).toMatchObject({ alias: "CIBARTSRL" });
    expect(sep("CIBARTSRL")).toMatchObject({ alias: "" });
  });
});

// ── Detección ───────────────────────────────────────────────────────────────

describe("detección", () => {
  it("encuentra los bloques lado a lado por la marca 'Pagina Principal'", () => {
    const bases = hojas.find((h) => h.nombre === "BASES DE DATOS")!;
    expect(detectarBloques(bases).map((b) => b.textos[0])).toEqual([
      "BASE DE DATOS PRODUCTOS",
      "BASE DE DATOS PROVEEDORES",
      "BASE DE DATOS DISTRIBUIDORES Y CLIENTES",
      "MATERIAS PRIMAS",
      "VENDEDORES / ACTIVADORES / PRE-VENTISTAS",
    ]);
  });

  it("asigna cada bloque a su sección sin preguntar", () => {
    const asignadas = Object.fromEntries(detecciones.filter((d) => d.seccion).map((d) => [d.titulo, d.seccion]));
    expect(asignadas).toEqual({
      "BASE DE DATOS PRODUCTOS": "productos",
      "BASE DE DATOS PROVEEDORES": "proveedores",
      "BASE DE DATOS DISTRIBUIDORES Y CLIENTES": "clientes",
      "MATERIAS PRIMAS": "materiaPrima",
      "LIBRO DE COMPRAS - OPERACIONES": "compras",
      "LIBRO DE COMPRAS - TRAZABILIDAD": "comprasTrazabilidad",
      "ORDEN DE PRODUCCION": "ordenes",
      "INVENTARIO DE MATERIAS PRIMAS: Limón": "inventarioMP",
      "INVENTARIO DE PRODUCTOS TERMINADOS: Licor Fino de Limón 500 cc": "inventarioPT",
      "LIBRO DE VENTAS - OPERACIONES": "ventas",
    });
    expect(detecciones.filter((d) => d.seccion && d.confianza !== "alta")).toEqual([]);
  });

  it("la lista de vendedores de la planilla no se importa (los vendedores salen de las ventas)", () => {
    const vendedores = detecciones.find((d) => d.titulo.startsWith("VENDEDORES"))!;
    expect(vendedores.seccion).toBeNull();
    expect(vendedores.confianza).toBe("baja");
  });

  it("ignora el señuelo (otra tabla con 'Materia prima') y las hojas auxiliares", () => {
    const costeo = detecciones.find((d) => d.titulo.startsWith("COSTEO"))!;
    expect(costeo.seccion).toBeNull();
    expect(costeo.confianza).toBe("baja");
    expect(detecciones.some((d) => d.bloque.hoja === "..")).toBe(false);
  });

  it("toma la columna correcta entre parecidas (PU FINAL, proveedor vs. transporte, saldo vs. ingreso)", () => {
    const col = (titulo: string, campo: string) =>
      detecciones.find((d) => d.titulo.startsWith(titulo))!.columnas.find((c) => c.campo === campo)?.encabezado;
    expect(col("LIBRO DE COMPRAS - OPERACIONES", "costoUnitario")).toBe("PRECIO UNITARIO · PU FINAL");
    expect(col("LIBRO DE COMPRAS - TRAZABILIDAD", "proveedor")).toBe("PROVEEDOR · NOMBRE - RAZON SOCIAL");
    expect(col("INVENTARIO DE MATERIAS PRIMAS", "saldo")).toBe("SALDO · C.");
    expect(col("INVENTARIO DE MATERIAS PRIMAS", "cantidad")).toBe("INGRESOS S/INSUMO · C");
  });

  it("reconoce una tabla simple aunque las columnas estén en otro orden", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["Precio", "Cantidad", "Cliente", "Producto", "Fecha"],
        [10000, 2, "PARTICULAR", "Licor Fino de Limón 500 cc", "02/08/2026"],
      ]),
      "Hoja1"
    );
    const h = leerLibro(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
    const [d] = analizarLibro(h);
    expect(d.seccion).toBe("ventas");
    expect(d.columnas.find((c) => c.campo === "producto")?.encabezado).toBe("Producto");
  });

  it("deja cambiar la sección de un bloque", () => {
    const d = detecciones.find((x) => x.seccion === "materiaPrima")!;
    expect(reasignar(hojas, d, null).seccion).toBeNull();
    expect(reasignar(hojas, d, "clientes").seccion).toBe("clientes");
  });
});

// ── Extracción ──────────────────────────────────────────────────────────────

describe("extracción", () => {
  it("productos: separa nombre y formato (columna sin encabezado arrastrada hacia abajo)", () => {
    expect(regs("productos").map((r) => [r.v.nombre, r.v.formato, r.v.codigoBarras])).toEqual([
      ["Licor Fino de Limón", "500 cc", "2611122201TRA"],
      ["Licor Fino de Limón, con M. y J.", "500 cc", "2611122201LMJ"],
      ["Licor Fino de Limón", "750 cc Premium", "2611122201TRAPREM"],
    ]);
  });

  it("materias primas: el título del bloque es el encabezado", () => {
    expect(regs("materiaPrima").map((r) => r.v.nombre)).toEqual(["Alcohol", "Azúcar", "Limón", "Env. 500 ml Ambar"]);
  });

  it("compras: une operaciones con trazabilidad, medio de pago por la cruz y cáscara del inventario", () => {
    const [c1, c2, c3] = regs("compras");
    expect(c1.v).toMatchObject({ numero: 1, fecha: "2026-08-02", materiaPrima: "Alcohol", cantidad: 16.2, lote: "CE2210281", proveedor: "GRUPO PRIMUS", medioPago: "MPR" });
    expect(c2.v).toMatchObject({ materiaPrima: "Limón", medioPago: "EFE", cantidadCascara: 1.14, proveedor: "" });
    expect(c3.v).toMatchObject({ comprobanteForm: "FACTURA", comprobanteTipo: "A", comprobanteNumero: "0004 - 00010377", medioPago: "MPA" });
    expect(regs("compras")).toHaveLength(4);
  });

  it("órdenes: insumos debajo de cada orden, sin los sub-encabezados, y el costo de existencia inicial", () => {
    const [o1, o2] = regs("ordenes");
    expect(o1.v).toMatchObject({ numero: 1, fechaMaceracion: "2026-08-20", fechaEmbotellado: "2026-09-05", cantidadProducida: 27, costoEI: 1500 });
    expect(o1.insumos!.map((i) => i.v.materiaPrima)).toEqual(["Alcohol", "Limón", "Env. 500 ml Ambar"]);
    expect(o2.insumos!.map((i) => i.v.materiaPrima)).toEqual(["Alcohol"]);
  });

  it("ventas: saltea el encabezado repetido", () => {
    expect(regs("ventas").map((r) => r.v.numero)).toEqual([1, 2, 3, 4]);
  });

  it("cada registro tiene una clave única (aunque varios bloques compartan filas en la misma hoja)", () => {
    const claves = extraccion.registros.map((r) => r.clave);
    expect(new Set(claves).size).toBe(claves.length);
  });

  it("inventarios: existencia inicial, lote previo y saldo final para comparar", () => {
    expect(regs("existenciaMP").map((r) => r.v)).toEqual([{ materiaPrima: "Limón", existenciaInicial: 0.32, costoUnitario: 794.18 }]);
    expect(regs("existenciaPT")[0].v).toMatchObject({ producto: "Licor Fino de Limón 500 cc", lote: 8, existenciaInicial: 53 });
    expect(extraccion.referencias.saldosMP).toEqual([{ materia: "Limón", saldo: 1.28 }]);
  });
});

// ── Plan (reglas de la app) ─────────────────────────────────────────────────

describe("plan de importación", () => {
  const e = plan.estado;
  const errores = plan.problemas.filter((p) => p.tipo === "error");
  const avisos = plan.problemas.filter((p) => p.tipo === "aviso").map((p) => p.mensaje);

  it("importa los catálogos completando lo que falta y dejando vacío lo opcional mal cargado", () => {
    expect(e.productos).toHaveLength(3);
    expect(e.vendedores.map((v) => v.nombre)).toEqual(["MONEY, LEANDRO", "ALQUIMIA", "JABIF, MARIANO"]);
    const lodiser = e.proveedores.find((p) => p.razonSocial === "LODISER")!;
    expect(lodiser).toMatchObject({ contacto: "Sin dato", telefono: "", alias: "dual.adrice.gaje.mp" });
    expect(avisos.some((m) => m.startsWith('Se dejó vacío el teléfono ("(0223) 478-3408 / 09")'))).toBe(true);
    expect(e.clientes.find((c) => c.razonSocial === "PARTICULAR")?.condicionIva).toBe("Consumidor Final");
    expect(e.clientes.find((c) => c.razonSocial === "CAVA MITRE")).toMatchObject({ condicionIva: "R. Inscripto", cuit: "20-39098613-1" });
  });

  it("proveedor con CBU y alias escritos a mano: guarda el alias, avisa y deja vacío un CBU inválido", () => {
    const fila = (cbuAlias: string): Registro => {
      const { cbu, alias, aliasAjustado } = separarCbuAlias(cbuAlias);
      return {
        seccion: "proveedores",
        clave: `proveedores:${cbuAlias}`,
        origen: { hoja: "BASES DE DATOS", fila: 20 },
        v: { razonSocial: "LA COLMENA", contacto: "Ana", producto: "Miel", cbu, alias, cbuAliasOriginal: cbuAlias, ...(aliasAjustado ? { aliasAjustado: "x" } : {}) },
      };
    };
    const p = planificar({ registros: [fila("Bco Macro CBU 285906377375902088245 / alias:la colmena.mp")], referencias: extraccion.referencias });
    expect(p.estado.proveedores[0]).toMatchObject({ alias: "lacolmena.mp" });
    expect(p.estado.proveedores[0].cbu).toBeFalsy();
    const mensajes = p.problemas.map((x) => x.mensaje);
    expect(mensajes.some((m) => m.startsWith('Se dejó vacío el CBU ("285906377375902088245")') && m.includes("tiene 21"))).toBe(true);
    expect(mensajes.some((m) => m.startsWith('Se tomó el alias "lacolmena.mp"'))).toBe(true);
    const ok = planificar({ registros: [fila("Bco Galicia CBU 0070199620000004630951 / alias: cibart.srl")], referencias: extraccion.referencias });
    expect(ok.estado.proveedores[0]).toMatchObject({ cbu: "0070199620000004630951", alias: "cibart.srl" });
    expect(ok.problemas).toEqual([]);
  });

  it("compras: proveedor por parecido, proveedor nuevo y 'sin identificar'", () => {
    expect(e.compras.map((c) => e.proveedores.find((p) => p.id === c.proveedorId)!.razonSocial)).toEqual([
      "GRUPO PRIMUS",
      PROVEEDOR_SIN_IDENTIFICAR,
      "GRUPO PRIMUS",
    ]);
    expect(avisos).toContain('El proveedor "Grupo Primus SA" se tomó como "GRUPO PRIMUS".');
    expect(e.compras.find((c) => c.materiaPrimaId === e.materiaPrima.find((m) => m.nombre === "Limón")!.id)?.cantidadCascara).toBe(1.14);
  });

  it("marca los errores con su fila y todos los campos que fallan", () => {
    const azucar = errores.filter((p) => p.origen?.fila === 8 && p.seccion === "compras");
    expect(azucar.map((p) => p.campo).sort()).toEqual(["costoUnitario"]);
    // La orden 2 sigue macerando y no tiene cantidad: se admite (es obligatoria al embotellar).
    expect(errores.filter((p) => p.seccion === "ordenes")).toEqual([]);
    const frambuesa = errores.find((p) => p.seccion === "ventas");
    expect(frambuesa).toMatchObject({ campo: "producto", origen: { hoja: "CUENTAS DE RESULTADO", fila: 8 } });
  });

  it("órdenes: cada insumo sale de las compras por FIFO y el resto de la existencia inicial", () => {
    const o1 = e.ordenesProduccion[0];
    // 20 L de alcohol: 16,2 de la compra 1 y 3,8 sin compra (la 3 es posterior a la maceración).
    expect(o1.insumos.filter((i) => i.materiaPrima === "Alcohol").map((i) => [i.cantidad, i.compraId])).toEqual([
      [16.2, 1],
      [3.8, undefined],
    ]);
    // Limón: 0,18 kg de la compra 2.
    expect(o1.insumos.find((i) => i.materiaPrima === "Limón")).toMatchObject({ cantidad: 0.18, compraId: 2 });
    expect(avisos.some((m) => m.includes("existencia inicial (EI)"))).toBe(true);
  });

  it("ventas: cliente nuevo, vendedor nuevo, producto por parecido y FIFO desde el lote previo", () => {
    expect(e.operaciones).toHaveLength(3);
    expect(e.clientes.some((c) => c.razonSocial === "BAR NUEVO")).toBe(true);
    expect(avisos).toContain('El producto "Licor Fino de Limon 500cc" se tomó como "Licor Fino de Limón — 500 cc".');
    const previo = e.productosTerminados.find((l) => l.lote === 8)!;
    expect(previo.origenOrdenId).toBeUndefined();
    expect(previo.movimientos.reduce((s, m) => s + m.cantidad, 0)).toBe(4);
  });

  it("una orden macerando sin cantidad se importa sin cantidad, y una corrección la completa", () => {
    expect(e.ordenesProduccion).toHaveLength(2);
    expect(e.ordenesProduccion[1]).toMatchObject({ fechaEmbotellado: null, cantidadProducida: null });
    const op2 = regs("ordenes")[1];
    const corregido = planificar({ ...extraccion, registros: aplicarCorrecciones(extraccion.registros, { [op2.clave]: { cantidadProducida: "18" } }) });
    expect(corregido.problemas.some((p) => p.clave === op2.clave && p.tipo === "error")).toBe(false);
    expect(corregido.estado.ordenesProduccion[1].cantidadProducida).toBe(18);
  });

  it("una corrección del usuario resuelve el error", () => {
    const venta = regs("ventas").find((r) => errores.some((p) => p.clave === r.clave))!;
    const corregido = planificar({
      ...extraccion,
      registros: aplicarCorrecciones(extraccion.registros, { [venta.clave]: { producto: "Licor Fino de Limón — 500 cc" } }),
    });
    expect(corregido.problemas.some((p) => p.clave === venta.clave && p.tipo === "error")).toBe(false);
    expect(corregido.estado.operaciones).toHaveLength(4);
  });

  it("reimportar da exactamente el mismo resultado", () => {
    expect(planificar(extraer(hojas, analizarLibro(hojas))).estado).toEqual(e);
  });

  it("compara con la planilla", () => {
    const fila = (c: string) => plan.cotejo.find((x) => x.concepto === c)!;
    expect(fila("Ventas cargadas")).toMatchObject({ planilla: 4, app: 3, coincide: false });
    // EI 0,32 + 1,14 kg de cáscara comprados − 0,18 usados = 1,28 kg de cáscara, como la planilla.
    expect(fila("Stock de Limón")).toMatchObject({ planilla: 1.28, app: 1.28, coincide: true });
  });
});

// ── Importación incremental (la app ya tiene datos) ─────────────────────────

describe("importación incremental", () => {
  // La app ya tiene lo de la primera importación (con la orden 2 corregida).
  const op2 = regs("ordenes")[1];
  const corregidos = aplicarCorrecciones(extraccion.registros, { [op2.clave]: { cantidadProducida: "18" } });
  const primera = planificar({ ...extraccion, registros: corregidos });
  const base = primera.estado;
  const total = (p: ReturnType<typeof planificar>, campo: "existentes" | "importados" | "conError") =>
    p.resumen.reduce((s, r) => s + r[campo], 0);

  it("volver a subir la misma planilla no agrega nada ni marca errores", () => {
    const otra = planificar(extraccion, { base });
    expect(total(otra, "importados")).toBe(0);
    expect(otra.nuevos).toEqual([]);
    expect(otra.modificaciones).toEqual([]);
    expect(hayCambios(otra)).toBe(false);
    expect(otra.estado).toEqual(base);
    // Lo que falló la primera vez (compra sin costo, venta de un producto que no existe) sigue fallando.
    expect(total(otra, "existentes")).toBe(total(primera, "importados"));
    expect(otra.problemas.filter((p) => p.tipo === "error").map((p) => p.seccion).sort()).toEqual(["compras", "ventas"]);
    // Sin avisos de "se tomó como" por nombres que ya estaban (ej. el producto con otro nombre en la planilla).
    expect(otra.problemas.some((p) => p.mensaje.includes("se tomó como"))).toBe(false);
  });

  it("solo agrega lo nuevo: un cliente y una venta cargados después en el Excel", () => {
    const nuevoCliente: Registro = {
      seccion: "clientes",
      clave: "clientes:nuevo",
      origen: { hoja: "BASES DE DATOS", fila: 9 },
      v: { razonSocial: "VINOTECA LOS ACANTILADOS", condicionIva: "MONO", cuit: "27 - 30111222 - 5", precioTradicional: 7000 },
    };
    const nuevaVenta: Registro = {
      seccion: "ventas",
      clave: "ventas:nueva",
      origen: { hoja: "CUENTAS DE RESULTADO", fila: 9 },
      v: { numero: 5, fecha: "2026-09-20", cliente: "VINOTECA LOS ACANTILADOS", vendedor: "ALQUIMIA", cantidad: 6, producto: "Licor Fino de Limón 500 cc", canal: "x MAYOR", condicion: "CONTADO", pu: 7000 },
    };
    const otra = planificar({ ...extraccion, registros: [...corregidos, nuevoCliente, nuevaVenta] }, { base });
    expect(otra.nuevos.sort()).toEqual(["clientes:nuevo", "ventas:nueva"]);
    expect(otra.estado.clientes).toHaveLength(base.clientes.length + 1);
    expect(otra.estado.operaciones).toHaveLength(base.operaciones.length + 1);
    expect(otra.estado.operaciones.at(-1)).toMatchObject({ cliente: "VINOTECA LOS ACANTILADOS", cantidad: 6 });
    expect(otra.resumen.find((r) => r.seccion === "ventas")).toMatchObject({ existentes: 3, importados: 1 });
  });

  it("comparación: distingue lo que ya estaba, lo cargado aparte en la app y las filas con error", () => {
    const fila = (p: ReturnType<typeof planificar>, c: string) => p.cotejo.find((x) => x.concepto === c)!;
    const otra = planificar(extraccion, { base });
    // Las órdenes ya estaban todas.
    expect(fila(otra, "Órdenes de producción")).toMatchObject({ planilla: 2, app: 2, estado: "yaEstaba" });
    // La venta de frambuesa tiene error: no es que algo salió mal, falta corregirla.
    expect(fila(otra, "Ventas cargadas")).toMatchObject({ planilla: 4, app: 3, estado: "conErrores" });

    // La app tiene además una venta y una compra de limón cargadas a mano (no están en la planilla).
    const limon = base.materiaPrima.find((m) => m.nombre === "Limón")!;
    const conMas: typeof base = {
      ...base,
      operaciones: [...base.operaciones, { ...base.operaciones[0], id: 99, fecha: "2026-10-01" }],
      compras: [...base.compras, { ...base.compras.find((c) => c.materiaPrimaId === limon.id)!, id: 98, fecha: "2026-10-02" }],
    };
    const conAparte = planificar(extraccion, { base: conMas });
    const ventas = fila(conAparte, "Ventas cargadas");
    expect(ventas).toMatchObject({ app: 3, totalApp: 4, estado: "conErrores" });
    expect(ventas.detalle).toContain("1 venta cargada");
    // Las compras de la planilla siguen comparándose solas, sin la cargada aparte.
    expect(fila(conAparte, "Compras cargadas")).toMatchObject({ app: 3, totalApp: base.compras.length + 1 });
  });

  it("comparación: un stock distinto por movimientos cargados en la app no es un error", () => {
    // Sin filas con error (todo corregido) y con una compra de limón cargada aparte en la app.
    const sinErrores = corregidos.filter((r) => !(r.seccion === "ventas" && r.v.numero === 4) && !(r.seccion === "compras" && r.origen.fila === 8));
    const limpia = planificar({ ...extraccion, registros: sinErrores });
    const limon = limpia.estado.materiaPrima.find((m) => m.nombre === "Limón")!;
    const compraLimon = limpia.estado.compras.find((c) => c.materiaPrimaId === limon.id)!;
    const conCompra = planificar(
      { registros: [], referencias: extraccion.referencias },
      { base: limpia.estado }
    );
    expect(conCompra.cotejo.find((c) => c.concepto === "Stock de Limón")).toMatchObject({ estado: "coincide" });
    // Una compra de limón cargada a mano en la app, con las mismas reglas que el formulario.
    const datosCompra: Partial<typeof compraLimon> = { ...compraLimon };
    delete datosCompra.id;
    const conCompraAparte = aplicar(limpia.estado, { tipo: "saveCompra", id: null, v: { ...datosCompra, fecha: "2026-10-03", fechaPago: "2026-10-03" } as never });
    const masLimon = planificar({ ...extraccion, registros: sinErrores }, { base: conCompraAparte });
    const stock = masLimon.cotejo.find((c) => c.concepto === "Stock de Limón")!;
    expect(stock.coincide).toBe(false);
    expect(stock.estado).toBe("otrosDatos");
    expect(stock.detalle).toContain("1 compra de Limón");
  });

  it("reconoce un cliente por su CUIT aunque en la planilla lo hayan renombrado", () => {
    const renombrado = corregidos.map((r) => (r.seccion === "clientes" && r.v.razonSocial === "CAVA MITRE" ? { ...r, v: { ...r.v, razonSocial: "CAVA MITRE S.R.L." } } : r));
    const otra = planificar({ ...extraccion, registros: renombrado }, { base });
    expect(otra.resumen.find((r) => r.seccion === "clientes")).toMatchObject({ importados: 0 });
  });

  it("cuenta las repeticiones: dos ventas iguales en la planilla y una en la app → una es nueva", () => {
    const venta = corregidos.find((r) => r.seccion === "ventas" && r.v.numero === 1)!;
    const repetida = { ...venta, clave: "ventas:repetida", origen: { ...venta.origen, fila: 40 } };
    const otra = planificar({ ...extraccion, registros: [...corregidos, repetida] }, { base });
    expect(otra.nuevos).toEqual(["ventas:repetida"]);
  });

  it("completa solo lo que en la app estaba vacío (ej. el embotellado de una orden que seguía macerando)", () => {
    const embotellada = corregidos.map((r) => (r.clave === op2.clave ? { ...r, v: { ...r.v, fechaEmbotellado: "2026-09-25" } } : r));
    const otra = planificar({ ...extraccion, registros: embotellada }, { base });
    expect(otra.nuevos).toEqual([]);
    expect(otra.modificaciones).toEqual([
      expect.objectContaining({
        clave: op2.clave,
        aplicada: true,
        cambios: [
          { campo: "fechaEmbotellado", etiqueta: "Fecha de embotellado", antes: "(vacío)", despues: "25/09/2026", conflicto: false, eleccion: "planilla", aplicado: true },
        ],
      }),
    ]);
    expect(otra.estado.ordenesProduccion[1].fechaEmbotellado).toBe("2026-09-25");
    expect(otra.resumen.find((r) => r.seccion === "ordenes")).toMatchObject({ existentes: 1, modificados: 1, importados: 0 });
    expect(conflictosSinElegir(otra)).toBe(0);
  });

  it("al embotellar en la planilla completa la fecha y la cantidad que la app no tenía", () => {
    const sinCantidad = planificar(extraccion).estado;
    const embotellada = extraccion.registros.map((r) =>
      r.clave === op2.clave ? { ...r, v: { ...r.v, fechaEmbotellado: "2026-09-25", cantidadProducida: 21 } } : r
    );
    const otra = planificar({ ...extraccion, registros: embotellada }, { base: sinCantidad });
    expect(otra.estado.ordenesProduccion[1]).toMatchObject({ fechaEmbotellado: "2026-09-25", cantidadProducida: 21 });
    expect(conflictosSinElegir(otra)).toBe(0);
    expect(otra.estado.productosTerminados.find((l) => l.origenOrdenId === otra.estado.ordenesProduccion[1].id)?.existenciaInicial).toBe(21);
  });

  it("si la app ya tenía otro dato no lo pisa: pregunta cuál dejar", () => {
    const cambiada = corregidos.map((r) => {
      if (r.seccion === "proveedores" && r.v.razonSocial === "GRUPO PRIMUS") return { ...r, v: { ...r.v, cbu: "0070199620000004630951", alias: "grupo.primus" } };
      if (r.seccion === "clientes" && r.v.razonSocial === "CAVA MITRE") return { ...r, v: { ...r.v, email: "compras@cavamitre.com", telefono: "", precioTradicional: 7100 } };
      return r;
    });
    const primusAntes = base.proveedores.find((p) => p.razonSocial === "GRUPO PRIMUS")!;
    const cavaAntes = base.clientes.find((c) => c.razonSocial === "CAVA MITRE")!;

    // Sin elegir: se completa lo vacío (alias, email) y en los conflictos queda el dato de la app.
    const otra = planificar({ ...extraccion, registros: cambiada }, { base });
    expect(otra.nuevos).toEqual([]);
    expect(conflictosSinElegir(otra)).toBe(2);
    expect(otra.estado.proveedores.find((p) => p.id === primusAntes.id)).toMatchObject({ cbu: primusAntes.cbu, alias: "grupo.primus" });
    // Un dato vacío en la planilla (el teléfono) no borra el de la app.
    expect(otra.estado.clientes.find((c) => c.id === cavaAntes.id)).toMatchObject({
      email: "compras@cavamitre.com",
      precioTradicional: cavaAntes.precioTradicional,
      telefono: cavaAntes.telefono,
    });
    const primus = otra.modificaciones.find((x) => x.nombre === "GRUPO PRIMUS")!;
    expect(primus.cambios.map((c) => [c.campo, c.antes, c.despues, c.conflicto, c.eleccion])).toEqual([
      ["cbu", primusAntes.cbu, "0070199620000004630951", true, null],
      ["alias", "(vacío)", "grupo.primus", false, "planilla"],
    ]);

    // Elige: el CBU de la planilla y el precio de la app.
    const elegida = planificar(
      { ...extraccion, registros: cambiada },
      {
        base,
        elecciones: {
          [claveEleccion(primus.clave, "cbu")]: "planilla",
          [claveEleccion(otra.modificaciones.find((x) => x.nombre === "CAVA MITRE")!.clave, "precioTradicional")]: "app",
        },
      }
    );
    expect(conflictosSinElegir(elegida)).toBe(0);
    expect(elegida.estado.proveedores.find((p) => p.id === primusAntes.id)).toMatchObject({ cbu: "0070199620000004630951", alias: "grupo.primus" });
    expect(elegida.estado.clientes.find((c) => c.id === cavaAntes.id)).toMatchObject({ precioTradicional: cavaAntes.precioTradicional });
    const precio = elegida.modificaciones.find((x) => x.nombre === "CAVA MITRE")!.cambios.find((c) => c.campo === "precioTradicional")!;
    expect(precio).toMatchObject({ conflicto: true, eleccion: "app", aplicado: false, despues: "$ 7.100" });
    // En el historial queda qué se cambió y qué se dejó.
    const detalle = detalleConPlan(DETALLE_VACIO, elegida);
    expect(detalle.modificaciones.find((m) => m.nombre === "CAVA MITRE")!.cambios.find((c) => c.etiqueta === "Precio tradicional")).toMatchObject({
      eleccion: "app",
      aplicado: false,
    });
    expect(leerDetalle(JSON.stringify(detalle))).toEqual(detalle);
  });

  it("si la regla rechaza un dato que cambió, ese no se cambia y el resto sí", () => {
    const cambiada = corregidos.map((r) =>
      r.seccion === "clientes" && r.v.razonSocial === "CAVA MITRE" ? { ...r, v: { ...r.v, email: "no-es-un-email", domicilio: "Av. Colón 1234" } } : r
    );
    const otra = planificar({ ...extraccion, registros: cambiada }, { base });
    expect(otra.estado.clientes.find((c) => c.razonSocial === "CAVA MITRE")).toMatchObject({ domicilio: "Av. Colón 1234" });
    expect(otra.problemas.some((p) => p.tipo === "aviso" && p.mensaje.startsWith('No se cambió email ("no-es-un-email")'))).toBe(true);
  });
});

// ── Plantilla limpia ────────────────────────────────────────────────────────

const DATOS_PLANTILLA: Record<string, (string | number)[][]> = {
  Productos: [["Licor de Naranja", "500 cc", "ABC123", 9000]],
  "Materias primas": [["Alcohol", "Litros"], ["Naranja", "Kilogramos"]],
  Proveedores: [["DESTILERIA SUR", "Pedro", "Alcohol", "30-71826240-9", "", "", "", ""]],
  Clientes: [["ALMACEN CENTRO", "Lucía", "Monotributo", "20-39098613-1", "", "", "", 8000, ""]],
  Compras: [[1, "01/09/2026", "Alcohol", 10, 2900, "L1", "DESTILERIA SUR", "Factura", "A", "0001 - 00000001", "MPR"]],
  "Órdenes de producción": [
    [1, "Licor de Naranja 500 cc", "02/09/2026", "20/09/2026", 12, "Tadeo", "Alcohol", 4, 11600],
    [1, "Licor de Naranja 500 cc", "02/09/2026", "20/09/2026", 12, "Tadeo", "Naranja", 2, 1800],
  ],
  Ventas: [[1, "25/09/2026", "ALMACEN CENTRO", "ALQUIMIA", 6, "Licor de Naranja 500 cc", "Mayor", "Contado", 8000]],
};

describe("plantilla limpia", () => {
  it("se reconoce sola y se importa (órdenes con una fila por insumo)", () => {
    const datos = DATOS_PLANTILLA;
    const wb = XLSX.utils.book_new();
    for (const { hoja: nombre, columnas } of HOJAS_PLANTILLA) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([columnas, ...(datos[nombre] ?? [])]), nombre);
    }
    const h: Hoja[] = leerLibro(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
    const ds = analizarLibro(h);
    expect(ds.filter((d) => d.seccion).map((d) => d.seccion).sort()).toEqual(
      ["clientes", "compras", "materiaPrima", "ordenes", "productos", "proveedores", "ventas"].sort()
    );
    const p = planificar(extraer(h, ds));
    expect(p.problemas.filter((x) => x.tipo === "error")).toEqual([]);
    expect(p.estado.ordenesProduccion[0].insumos.map((i) => [i.materiaPrima, i.cantidad, i.compraId])).toEqual([
      ["Alcohol", 4, 1],
      ["Naranja", 2, undefined],
    ]);
    expect(p.estado.operaciones[0]).toMatchObject({ cantidad: 6, subTotal: 48000 });
  });
});

// ── Historial de subidas ────────────────────────────────────────────────────

describe("historial de subidas", () => {
  it("guarda archivos, tablas, resumen, filas con error, avisos y comparación", () => {
    const d = detalleConPlan(detalleDeLectura([{ nombre: "planilla.xlsx", tamano: 2048 }], hojas, detecciones), plan);
    expect(d.archivos).toEqual([{ nombre: "planilla.xlsx", tamano: 2048 }]);
    expect(d.tablas.find((t) => t.titulo === "LIBRO DE VENTAS - OPERACIONES")).toMatchObject({ seccion: "Ventas (Operaciones)", hoja: "CUENTAS DE RESULTADO" });
    expect(d.tablasNoImportadas).toBeGreaterThan(0);
    expect(d.resumen.find((r) => r.nombre === "Ventas (Operaciones)")).toMatchObject({ total: 4, importados: 3, conError: 1 });
    expect(d.errores.find((e) => e.seccion === "ventas")).toMatchObject({ hoja: "CUENTAS DE RESULTADO", fila: 8 });
    expect(d.totalErrores).toBe(plan.problemas.filter((p) => p.tipo === "error").length);
    expect(d.cotejo.find((c) => c.concepto === "Ventas cargadas")).toMatchObject({ planilla: 4, app: 3, estado: "conErrores" });
    expect(totalesDePlan(plan)).toMatchObject({ agregados: plan.nuevos.length, conError: d.totalErrores });
    // Ida y vuelta por JSON (así se guarda en la base).
    expect(leerDetalle(JSON.stringify(d))).toEqual(d);
  });

  it("descarta lo que no tiene la forma esperada", () => {
    expect(leerDetalle("no es json")).toEqual(DETALLE_VACIO);
    const raro = leerDetalle({ archivos: [{ nombre: 5, tamano: "x" }, "otro"], errores: "x", cotejo: [{ concepto: "A", estado: "inventado", planilla: "1" }] });
    expect(raro.archivos).toEqual([{ nombre: "", tamano: 0 }]);
    expect(raro.errores).toEqual([]);
    expect(raro.cotejo[0]).toMatchObject({ concepto: "A", estado: "distinto", planilla: null });
  });
});

// ── CSV ─────────────────────────────────────────────────────────────────────

/** Un CSV como lo exporta Excel en español: separador ";" y Windows-1252 (o UTF-8 con BOM). */
function csv(filas: (string | number)[][], utf8 = false): Uint8Array {
  const celda = (v: string | number) => {
    const t = typeof v === "number" ? String(v).replace(".", ",") : v;
    return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const texto = filas.map((f) => f.map(celda).join(";")).join("\r\n") + "\r\n";
  return utf8 ? new Uint8Array(Buffer.from("﻿" + texto, "utf8")) : new Uint8Array(Buffer.from(texto, "latin1"));
}

describe("CSV", () => {
  it("lee Windows-1252 y UTF-8, separador ';' y usa el nombre del archivo como hoja", () => {
    const filas = [["Razón social", "Condición de IVA", "CUIT", "Precio tradicional"], ["ALMACÉN; CENTRO", "Monotributo", "20-39098613-1", "10.000,50"], ["PEPE", "RI", "", "0"]];
    for (const utf8 of [false, true]) {
      const h = leerCsv(csv(filas, utf8), "Clientes.csv");
      expect(h.nombre).toBe("Clientes");
      expect(h.filas[0][0]).toBe("Razón social");
      expect(h.filas[1]).toEqual(["ALMACÉN; CENTRO", "Monotributo", "20-39098613-1", "10.000,50"]);
      // Un 0 se lee vacío, como en el Excel.
      expect(h.filas[2]).toEqual(["PEPE", "RI"]);
    }
  });

  it("un CSV por sección de la plantilla limpia: se reconocen por el nombre y se importan con fechas dd/mm/aaaa y montos con miles", () => {
    const conMiles = (n: number) => n.toLocaleString("es-AR", { minimumFractionDigits: 2 });
    const h: Hoja[] = HOJAS_PLANTILLA.map(({ hoja: nombre, columnas }) => {
      const filas = (DATOS_PLANTILLA[nombre] ?? []).map((f) => f.map((v) => (typeof v === "number" && v >= 1000 ? conMiles(v) : v)));
      return leerCsv(csv([columnas, ...filas]), `${nombre}.csv`);
    });
    const ds = analizarLibro(h);
    expect(Object.fromEntries(ds.filter((d) => d.seccion).map((d) => [d.titulo, d.seccion]))).toEqual({
      Productos: "productos",
      "Materias primas": "materiaPrima",
      Proveedores: "proveedores",
      Clientes: "clientes",
      Compras: "compras",
      "Órdenes de producción": "ordenes",
      Ventas: "ventas",
    });
    const p = planificar(extraer(h, ds));
    expect(p.problemas.filter((x) => x.tipo === "error")).toEqual([]);
    expect(p.estado.productos[0]).toMatchObject({ precioUnitario: 9000 });
    expect(p.estado.compras[0]).toMatchObject({ fecha: "2026-09-01", costoUnitario: 2900 });
    expect(p.estado.ordenesProduccion[0]).toMatchObject({ fechaMaceracion: "2026-09-02", fechaEmbotellado: "2026-09-20" });
    expect(p.estado.operaciones[0]).toMatchObject({ fecha: "2026-09-25", cantidad: 6, subTotal: 48000 });
  });

  it("una tabla suelta con otro nombre de archivo se reconoce por las columnas", () => {
    const h = leerCsv(csv([["Fecha", "Cliente", "Producto", "Cantidad", "Precio"], ["02/08/2026", "PARTICULAR", "Licor Fino de Limón 500 cc", 2, "10.000,50"]]), "export 2026.csv");
    const [d] = analizarLibro([h]);
    expect(d.seccion).toBe("ventas");
    expect(extraer([h], [d]).registros[0].v).toMatchObject({ fecha: "2026-08-02", cantidad: 2 });
  });
});

// ── Archivos que no sirven y mensajes para el usuario ───────────────────────

describe("archivos vacíos o que no son de la app", () => {
  const xlsx = (hojas: Record<string, (string | number)[][]>) => {
    const wb = XLSX.utils.book_new();
    for (const [n, filas] of Object.entries(hojas)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filas), n);
    return leerLibro(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
  };

  it("un archivo que no es Excel aunque diga .xlsx", () => {
    expect(() => leerLibro(new TextEncoder().encode("esto es un texto cualquiera"))).toThrow(/no es una planilla de Excel/);
  });

  it("dice por qué no hay nada para importar", () => {
    const vacio = xlsx({ Hoja1: [[]] });
    expect(motivoSinTablas(vacio, analizarLibro(vacio))).toMatch(/^La planilla está vacía/);
    // La plantilla limpia tal como se descarga: encabezados sin filas.
    const plantilla = xlsx(Object.fromEntries(HOJAS_PLANTILLA.map((h) => [h.hoja, [h.columnas]])));
    const ds = analizarLibro(plantilla);
    expect(ds.some((d) => d.seccion !== null)).toBe(false);
    expect(motivoSinTablas(plantilla, ds)).toMatch(/^Se reconocieron las columnas de .*Clientes.*pero no hay ninguna fila con datos/);
    const otra = xlsx({ Pendientes: [["Tarea", "Responsable", "Estado"], ["Pintar depósito", "Juan", "Pendiente"]] });
    expect(motivoSinTablas(otra, analizarLibro(otra))).toMatch(/^No se reconoció ninguna tabla de la app/);
  });

  it("una venta con un producto que no existe dice cuál es", () => {
    const errorVenta = plan.problemas.find((p) => p.tipo === "error" && p.seccion === "ventas")!;
    expect(errorVenta).toMatchObject({ campo: "producto" });
    expect(errorVenta.mensaje).toMatch(/^"Licor de frambuesa 700 cc" no está entre los productos de la app/);
  });

  it("la comparación muestra solo lo que trae la planilla", () => {
    const soloClientes = planificar({ registros: regs("clientes"), referencias: { totalCompras: null, totalVentas: null, unidadesVendidas: null, saldosMP: [] } });
    expect(soloClientes.cotejo).toEqual([]);
    const conVentas = planificar({ registros: [...regs("clientes"), ...regs("productos"), ...regs("ventas")], referencias: extraccion.referencias });
    expect(conVentas.cotejo.map((c) => c.concepto)).toEqual(["Ventas cargadas", "Total vendido", "Botellas vendidas"]);
  });
});

// ── Planilla real (opcional) ────────────────────────────────────────────────

const real = process.env.PLANILLA_REAL;
describe.skipIf(!real || !existsSync(real))("planilla real del cliente", () => {
  it("se analiza y planifica sin preguntar nada y las ventas cierran con la planilla", () => {
    const h = leerLibro(readFileSync(real!));
    const ds = analizarLibro(h);
    expect(ds.filter((d) => d.confianza === "media")).toEqual([]);
    const ext = extraer(h, ds);
    const claves = ext.registros.map((r) => r.clave);
    expect(new Set(claves).size).toBe(claves.length);
    const p = planificar(ext);
    const ventas = p.cotejo.find((c) => c.concepto === "Total vendido")!;
    expect(ventas.coincide).toBe(true);
  }, 60_000);
});
