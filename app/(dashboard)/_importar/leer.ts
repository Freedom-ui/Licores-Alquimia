// Lectura del .xlsx con SheetJS → grillas de valores (tipos.ts). Corre en el
// navegador: el archivo no se sube entero, solo viajan al servidor los datos
// ya extraídos.
//
// - Se usan los valores guardados de las fórmulas (lo que se ve en Excel). Un
//   0 se toma como celda vacía: la planilla tiene cientos de filas pre-armadas
//   con fórmulas que dan 0, y en la app ninguna cantidad ni precio puede ser 0.
//   (No se leen las fórmulas en sí: tarda el doble con una planilla grande.)
// - Las fechas se leen por el formato de la celda y se convierten a
//   "YYYY-MM-DD" sin pasar por Date (así no hay corrimientos por zona horaria).
// - También acepta .csv (Excel lo exporta así, una hoja por archivo): se lee
//   como texto (UTF-8 o, si no lo es, Windows-1252, lo que exporta Excel en
//   español), con el separador que use (";" o ","), y cada archivo es una hoja
//   con su nombre (así "Clientes.csv" se reconoce como Clientes). Los valores
//   quedan como texto: "10.000,50" y "02/08/2026" los interpreta normalizar.ts
//   como en la Argentina (SheetJS los leería al estilo de EE. UU.).

import * as XLSX from "xlsx";
import { aNumero } from "./normalizar";
import type { Hoja, Valor } from "./tipos";

type CeldaXlsx = { t?: string; v?: unknown; z?: string | number };

function valorDe(c: CeldaXlsx | undefined): Valor {
  if (!c || c.v === undefined || c.v === null || c.t === "e" || c.t === "z") return null;
  if (c.v === 0) return null;
  if (c.t === "n" && typeof c.v === "number") {
    if (typeof c.z === "string" && XLSX.SSF.is_date(c.z)) {
      const d = XLSX.SSF.parse_date_code(c.v);
      if (d && d.y > 1900) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
    }
    return c.v;
  }
  if (c.t === "b") return c.v ? "x" : null;
  if (c.v instanceof Date) return c.v.toISOString().slice(0, 10);
  const t = String(c.v).trim();
  return t ? t : null;
}

/** Un CSV trae todo como texto: un 0 (o "$ 0,00") también se toma como vacío, igual que en el Excel. */
function valorCsv(c: CeldaXlsx | undefined): Valor {
  const v = valorDe(c);
  return typeof v === "string" && aNumero(v) === 0 ? null : v;
}

function hojaDe(nombre: string, ws: XLSX.WorkSheet, valor: (c: CeldaXlsx | undefined) => Valor): Hoja {
  const data = (ws as XLSX.WorkSheet & { "!data"?: (CeldaXlsx | undefined)[][] })["!data"] ?? [];
  const filas: Valor[][] = [];
  data.forEach((fila, r) => {
    if (!fila) return;
    const out: Valor[] = [];
    let alguna = false;
    fila.forEach((celda, col) => {
      const v = valor(celda);
      if (v !== null) {
        out[col] = v;
        alguna = true;
      }
    });
    if (alguna) filas[r] = out;
  });
  const combinadas = (ws["!merges"] ?? []).map((m) => ({ r0: m.s.r, c0: m.s.c, r1: m.e.r, c1: m.e.c }));
  return { nombre, filas, combinadas };
}

export const esCsv = (nombreArchivo: string) => /\.csv$/i.test(nombreArchivo);

/** Texto del CSV: UTF-8 si lo es (con o sin BOM); si no, Windows-1252 (Excel en español). */
function decodificar(datos: ArrayBuffer | Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(datos);
  } catch {
    return new TextDecoder("windows-1252").decode(datos);
  }
}

/** Lee un CSV como una hoja con el nombre del archivo (sin la extensión). */
export function leerCsv(datos: ArrayBuffer | Uint8Array, nombreArchivo: string): Hoja {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(decodificar(datos), { type: "string", raw: true, dense: true });
  } catch {
    throw new Error(`No se pudo leer «${nombreArchivo}»: tiene que ser un archivo CSV (valores separados por ";" o ",").`);
  }
  const nombre = nombreArchivo.replace(/\.csv$/i, "").trim() || "CSV";
  return hojaDe(nombre, wb.Sheets[wb.SheetNames[0]], valorCsv);
}

/**
 * El archivo es de verdad un Excel: un .xlsx/.xlsm es un ZIP (empieza con
 * "PK") y un .xls viejo es un documento OLE (D0 CF 11 E0). Así un archivo de
 * otro tipo con la extensión cambiada no se lee como si fuera texto.
 */
function pareceExcel(datos: ArrayBuffer | Uint8Array): boolean {
  const b = datos instanceof Uint8Array ? datos : new Uint8Array(datos);
  const zip = b[0] === 0x50 && b[1] === 0x4b;
  const ole = b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0;
  return zip || ole;
}

/** Lee el libro completo. Lanza un Error con mensaje para el usuario si no es un Excel. */
export function leerLibro(datos: ArrayBuffer | Uint8Array): Hoja[] {
  if (!pareceExcel(datos)) {
    throw new Error(
      "Este archivo no es una planilla de Excel (puede estar dañado o ser otro tipo de archivo con la extensión cambiada). Abrilo en Excel y guardalo de nuevo como .xlsx."
    );
  }
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(datos, { type: "array", dense: true, cellNF: true, cellFormula: false, cellText: false, cellHTML: false, cellStyles: false });
  } catch {
    throw new Error("No se pudo leer el archivo: tiene que ser una planilla de Excel (.xlsx o .xls).");
  }
  return wb.SheetNames.map((nombre) => hojaDe(nombre, wb.Sheets[nombre], valorDe));
}
