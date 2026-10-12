"use client";

/**
 * Store compartido de todo el dashboard. Varias secciones se referencian
 * entre sí:
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
 * Los datos viven en la base (SQLite vía Prisma). El layout los lee al
 * entrar y los pasa como `inicial`; cada cambio va al servidor
 * (_datos/acciones.ts), que lo valida, aplica las sincronizaciones y lo
 * guarda en una transacción, y devuelve el estado actualizado. Las
 * funciones de `useStore()` devuelven una promesa: si el cambio no se puede
 * hacer, la promesa falla con un Error cuyo mensaje es para el usuario.
 */

import { createContext, useContext, useState, type ReactNode } from "react";
import type { KardexMovimiento } from "@/app/components/data-table/kardex";
import type { CompraInput } from "./trazabilidad/data";
import type {
  Accion,
  Estado,
  InventarioMateriaPrimaHeaderInput,
  LoteHeaderInput,
  NuevaMateriaPrimaInventarioInput,
  OperacionInput,
  OrdenInput,
} from "./_dominio/acciones";
import { ejecutar } from "./_datos/acciones";

export type {
  InventarioMateriaPrimaHeaderInput,
  LoteHeaderInput,
  NuevaMateriaPrimaInventarioInput,
  OperacionInput,
  OrdenInput,
} from "./_dominio/acciones";
export { usadoDeCompra } from "./_dominio/sync";

type Valores = Record<string, string | number>;
type Movimiento = Omit<KardexMovimiento, "id">;

type Store = Estado & {
  addCliente: (v: Valores) => Promise<void>;
  updateCliente: (id: number, v: Valores) => Promise<void>;
  deleteCliente: (id: number) => Promise<void>;

  addProveedor: (v: Valores) => Promise<void>;
  updateProveedor: (id: number, v: Valores) => Promise<void>;
  deleteProveedor: (id: number) => Promise<void>;

  addMateriaPrima: (v: Valores) => Promise<void>;
  updateMateriaPrima: (id: number, v: Valores) => Promise<void>;
  deleteMateriaPrima: (id: number) => Promise<void>;

  addProducto: (v: Valores) => Promise<void>;
  updateProducto: (id: number, v: Valores) => Promise<void>;
  deleteProducto: (id: number) => Promise<void>;

  addOperacion: (v: OperacionInput) => Promise<void>;
  updateOperacion: (id: number, v: OperacionInput) => Promise<void>;
  deleteOperacion: (id: number) => Promise<void>;

  saveOrden: (id: number | null, v: OrdenInput) => Promise<void>;
  deleteOrden: (id: number) => Promise<void>;

  addMovimiento: (loteId: number, movimiento: Movimiento) => Promise<void>;
  updateLote: (loteId: number, v: LoteHeaderInput) => Promise<void>;
  deleteLote: (loteId: number) => Promise<void>;

  addInventarioMateriaPrima: (v: NuevaMateriaPrimaInventarioInput) => Promise<void>;
  addInventarioMovimiento: (rowId: number, movimiento: Movimiento) => Promise<void>;
  updateInventarioMateriaPrima: (rowId: number, v: InventarioMateriaPrimaHeaderInput) => Promise<void>;
  deleteInventarioMateriaPrima: (rowId: number) => Promise<void>;

  /** Alta (id null) o edición. */
  saveCompra: (id: number | null, v: CompraInput) => Promise<void>;
  deleteCompra: (id: number) => Promise<void>;
};

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ inicial, children }: { inicial: Estado; children: ReactNode }) {
  const [estado, setEstado] = useState<Estado>(inicial);

  async function run(accion: Accion) {
    const r = await ejecutar(accion);
    if (!r.ok) throw new Error(r.error);
    setEstado(r.estado);
  }

  const value: Store = {
    ...estado,
    addCliente: (v) => run({ tipo: "addCliente", v }),
    updateCliente: (id, v) => run({ tipo: "updateCliente", id, v }),
    deleteCliente: (id) => run({ tipo: "deleteCliente", id }),
    addProveedor: (v) => run({ tipo: "addProveedor", v }),
    updateProveedor: (id, v) => run({ tipo: "updateProveedor", id, v }),
    deleteProveedor: (id) => run({ tipo: "deleteProveedor", id }),
    addMateriaPrima: (v) => run({ tipo: "addMateriaPrima", v }),
    updateMateriaPrima: (id, v) => run({ tipo: "updateMateriaPrima", id, v }),
    deleteMateriaPrima: (id) => run({ tipo: "deleteMateriaPrima", id }),
    addProducto: (v) => run({ tipo: "addProducto", v }),
    updateProducto: (id, v) => run({ tipo: "updateProducto", id, v }),
    deleteProducto: (id) => run({ tipo: "deleteProducto", id }),
    addOperacion: (v) => run({ tipo: "addOperacion", v }),
    updateOperacion: (id, v) => run({ tipo: "updateOperacion", id, v }),
    deleteOperacion: (id) => run({ tipo: "deleteOperacion", id }),
    saveOrden: (id, v) => run({ tipo: "saveOrden", id, v }),
    deleteOrden: (id) => run({ tipo: "deleteOrden", id }),
    addMovimiento: (loteId, movimiento) => run({ tipo: "addMovimiento", loteId, movimiento }),
    updateLote: (loteId, v) => run({ tipo: "updateLote", loteId, v }),
    deleteLote: (loteId) => run({ tipo: "deleteLote", loteId }),
    addInventarioMateriaPrima: (v) => run({ tipo: "addInventarioMateriaPrima", v }),
    addInventarioMovimiento: (rowId, movimiento) => run({ tipo: "addInventarioMovimiento", rowId, movimiento }),
    updateInventarioMateriaPrima: (rowId, v) => run({ tipo: "updateInventarioMateriaPrima", rowId, v }),
    deleteInventarioMateriaPrima: (rowId) => run({ tipo: "deleteInventarioMateriaPrima", rowId }),
    saveCompra: (id, v) => run({ tipo: "saveCompra", id, v }),
    deleteCompra: (id) => run({ tipo: "deleteCompra", id }),
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore() debe usarse dentro de <StoreProvider>.");
  return ctx;
}
