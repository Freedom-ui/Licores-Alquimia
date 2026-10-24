// Conversión entre la base (Prisma) y el estado de la app (_dominio/acciones.ts).
// Solo se usa en el servidor.
//
// - cargarEstado: lee todo y lo devuelve con los tipos de cada sección. Los
//   nombres que se muestran (cliente y producto de una venta, producto de una
//   orden o de un lote del catálogo) salen de su catálogo, así un renombre se
//   ve en todos lados.
// - guardarCambios: compara el estado anterior con el nuevo y escribe solo
//   las diferencias (altas, cambios y bajas), en orden para respetar las FK.

import type { Prisma, PrismaClient } from "@/app/generated/prisma/client";
import type { ClienteRow } from "../clientes/data";
import type { ProveedorRow } from "../proveedores/data";
import type { MateriaPrimaRow, UnidadMedida } from "../materia-prima/data";
import { productoLabel, type Linea, type ProductoRow } from "../productos/data";
import type { OperacionRow, VendedorRow } from "../operaciones/data";
import type { OrdenProduccionRow } from "../ordenes-produccion/data";
import type { LoteTerminado } from "../productos-terminados/data";
import type { InventarioMateriaPrimaRow } from "../inventario-materia-prima/data";
import type { CompraRow, MedioPago } from "../trazabilidad/data";
import type { KardexMovimiento } from "@/app/components/data-table/kardex";
import type { Estado } from "../_dominio/acciones";

type Db = PrismaClient | Prisma.TransactionClient;

// null de la base → campo opcional ausente (como en los tipos de la app).
const opt = <T,>(v: T | null): T | undefined => (v === null ? undefined : v);

// Valores que llegan de los formularios genéricos (texto o número) → columna.
const txt = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const txtOpt = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const numOpt = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

// ── Lectura ─────────────────────────────────────────────────────────────────

type FilaMovimiento = {
  id: number;
  fecha: string | null;
  tipo: string;
  cantidad: number;
  puEntrada: number | null;
  cantidadSecundaria: number | null;
  origenOperacionId: number | null;
  origenOrdenId: number | null;
  origenCompraId: number | null;
};

function aMovimiento(m: FilaMovimiento): KardexMovimiento {
  return {
    id: m.id,
    fecha: m.fecha,
    tipo: m.tipo as KardexMovimiento["tipo"],
    cantidad: m.cantidad,
    puEntrada: opt(m.puEntrada),
    cantidadSecundaria: opt(m.cantidadSecundaria),
    origenOperacionId: opt(m.origenOperacionId),
    origenOrdenId: opt(m.origenOrdenId),
    origenCompraId: opt(m.origenCompraId),
  };
}

const porId = { orderBy: { id: "asc" as const } };

