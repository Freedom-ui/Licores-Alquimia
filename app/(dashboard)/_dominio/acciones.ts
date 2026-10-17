// Todo lo que se puede cambiar en la app, como acciones sobre el estado
// completo: `aplicar(estado, accion)` devuelve el estado nuevo (sin mutar el
// anterior) o lanza ErrorNegocio con un mensaje para el usuario.
//
// Es la misma lógica que antes vivía en el store del navegador; ahora la
// corre el servidor dentro de una transacción (ver _datos/acciones.ts) y
// guarda en la base solo lo que cambió.
//
// Lo que llega del navegador no es confiable (las server actions son
// públicas): cada acción valida sus datos con reglas.ts (las mismas reglas
// que usan los formularios) y guarda solo el valor limpio que devuelven, y
// todo id se busca antes de usarlo.

import type { ClienteRow } from "../clientes/data";
import type { ProveedorRow } from "../proveedores/data";
import type { MateriaPrimaRow } from "../materia-prima/data";
import { productoLabel, type ProductoRow } from "../productos/data";
import type { OperacionRow, VendedorRow } from "../operaciones/data";
import { calcularCostoTotal, type OrdenInsumo, type OrdenProduccionRow } from "../ordenes-produccion/data";
import type { LoteTerminado } from "../productos-terminados/data";
import type { InventarioMateriaPrimaRow } from "../inventario-materia-prima/data";
import type { CompraInput, CompraRow } from "../trazabilidad/data";
import type { KardexMovimiento } from "@/app/components/data-table/kardex";
import {
  leerId,
  validarAltaInventario,
  validarAltaLote,
  validarCliente,
  validarCompra,
  validarEncabezadoInventario,
  validarEncabezadoLote,
  validarMateriaPrima,
  validarMovimientoInventario,
  validarMovimientoLote,
  validarOperacion,
  validarOrden,
  validarProducto,
  validarProveedor,
  validarVendedor,
  type Resultado,
} from "./reglas";
import {
  nextId,
  quitarConsumosDeOrden,
  quitarEntradaDeCompra,
  quitarSalidaDeOperacion,
  syncConsumosParaOrden,
  syncEntradaParaCompra,
  syncLoteParaOrden,
  syncSalidaParaOperacion,
} from "./sync";

