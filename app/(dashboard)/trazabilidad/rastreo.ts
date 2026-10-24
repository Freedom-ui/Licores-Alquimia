// Rastreo de punta a punta, en las dos direcciones:
//
//  - Hacia adelante (rastrearLoteProveedor): de un lote de proveedor a las
//    órdenes que lo usaron, los lotes de licor que salieron de ellas y los
//    clientes que los recibieron. Es lo que se necesita si un proveedor avisa
//    de un problema con un lote (retiro de producto).
//  - Hacia atrás (fichaDeLote): de un lote de licor a su elaboración (fecha,
//    responsable, unidades — lo que pide el punto 6.7 del reglamento PUPAA) y
//    a cada materia prima con su proveedor, lote y comprobante de compra.
//
// No estima nada: usa el vínculo que se registra en cada orden
// (OrdenInsumo.compraId) y las ventas tageadas contra cada lote.
//
// Retiro de lote (retiroDeLote / retiroDeLoteProveedor): lo que hace falta
// para sacar un lote del mercado — los lotes afectados con su stock a
// inmovilizar y cada cliente que lo recibió, con sus datos de contacto.

import type { ClienteRow } from "../clientes/data";
import type { ProveedorRow } from "../proveedores/data";
import type { MateriaPrimaRow } from "../materia-prima/data";
import type { OrdenProduccionRow } from "../ordenes-produccion/data";
import type { LoteTerminado } from "../productos-terminados/data";
import type { OperacionRow } from "../operaciones/data";
import { stockDeCompra, type CompraRow } from "./data";

export type TrazaContexto = {
  compras: CompraRow[];
  proveedores: ProveedorRow[];
  materiaPrima: MateriaPrimaRow[];
  ordenes: OrdenProduccionRow[];
  lotes: LoteTerminado[];
  operaciones: OperacionRow[];
  clientes: ClienteRow[];
};

export type VentaTraza = { operacionId: number; fecha: string; clienteId: number; cliente: string; cantidad: number };

export type DestinoLote = {
  ventas: VentaTraza[];
  /** Salidas cargadas a mano en Productos terminados (mermas, degustaciones…), sin cliente. */
  otrasSalidas: number;
  enStock: number;
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function destinoDeLote(lote: LoteTerminado, operaciones: OperacionRow[]): DestinoLote {
  const ventas: VentaTraza[] = [];
  let otrasSalidas = 0;
  let saldo = lote.existenciaInicial;
  for (const m of lote.movimientos) {
    if (m.tipo === "entrada") {
      saldo += m.cantidad;
      continue;
    }
    saldo -= m.cantidad;
    const op = m.origenOperacionId ? operaciones.find((o) => o.id === m.origenOperacionId) : undefined;
    if (op) ventas.push({ operacionId: op.id, fecha: m.fecha ?? op.fecha, clienteId: op.clienteId, cliente: op.cliente, cantidad: m.cantidad });
    else otrasSalidas += m.cantidad;
  }
  ventas.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.operacionId - b.operacionId));
  return { ventas, otrasSalidas: round2(otrasSalidas), enStock: round2(saldo) };
}

export type ClienteTraza = { clienteId: number; cliente: string; cantidad: number };

/** Total recibido por cliente (para la lista de a quién avisar ante un retiro). Agrupa por cliente, no por nombre. */
export function clientesDe(ventas: VentaTraza[]): ClienteTraza[] {
  const porCliente = new Map<number, ClienteTraza>();
  for (const v of ventas) {
    const c = porCliente.get(v.clienteId) ?? { clienteId: v.clienteId, cliente: v.cliente, cantidad: 0 };
    c.cantidad += v.cantidad;
    porCliente.set(v.clienteId, c);
  }
  return [...porCliente.values()]
    .map((c) => ({ ...c, cantidad: round2(c.cantidad) }))
    .sort((a, b) => b.cantidad - a.cantidad || a.cliente.localeCompare(b.cliente, "es") || a.clienteId - b.clienteId);
}

export type ContactoRetiro = ClienteTraza & {
  contacto: string;
  cuit: string;
  telefono: string;
  email: string;
  domicilio: string;
};