export async function cargarEstado(db: Db): Promise<Estado> {
  const [clientes, proveedores, materiaPrima, productos, vendedores, operaciones, ordenes, lotes, inventario, compras] = await Promise.all([
    db.cliente.findMany(porId),
    db.proveedor.findMany(porId),
    db.materiaPrima.findMany(porId),
    db.producto.findMany(porId),
    db.vendedor.findMany(porId),
    db.operacion.findMany({ ...porId, include: { cliente: true, producto: true } }),
    db.ordenProduccion.findMany({ ...porId, include: { producto: true, insumos: { orderBy: { posicion: "asc" } } } }),
    db.loteTerminado.findMany({ ...porId, include: { productoRef: true, movimientos: porId } }),
    db.inventarioMateriaPrima.findMany({ ...porId, include: { movimientos: porId } }),
    db.compra.findMany(porId),
  ]);

  return {
    clientes: clientes.map((c): ClienteRow => ({
      id: c.id,
      razonSocial: c.razonSocial,
      apellidoNombre: c.apellidoNombre,
      condicionIva: c.condicionIva,
      cuit: c.cuit,
      telefono: c.telefono,
      email: c.email,
      domicilio: c.domicilio,
      precioTradicional: c.precioTradicional,
      precioPremium: c.precioPremium,
    })),
    proveedores: proveedores.map((p): ProveedorRow => ({
      id: p.id,
      razonSocial: p.razonSocial,
      contacto: p.contacto,
      producto: p.producto,
      cuitCuil: p.cuitCuil,
      email: p.email,
      telefono: p.telefono,
      cbu: opt(p.cbu),
      alias: opt(p.alias),
    })),
    materiaPrima: materiaPrima.map(
      (m): MateriaPrimaRow => ({
        id: m.id,
        nombre: m.nombre,
        unidad: m.unidad as UnidadMedida,
        reposicion: m.compraPorOrden ? "Para cada orden" : "Con stock",
      })
    ),
    productos: productos.map((p): ProductoRow => ({
      id: p.id,
      nombre: p.nombre,
      formato: p.formato,
      codigoBarras: p.codigoBarras,
      precioUnitario: p.precioUnitario,
      linea: p.linea as Linea,
    })),
    vendedores: vendedores.map((v): VendedorRow => ({ id: v.id, nombre: v.nombre })),
    operaciones: operaciones.map((o): OperacionRow => ({
      id: o.id,
      fecha: o.fecha,
      clienteId: o.clienteId,
      cliente: o.cliente.razonSocial,
      vendedor: o.vendedor,
      cantidad: o.cantidad,
      productoId: o.productoId,
      descripcion: productoLabel(o.producto),
      canal: o.canal,
      condicion: o.condicion,
      pu: o.pu,
      subTotal: o.subTotal,
    })),
    ordenesProduccion: ordenes.map((o): OrdenProduccionRow => ({
      id: o.id,
      productoId: o.productoId,
      producto: o.producto.nombre,
      formato: o.producto.formato,
      fechaMaceracion: o.fechaMaceracion,
      fechaEmbotellado: o.fechaEmbotellado,
      responsable: o.responsable,
      cantidadProducida: o.cantidadProducida,
      costoTotal: o.costoTotal,
      insumos: o.insumos.map((i) => ({
        materiaPrima: i.materiaPrima,
        cantidad: i.cantidad,
        costoUnitario: i.costoUnitario,
        compraId: opt(i.compraId),
      })),
    })),
    productosTerminados: lotes.map((l): LoteTerminado => ({
      id: l.id,
      lote: l.lote,
      productoId: opt(l.productoId),
      // Los lotes de productos que ya no están en el catálogo conservan el nombre guardado.
      producto: l.productoRef?.nombre ?? l.producto,
      formato: l.productoRef?.formato ?? l.formato,
      existenciaInicial: l.existenciaInicial,
      costoUnitario: l.costoUnitario,
      fechaVencimiento: l.fechaVencimiento,
      origenOrdenId: opt(l.origenOrdenId),
      movimientos: l.movimientos.map(aMovimiento),
    })),
    inventarioMateriaPrima: inventario.map((r): InventarioMateriaPrimaRow => ({
      id: r.id,
      materiaPrimaId: r.materiaPrimaId,
      existenciaInicial: r.existenciaInicial,
      costoUnitario: r.costoUnitario,
      movimientos: r.movimientos.map(aMovimiento),
    })),
    compras: compras.map((c): CompraRow => ({
      id: c.id,
      fecha: c.fecha,
      materiaPrimaId: c.materiaPrimaId,
      cantidad: c.cantidad,
      costoUnitario: c.costoUnitario,
      cantidadCascara: opt(c.cantidadCascara),
      lote: c.lote,
      proveedorId: c.proveedorId,
      comprobanteForm: c.comprobanteForm,
      comprobanteTipo: c.comprobanteTipo,
      comprobanteNumero: c.comprobanteNumero,
      medioPago: c.medioPago as MedioPago,
      fechaPago: c.fechaPago,
    })),
  };
}

// ── Escritura ───────────────────────────────────────────────────────────────
// Cada tipo de la app → columnas de su tabla (sin los campos que se derivan
// al leer). Esas columnas son también lo que se compara para saber si cambió.

const filaCliente = (c: ClienteRow) => ({
  id: c.id,
  razonSocial: txt(c.razonSocial),
  apellidoNombre: txt(c.apellidoNombre),
  condicionIva: txt(c.condicionIva),
  cuit: txt(c.cuit),
  telefono: txt(c.telefono),
  email: txt(c.email),
  domicilio: txt(c.domicilio),
  precioTradicional: num(c.precioTradicional),
  precioPremium: numOpt(c.precioPremium),
});

