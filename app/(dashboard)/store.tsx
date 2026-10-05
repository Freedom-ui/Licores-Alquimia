"use client";

/**
 * Store compartido en memoria para todo el dashboard. Reemplaza el patrón
 * anterior de "cada sección tiene su propio useState(initialRows)" — necesario
 * porque varias secciones se referencian entre sí:
 *
 *   Libro de compras ──► Inventario de materia prima (ingreso)
 *         ▲                        ▲
 *         │ compraId               │ consumo
 *   Órdenes de producción ─────────┘
 *         │ al embotellar
 *         ▼
 *   Productos terminados (lote) ◄── Operaciones (venta = salida del lote)
 *
 * Esa cadena es la trazabilidad: de un lote de proveedor se llega a los
 * lotes de producto y a los clientes, y al revés.
 *
 * Sigue siendo 100% en memoria — se resetea al recargar la página. Cuando el
 * modelo esté en Prisma, esta es la capa que se reemplaza por llamadas a
 * /api/* (las funciones expuestas por `useStore()` son ya la forma en que las
 * vistas consumen los datos, así que el reemplazo no debería tocar las vistas).
 */

import { createContext, useContext, useState, type ReactNode } from "react";
import type { ClienteRow } from "./clientes/data";
import { clientesDemo } from "./clientes/data";
import type { ProveedorRow } from "./proveedores/data";
import { proveedoresDemo } from "./proveedores/data";
import type { MateriaPrimaRow } from "./materia-prima/data";
import { materiaPrimaDemo } from "./materia-prima/data";
import type { ProductoRow } from "./productos/data";
import { productosDemo, productoLabel, findProductoById } from "./productos/data";
import type { OperacionRow } from "./operaciones/data";
import { operacionesDemo } from "./operaciones/data";
import type { OrdenInsumo, OrdenProduccionRow } from "./ordenes-produccion/data";
import { ordenesProduccionDemo, calcularCostoTotal } from "./ordenes-produccion/data";
import type { LoteTerminado } from "./productos-terminados/data";
import { productosTerminadosDemo } from "./productos-terminados/data";
import type { InventarioMateriaPrimaRow } from "./inventario-materia-prima/data";
import { inventarioMateriaPrimaDemo } from "./inventario-materia-prima/data";
import type { CompraInput, CompraRow } from "./trazabilidad/data";
import { comprasDemo, formatComprobante } from "./trazabilidad/data";
import type { KardexMovimiento } from "@/app/components/data-table/kardex";