/** Cada cliente que recibió esas ventas, con sus datos de contacto y las unidades que recibió. */
export function contactosDeRetiro(ventas: VentaTraza[], clientes: ClienteRow[]): ContactoRetiro[] {
  return clientesDe(ventas).map((c) => {
    const datos = clientes.find((x) => x.id === c.clienteId);
    return {
      ...c,
      contacto: datos?.apellidoNombre ?? "",
      cuit: datos?.cuit ?? "",
      telefono: datos?.telefono ?? "",
      email: datos?.email ?? "",
      domicilio: datos?.domicilio ?? "",
    };
  });
}

// ── Hacia adelante ──────────────────────────────────────────────────────────

export type OrdenAfectada = {
  orden: OrdenProduccionRow;
  /** Cuánto de este lote de proveedor usó la orden. */
  cantidadUsada: number;
  /** Lote de producto terminado que salió de la orden (null = todavía sin embotellar). */
  lote: LoteTerminado | null;
  destino: DestinoLote | null;
};

export type RastreoLoteProveedor = {
  /** Compras incluidas: todas las de ese mismo lote y proveedor (un lote puede comprarse en varias veces). */
  compras: CompraRow[];
  materiaPrima: MateriaPrimaRow | undefined;
  proveedor: ProveedorRow | undefined;
  totalComprado: number;
  totalUsado: number;
  ordenes: OrdenAfectada[];
  clientes: ClienteTraza[];
  contactos: ContactoRetiro[];
};

export function rastrearLoteProveedor(compra: CompraRow, ctx: TrazaContexto): RastreoLoteProveedor {
  const compras = compra.lote
    ? ctx.compras
        .filter(
          (c) => c.lote === compra.lote && c.materiaPrimaId === compra.materiaPrimaId && c.proveedorId === compra.proveedorId
        )
        .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.id - b.id))
    : [compra];
  const ids = new Set(compras.map((c) => c.id));

  const ordenes: OrdenAfectada[] = [];
  for (const orden of ctx.ordenes) {
    const cantidadUsada = orden.insumos.reduce(
      (sum, i) => (i.compraId !== undefined && ids.has(i.compraId) ? sum + i.cantidad : sum),
      0
    );
    if (cantidadUsada <= 0) continue;
    const lote = ctx.lotes.find((l) => l.origenOrdenId === orden.id) ?? null;
    ordenes.push({
      orden,
      cantidadUsada: round2(cantidadUsada),
      lote,
      destino: lote ? destinoDeLote(lote, ctx.operaciones) : null,
    });
  }
  ordenes.sort((a, b) => (a.orden.fechaMaceracion < b.orden.fechaMaceracion ? -1 : 1));

  const totalComprado = round2(compras.reduce((s, c) => s + stockDeCompra(c), 0));
  const totalUsado = round2(ordenes.reduce((s, o) => s + o.cantidadUsada, 0));

  return {
    compras,
    materiaPrima: ctx.materiaPrima.find((m) => m.id === compra.materiaPrimaId),
    proveedor: ctx.proveedores.find((p) => p.id === compra.proveedorId),
    totalComprado,
    totalUsado,
    ordenes,
    clientes: clientesDe(ordenes.flatMap((o) => o.destino?.ventas ?? [])),
    contactos: contactosDeRetiro(ordenes.flatMap((o) => o.destino?.ventas ?? []), ctx.clientes),
  };
}

// ── Hacia atrás ─────────────────────────────────────────────────────────────

export type InsumoTraza = {
  materiaPrima: string;
  unidad: string;
  cantidad: number;
  /** null = el insumo no tiene compra asociada (stock previo o no registrado). */
  compra: CompraRow | null;
  proveedor: ProveedorRow | null;
};

export type FichaLote = {
  lote: LoteTerminado;
  /** null = lote anterior al sistema, sin orden de producción registrada. */
  orden: OrdenProduccionRow | null;
  insumos: InsumoTraza[];
  destino: DestinoLote;
  clientes: ClienteTraza[];
  contactos: ContactoRetiro[];
};

