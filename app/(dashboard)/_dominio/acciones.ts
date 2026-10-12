// Todo lo que se puede cambiar en la app, como acciones sobre el estado
// completo: `aplicar(estado, accion)` devuelve el estado nuevo (sin mutar el
// anterior) o lanza ErrorNegocio con un mensaje para el usuario.
//
// Es la misma lógica que antes vivía en el store del navegador; ahora la
// corre el servidor dentro de una transacción (ver _datos/acciones.ts) y
// guarda en la base solo lo que cambió.

import type { ClienteRow } from "../clientes/data";
import type { ProveedorRow } from "../proveedores/data";
import type { MateriaPrimaRow } from "../materia-prima/data";
import { productoLabel, type ProductoRow } from "../productos/data";
import type { OperacionRow } from "../operaciones/data";
import { calcularCostoTotal, type OrdenInsumo, type OrdenProduccionRow } from "../ordenes-produccion/data";
import type { LoteTerminado } from "../productos-terminados/data";
import type { InventarioMateriaPrimaRow } from "../inventario-materia-prima/data";
import { formatComprobante, type CompraInput, type CompraRow } from "../trazabilidad/data";
import type { KardexMovimiento } from "@/app/components/data-table/kardex";
import {
  nextId,
  quitarConsumosDeOrden,
  quitarEntradaDeCompra,
  quitarSalidaDeOperacion,
  syncConsumosParaOrden,
  syncEntradaParaCompra,
  syncLoteParaOrden,
  syncSalidaParaOperacion,
  usadoDeCompra,
} from "./sync";

export type Estado = {
  clientes: ClienteRow[];
  proveedores: ProveedorRow[];
  materiaPrima: MateriaPrimaRow[];
  productos: ProductoRow[];
  operaciones: OperacionRow[];
  ordenesProduccion: OrdenProduccionRow[];
  productosTerminados: LoteTerminado[];
  inventarioMateriaPrima: InventarioMateriaPrimaRow[];
  compras: CompraRow[];
};

export const ESTADO_VACIO: Estado = {
  clientes: [],
  proveedores: [],
  materiaPrima: [],
  productos: [],
  operaciones: [],
  ordenesProduccion: [],
  productosTerminados: [],
  inventarioMateriaPrima: [],
  compras: [],
};

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

type Valores = Record<string, string | number>;
type Movimiento = Omit<KardexMovimiento, "id">;

export type Accion =
  | { tipo: "addCliente"; v: Valores }
  | { tipo: "updateCliente"; id: number; v: Valores }
  | { tipo: "deleteCliente"; id: number }
  | { tipo: "addProveedor"; v: Valores }
  | { tipo: "updateProveedor"; id: number; v: Valores }
  | { tipo: "deleteProveedor"; id: number }
  | { tipo: "addMateriaPrima"; v: Valores }
  | { tipo: "updateMateriaPrima"; id: number; v: Valores }
  | { tipo: "deleteMateriaPrima"; id: number }
  | { tipo: "addProducto"; v: Valores }
  | { tipo: "updateProducto"; id: number; v: Valores }
  | { tipo: "deleteProducto"; id: number }
  | { tipo: "addOperacion"; v: OperacionInput }
  | { tipo: "updateOperacion"; id: number; v: OperacionInput }
  | { tipo: "deleteOperacion"; id: number }
  | { tipo: "saveOrden"; id: number | null; v: OrdenInput }
  | { tipo: "deleteOrden"; id: number }
  | { tipo: "addMovimiento"; loteId: number; movimiento: Movimiento }
  | { tipo: "updateLote"; loteId: number; v: LoteHeaderInput }
  | { tipo: "deleteLote"; loteId: number }
  | { tipo: "addInventarioMateriaPrima"; v: NuevaMateriaPrimaInventarioInput }
  | { tipo: "addInventarioMovimiento"; rowId: number; movimiento: Movimiento }
  | { tipo: "updateInventarioMateriaPrima"; rowId: number; v: InventarioMateriaPrimaHeaderInput }
  | { tipo: "deleteInventarioMateriaPrima"; rowId: number }
  | { tipo: "saveCompra"; id: number | null; v: CompraInput }
  | { tipo: "deleteCompra"; id: number };

/** Error esperable (una regla del negocio impide el cambio): su mensaje se le muestra al usuario. */
export class ErrorNegocio extends Error {}

const listaIds = (ids: number[]) => [...new Set(ids)].join(", ");