export type Estado = {
  clientes: ClienteRow[];
  proveedores: ProveedorRow[];
  materiaPrima: MateriaPrimaRow[];
  productos: ProductoRow[];
  vendedores: VendedorRow[];
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
  vendedores: [],
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

/** Lote con stock previo al sistema (no viene de una orden): lo usa la importación de la planilla. */
export type NuevoLoteInput = {
  productoId: number;
  lote: number;
  existenciaInicial: number;
  costoUnitario: number;
  fechaVencimiento: string | null;
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

/** Valores de un formulario de catálogo: se validan y limpian en reglas.ts. */
type Valores = Record<string, unknown>;
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
  | { tipo: "addVendedor"; v: Valores }
  | { tipo: "addOperacion"; v: OperacionInput }
  | { tipo: "updateOperacion"; id: number; v: OperacionInput }
  | { tipo: "deleteOperacion"; id: number }
  | { tipo: "saveOrden"; id: number | null; v: OrdenInput }
  | { tipo: "deleteOrden"; id: number }
  | { tipo: "addLote"; v: Valores }
  | { tipo: "addMovimiento"; loteId: number; movimiento: Movimiento }
  | { tipo: "updateLote"; loteId: number; v: LoteHeaderInput }
  | { tipo: "deleteLote"; loteId: number }
  | { tipo: "addInventarioMateriaPrima"; v: NuevaMateriaPrimaInventarioInput }
  | { tipo: "addInventarioMovimiento"; rowId: number; movimiento: Movimiento }
  | { tipo: "updateInventarioMateriaPrima"; rowId: number; v: InventarioMateriaPrimaHeaderInput }
  | { tipo: "deleteInventarioMateriaPrima"; rowId: number }
  | { tipo: "saveCompra"; id: number | null; v: CompraInput }
  | { tipo: "deleteCompra"; id: number };

/**
 * Error esperable (un dato inválido o una regla del negocio impide el
 * cambio): su mensaje se le muestra al usuario. `campo` dice en qué campo del
 * formulario mostrarlo; sin campo va en el cartel general.
 */
export class ErrorNegocio extends Error {
  constructor(
    mensaje: string,
    readonly campo?: string
  ) {
    super(mensaje);
  }
}

const listaIds = (ids: number[]) => [...new Set(ids)].join(", ");

/** El valor validado, o ErrorNegocio con el primer error (y su campo). */
function exigir<T>(r: Resultado<T>): T {
  if (r.ok) return r.valor;
  const [campo, mensaje] = Object.entries(r.errores)[0];
  throw new ErrorNegocio(mensaje, campo);
}

/** Busca por id lo que llega del navegador (puede ser cualquier cosa); si no existe, error. */
function buscar<T extends { id: number }>(rows: T[], id: unknown): T {
  const n = leerId(id);
  const row = n === null ? undefined : rows.find((r) => r.id === n);
  if (!row) throw new ErrorNegocio("Ese registro ya no existe (puede que se haya borrado en otra pestaña). Recargá la página.");
  return row;
}

/** null para un alta, o el id de un registro que existe. */
function idEdicion<T extends { id: number }>(rows: T[], id: unknown): number | null {
  return id === null ? null : buscar(rows, id).id;
}

export function aplicar(e: Estado, a: Accion): Estado {
  switch (a.tipo) {
    // ── Clientes / Proveedores / Materia prima / Productos: CRUD simple ──
    case "addCliente": {
      const v = exigir(validarCliente(a.v, e, null));
      return { ...e, clientes: [...e.clientes, { id: nextId(e.clientes), ...v }] };
    }
    case "updateCliente": {
      const { id } = buscar(e.clientes, a.id);
      const v = exigir(validarCliente(a.v, e, id));
      return { ...e, clientes: e.clientes.map((r) => (r.id === id ? { id, ...v } : r)) };
    }
    case "deleteCliente": {
      const { id } = buscar(e.clientes, a.id);
      // Las ventas guardan al cliente: borrarlo dejaría operaciones sin dueño.
      const ops = e.operaciones.filter((o) => o.clienteId === id).map((o) => o.id);
      if (ops.length > 0) {
        throw new ErrorNegocio(`Este cliente tiene operaciones cargadas (OP N° ${listaIds(ops)}). No se puede eliminar sin perder esas ventas.`);
      }
      return { ...e, clientes: e.clientes.filter((r) => r.id !== id) };
    }

    case "addProveedor": {
      const v = exigir(validarProveedor(a.v, e, null));
      return { ...e, proveedores: [...e.proveedores, { id: nextId(e.proveedores), ...v }] };
    }
    case "updateProveedor": {
      const { id } = buscar(e.proveedores, a.id);
      const v = exigir(validarProveedor(a.v, e, id));
      return { ...e, proveedores: e.proveedores.map((r) => (r.id === id ? { id, ...v } : r)) };
    }
    case "deleteProveedor": {
      const { id } = buscar(e.proveedores, a.id);
      // El Libro de compras referencia al proveedor: borrarlo dejaría compras
      // sin origen, que es justo lo que la trazabilidad tiene que poder mostrar.
      const usadas = e.compras.filter((c) => c.proveedorId === id).map((c) => c.id);
      if (usadas.length > 0) {
        throw new ErrorNegocio(
          `Este proveedor figura en el Libro de compras (OP N° ${listaIds(usadas)}). No se puede eliminar sin perder la trazabilidad de esas compras.`
        );
      }
      return { ...e, proveedores: e.proveedores.filter((r) => r.id !== id) };
    }

    case "addMateriaPrima": {
      const v = exigir(validarMateriaPrima(a.v, e, null));
      return { ...e, materiaPrima: [...e.materiaPrima, { id: nextId(e.materiaPrima), ...v }] };
    }
    case "updateMateriaPrima": {
      const anterior = buscar(e.materiaPrima, a.id);
      const v = exigir(validarMateriaPrima(a.v, e, anterior.id));
      const materiaPrima = e.materiaPrima.map((r) => (r.id === anterior.id ? { id: anterior.id, ...v } : r));
      // Las órdenes guardan el insumo por nombre (texto): si se renombra acá hay
      // que renombrarlo también en ellas, si no una orden que se edite después
      // ya no encontraría su materia prima y dejaría de descontar del inventario.
      if (v.nombre === anterior.nombre) return { ...e, materiaPrima };
      return {
        ...e,
        materiaPrima,
        ordenesProduccion: e.ordenesProduccion.map((o) =>
          o.insumos.some((i) => i.materiaPrima === anterior.nombre)
            ? { ...o, insumos: o.insumos.map((i) => (i.materiaPrima === anterior.nombre ? { ...i, materiaPrima: v.nombre } : i)) }
            : o
        ),
      };
    }
    case "deleteMateriaPrima": {
      const { id } = buscar(e.materiaPrima, a.id);
      if (e.compras.some((c) => c.materiaPrimaId === id)) {
        throw new ErrorNegocio("Esta materia prima tiene compras en el Libro de compras (Trazabilidad). No se puede eliminar del catálogo.");
      }
      // Se lanza el error (DataTable lo muestra en el diálogo de confirmación)
      // en vez de borrar: sino la fila del inventario quedaba huérfana, sin
      // nombre ni unidad, con todo su historial de movimientos colgando.
      if (e.inventarioMateriaPrima.some((r) => r.materiaPrimaId === id)) {
        throw new ErrorNegocio(
          "Esta materia prima está en el Inventario de materia prima. Quitala de ahí primero para poder eliminarla del catálogo."
        );
      }
      return { ...e, materiaPrima: e.materiaPrima.filter((r) => r.id !== id) };
    }

    case "addProducto": {
      const v = exigir(validarProducto(a.v, e, null));
      return { ...e, productos: [...e.productos, { id: nextId(e.productos), ...v }] };
    }
    case "updateProducto": {
      const { id } = buscar(e.productos, a.id);
      const v = exigir(validarProducto(a.v, e, id));
      return { ...e, productos: e.productos.map((r) => (r.id === id ? { id, ...v } : r)) };
    }
    case "deleteProducto": {
      const { id } = buscar(e.productos, a.id);
      const ops = e.operaciones.filter((o) => o.productoId === id).map((o) => o.id);
      if (ops.length > 0) {
        throw new ErrorNegocio(`Este producto tiene ventas cargadas (OP N° ${listaIds(ops)}). No se puede eliminar del catálogo.`);
      }
      const ordenes = e.ordenesProduccion.filter((o) => o.productoId === id).map((o) => o.id);
      if (ordenes.length > 0) {
        throw new ErrorNegocio(`Este producto tiene órdenes de producción (N° ${listaIds(ordenes)}). No se puede eliminar del catálogo.`);
      }
      const lotes = e.productosTerminados.filter((l) => l.productoId === id).map((l) => l.lote);
      if (lotes.length > 0) {
        throw new ErrorNegocio(`Este producto tiene lotes en Productos terminados (lote ${listaIds(lotes)}). No se puede eliminar del catálogo.`);
      }
      return { ...e, productos: e.productos.filter((r) => r.id !== id) };
    }

    case "addVendedor": {
      const v = exigir(validarVendedor(a.v, e, null));
      return { ...e, vendedores: [...e.vendedores, { id: nextId(e.vendedores), ...v }] };
    }

    // ── Productos terminados: lotes previos al sistema, movimientos manuales + edición/baja de lote ──
    case "addLote": {
      const v = exigir(validarAltaLote(a.v, e));
      const producto = e.productos.find((p) => p.id === v.productoId)!;
      const lote: LoteTerminado = {
        id: nextId(e.productosTerminados),
        lote: v.lote,
        productoId: v.productoId,
        producto: producto.nombre,
        formato: producto.formato,
        existenciaInicial: v.existenciaInicial,
        costoUnitario: v.costoUnitario,
        fechaVencimiento: v.fechaVencimiento,
        movimientos: [],
      };
      return { ...e, productosTerminados: [...e.productosTerminados, lote] };
    }
    case "addMovimiento": {
      const lote = buscar(e.productosTerminados, a.loteId);
      const movimiento = exigir(validarMovimientoLote(a.movimiento, lote, e));
      return {
        ...e,
        productosTerminados: e.productosTerminados.map((l) =>
          l.id === lote.id ? { ...l, movimientos: [...l.movimientos, { ...movimiento, id: nextId(l.movimientos) }] } : l
        ),
      };
    }
    case "updateLote": {
      const lote = buscar(e.productosTerminados, a.loteId);
      const v = exigir(validarEncabezadoLote(a.v, lote, e));
      return { ...e, productosTerminados: e.productosTerminados.map((l) => (l.id === lote.id ? { ...l, ...v } : l)) };
    }
    case "deleteLote": {
      const lote = buscar(e.productosTerminados, a.loteId);
      return { ...e, productosTerminados: e.productosTerminados.filter((l) => l.id !== lote.id) };
    }

    // ── Inventario de materia prima: movimientos manuales (ajustes, mermas,
    // stock previo) + alta/edición/baja. Las compras y los consumos de las
    // órdenes entran solos (ver sync.ts).
    case "addInventarioMateriaPrima": {
      const v = exigir(validarAltaInventario(a.v, e));
      return {
        ...e,
        inventarioMateriaPrima: [
          ...e.inventarioMateriaPrima,
          {
            id: nextId(e.inventarioMateriaPrima),
            materiaPrimaId: v.materiaPrimaId,
            existenciaInicial: v.existenciaInicial,
            costoUnitario: v.costoUnitario,
            movimientos: [],
          },
        ],
      };
    }
    case "addInventarioMovimiento": {
      const row = buscar(e.inventarioMateriaPrima, a.rowId);
      const movimiento = exigir(validarMovimientoInventario(a.movimiento, row, e));
      return {
        ...e,
        inventarioMateriaPrima: e.inventarioMateriaPrima.map((r) =>
          r.id === row.id ? { ...r, movimientos: [...r.movimientos, { ...movimiento, id: nextId(r.movimientos) }] } : r
        ),
      };
    }
    case "updateInventarioMateriaPrima": {
      const row = buscar(e.inventarioMateriaPrima, a.rowId);
      const v = exigir(validarEncabezadoInventario(a.v, row, e));
      return { ...e, inventarioMateriaPrima: e.inventarioMateriaPrima.map((r) => (r.id === row.id ? { ...r, ...v } : r)) };
    }
    case "deleteInventarioMateriaPrima": {
      const row = buscar(e.inventarioMateriaPrima, a.rowId);
      if (e.compras.some((c) => c.materiaPrimaId === row.materiaPrimaId)) {
        throw new ErrorNegocio(
          "Esta materia prima tiene compras registradas en el Libro de compras (Trazabilidad): sus ingresos salen de ahí y no se pueden quitar del inventario."
        );
      }
      return { ...e, inventarioMateriaPrima: e.inventarioMateriaPrima.filter((r) => r.id !== row.id) };
    }

    // ── Operaciones (ventas): descuentan stock del lote que corresponda ──
    case "addOperacion":
    case "updateOperacion": {
      // Vender más de lo que hay en stock se permite (la pantalla avisa y pide
      // confirmar): el lote queda en negativo hasta que se embotelle.
      const id = a.tipo === "addOperacion" ? nextId(e.operaciones) : buscar(e.operaciones, a.id).id;
      const v = exigir(validarOperacion(a.v, e));
      const cliente = e.clientes.find((c) => c.id === v.clienteId)!;
      const producto = e.productos.find((p) => p.id === v.productoId)!;
      const row: OperacionRow = {
        id,
        ...v,
        cliente: cliente.razonSocial,
        descripcion: productoLabel(producto),
        subTotal: v.cantidad * v.pu,
      };
      return {
        ...e,
        operaciones: a.tipo === "addOperacion" ? [...e.operaciones, row] : e.operaciones.map((r) => (r.id === id ? row : r)),
        productosTerminados: syncSalidaParaOperacion(e.productosTerminados, row),
      };
    }
    case "deleteOperacion": {
      const { id } = buscar(e.operaciones, a.id);
      return {
        ...e,
        operaciones: e.operaciones.filter((r) => r.id !== id),
        productosTerminados: quitarSalidaDeOperacion(e.productosTerminados, id),
      };
    }

    // ── Órdenes de producción ──
    case "saveOrden": {
      const id = idEdicion(e.ordenesProduccion, a.id);
      const v = exigir(validarOrden(a.v, e, id));
      const producto = e.productos.find((p) => p.id === v.productoId)!;
      const orden: OrdenProduccionRow = {
        id: id ?? nextId(e.ordenesProduccion),
        productoId: v.productoId,
        producto: producto.nombre,
        formato: producto.formato,
        fechaMaceracion: v.fechaMaceracion,
        fechaEmbotellado: v.fechaEmbotellado,
        responsable: v.responsable,
        cantidadProducida: v.cantidadProducida,
        insumos: v.insumos,
        costoTotal: calcularCostoTotal(v.insumos),
      };
      return {
        ...e,
        ordenesProduccion: id === null ? [...e.ordenesProduccion, orden] : e.ordenesProduccion.map((r) => (r.id === id ? orden : r)),
        productosTerminados: syncLoteParaOrden(e.productosTerminados, orden),
        inventarioMateriaPrima: syncConsumosParaOrden(e.inventarioMateriaPrima, orden, e.materiaPrima),
      };
    }
    case "deleteOrden": {
      const { id } = buscar(e.ordenesProduccion, a.id);
      return {
        ...e,
        ordenesProduccion: e.ordenesProduccion.filter((r) => r.id !== id),
        productosTerminados: e.productosTerminados.filter((l) => !(l.origenOrdenId === id && l.movimientos.length === 0)),
        inventarioMateriaPrima: quitarConsumosDeOrden(e.inventarioMateriaPrima, id),
      };
    }

    // ── Libro de compras (Trazabilidad) ──
    case "saveCompra": {
      // Datos, duplicados y coherencia con las órdenes que ya la usan: validarCompra.
      const id = idEdicion(e.compras, a.id);
      const v = exigir(validarCompra(a.v, e, id));
      const compra: CompraRow = { id: id ?? nextId(e.compras), ...v };
      return {
        ...e,
        compras: id === null ? [...e.compras, compra] : e.compras.map((c) => (c.id === id ? compra : c)),
        inventarioMateriaPrima: syncEntradaParaCompra(e.inventarioMateriaPrima, compra),
      };
    }
    case "deleteCompra": {
      const { id } = buscar(e.compras, a.id);
      const ordenesQueUsan = e.ordenesProduccion.filter((o) => o.insumos.some((i) => i.compraId === id)).map((o) => o.id);
      if (ordenesQueUsan.length > 0) {
        throw new ErrorNegocio(
          `Esta compra se usó en las órdenes de producción N° ${listaIds(ordenesQueUsan)}. Quitala de esas órdenes antes de eliminarla, para no cortar la trazabilidad.`
        );
      }
      return {
        ...e,
        compras: e.compras.filter((c) => c.id !== id),
        inventarioMateriaPrima: quitarEntradaDeCompra(e.inventarioMateriaPrima, id),
      };
    }
    default:
      throw new ErrorNegocio("Acción desconocida.");
  }
}