function nextId<T extends { id: number }>(rows: T[]): number {
  return rows.reduce((max, r) => Math.max(max, r.id), 0) + 1;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export type OperacionInput = Omit<OperacionRow, "id" | "cliente" | "descripcion" | "subTotal">;

export type OrdenInput = {
  productoId: number;
  fechaMaceracion: string;
  fechaEmbotellado: string | null;
  responsable: string;
  cantidadProducida: number;
  insumos: OrdenInsumo[];
};

export type LoteHeaderInput = {
  existenciaInicial: number;
  costoUnitario: number;
  fechaVencimiento: string | null;
};

export type InventarioMateriaPrimaHeaderInput = {
  existenciaInicial: number;
  costoUnitario: number;
};

export type NuevaMateriaPrimaInventarioInput = InventarioMateriaPrimaHeaderInput & {
  materiaPrimaId: number;
};

// ── Sincronizaciones entre secciones ────────────────────────────────────────
// Funciones puras: las usa el store al guardar/borrar, y también al iniciar
// para armar los datos de demo (así el demo es exactamente lo que daría
// cargar todo a mano). Cada movimiento generado queda "tageado" con su
// origen (origenCompraId / origenOrdenId / origenOperacionId) para poder
// actualizarlo o borrarlo en cascada en vez de duplicarlo.

/** Cuánto de una compra ya está asignado a órdenes de producción. */
export function usadoDeCompra(ordenes: OrdenProduccionRow[], compraId: number, excluirOrdenId?: number): number {
  let total = 0;
  for (const o of ordenes) {
    if (o.id === excluirOrdenId) continue;
    for (const i of o.insumos) if (i.compraId === compraId) total += i.cantidad;
  }
  return round2(total);
}

// Libro de compras → Inventario de materia prima: cada compra es un ingreso.
// Si la materia prima todavía no estaba en el inventario, se agrega sola.
function quitarEntradaDeCompra(rows: InventarioMateriaPrimaRow[], compraId: number): InventarioMateriaPrimaRow[] {
  return rows.map((r) =>
    r.movimientos.some((m) => m.origenCompraId === compraId)
      ? { ...r, movimientos: r.movimientos.filter((m) => m.origenCompraId !== compraId) }
      : r
  );
}

function syncEntradaParaCompra(rows: InventarioMateriaPrimaRow[], compra: CompraRow): InventarioMateriaPrimaRow[] {
  const limpias = quitarEntradaDeCompra(rows, compra.id);
  const movimiento: Omit<KardexMovimiento, "id"> = {
    fecha: compra.fecha,
    tipo: "entrada",
    cantidad: compra.cantidad,
    puEntrada: compra.costoUnitario,
    cantidadSecundaria: compra.cantidadCascara || undefined,
    origenCompraId: compra.id,
  };
  const existente = limpias.find((r) => r.materiaPrimaId === compra.materiaPrimaId);
  if (!existente) {
    return [
      ...limpias,
      {
        id: nextId(limpias),
        materiaPrimaId: compra.materiaPrimaId,
        existenciaInicial: 0,
        costoUnitario: compra.costoUnitario,
        movimientos: [{ id: 1, ...movimiento }],
      },
    ];
  }
  return limpias.map((r) =>
    r.id === existente.id ? { ...r, movimientos: [...r.movimientos, { id: nextId(r.movimientos), ...movimiento }] } : r
  );
}

// Órdenes de producción → Inventario de materia prima: cada insumo que esté
// en el inventario genera un consumo. Detalles:
//  - Si la misma materia prima se repite (ej. alcohol de dos compras), se
//    suma en un solo consumo.
//  - Se fecha con la fecha de maceración.
//  - Los insumos que no están en el inventario se ignoran, sin bloquear.
//  - Si no alcanza el saldo no se bloquea: queda en negativo (rojo en pantalla).
function quitarConsumosDeOrden(rows: InventarioMateriaPrimaRow[], ordenId: number): InventarioMateriaPrimaRow[] {
  return rows.map((r) =>
    r.movimientos.some((m) => m.origenOrdenId === ordenId)
      ? { ...r, movimientos: r.movimientos.filter((m) => m.origenOrdenId !== ordenId) }
      : r
  );
}

function syncConsumosParaOrden(
  rows: InventarioMateriaPrimaRow[],
  orden: OrdenProduccionRow,
  materiaPrima: MateriaPrimaRow[]
): InventarioMateriaPrimaRow[] {
  const cantidadPorMateria = new Map<number, number>();
  for (const insumo of orden.insumos) {
    const mp = materiaPrima.find((m) => m.nombre === insumo.materiaPrima);
    if (!mp) continue;
    cantidadPorMateria.set(mp.id, (cantidadPorMateria.get(mp.id) ?? 0) + insumo.cantidad);
  }

  return quitarConsumosDeOrden(rows, orden.id).map((r) => {
    const cantidad = cantidadPorMateria.get(r.materiaPrimaId);
    if (!cantidad) return r;
    return {
      ...r,
      movimientos: [
        ...r.movimientos,
        { id: nextId(r.movimientos), fecha: orden.fechaMaceracion, tipo: "salida", cantidad: round2(cantidad), origenOrdenId: orden.id },
      ],
    };
  });
}

// Órdenes de producción → Productos terminados: al embotellarse, la orden
// crea o actualiza su lote (existencia = cantidad producida, costo unitario =
// costo total / cantidad). Si se borra la fecha de embotellado, el lote
// auto-generado se quita — salvo que ya tenga ventas, para no perder historial.
function syncLoteParaOrden(lotes: LoteTerminado[], orden: OrdenProduccionRow): LoteTerminado[] {
  if (!orden.fechaEmbotellado) {
    return lotes.filter((l) => !(l.origenOrdenId === orden.id && l.movimientos.length === 0));
  }
  const costoUnitario = orden.cantidadProducida > 0 ? round2(orden.costoTotal / orden.cantidadProducida) : 0;
  const existente = lotes.find((l) => l.origenOrdenId === orden.id);
  if (existente) {
    return lotes.map((l) =>
      l.id === existente.id
        ? {
            ...l,
            productoId: orden.productoId,
            producto: orden.producto,
            formato: orden.formato,
            existenciaInicial: orden.cantidadProducida,
            costoUnitario,
          }
        : l
    );
  }
  return [
    ...lotes,
    {
      id: nextId(lotes),
      lote: orden.id,
      productoId: orden.productoId,
      origenOrdenId: orden.id,
      producto: orden.producto,
      formato: orden.formato,
      existenciaInicial: orden.cantidadProducida,
      costoUnitario,
      fechaVencimiento: null,
      movimientos: [],
    },
  ];
}

// Operaciones → Productos terminados: una venta descuenta del lote más viejo
// de ese producto que todavía tenga stock (FIFO); si no alcanza, sigue con el
// siguiente lote, y lo que exceda a todo el stock queda en el último (saldo
// negativo = falta embotellar). Antes descontaba siempre del primer lote,
// aunque estuviera agotado, y la venta quedaba atribuida al lote equivocado:
// para trazabilidad importa saber a qué cliente fue cada lote.
function saldoLote(l: LoteTerminado): number {
  return l.movimientos.reduce((s, m) => (m.tipo === "entrada" ? s + m.cantidad : s - m.cantidad), l.existenciaInicial);
}

function quitarSalidaDeOperacion(lotes: LoteTerminado[], operacionId: number): LoteTerminado[] {
  return lotes.map((l) =>
    l.movimientos.some((m) => m.origenOperacionId === operacionId)
      ? { ...l, movimientos: l.movimientos.filter((m) => m.origenOperacionId !== operacionId) }
      : l
  );
}

function syncSalidaParaOperacion(
  lotes: LoteTerminado[],
  operacion: { id: number; productoId: number; fecha: string; cantidad: number }
): LoteTerminado[] {
  const limpios = quitarSalidaDeOperacion(lotes, operacion.id);
  const candidatos = limpios
    .filter((l) => l.productoId === operacion.productoId)
    .sort((a, b) => a.lote - b.lote || a.id - b.id);
  if (candidatos.length === 0) return limpios;

  const asignado = new Map<number, number>();
  let restante = operacion.cantidad;
  for (const l of candidatos) {
    if (restante <= 0) break;
    const disponible = saldoLote(l);
    if (disponible <= 0) continue;
    const toma = Math.min(disponible, restante);
    asignado.set(l.id, toma);
    restante = round2(restante - toma);
  }
  if (restante > 0) {
    const ultimo = candidatos[candidatos.length - 1];
    asignado.set(ultimo.id, (asignado.get(ultimo.id) ?? 0) + restante);
  }

  return limpios.map((l) => {
    const cantidad = asignado.get(l.id);
    if (!cantidad) return l;
    return {
      ...l,
      movimientos: [
        ...l.movimientos,
        { id: nextId(l.movimientos), fecha: operacion.fecha, tipo: "salida", cantidad: round2(cantidad), origenOperacionId: operacion.id },
      ],
    };
  });
}

// Estado inicial del demo, armado con las mismas sincronizaciones.
const inventarioInicial = (() => {
  let rows = inventarioMateriaPrimaDemo;
  for (const c of comprasDemo) rows = syncEntradaParaCompra(rows, c);
  for (const o of ordenesProduccionDemo) rows = syncConsumosParaOrden(rows, o, materiaPrimaDemo);
  return rows;
})();

const productosTerminadosIniciales = (() => {
  let lotes = productosTerminadosDemo;
  for (const o of ordenesProduccionDemo) lotes = syncLoteParaOrden(lotes, o);
  for (const op of operacionesDemo) lotes = syncSalidaParaOperacion(lotes, op);
  return lotes;
})();

type Store = {
  clientes: ClienteRow[];
  addCliente: (v: Record<string, string | number>) => void;
  updateCliente: (id: number, v: Record<string, string | number>) => void;
  deleteCliente: (id: number) => void;

  proveedores: ProveedorRow[];
  addProveedor: (v: Record<string, string | number>) => void;
  updateProveedor: (id: number, v: Record<string, string | number>) => void;
  deleteProveedor: (id: number) => void;

  materiaPrima: MateriaPrimaRow[];
  addMateriaPrima: (v: Record<string, string | number>) => void;
  updateMateriaPrima: (id: number, v: Record<string, string | number>) => void;
  deleteMateriaPrima: (id: number) => void;

  productos: ProductoRow[];
  addProducto: (v: Record<string, string | number>) => void;
  updateProducto: (id: number, v: Record<string, string | number>) => void;
  deleteProducto: (id: number) => void;

  operaciones: OperacionRow[];
  addOperacion: (v: OperacionInput) => void;
  updateOperacion: (id: number, v: OperacionInput) => void;
  deleteOperacion: (id: number) => void;

  ordenesProduccion: OrdenProduccionRow[];
  saveOrden: (id: number | null, v: OrdenInput) => void;
  deleteOrden: (id: number) => void;

  productosTerminados: LoteTerminado[];
  addMovimiento: (loteId: number, movimiento: Omit<KardexMovimiento, "id">) => void;
  updateLote: (loteId: number, v: LoteHeaderInput) => void;
  deleteLote: (loteId: number) => void;

  inventarioMateriaPrima: InventarioMateriaPrimaRow[];
  addInventarioMateriaPrima: (v: NuevaMateriaPrimaInventarioInput) => void;
  addInventarioMovimiento: (rowId: number, movimiento: Omit<KardexMovimiento, "id">) => void;
  updateInventarioMateriaPrima: (rowId: number, v: InventarioMateriaPrimaHeaderInput) => void;
  deleteInventarioMateriaPrima: (rowId: number) => void;

  compras: CompraRow[];
  /** Alta (id null) o edición. Lanza Error con un mensaje para el usuario si no se puede guardar. */
  saveCompra: (id: number | null, v: CompraInput) => void;
  deleteCompra: (id: number) => void;
};

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [clientes, setClientes] = useState<ClienteRow[]>(clientesDemo);
  const [proveedores, setProveedores] = useState<ProveedorRow[]>(proveedoresDemo);
  const [materiaPrima, setMateriaPrima] = useState<MateriaPrimaRow[]>(materiaPrimaDemo);
  const [productos, setProductos] = useState<ProductoRow[]>(productosDemo);
  const [operaciones, setOperaciones] = useState<OperacionRow[]>(operacionesDemo);
  const [ordenesProduccion, setOrdenesProduccion] = useState<OrdenProduccionRow[]>(ordenesProduccionDemo);
  const [productosTerminados, setProductosTerminados] = useState<LoteTerminado[]>(productosTerminadosIniciales);
  const [inventarioMateriaPrima, setInventarioMateriaPrima] = useState<InventarioMateriaPrimaRow[]>(inventarioInicial);
  const [compras, setCompras] = useState<CompraRow[]>(comprasDemo);

  // ── Clientes / Proveedores / Materia prima / Productos: CRUD simple ──
  function addCliente(v: Record<string, string | number>) {
    setClientes((prev) => [...prev, { id: nextId(prev), ...v } as ClienteRow]);
  }
  function updateCliente(id: number, v: Record<string, string | number>) {
    setClientes((prev) => prev.map((r) => (r.id === id ? ({ ...r, ...v } as ClienteRow) : r)));
  }
  function deleteCliente(id: number) {
    setClientes((prev) => prev.filter((r) => r.id !== id));
  }

  function addProveedor(v: Record<string, string | number>) {
    setProveedores((prev) => [...prev, { id: nextId(prev), ...v } as ProveedorRow]);
  }
  function updateProveedor(id: number, v: Record<string, string | number>) {
    setProveedores((prev) => prev.map((r) => (r.id === id ? ({ ...r, ...v } as ProveedorRow) : r)));
  }
  function deleteProveedor(id: number) {
    // El Libro de compras referencia al proveedor: borrarlo dejaría compras
    // sin origen, que es justo lo que la trazabilidad tiene que poder mostrar.
    const usadas = compras.filter((c) => c.proveedorId === id).map((c) => c.id);
    if (usadas.length > 0) {
      throw new Error(
        `Este proveedor figura en el Libro de compras (OP N° ${usadas.join(", ")}). No se puede eliminar sin perder la trazabilidad de esas compras.`
      );
    }
    setProveedores((prev) => prev.filter((r) => r.id !== id));
  }

  function addMateriaPrima(v: Record<string, string | number>) {
    setMateriaPrima((prev) => [...prev, { id: nextId(prev), ...v } as unknown as MateriaPrimaRow]);
  }
  function updateMateriaPrima(id: number, v: Record<string, string | number>) {
    const anterior = materiaPrima.find((r) => r.id === id);
    setMateriaPrima((prev) => prev.map((r) => (r.id === id ? ({ ...r, ...v } as unknown as MateriaPrimaRow) : r)));
    // Las órdenes guardan el insumo por nombre (texto): si se renombra acá hay
    // que renombrarlo también en ellas, si no una orden que se edite después
    // ya no encontraría su materia prima y dejaría de descontar del inventario.
    const nuevoNombre = typeof v.nombre === "string" ? v.nombre : undefined;
    if (anterior && nuevoNombre && nuevoNombre !== anterior.nombre) {
      setOrdenesProduccion((prev) =>
        prev.map((o) => ({
          ...o,
          insumos: o.insumos.map((i) => (i.materiaPrima === anterior.nombre ? { ...i, materiaPrima: nuevoNombre } : i)),
        }))
      );
    }
  }
  function deleteMateriaPrima(id: number) {
    if (compras.some((c) => c.materiaPrimaId === id)) {
      throw new Error("Esta materia prima tiene compras en el Libro de compras (Trazabilidad). No se puede eliminar del catálogo.");
    }
    // Se lanza el error (DataTable lo muestra en el diálogo de confirmación)
    // en vez de borrar: sino la fila del inventario quedaba huérfana, sin
    // nombre ni unidad, con todo su historial de movimientos colgando.
    if (inventarioMateriaPrima.some((r) => r.materiaPrimaId === id)) {
      throw new Error(
        "Esta materia prima está en el Inventario de materia prima. Quitala de ahí primero para poder eliminarla del catálogo."
      );
    }
    setMateriaPrima((prev) => prev.filter((r) => r.id !== id));
  }

  function addProducto(v: Record<string, string | number>) {
    setProductos((prev) => [...prev, { id: nextId(prev), ...v } as ProductoRow]);
  }
  function updateProducto(id: number, v: Record<string, string | number>) {
    setProductos((prev) => prev.map((r) => (r.id === id ? ({ ...r, ...v } as ProductoRow) : r)));
  }
  function deleteProducto(id: number) {
    setProductos((prev) => prev.filter((r) => r.id !== id));
  }

  // ── Productos terminados: movimientos manuales + alta/edición/baja de lote ──
  function addMovimiento(loteId: number, movimiento: Omit<KardexMovimiento, "id">) {
    setProductosTerminados((prev) =>
      prev.map((l) => {
        if (l.id !== loteId) return l;
        const id = nextId(l.movimientos);
        return { ...l, movimientos: [...l.movimientos, { ...movimiento, id }] };
      })
    );
  }
  function updateLote(loteId: number, v: LoteHeaderInput) {
    setProductosTerminados((prev) => prev.map((l) => (l.id === loteId ? { ...l, ...v } : l)));
  }
  function deleteLote(loteId: number) {
    setProductosTerminados((prev) => prev.filter((l) => l.id !== loteId));
  }

  // ── Inventario de materia prima: movimientos manuales (ajustes, mermas,
  // stock previo) + alta/edición/baja. Las compras y los consumos de las
  // órdenes entran solos (ver sincronizaciones arriba).
  function addInventarioMateriaPrima(v: NuevaMateriaPrimaInventarioInput) {
    setInventarioMateriaPrima((prev) => [
      ...prev,
      { id: nextId(prev), materiaPrimaId: v.materiaPrimaId, existenciaInicial: v.existenciaInicial, costoUnitario: v.costoUnitario, movimientos: [] },
    ]);
  }
  function addInventarioMovimiento(rowId: number, movimiento: Omit<KardexMovimiento, "id">) {
    setInventarioMateriaPrima((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const id = nextId(r.movimientos);
        return { ...r, movimientos: [...r.movimientos, { ...movimiento, id }] };
      })
    );
  }
  function updateInventarioMateriaPrima(rowId: number, v: InventarioMateriaPrimaHeaderInput) {
    setInventarioMateriaPrima((prev) => prev.map((r) => (r.id === rowId ? { ...r, ...v } : r)));
  }
  function deleteInventarioMateriaPrima(rowId: number) {
    const row = inventarioMateriaPrima.find((r) => r.id === rowId);
    if (row && compras.some((c) => c.materiaPrimaId === row.materiaPrimaId)) {
      throw new Error(
        "Esta materia prima tiene compras registradas en el Libro de compras (Trazabilidad): sus ingresos salen de ahí y no se pueden quitar del inventario."
      );
    }
    setInventarioMateriaPrima((prev) => prev.filter((r) => r.id !== rowId));
  }

  // ── Operaciones (ventas): descuentan stock del lote que corresponda ──
  function addOperacion(v: OperacionInput) {
    const id = nextId(operaciones);
    const cliente = clientes.find((c) => c.id === v.clienteId);
    const producto = findProductoById(v.productoId);
    const row: OperacionRow = {
      id,
      ...v,
      cliente: cliente?.razonSocial ?? "",
      descripcion: producto ? productoLabel(producto) : "",
      subTotal: v.cantidad * v.pu,
    };
    setOperaciones((prev) => [...prev, row]);
    setProductosTerminados((prev) => syncSalidaParaOperacion(prev, row));
  }

  function updateOperacion(id: number, v: OperacionInput) {
    const cliente = clientes.find((c) => c.id === v.clienteId);
    const producto = findProductoById(v.productoId);
    setOperaciones((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              ...v,
              cliente: cliente?.razonSocial ?? "",
              descripcion: producto ? productoLabel(producto) : "",
              subTotal: v.cantidad * v.pu,
            }
          : r
      )
    );
    setProductosTerminados((prev) => syncSalidaParaOperacion(prev, { id, ...v }));
  }

  function deleteOperacion(id: number) {
    setOperaciones((prev) => prev.filter((r) => r.id !== id));
    setProductosTerminados((prev) => quitarSalidaDeOperacion(prev, id));
  }

  // ── Órdenes de producción ──
  function saveOrden(id: number | null, v: OrdenInput) {
    const producto = findProductoById(v.productoId);
    const costoTotal = calcularCostoTotal(v.insumos);
    const base = {
      productoId: v.productoId,
      producto: producto?.nombre ?? "",
      formato: producto?.formato ?? "",
      fechaMaceracion: v.fechaMaceracion,
      fechaEmbotellado: v.fechaEmbotellado,
      responsable: v.responsable,
      cantidadProducida: v.cantidadProducida,
      insumos: v.insumos,
      costoTotal,
    };
    const orden: OrdenProduccionRow = id === null ? { id: nextId(ordenesProduccion), ...base } : { id, ...base };
    setOrdenesProduccion((prev) => (id === null ? [...prev, orden] : prev.map((r) => (r.id === id ? orden : r))));
    setProductosTerminados((prev) => syncLoteParaOrden(prev, orden));
    setInventarioMateriaPrima((prev) => syncConsumosParaOrden(prev, orden, materiaPrima));
  }

  function deleteOrden(id: number) {
    setOrdenesProduccion((prev) => prev.filter((r) => r.id !== id));
    setProductosTerminados((prev) => prev.filter((l) => !(l.origenOrdenId === id && l.movimientos.length === 0)));
    setInventarioMateriaPrima((prev) => quitarConsumosDeOrden(prev, id));
  }

  // ── Libro de compras (Trazabilidad) ──
  function saveCompra(id: number | null, v: CompraInput) {
    if (id !== null) {
      const anterior = compras.find((c) => c.id === id);
      const usado = usadoDeCompra(ordenesProduccion, id);
      const ordenesQueUsan = ordenesProduccion.filter((o) => o.insumos.some((i) => i.compraId === id)).map((o) => o.id);
      if (anterior && usado > 0 && anterior.materiaPrimaId !== v.materiaPrimaId) {
        throw new Error(
          `No se puede cambiar la materia prima: esta compra ya se usó en las órdenes N° ${ordenesQueUsan.join(", ")}.`
        );
      }
      if (v.cantidad + 1e-9 < usado) {
        throw new Error(
          `Las órdenes N° ${ordenesQueUsan.join(", ")} ya usan ${usado} de esta compra: la cantidad no puede ser menor.`
        );
      }
    }

    if (v.comprobanteNumero) {
      const duplicada = compras.find(
        (c) =>
          c.id !== id &&
          c.proveedorId === v.proveedorId &&
          c.materiaPrimaId === v.materiaPrimaId &&
          formatComprobante(c) === formatComprobante(v)
      );
      if (duplicada) {
        throw new Error(
          `Esta compra ya está cargada: la OP N° ${duplicada.id} tiene el mismo proveedor, comprobante y materia prima.`
        );
      }
    }

    const compra: CompraRow = { id: id ?? nextId(compras), ...v };
    setCompras((prev) => (id === null ? [...prev, compra] : prev.map((c) => (c.id === id ? compra : c))));
    setInventarioMateriaPrima((prev) => syncEntradaParaCompra(prev, compra));
  }

  function deleteCompra(id: number) {
    const ordenesQueUsan = ordenesProduccion.filter((o) => o.insumos.some((i) => i.compraId === id)).map((o) => o.id);
    if (ordenesQueUsan.length > 0) {
      throw new Error(
        `Esta compra se usó en las órdenes de producción N° ${ordenesQueUsan.join(", ")}. Quitala de esas órdenes antes de eliminarla, para no cortar la trazabilidad.`
      );
    }
    setCompras((prev) => prev.filter((c) => c.id !== id));
    setInventarioMateriaPrima((prev) => quitarEntradaDeCompra(prev, id));
  }

  const value: Store = {
    clientes,
    addCliente,
    updateCliente,
    deleteCliente,
    proveedores,
    addProveedor,
    updateProveedor,
    deleteProveedor,
    materiaPrima,
    addMateriaPrima,
    updateMateriaPrima,
    deleteMateriaPrima,
    productos,
    addProducto,
    updateProducto,
    deleteProducto,
    operaciones,
    addOperacion,
    updateOperacion,
    deleteOperacion,
    ordenesProduccion,
    saveOrden,
    deleteOrden,
    productosTerminados,
    addMovimiento,
    updateLote,
    deleteLote,
    inventarioMateriaPrima,
    addInventarioMateriaPrima,
    addInventarioMovimiento,
    updateInventarioMateriaPrima,
    deleteInventarioMateriaPrima,
    compras,
    saveCompra,
    deleteCompra,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore() debe usarse dentro de <StoreProvider>.");
  return ctx;
}