export function aplicar(e: Estado, a: Accion): Estado {
  switch (a.tipo) {
    // ── Clientes / Proveedores / Materia prima / Productos: CRUD simple ──
    case "addCliente":
      return { ...e, clientes: [...e.clientes, { id: nextId(e.clientes), ...a.v } as ClienteRow] };
    case "updateCliente":
      return { ...e, clientes: e.clientes.map((r) => (r.id === a.id ? ({ ...r, ...a.v } as ClienteRow) : r)) };
    case "deleteCliente": {
      // Las ventas guardan al cliente: borrarlo dejaría operaciones sin dueño.
      const ops = e.operaciones.filter((o) => o.clienteId === a.id).map((o) => o.id);
      if (ops.length > 0) {
        throw new ErrorNegocio(`Este cliente tiene operaciones cargadas (OP N° ${listaIds(ops)}). No se puede eliminar sin perder esas ventas.`);
      }
      return { ...e, clientes: e.clientes.filter((r) => r.id !== a.id) };
    }

    case "addProveedor":
      return { ...e, proveedores: [...e.proveedores, { id: nextId(e.proveedores), ...a.v } as ProveedorRow] };
    case "updateProveedor":
      return { ...e, proveedores: e.proveedores.map((r) => (r.id === a.id ? ({ ...r, ...a.v } as ProveedorRow) : r)) };
    case "deleteProveedor": {
      // El Libro de compras referencia al proveedor: borrarlo dejaría compras
      // sin origen, que es justo lo que la trazabilidad tiene que poder mostrar.
      const usadas = e.compras.filter((c) => c.proveedorId === a.id).map((c) => c.id);
      if (usadas.length > 0) {
        throw new ErrorNegocio(
          `Este proveedor figura en el Libro de compras (OP N° ${listaIds(usadas)}). No se puede eliminar sin perder la trazabilidad de esas compras.`
        );
      }
      return { ...e, proveedores: e.proveedores.filter((r) => r.id !== a.id) };
    }

    case "addMateriaPrima":
      return { ...e, materiaPrima: [...e.materiaPrima, { id: nextId(e.materiaPrima), ...a.v } as unknown as MateriaPrimaRow] };
    case "updateMateriaPrima": {
      const anterior = e.materiaPrima.find((r) => r.id === a.id);
      const materiaPrima = e.materiaPrima.map((r) => (r.id === a.id ? ({ ...r, ...a.v } as unknown as MateriaPrimaRow) : r));
      // Las órdenes guardan el insumo por nombre (texto): si se renombra acá hay
      // que renombrarlo también en ellas, si no una orden que se edite después
      // ya no encontraría su materia prima y dejaría de descontar del inventario.
      const nuevoNombre = typeof a.v.nombre === "string" ? a.v.nombre : undefined;
      if (!anterior || !nuevoNombre || nuevoNombre === anterior.nombre) return { ...e, materiaPrima };
      return {
        ...e,
        materiaPrima,
        ordenesProduccion: e.ordenesProduccion.map((o) =>
          o.insumos.some((i) => i.materiaPrima === anterior.nombre)
            ? { ...o, insumos: o.insumos.map((i) => (i.materiaPrima === anterior.nombre ? { ...i, materiaPrima: nuevoNombre } : i)) }
            : o
        ),
      };
    }
    case "deleteMateriaPrima":
      if (e.compras.some((c) => c.materiaPrimaId === a.id)) {
        throw new ErrorNegocio("Esta materia prima tiene compras en el Libro de compras (Trazabilidad). No se puede eliminar del catálogo.");
      }
      // Se lanza el error (DataTable lo muestra en el diálogo de confirmación)
      // en vez de borrar: sino la fila del inventario quedaba huérfana, sin
      // nombre ni unidad, con todo su historial de movimientos colgando.
      if (e.inventarioMateriaPrima.some((r) => r.materiaPrimaId === a.id)) {
        throw new ErrorNegocio(
          "Esta materia prima está en el Inventario de materia prima. Quitala de ahí primero para poder eliminarla del catálogo."
        );
      }
      return { ...e, materiaPrima: e.materiaPrima.filter((r) => r.id !== a.id) };

    case "addProducto":
      return { ...e, productos: [...e.productos, { id: nextId(e.productos), ...a.v } as ProductoRow] };
    case "updateProducto":
      return { ...e, productos: e.productos.map((r) => (r.id === a.id ? ({ ...r, ...a.v } as ProductoRow) : r)) };
    case "deleteProducto": {
      const ops = e.operaciones.filter((o) => o.productoId === a.id).map((o) => o.id);
      if (ops.length > 0) {
        throw new ErrorNegocio(`Este producto tiene ventas cargadas (OP N° ${listaIds(ops)}). No se puede eliminar del catálogo.`);
      }
      const ordenes = e.ordenesProduccion.filter((o) => o.productoId === a.id).map((o) => o.id);
      if (ordenes.length > 0) {
        throw new ErrorNegocio(`Este producto tiene órdenes de producción (N° ${listaIds(ordenes)}). No se puede eliminar del catálogo.`);
      }
      const lotes = e.productosTerminados.filter((l) => l.productoId === a.id).map((l) => l.lote);
      if (lotes.length > 0) {
        throw new ErrorNegocio(`Este producto tiene lotes en Productos terminados (lote ${listaIds(lotes)}). No se puede eliminar del catálogo.`);
      }
      return { ...e, productos: e.productos.filter((r) => r.id !== a.id) };
    }

    // ── Productos terminados: movimientos manuales + edición/baja de lote ──
    case "addMovimiento":
      return {
        ...e,
        productosTerminados: e.productosTerminados.map((l) =>
          l.id === a.loteId ? { ...l, movimientos: [...l.movimientos, { ...a.movimiento, id: nextId(l.movimientos) }] } : l
        ),
      };
    case "updateLote":
      return { ...e, productosTerminados: e.productosTerminados.map((l) => (l.id === a.loteId ? { ...l, ...a.v } : l)) };
    case "deleteLote":
      return { ...e, productosTerminados: e.productosTerminados.filter((l) => l.id !== a.loteId) };

    // ── Inventario de materia prima: movimientos manuales (ajustes, mermas,
    // stock previo) + alta/edición/baja. Las compras y los consumos de las
    // órdenes entran solos (ver sync.ts).
    case "addInventarioMateriaPrima":
      if (e.inventarioMateriaPrima.some((r) => r.materiaPrimaId === a.v.materiaPrimaId)) {
        throw new ErrorNegocio("Esta materia prima ya está en el inventario.");
      }
      return {
        ...e,
        inventarioMateriaPrima: [
          ...e.inventarioMateriaPrima,
          {
            id: nextId(e.inventarioMateriaPrima),
            materiaPrimaId: a.v.materiaPrimaId,
            existenciaInicial: a.v.existenciaInicial,
            costoUnitario: a.v.costoUnitario,
            movimientos: [],
          },
        ],
      };
    case "addInventarioMovimiento":
      return {
        ...e,
        inventarioMateriaPrima: e.inventarioMateriaPrima.map((r) =>
          r.id === a.rowId ? { ...r, movimientos: [...r.movimientos, { ...a.movimiento, id: nextId(r.movimientos) }] } : r
        ),
      };
    case "updateInventarioMateriaPrima":
      return { ...e, inventarioMateriaPrima: e.inventarioMateriaPrima.map((r) => (r.id === a.rowId ? { ...r, ...a.v } : r)) };
    case "deleteInventarioMateriaPrima": {
      const row = e.inventarioMateriaPrima.find((r) => r.id === a.rowId);
      if (row && e.compras.some((c) => c.materiaPrimaId === row.materiaPrimaId)) {
        throw new ErrorNegocio(
          "Esta materia prima tiene compras registradas en el Libro de compras (Trazabilidad): sus ingresos salen de ahí y no se pueden quitar del inventario."
        );
      }
      return { ...e, inventarioMateriaPrima: e.inventarioMateriaPrima.filter((r) => r.id !== a.rowId) };
    }

    // ── Operaciones (ventas): descuentan stock del lote que corresponda ──
    case "addOperacion":
    case "updateOperacion": {
      const id = a.tipo === "addOperacion" ? nextId(e.operaciones) : a.id;
      const cliente = e.clientes.find((c) => c.id === a.v.clienteId);
      const producto = e.productos.find((p) => p.id === a.v.productoId);
      if (!cliente) throw new ErrorNegocio("El cliente elegido ya no existe.");
      if (!producto) throw new ErrorNegocio("El producto elegido ya no existe.");
      const row: OperacionRow = {
        id,
        ...a.v,
        cliente: cliente.razonSocial,
        descripcion: productoLabel(producto),
        subTotal: a.v.cantidad * a.v.pu,
      };
      return {
        ...e,
        operaciones: a.tipo === "addOperacion" ? [...e.operaciones, row] : e.operaciones.map((r) => (r.id === id ? row : r)),
        productosTerminados: syncSalidaParaOperacion(e.productosTerminados, row),
      };
    }
    case "deleteOperacion":
      return {
        ...e,
        operaciones: e.operaciones.filter((r) => r.id !== a.id),
        productosTerminados: quitarSalidaDeOperacion(e.productosTerminados, a.id),
      };

    // ── Órdenes de producción ──
    case "saveOrden": {
      const producto = e.productos.find((p) => p.id === a.v.productoId);
      if (!producto) throw new ErrorNegocio("El producto elegido ya no existe.");
      const compraInexistente = a.v.insumos.find((i) => i.compraId !== undefined && !e.compras.some((c) => c.id === i.compraId));
      if (compraInexistente) throw new ErrorNegocio(`La compra OP N° ${compraInexistente.compraId} ya no existe en el Libro de compras.`);
      const orden: OrdenProduccionRow = {
        id: a.id ?? nextId(e.ordenesProduccion),
        productoId: a.v.productoId,
        producto: producto.nombre,
        formato: producto.formato,
        fechaMaceracion: a.v.fechaMaceracion,
        fechaEmbotellado: a.v.fechaEmbotellado,
        responsable: a.v.responsable,
        cantidadProducida: a.v.cantidadProducida,
        insumos: a.v.insumos,
        costoTotal: calcularCostoTotal(a.v.insumos),
      };
      return {
        ...e,
        ordenesProduccion: a.id === null ? [...e.ordenesProduccion, orden] : e.ordenesProduccion.map((r) => (r.id === a.id ? orden : r)),
        productosTerminados: syncLoteParaOrden(e.productosTerminados, orden),
        inventarioMateriaPrima: syncConsumosParaOrden(e.inventarioMateriaPrima, orden, e.materiaPrima),
      };
    }
    case "deleteOrden":
      return {
        ...e,
        ordenesProduccion: e.ordenesProduccion.filter((r) => r.id !== a.id),
        productosTerminados: e.productosTerminados.filter((l) => !(l.origenOrdenId === a.id && l.movimientos.length === 0)),
        inventarioMateriaPrima: quitarConsumosDeOrden(e.inventarioMateriaPrima, a.id),
      };

    // ── Libro de compras (Trazabilidad) ──
    case "saveCompra": {
      const { id, v } = a;
      if (!e.proveedores.some((p) => p.id === v.proveedorId)) throw new ErrorNegocio("El proveedor elegido ya no existe.");
      if (!e.materiaPrima.some((m) => m.id === v.materiaPrimaId)) throw new ErrorNegocio("La materia prima elegida ya no existe.");
      if (id !== null) {
        const anterior = e.compras.find((c) => c.id === id);
        const usado = usadoDeCompra(e.ordenesProduccion, id);
        const ordenesQueUsan = e.ordenesProduccion.filter((o) => o.insumos.some((i) => i.compraId === id)).map((o) => o.id);
        if (anterior && usado > 0 && anterior.materiaPrimaId !== v.materiaPrimaId) {
          throw new ErrorNegocio(`No se puede cambiar la materia prima: esta compra ya se usó en las órdenes N° ${listaIds(ordenesQueUsan)}.`);
        }
        if (v.cantidad + 1e-9 < usado) {
          throw new ErrorNegocio(`Las órdenes N° ${listaIds(ordenesQueUsan)} ya usan ${usado} de esta compra: la cantidad no puede ser menor.`);
        }
      }

      if (v.comprobanteNumero) {
        const duplicada = e.compras.find(
          (c) =>
            c.id !== id &&
            c.proveedorId === v.proveedorId &&
            c.materiaPrimaId === v.materiaPrimaId &&
            formatComprobante(c) === formatComprobante(v)
        );
        if (duplicada) {
          throw new ErrorNegocio(`Esta compra ya está cargada: la OP N° ${duplicada.id} tiene el mismo proveedor, comprobante y materia prima.`);
        }
      }

      const compra: CompraRow = { id: id ?? nextId(e.compras), ...v };
      return {
        ...e,
        compras: id === null ? [...e.compras, compra] : e.compras.map((c) => (c.id === id ? compra : c)),
        inventarioMateriaPrima: syncEntradaParaCompra(e.inventarioMateriaPrima, compra),
      };
    }
    case "deleteCompra": {
      const ordenesQueUsan = e.ordenesProduccion.filter((o) => o.insumos.some((i) => i.compraId === a.id)).map((o) => o.id);
      if (ordenesQueUsan.length > 0) {
        throw new ErrorNegocio(
          `Esta compra se usó en las órdenes de producción N° ${listaIds(ordenesQueUsan)}. Quitala de esas órdenes antes de eliminarla, para no cortar la trazabilidad.`
        );
      }
      return {
        ...e,
        compras: e.compras.filter((c) => c.id !== a.id),
        inventarioMateriaPrima: quitarEntradaDeCompra(e.inventarioMateriaPrima, a.id),
      };
    }
    default:
      throw new ErrorNegocio("Acción desconocida.");
  }
}