const filaProveedor = (p: ProveedorRow) => ({
  id: p.id,
  razonSocial: txt(p.razonSocial),
  contacto: txt(p.contacto),
  producto: txt(p.producto),
  cuitCuil: txt(p.cuitCuil),
  email: txt(p.email),
  telefono: txt(p.telefono),
  cbu: txtOpt(p.cbu),
  alias: txtOpt(p.alias),
});

const filaMateriaPrima = (m: MateriaPrimaRow) => ({
  id: m.id,
  nombre: txt(m.nombre),
  unidad: txt(m.unidad),
  compraPorOrden: m.reposicion === "Para cada orden",
});

const filaVendedor = (v: VendedorRow) => ({ id: v.id, nombre: txt(v.nombre) });

const filaProducto = (p: ProductoRow) => ({
  id: p.id,
  nombre: txt(p.nombre),
  formato: txt(p.formato),
  codigoBarras: txt(p.codigoBarras),
  precioUnitario: num(p.precioUnitario),
  linea: txt(p.linea),
});

const filaOperacion = (o: OperacionRow) => ({
  id: o.id,
  fecha: o.fecha,
  clienteId: o.clienteId,
  vendedor: txt(o.vendedor),
  cantidad: num(o.cantidad),
  productoId: o.productoId,
  canal: txt(o.canal),
  condicion: txt(o.condicion),
  pu: num(o.pu),
  subTotal: num(o.subTotal),
});

const filaCompra = (c: CompraRow) => ({
  id: c.id,
  fecha: c.fecha,
  materiaPrimaId: c.materiaPrimaId,
  cantidad: num(c.cantidad),
  costoUnitario: num(c.costoUnitario),
  cantidadCascara: numOpt(c.cantidadCascara),
  lote: txt(c.lote),
  proveedorId: c.proveedorId,
  comprobanteForm: txt(c.comprobanteForm),
  comprobanteTipo: txt(c.comprobanteTipo),
  comprobanteNumero: txt(c.comprobanteNumero),
  medioPago: txt(c.medioPago),
  fechaPago: txtOpt(c.fechaPago),
});

const filaOrden = (o: OrdenProduccionRow) => ({
  id: o.id,
  productoId: o.productoId,
  fechaMaceracion: o.fechaMaceracion,
  fechaEmbotellado: txtOpt(o.fechaEmbotellado),
  responsable: txt(o.responsable),
  cantidadProducida: numOpt(o.cantidadProducida),
  costoTotal: num(o.costoTotal),
});

const filasInsumos = (o: OrdenProduccionRow) =>
  o.insumos.map((i, posicion) => ({
    ordenId: o.id,
    posicion,
    materiaPrima: txt(i.materiaPrima),
    cantidad: num(i.cantidad),
    costoUnitario: num(i.costoUnitario),
    compraId: i.compraId ?? null,
  }));

const filaLote = (l: LoteTerminado) => ({
  id: l.id,
  lote: num(l.lote),
  productoId: l.productoId ?? null,
  producto: txt(l.producto),
  formato: txt(l.formato),
  existenciaInicial: num(l.existenciaInicial),
  costoUnitario: num(l.costoUnitario),
  fechaVencimiento: txtOpt(l.fechaVencimiento),
  origenOrdenId: l.origenOrdenId ?? null,
});

const filaInventario = (r: InventarioMateriaPrimaRow) => ({
  id: r.id,
  materiaPrimaId: r.materiaPrimaId,
  existenciaInicial: num(r.existenciaInicial),
  costoUnitario: num(r.costoUnitario),
});

const filaMovimiento = (m: KardexMovimiento) => ({
  id: m.id,
  fecha: txtOpt(m.fecha),
  tipo: m.tipo,
  cantidad: num(m.cantidad),
  puEntrada: numOpt(m.puEntrada),
  cantidadSecundaria: numOpt(m.cantidadSecundaria),
  origenOperacionId: m.origenOperacionId ?? null,
  origenOrdenId: m.origenOrdenId ?? null,
  origenCompraId: m.origenCompraId ?? null,
});

type Diferencias<T> = { nuevos: T[]; cambiados: T[]; borrados: number[] };