export function fichaDeLote(lote: LoteTerminado, ctx: TrazaContexto): FichaLote {
  const orden = lote.origenOrdenId ? ctx.ordenes.find((o) => o.id === lote.origenOrdenId) ?? null : null;
  const insumos: InsumoTraza[] = (orden?.insumos ?? []).map((i) => {
    const compra = i.compraId !== undefined ? ctx.compras.find((c) => c.id === i.compraId) ?? null : null;
    return {
      materiaPrima: i.materiaPrima,
      unidad: ctx.materiaPrima.find((m) => m.nombre === i.materiaPrima)?.unidad ?? "",
      cantidad: i.cantidad,
      compra,
      proveedor: compra ? ctx.proveedores.find((p) => p.id === compra.proveedorId) ?? null : null,
    };
  });
  const destino = destinoDeLote(lote, ctx.operaciones);
  return { lote, orden, insumos, destino, clientes: clientesDe(destino.ventas), contactos: contactosDeRetiro(destino.ventas, ctx.clientes) };
}

// ── Retiro de lote ──────────────────────────────────────────────────────────

export type LoteAfectado = {
  lote: LoteTerminado;
  /** null = lote anterior al sistema. */
  orden: OrdenProduccionRow | null;
  destino: DestinoLote;
};

export type RetiroLote = {
  titulo: string;
  /** Qué se retira y por qué está afectado ("dato: valor"). */
  origen: [string, string][];
  lotes: LoteAfectado[];
  contactos: ContactoRetiro[];
  /** Cada entrega a un cliente: fecha, operación, lote y unidades. */
  entregas: (VentaTraza & { lote: number })[];
  /** Unidades que todavía están en stock y hay que inmovilizar. */
  enStock: number;
  archivo: string;
};

function armarRetiro(titulo: string, origen: [string, string][], lotes: LoteAfectado[], ctx: TrazaContexto, archivo: string): RetiroLote {
  const entregas = lotes
    .flatMap((l) => l.destino.ventas.map((v) => ({ ...v, lote: l.lote.lote })))
    .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.operacionId - b.operacionId));
  return {
    titulo,
    origen,
    lotes,
    contactos: contactosDeRetiro(entregas, ctx.clientes),
    entregas,
    // Un lote en negativo (venta sin embotellar) no resta lo que hay en los otros.
    enStock: round2(lotes.reduce((s, l) => s + Math.max(0, l.destino.enStock), 0)),
    archivo,
  };
}

/** Retiro de un lote de licor: a quién se le vendió y cuánto queda en stock. */
export function retiroDeLote(lote: LoteTerminado, ctx: TrazaContexto): RetiroLote {
  const { orden, destino } = fichaDeLote(lote, ctx);
  return armarRetiro(
    `Retiro del lote ${lote.lote}`,
    [
      ["Producto", `${lote.producto} — ${lote.formato}`],
      ["N° de lote", String(lote.lote)],
      ["Orden de producción", orden ? `N° ${orden.id}` : "Sin orden registrada (lote anterior al sistema)"],
    ],
    [{ lote, orden, destino }],
    ctx,
    `retiro-lote-${lote.lote}`
  );
}

/** Retiro por un lote de proveedor: todos los lotes de licor que lo usaron. */
export function retiroDeLoteProveedor(r: RastreoLoteProveedor, ctx: TrazaContexto): RetiroLote {
  const primera = r.compras[0];
  const lotes = r.ordenes.flatMap((o) => (o.lote && o.destino ? [{ lote: o.lote, orden: o.orden, destino: o.destino }] : []));
  return armarRetiro(
    `Retiro por ${primera.lote ? `el lote ${primera.lote}` : `la compra OP N° ${primera.id}`} de ${r.materiaPrima?.nombre ?? "materia prima"}`,
    [
      ["Materia prima", r.materiaPrima?.nombre ?? "—"],
      ["Proveedor", `${r.proveedor?.razonSocial ?? "—"}${r.proveedor?.cuitCuil ? ` (CUIT ${r.proveedor.cuitCuil})` : ""}`],
      ["Lote del proveedor", primera.lote || `Sin lote (compra OP N° ${primera.id})`],
      ["Compras de ese lote", r.compras.map((c) => `OP N° ${c.id}`).join(", ")],
      ["Órdenes sin embotellar", r.ordenes.filter((o) => !o.lote).map((o) => `N° ${o.orden.id}`).join(", ") || "Ninguna"],
    ],
    lotes,
    ctx,
    `retiro-${primera.lote || `op-${primera.id}`}`
  );
}
