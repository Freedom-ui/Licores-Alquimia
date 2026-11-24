// Integración: importación de la planilla (app/(dashboard)/_datos/importar.ts).
// Se arma un Excel con la plantilla de la app, se lee y extrae como en el
// navegador (_importar/) y se manda a la server action, que vuelve a planificar
// con las reglas de la app y guarda todo en una transacción.

import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { importarPlanilla } from "@/app/(dashboard)/_datos/importar";
import { HOJAS_PLANTILLA } from "@/app/(dashboard)/_importar/plantilla";
import { leerLibro } from "@/app/(dashboard)/_importar/leer";
import { analizarLibro } from "@/app/(dashboard)/_importar/detectar";
import { extraer } from "@/app/(dashboard)/_importar/extraer";
import { entrar, estadoEnBase, stockDe, vaciarBase } from "./ayudantes";

const DATOS: Record<string, (string | number)[][]> = {
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

/** Lo que manda la pantalla después de leer el Excel: la extracción, no el archivo. */
function pedido(datos = DATOS) {
  const wb = XLSX.utils.book_new();
  for (const { hoja, columnas } of HOJAS_PLANTILLA) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([columnas, ...(datos[hoja] ?? [])]), hoja);
  const hojas = leerLibro(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
  return { extraccion: extraer(hojas, analizarLibro(hojas)), unidades: {}, elecciones: {}, subidaId: null };
}

const contar = async () => ({
  clientes: await prisma.cliente.count(),
  productos: await prisma.producto.count(),
  materias: await prisma.materiaPrima.count(),
  proveedores: await prisma.proveedor.count(),
  compras: await prisma.compra.count(),
  ordenes: await prisma.ordenProduccion.count(),
  ventas: await prisma.operacion.count(),
});

beforeEach(() => vaciarBase());

describe("Importar la planilla (importarPlanilla)", () => {
  it("IT-I01 sin sesión no importa nada", async () => {
    const r = await importarPlanilla(pedido());

    expect(r).toMatchObject({ ok: false, sinSesion: true });
    expect((await contar()).clientes).toBe(0);
  });

  it.each([
    ["null", null],
    ["sin extracción", { unidades: {} }],
    ["registros que no son una lista", { extraccion: { registros: "x", referencias: { saldosMP: [] } }, unidades: {} }],
    ["un registro de una sección inventada", { extraccion: { registros: [{ seccion: "usuarios", clave: "a", origen: { hoja: "h", fila: 1 }, v: {} }], referencias: { saldosMP: [] } }, unidades: {} }],
  ])("IT-I02 entrada malformada (%s): la rechaza sin tocar la base", async (_n, entrada) => {
    await entrar();

    const r = await importarPlanilla(entrada);

    expect(r).toMatchObject({ ok: false, error: "Los datos de la planilla llegaron incompletos. Volvé a cargar el archivo." });
    expect(await contar()).toMatchObject({ clientes: 0, ventas: 0 });
  });

  it("IT-I03 a una base vacía: carga cada sección, encadena orden → lote → venta y no hace copia (no había datos)", async () => {
    await entrar();

    const r = await importarPlanilla(pedido());

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.respaldo).toBeNull();
    expect(await contar()).toEqual({ clientes: 1, productos: 1, materias: 2, proveedores: 1, compras: 1, ordenes: 1, ventas: 1 });
    const estado = await estadoEnBase();
    const producto = estado.productos[0];
    expect(stockDe(estado, producto.id)).toBe(6); // 12 embotelladas − 6 vendidas
    expect(estado.operaciones[0]).toMatchObject({ cantidad: 6, subTotal: 48000, cliente: "ALMACEN CENTRO" });
  });

  it("IT-I04 importar dos veces el mismo archivo no duplica nada", async () => {
    await entrar();
    await importarPlanilla(pedido());
    const despuesDeLaPrimera = await contar();

    const r = await importarPlanilla(pedido());

    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("No hay nada nuevo") });
    expect(await contar()).toEqual(despuesDeLaPrimera);
  });

  it("IT-I05 con datos previos: antes de importar hace una copia de seguridad y agrega solo lo nuevo", async () => {
    await entrar();
    await importarPlanilla(pedido());
    const conOtroCliente = { ...DATOS, Clientes: [...DATOS.Clientes, ["BAR NUEVO", "", "Consumidor Final", "", "", "", "", 9000, ""]] };

    const r = await importarPlanilla(pedido(conOtroCliente));

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.agregados).toBe(1);
      expect(r.respaldo).toMatch(/-antes-de-importar\.db$/);
      const copias = path.join(process.env.ALQUIMIA_DATOS!, "copias");
      expect(existsSync(copias) && readdirSync(copias).includes(r.respaldo!)).toBe(true);
    }
    expect((await contar()).clientes).toBe(2);
  });
});