/** Qué filas se agregaron, cuáles cambiaron (según `clave`) y cuáles se quitaron. */
function comparar<T extends { id: number }>(antes: T[], despues: T[], clave: (r: T) => unknown): Diferencias<T> {
  const previas = new Map(antes.map((r) => [r.id, JSON.stringify(clave(r))]));
  const actuales = new Set(despues.map((r) => r.id));
  return {
    nuevos: despues.filter((r) => !previas.has(r.id)),
    cambiados: despues.filter((r) => previas.has(r.id) && previas.get(r.id) !== JSON.stringify(clave(r))),
    borrados: antes.filter((r) => !actuales.has(r.id)).map((r) => r.id),
  };
}

/** Movimientos de kardex de cada lote / materia prima que sigue existiendo. */
function compararMovimientos<T extends { id: number; movimientos: KardexMovimiento[] }>(antes: T[], despues: T[]) {
  const previos = new Map(antes.map((r) => [r.id, r.movimientos]));
  return despues
    .filter((r) => previos.has(r.id))
    .map((r) => ({ padreId: r.id, ...comparar(previos.get(r.id)!, r.movimientos, filaMovimiento) }))
    .filter((d) => d.nuevos.length || d.cambiados.length || d.borrados.length);
}

/**
 * Borra todos los datos del negocio (no los usuarios ni las sesiones), en
 * orden para respetar las FK. Lo usan el seed y la importación de la planilla
 * antes de cargar un estado completo con guardarCambios(tx, ESTADO_VACIO, …).
 */
export async function borrarDatosNegocio(tx: Prisma.TransactionClient): Promise<void> {
  await tx.operacion.deleteMany();
  await tx.loteTerminado.deleteMany();
  await tx.inventarioMateriaPrima.deleteMany();
  await tx.ordenProduccion.deleteMany();
  await tx.compra.deleteMany();
  await tx.producto.deleteMany();
  await tx.materiaPrima.deleteMany();
  await tx.proveedor.deleteMany();
  await tx.cliente.deleteMany();
  await tx.vendedor.deleteMany();
}

