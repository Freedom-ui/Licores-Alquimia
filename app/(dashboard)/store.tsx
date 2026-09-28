"use client";

/**
 * Store compartido en memoria para todo el dashboard. Reemplaza el patrón
 * anterior de "cada sección tiene su propio useState(initialRows)" — necesario
 * porque varias secciones ahora se referencian entre sí (Operaciones vende un
 * Producto del catálogo; Órdenes de producción genera un lote en Productos
 * terminados al embotellarse; una venta descuenta stock del lote correspondiente).
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
import type { KardexMovimiento } from "@/app/components/data-table/kardex";

function nextId<T extends { id: number }>(rows: T[]): number {
  return rows.reduce((max, r) => Math.max(max, r.id), 0) + 1;
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
};

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [clientes, setClientes] = useState<ClienteRow[]>(clientesDemo);
  const [proveedores, setProveedores] = useState<ProveedorRow[]>(proveedoresDemo);
  const [materiaPrima, setMateriaPrima] = useState<MateriaPrimaRow[]>(materiaPrimaDemo);
  const [productos, setProductos] = useState<ProductoRow[]>(productosDemo);
  const [operaciones, setOperaciones] = useState<OperacionRow[]>(operacionesDemo);
  const [ordenesProduccion, setOrdenesProduccion] = useState<OrdenProduccionRow[]>(ordenesProduccionDemo);
  const [productosTerminados, setProductosTerminados] = useState<LoteTerminado[]>(productosTerminadosDemo);
  const [inventarioMateriaPrima, setInventarioMateriaPrima] =
    useState<InventarioMateriaPrimaRow[]>(inventarioMateriaPrimaDemo);

  // ── Clientes / Proveedores / Materia prima / Productos: CRUD simple, sin automatizaciones ──
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

  // ── Inventario de materia prima: mismo patrón que Productos terminados
  // (movimientos manuales + alta/edición/baja), pero acá "dar de alta" es
  // empezar a trackear una materia prima que ya existe en el catálogo
  // (materiaPrima), no crear un producto nuevo — por eso addInventarioMateriaPrima
  // recibe un `materiaPrimaId` en vez de nombre/formato sueltos. Los consumos
  // de las Órdenes de producción se sincronizan más abajo (syncConsumosParaOrden).
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
    setInventarioMateriaPrima((prev) => prev.filter((r) => r.id !== rowId));
  }

  // ── Operaciones (ventas): al guardar, sincroniza automáticamente la salida
  // correspondiente en el kardex del lote de Productos terminados que tenga
  // ese mismo producto — así una venta ya no requiere cargarse dos veces. El
  // movimiento generado queda "tageado" con `origenOperacionId` para poder
  // encontrarlo y actualizarlo (o borrarlo) si la venta se edita o elimina,
  // en vez de duplicarlo. Si todavía no existe stock de ese producto en
  // Productos terminados, no se genera movimiento (no bloquea la carga de la
  // venta: es una limitación esperable de un demo en memoria sin validación
  // de stock real).
  function syncSalidaParaOperacion(
    lotes: LoteTerminado[],
    operacionId: number,
    productoId: number,
    fecha: string,
    cantidad: number
  ): LoteTerminado[] {
    const candidato = lotes.find((l) => l.productoId === productoId);
    return lotes.map((l) => {
      if (!candidato || l.id !== candidato.id) {
        // Si el producto de la venta cambió, hay que sacar el movimiento del lote anterior.
        if (l.movimientos.some((m) => m.origenOperacionId === operacionId)) {
          return { ...l, movimientos: l.movimientos.filter((m) => m.origenOperacionId !== operacionId) };
        }
        return l;
      }
      const existente = l.movimientos.find((m) => m.origenOperacionId === operacionId);
      if (existente) {
        return {
          ...l,
          movimientos: l.movimientos.map((m) =>
            m.origenOperacionId === operacionId ? { ...m, fecha, cantidad } : m
          ),
        };
      }
      const id = nextId(l.movimientos);
      return {
        ...l,
        movimientos: [
          ...l.movimientos,
          { id, fecha, tipo: "salida", cantidad, origenOperacionId: operacionId },
        ],
      };
    });
  }

  function quitarSalidaDeOperacion(lotes: LoteTerminado[], operacionId: number): LoteTerminado[] {
    return lotes.map((l) =>
      l.movimientos.some((m) => m.origenOperacionId === operacionId)
        ? { ...l, movimientos: l.movimientos.filter((m) => m.origenOperacionId !== operacionId) }
        : l
    );
  }

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
    setProductosTerminados((prev) => syncSalidaParaOperacion(prev, id, v.productoId, v.fecha, v.cantidad));
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
    setProductosTerminados((prev) => syncSalidaParaOperacion(prev, id, v.productoId, v.fecha, v.cantidad));
  }

  function deleteOperacion(id: number) {
    setOperaciones((prev) => prev.filter((r) => r.id !== id));
    setProductosTerminados((prev) => quitarSalidaDeOperacion(prev, id));
  }

  // ── Órdenes de producción: al guardar con fecha de embotellado cargada,
  // crea o actualiza automáticamente el lote correspondiente en Productos
  // terminados (existencia inicial = cantidad producida, costo unitario =
  // costo total / cantidad). El lote generado queda "tageado" con
  // `origenOrdenId`. Si se borra la fecha de embotellado o se elimina la
  // orden, el lote auto-generado se quita — pero solo si todavía no tiene
  // movimientos propios (ventas ya registradas contra ese lote), para no
  // borrar historial real por accidente.
  function syncLoteParaOrden(lotes: LoteTerminado[], orden: OrdenProduccionRow): LoteTerminado[] {
    if (!orden.fechaEmbotellado) {
      return lotes.filter((l) => !(l.origenOrdenId === orden.id && l.movimientos.length === 0));
    }
    const costoUnitario = orden.cantidadProducida > 0 ? orden.costoTotal / orden.cantidadProducida : 0;
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
    const nuevoLote: LoteTerminado = {
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
    };
    return [...lotes, nuevoLote];
  }

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
    setInventarioMateriaPrima((prev) => syncConsumosParaOrden(prev, orden));
  }

  function deleteOrden(id: number) {
    setOrdenesProduccion((prev) => prev.filter((r) => r.id !== id));
    setProductosTerminados((prev) => prev.filter((l) => !(l.origenOrdenId === id && l.movimientos.length === 0)));
    setInventarioMateriaPrima((prev) => quitarConsumosDeOrden(prev, id));
  }

  // ── Órdenes de producción → Inventario de materia prima: al guardar una
  // orden, cada insumo que esté en el inventario genera un consumo (salida)
  // tageado con `origenOrdenId`, así se actualiza o se borra junto con la
  // orden en vez de duplicarse. Detalles:
  //  - Si la misma materia prima se repite en la sub-tabla de insumos, se
  //    suma en un solo consumo.
  //  - Se fecha con la fecha de maceración (cuando se consumen el alcohol y
  //    la fruta; envases y etiquetas en rigor salen al embotellar, pero no
  //    hay forma de distinguirlos sin agregar un tipo al catálogo).
  //  - Los insumos que todavía no se están trackeando en el inventario se
  //    ignoran, sin bloquear la orden (mismo criterio que una venta de un
  //    producto sin lote).
  //  - Si no alcanza el saldo no se bloquea: el saldo queda en negativo, que
  //    en pantalla se ve en rojo y avisa que falta cargar una compra.
  function quitarConsumosDeOrden(rows: InventarioMateriaPrimaRow[], ordenId: number): InventarioMateriaPrimaRow[] {
    return rows.map((r) =>
      r.movimientos.some((m) => m.origenOrdenId === ordenId)
        ? { ...r, movimientos: r.movimientos.filter((m) => m.origenOrdenId !== ordenId) }
        : r
    );
  }

  function syncConsumosParaOrden(rows: InventarioMateriaPrimaRow[], orden: OrdenProduccionRow): InventarioMateriaPrimaRow[] {
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
          {
            id: nextId(r.movimientos),
            fecha: orden.fechaMaceracion,
            tipo: "salida",
            cantidad: Math.round(cantidad * 100) / 100,
            origenOrdenId: orden.id,
          },
        ],
      };
    });
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
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore() debe usarse dentro de <StoreProvider>.");
  return ctx;
}