export async function guardarCambios(tx: Prisma.TransactionClient, antes: Estado, despues: Estado): Promise<void> {
  const clientes = comparar(antes.clientes, despues.clientes, filaCliente);
  const proveedores = comparar(antes.proveedores, despues.proveedores, filaProveedor);
  const materias = comparar(antes.materiaPrima, despues.materiaPrima, filaMateriaPrima);
  const productos = comparar(antes.productos, despues.productos, filaProducto);
  const vendedores = comparar(antes.vendedores, despues.vendedores, filaVendedor);
  const operaciones = comparar(antes.operaciones, despues.operaciones, filaOperacion);
  const compras = comparar(antes.compras, despues.compras, filaCompra);
  const ordenes = comparar(antes.ordenesProduccion, despues.ordenesProduccion, (o) => [filaOrden(o), filasInsumos(o)]);
  const lotes = comparar(antes.productosTerminados, despues.productosTerminados, filaLote);
  const inventario = comparar(antes.inventarioMateriaPrima, despues.inventarioMateriaPrima, filaInventario);
  const movLotes = compararMovimientos(antes.productosTerminados, despues.productosTerminados);
  const movInventario = compararMovimientos(antes.inventarioMateriaPrima, despues.inventarioMateriaPrima);
  const enIds = (ids: number[]) => ({ where: { id: { in: ids } } });

  // 1. Bajas: primero lo que referencia a otras tablas, al final los catálogos.
  if (operaciones.borrados.length) await tx.operacion.deleteMany(enIds(operaciones.borrados));
  for (const d of movLotes) if (d.borrados.length) await tx.movimientoLote.deleteMany({ where: { loteId: d.padreId, id: { in: d.borrados } } });
  for (const d of movInventario)
    if (d.borrados.length) await tx.movimientoInventario.deleteMany({ where: { inventarioId: d.padreId, id: { in: d.borrados } } });
  if (lotes.borrados.length) await tx.loteTerminado.deleteMany(enIds(lotes.borrados));
  if (inventario.borrados.length) await tx.inventarioMateriaPrima.deleteMany(enIds(inventario.borrados));
  if (ordenes.borrados.length) await tx.ordenProduccion.deleteMany(enIds(ordenes.borrados));
  if (compras.borrados.length) await tx.compra.deleteMany(enIds(compras.borrados));
  if (productos.borrados.length) await tx.producto.deleteMany(enIds(productos.borrados));
  if (materias.borrados.length) await tx.materiaPrima.deleteMany(enIds(materias.borrados));
  if (proveedores.borrados.length) await tx.proveedor.deleteMany(enIds(proveedores.borrados));
  if (clientes.borrados.length) await tx.cliente.deleteMany(enIds(clientes.borrados));
  if (vendedores.borrados.length) await tx.vendedor.deleteMany(enIds(vendedores.borrados));

  // 2. Altas y cambios: primero los catálogos, después lo que los referencia.
  for (const r of clientes.nuevos) await tx.cliente.create({ data: filaCliente(r) });
  for (const r of clientes.cambiados) await tx.cliente.update({ where: { id: r.id }, data: filaCliente(r) });
  for (const r of proveedores.nuevos) await tx.proveedor.create({ data: filaProveedor(r) });
  for (const r of proveedores.cambiados) await tx.proveedor.update({ where: { id: r.id }, data: filaProveedor(r) });
  for (const r of materias.nuevos) await tx.materiaPrima.create({ data: filaMateriaPrima(r) });
  for (const r of materias.cambiados) await tx.materiaPrima.update({ where: { id: r.id }, data: filaMateriaPrima(r) });
  for (const r of productos.nuevos) await tx.producto.create({ data: filaProducto(r) });
  for (const r of productos.cambiados) await tx.producto.update({ where: { id: r.id }, data: filaProducto(r) });
  for (const r of vendedores.nuevos) await tx.vendedor.create({ data: filaVendedor(r) });
  for (const r of vendedores.cambiados) await tx.vendedor.update({ where: { id: r.id }, data: filaVendedor(r) });

  for (const r of compras.nuevos) await tx.compra.create({ data: filaCompra(r) });
  for (const r of compras.cambiados) await tx.compra.update({ where: { id: r.id }, data: filaCompra(r) });

  for (const o of ordenes.nuevos) {
    await tx.ordenProduccion.create({ data: filaOrden(o) });
    await tx.ordenInsumo.createMany({ data: filasInsumos(o) });
  }
  for (const o of ordenes.cambiados) {
    await tx.ordenProduccion.update({ where: { id: o.id }, data: filaOrden(o) });
    await tx.ordenInsumo.deleteMany({ where: { ordenId: o.id } });
    await tx.ordenInsumo.createMany({ data: filasInsumos(o) });
  }

  for (const l of lotes.nuevos) {
    await tx.loteTerminado.create({ data: filaLote(l) });
    await tx.movimientoLote.createMany({ data: l.movimientos.map((m) => ({ loteId: l.id, ...filaMovimiento(m) })) });
  }
  for (const l of lotes.cambiados) await tx.loteTerminado.update({ where: { id: l.id }, data: filaLote(l) });
  for (const d of movLotes) {
    if (d.nuevos.length) await tx.movimientoLote.createMany({ data: d.nuevos.map((m) => ({ loteId: d.padreId, ...filaMovimiento(m) })) });
    for (const m of d.cambiados) {
      await tx.movimientoLote.update({ where: { loteId_id: { loteId: d.padreId, id: m.id } }, data: filaMovimiento(m) });
    }
  }

  for (const r of inventario.nuevos) {
    await tx.inventarioMateriaPrima.create({ data: filaInventario(r) });
    await tx.movimientoInventario.createMany({ data: r.movimientos.map((m) => ({ inventarioId: r.id, ...filaMovimiento(m) })) });
  }
  for (const r of inventario.cambiados) await tx.inventarioMateriaPrima.update({ where: { id: r.id }, data: filaInventario(r) });
  for (const d of movInventario) {
    if (d.nuevos.length) {
      await tx.movimientoInventario.createMany({ data: d.nuevos.map((m) => ({ inventarioId: d.padreId, ...filaMovimiento(m) })) });
    }
    for (const m of d.cambiados) {
      await tx.movimientoInventario.update({ where: { inventarioId_id: { inventarioId: d.padreId, id: m.id } }, data: filaMovimiento(m) });
    }
  }

  for (const r of operaciones.nuevos) await tx.operacion.create({ data: filaOperacion(r) });
  for (const r of operaciones.cambiados) await tx.operacion.update({ where: { id: r.id }, data: filaOperacion(r) });
}
