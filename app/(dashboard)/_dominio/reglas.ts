// Reglas de cada formulario: datos válidos + reglas del negocio. Puro (sin
// React ni base). Las mismas funciones corren en dos lados:
//  - en el navegador, para mostrar el error debajo de cada campo antes de mandar;
//  - en el servidor (acciones.ts → aplicar), que rechaza cualquier dato inválido
//    aunque no venga de la pantalla (las server actions son públicas).
//
// Cada función recibe los valores tal como llegan (texto del formulario o
// cualquier cosa que manden) y devuelve el objeto limpio y tipado, armado solo
// con los campos permitidos, o los errores por campo. Los campos de las líneas
// de una orden se nombran "insumos.<n°>.<campo>".

import { CONDICIONES_IVA, type ClienteRow } from "../clientes/data";
import type { ProveedorRow } from "../proveedores/data";
import { REPOSICIONES, UNIDADES_MEDIDA, type MateriaPrimaRow, type Reposicion, type UnidadMedida } from "../materia-prima/data";
import { productoLabel, type ProductoRow } from "../productos/data";
import { CANALES, CONDICIONES, type VendedorRow } from "../operaciones/data";
import type { LoteTerminado } from "../productos-terminados/data";
import type { InventarioMateriaPrimaRow } from "../inventario-materia-prima/data";
import {
  COMPROBANTE_FORMS,
  COMPROBANTE_TIPOS,
  MEDIOS_PAGO,
  formatComprobante,
  normalizarNumeroComprobante,
  stockDeCompra,
  unidadCorta,
  type CompraInput,
  type MedioPago,
} from "../trazabilidad/data";
import type { KardexMovimiento } from "@/app/components/data-table/kardex";
import {
  CANTIDAD_MAX,
  LARGO_CORTO,
  LARGO_DOMICILIO,
  LARGO_NOMBRE,
  LARGO_RESPONSABLE,
  MONTO_MAX,
  claveTexto,
  fechaMaximaVencimiento,
  fmtFecha,
  fmtNumero,
  normalizarCbu,
  normalizarCodigoBarras,
  normalizarCuit,
  normalizarTexto,
  parsearNumero,
  reglaCantidad,
  reglaMonto,
  validarAlias,
  validarCbu,
  validarCodigoBarras,
  validarCuit,
  validarEmail,
  validarFecha,
  validarNumero,
  validarOpcion,
  validarTelefono,
  validarTexto,
  type Errores,
  type Resultado,
  type Validacion,
} from "@/app/components/data-table/validacion";
import type {
  Estado,
  InventarioMateriaPrimaHeaderInput,
  LoteHeaderInput,
  NuevaMateriaPrimaInventarioInput,
  NuevoLoteInput,
  OperacionInput,
  OrdenInput,
} from "./acciones";
import { asignarFifo, faltanteDeProducto, round2, saldoInventario, saldoLote, usadoDeCompra } from "./sync";

export type { Errores, Resultado };
type Movimiento = Omit<KardexMovimiento, "id">;

const EPSILON = 1e-9;

// ── Utilidades ──────────────────────────────────────────────────────────────

function objeto(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Id entero positivo (de un número o del texto de un <select>), o null. */
export function leerId(v: unknown): number | null {
  const n = typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n > 0 ? n : null;
}

function recolector() {
  const errores: Errores = {};
  return {
    errores,
    /** Guarda solo el primer error de cada campo. */
    poner(campo: string, v: Validacion) {
      if (v && !(campo in errores)) errores[campo] = v;
    },
    tiene: (campo: string) => campo in errores,
  };
}

function resultado<T>(errores: Errores, valor: () => T): Resultado<T> {
  return Object.keys(errores).length > 0 ? { ok: false, errores } : { ok: true, valor: valor() };
}

const texto = (v: unknown) => normalizarTexto(v);
const esUnidades = (u: UnidadMedida | undefined) => u === "Unidades";

// ── Catálogos ───────────────────────────────────────────────────────────────

export function validarCliente(v: unknown, e: Estado, id: number | null): Resultado<Omit<ClienteRow, "id">> {
  const o = objeto(v);
  const { errores, poner, tiene } = recolector();

  const razonSocial = texto(o.razonSocial);
  poner("razonSocial", validarTexto(razonSocial, { que: "la razón social", requerido: true, max: LARGO_NOMBRE }));
  const apellidoNombre = texto(o.apellidoNombre);
  poner("apellidoNombre", validarTexto(apellidoNombre, { que: "el apellido y nombre", max: LARGO_NOMBRE }));
  const condicionIva = texto(o.condicionIva);
  poner("condicionIva", validarOpcion(condicionIva, CONDICIONES_IVA, "la condición de IVA"));

  // Consumidor Final suele no tener CUIT: puede quedar vacío, pero si se carga se valida igual.
  const cuit = normalizarCuit(o.cuit);
  if (!cuit && condicionIva !== "Consumidor Final") {
    poner("cuit", "Ingresá el CUIT, por ejemplo 30-71234567-8 (solo puede quedar vacío si es Consumidor Final).");
  }
  poner("cuit", validarCuit(cuit));
  if (cuit && !tiene("cuit")) {
    const otro = e.clientes.find((c) => c.id !== id && normalizarCuit(c.cuit) === cuit);
    if (otro) poner("cuit", `Ya hay un cliente con este CUIT: ${otro.razonSocial}.`);
  }

  const telefono = texto(o.telefono);
  poner("telefono", validarTelefono(telefono));
  const email = texto(o.email);
  poner("email", validarEmail(email));
  const domicilio = texto(o.domicilio);
  poner("domicilio", validarTexto(domicilio, { que: "el domicilio", max: LARGO_DOMICILIO }));

  const precioTradicional = parsearNumero(o.precioTradicional);
  poner("precioTradicional", validarNumero(precioTradicional, reglaMonto("el precio tradicional", "6800")));
  const precioPremium = parsearNumero(o.precioPremium);
  poner("precioPremium", validarNumero(precioPremium, { ...reglaMonto("el precio premium", "17000"), requerido: false }));

  return resultado(errores, () => ({
    razonSocial,
    apellidoNombre,
    condicionIva,
    cuit,
    telefono,
    email,
    domicilio,
    precioTradicional: precioTradicional as number,
    precioPremium,
  }));
}

export function validarProveedor(v: unknown, e: Estado, id: number | null): Resultado<Omit<ProveedorRow, "id">> {
  const o = objeto(v);
  const { errores, poner, tiene } = recolector();

  const razonSocial = texto(o.razonSocial);
  poner("razonSocial", validarTexto(razonSocial, { que: "la razón social", requerido: true, max: LARGO_NOMBRE }));
  const contacto = texto(o.contacto);
  poner("contacto", validarTexto(contacto, { que: "el contacto", requerido: true, max: LARGO_NOMBRE }));
  const producto = texto(o.producto);
  poner("producto", validarTexto(producto, { que: "qué le compramos (producto)", requerido: true, max: LARGO_NOMBRE }));

  // CUIT, email y teléfono pueden no tenerse al cargarlo: vacíos se aceptan, pero si se completan se validan.
  const cuitCuil = normalizarCuit(o.cuitCuil);
  poner("cuitCuil", validarCuit(cuitCuil));
  if (cuitCuil && !tiene("cuitCuil")) {
    const otro = e.proveedores.find((p) => p.id !== id && normalizarCuit(p.cuitCuil) === cuitCuil);
    if (otro) poner("cuitCuil", `Ya hay un proveedor con este CUIT/CUIL: ${otro.razonSocial}.`);
  }
  const email = texto(o.email);
  poner("email", validarEmail(email));
  const telefono = texto(o.telefono);
  poner("telefono", validarTelefono(telefono));
  const cbu = normalizarCbu(o.cbu);
  poner("cbu", validarCbu(cbu));
  const alias = texto(o.alias);
  poner("alias", validarAlias(alias));

  return resultado(errores, () => ({
    razonSocial,
    contacto,
    producto,
    cuitCuil,
    email,
    telefono,
    cbu: cbu || undefined,
    alias: alias || undefined,
  }));
}

export function validarMateriaPrima(v: unknown, e: Estado, id: number | null): Resultado<Omit<MateriaPrimaRow, "id">> {
  const o = objeto(v);
  const { errores, poner, tiene } = recolector();

  const nombre = texto(o.nombre);
  poner("nombre", validarTexto(nombre, { que: "el nombre", requerido: true, max: LARGO_NOMBRE }));
  if (nombre && !tiene("nombre")) {
    const otra = e.materiaPrima.find((m) => m.id !== id && claveTexto(m.nombre) === claveTexto(nombre));
    if (otra) poner("nombre", `Ya existe la materia prima "${otra.nombre}".`);
  }
  const unidad = texto(o.unidad);
  poner("unidad", validarOpcion(unidad, UNIDADES_MEDIDA, "la unidad"));
  // Sin dato (la importación o un alta vieja) queda como estaba, o "Con stock" si es nueva.
  const reposicion = texto(o.reposicion) || (e.materiaPrima.find((m) => m.id === id)?.reposicion ?? "Con stock");
  poner("reposicion", validarOpcion(reposicion, REPOSICIONES, "cómo se compra"));

  return resultado(errores, () => ({ nombre, unidad: unidad as UnidadMedida, reposicion: reposicion as Reposicion }));
}

export function validarProducto(v: unknown, e: Estado, id: number | null): Resultado<Omit<ProductoRow, "id">> {
  const o = objeto(v);
  const { errores, poner, tiene } = recolector();

  const nombre = texto(o.nombre);
  poner("nombre", validarTexto(nombre, { que: "el nombre", requerido: true, max: LARGO_NOMBRE }));
  const formato = texto(o.formato);
  poner("formato", validarTexto(formato, { que: "el formato", requerido: true, max: LARGO_CORTO }));
  if (nombre && formato && !tiene("nombre") && !tiene("formato")) {
    const otro = e.productos.find(
      (p) => p.id !== id && claveTexto(p.nombre) === claveTexto(nombre) && claveTexto(p.formato) === claveTexto(formato)
    );
    if (otro) poner("formato", `Ya existe "${productoLabel(otro)}": cambiá el nombre o el formato.`);
  }

  const codigoBarras = normalizarCodigoBarras(o.codigoBarras);
  poner("codigoBarras", validarCodigoBarras(codigoBarras));
  if (codigoBarras && !tiene("codigoBarras")) {
    const otro = e.productos.find((p) => p.id !== id && normalizarCodigoBarras(p.codigoBarras) === codigoBarras);
    if (otro) poner("codigoBarras", `Este código ya lo tiene "${productoLabel(otro)}".`);
  }

  const precioUnitario = parsearNumero(o.precioUnitario);
  poner("precioUnitario", validarNumero(precioUnitario, reglaMonto("el precio unitario", "10000")));

  return resultado(errores, () => ({ nombre, formato, codigoBarras, precioUnitario: precioUnitario as number }));
}

export function validarVendedor(v: unknown, e: Estado, id: number | null): Resultado<Omit<VendedorRow, "id">> {
  const o = objeto(v);
  const { errores, poner, tiene } = recolector();

  // En mayúsculas, como en la planilla ("VICENTE, RODRIGO"): así la lista se ve pareja.
  const nombre = texto(o.nombre).toLocaleUpperCase("es-AR");
  poner("nombre", validarTexto(nombre, { que: "el nombre del vendedor", requerido: true, max: LARGO_NOMBRE }));
  if (nombre && !tiene("nombre")) {
    const otro = e.vendedores.find((x) => x.id !== id && claveTexto(x.nombre) === claveTexto(nombre));
    if (otro) poner("nombre", `Ya existe el vendedor "${otro.nombre}".`);
  }

  return resultado(errores, () => ({ nombre }));
}

// ── Operaciones (ventas) ────────────────────────────────────────────────────

/** Botellas disponibles de un producto (suma de sus lotes). Al editar una venta, cuenta como disponible lo que ya tomó esa venta. */
export function stockDisponible(e: Estado, productoId: number, excluirOperacionId?: number): number {
  let total = 0;
  for (const l of e.productosTerminados) {
    if (l.productoId !== productoId) continue;
    total += saldoLote(l);
    if (excluirOperacionId !== undefined) {
      for (const m of l.movimientos) if (m.origenOperacionId === excluirOperacionId) total += m.cantidad;
    }
  }
  return round2(total);
}

/**
 * Cuánto stock falta si se guarda esta venta (alta o edición), mirando lo que
 * había embotellado a su fecha (FIFO por fechas, ver sync.ts). `faltan` cuenta
 * también las ventas posteriores que se quedarían sin stock por esta.
 * `sinLote`: a esa fecha no había ningún lote de ese producto.
 */
export function faltanteDeVenta(
  e: Estado,
  venta: { id: number | null; productoId: number; fecha: string; cantidad: number }
): { faltan: number; sinLote: boolean } {
  const id = venta.id ?? -1;
  const operaciones = [...e.operaciones.filter((o) => o.id !== id), { ...venta, id }];
  const antes = faltanteDeProducto(e.productosTerminados, e.operaciones, e.ordenesProduccion, venta.productoId);
  const asignacion = asignarFifo(e.productosTerminados, operaciones, e.ordenesProduccion, venta.productoId);
  let despues = 0;
  for (const f of asignacion.faltantes.values()) despues += f;
  return { faltan: Math.max(0, round2(despues - antes)), sinLote: asignacion.sinLote.includes(id) };
}

export function validarOperacion(v: unknown, e: Estado): Resultado<OperacionInput> {
  const o = objeto(v);
  const { errores, poner } = recolector();

  const fecha = texto(o.fecha);
  poner("fecha", validarFecha(fecha, { que: "la fecha de la venta", requerido: true }));

  const clienteId = leerId(o.clienteId);
  if (clienteId === null) poner("clienteId", "Elegí el cliente.");
  else if (!e.clientes.some((c) => c.id === clienteId)) poner("clienteId", "El cliente elegido ya no existe.");

  const vendedor = texto(o.vendedor);
  poner("vendedor", validarOpcion(vendedor, e.vendedores.map((x) => x.nombre), "el vendedor"));

  const productoId = leerId(o.productoId);
  if (productoId === null) poner("productoId", "Elegí el producto.");
  else if (!e.productos.some((p) => p.id === productoId)) poner("productoId", "El producto elegido ya no existe.");

  const cantidad = parsearNumero(o.cantidad);
  poner("cantidad", validarNumero(cantidad, reglaCantidad("la cantidad de botellas", true)));
  const canal = texto(o.canal);
  poner("canal", validarOpcion(canal, CANALES, "el canal"));
  const condicion = texto(o.condicion);
  poner("condicion", validarOpcion(condicion, CONDICIONES, "la condición"));
  const pu = parsearNumero(o.pu);
  poner("pu", validarNumero(pu, reglaMonto("el precio unitario", "10000")));

  return resultado(errores, () => ({
    fecha,
    clienteId: clienteId as number,
    vendedor,
    productoId: productoId as number,
    cantidad: cantidad as number,
    canal,
    condicion,
    pu: pu as number,
  }));
}

// ── Órdenes de producción ───────────────────────────────────────────────────

export function validarOrden(v: unknown, e: Estado, id: number | null): Resultado<OrdenInput> {
  const o = objeto(v);
  const { errores, poner, tiene } = recolector();

  const productoId = leerId(o.productoId);
  if (productoId === null) poner("productoId", "Elegí el producto.");
  else if (!e.productos.some((p) => p.id === productoId)) poner("productoId", "El producto elegido ya no existe.");

  const fechaMaceracion = texto(o.fechaMaceracion);
  poner("fechaMaceracion", validarFecha(fechaMaceracion, { que: "la fecha de maceración", requerido: true }));
  const maceracionOk = !tiene("fechaMaceracion");

  const fechaEmbotellado = texto(o.fechaEmbotellado);
  poner("fechaEmbotellado", validarFecha(fechaEmbotellado, { que: "la fecha de embotellado" }));
  if (fechaEmbotellado && maceracionOk && !tiene("fechaEmbotellado") && fechaEmbotellado < fechaMaceracion) {
    poner("fechaEmbotellado", `No puede ser anterior a la maceración (${fmtFecha(fechaMaceracion)}).`);
  }

  const responsable = texto(o.responsable);
  poner("responsable", validarTexto(responsable, { que: "el responsable", requerido: true, max: LARGO_RESPONSABLE }));

  // Mientras macera la cantidad puede no saberse todavía: es obligatoria al embotellar.
  const cantidadProducida = parsearNumero(o.cantidadProducida);
  if (cantidadProducida === null && fechaEmbotellado) {
    poner("cantidadProducida", "Ingresá cuántas botellas salieron al embotellar, por ejemplo 120.");
  }
  poner(
    "cantidadProducida",
    validarNumero(cantidadProducida, { ...reglaCantidad("la cantidad de botellas producidas", true), requerido: false })
  );
  // Si el lote de esta orden ya tiene ventas o movimientos, la orden no puede
  // volver a "macerando" ni cambiar de producto: el lote quedaría huérfano.
  const lote = id !== null ? e.productosTerminados.find((l) => l.origenOrdenId === id) : undefined;
  if (lote && lote.movimientos.length > 0) {
    if (!fechaEmbotellado && !tiene("fechaEmbotellado")) {
      poner("fechaEmbotellado", `El lote ${lote.lote} de esta orden ya tiene ventas o movimientos: no se puede quitar la fecha de embotellado.`);
    }
    if (productoId !== null && lote.productoId !== undefined && productoId !== lote.productoId && !tiene("productoId")) {
      poner("productoId", `El lote ${lote.lote} de esta orden ya tiene ventas o movimientos: no se puede cambiar el producto.`);
    }
    // Las ventas se reacomodan solas con el embotellado nuevo; los movimientos
    // cargados a mano no pueden quedar antes del embotellado.
    const primerManual = lote.movimientos
      .filter((m) => m.origenOperacionId === undefined && m.fecha)
      .reduce<string | null>((min, m) => (min === null || m.fecha! < min ? m.fecha! : min), null);
    if (fechaEmbotellado && primerManual && fechaEmbotellado > primerManual && !tiene("fechaEmbotellado")) {
      poner("fechaEmbotellado", `El lote ${lote.lote} tiene un movimiento cargado a mano el ${fmtFecha(primerManual)}: el embotellado no puede ser posterior.`);
    }
  }
  // Si el lote de esta orden ya tuvo ventas, no se puede producir menos de lo que ya salió.
  if (lote && fechaEmbotellado && cantidadProducida !== null && !tiene("cantidadProducida")) {
    const salio = round2(lote.existenciaInicial - saldoLote(lote));
    if (cantidadProducida < salio) {
      poner("cantidadProducida", `Del lote de esta orden ya salieron ${fmtNumero(salio)} botellas: la cantidad producida no puede ser menor.`);
    }
  }

  // ── Insumos (una línea por materia prima y compra) ──
  const lineas = Array.isArray(o.insumos) ? o.insumos : [];
  if (lineas.length === 0) poner("insumos", "Agregá al menos un insumo con su materia prima y cantidad.");
  const insumos: OrdenInput["insumos"] = [];
  const usoPorCompra = new Map<number, { uso: number; primeraLinea: number }>();

  lineas.forEach((raw, i) => {
    const l = objeto(raw);
    const campo = (k: string) => `insumos.${i}.${k}`;

    const materiaPrima = texto(l.materiaPrima);
    const mp = e.materiaPrima.find((m) => m.nombre === materiaPrima);
    if (!materiaPrima) poner(campo("materiaPrima"), "Elegí la materia prima.");
    else if (!mp) poner(campo("materiaPrima"), "Esa materia prima ya no está en el catálogo.");

    const cantidad = parsearNumero(l.cantidad);
    poner(campo("cantidad"), validarNumero(cantidad, reglaCantidad("la cantidad", esUnidades(mp?.unidad))));
    const costoUnitario = parsearNumero(l.costoUnitario);
    poner(campo("costoUnitario"), validarNumero(costoUnitario, reglaMonto("el costo unitario", "850")));

    // La compra (lote del proveedor) es opcional, pero si se indica tiene que cerrar con la trazabilidad.
    const compraTexto = l.compraId === undefined || l.compraId === null ? "" : String(l.compraId).trim();
    const compraId = leerId(l.compraId);
    if (compraTexto && compraId === null) {
      poner(campo("compraId"), "Elegí una compra de la lista.");
    } else if (compraId !== null) {
      const compra = e.compras.find((c) => c.id === compraId);
      if (!compra) poner(campo("compraId"), `La compra OP N° ${compraId} ya no existe en el Libro de compras.`);
      else if (mp && compra.materiaPrimaId !== mp.id) poner(campo("compraId"), "Esa compra es de otra materia prima.");
      else if (maceracionOk && compra.fecha > fechaMaceracion) {
        poner(
          campo("compraId"),
          `La compra OP N° ${compra.id} es del ${fmtFecha(compra.fecha)}, posterior a la maceración: no pudo usarse en esta orden.`
        );
      } else if (cantidad !== null && !Number.isNaN(cantidad)) {
        const previo = usoPorCompra.get(compraId);
        usoPorCompra.set(compraId, { uso: (previo?.uso ?? 0) + cantidad, primeraLinea: previo?.primeraLinea ?? i });
      }
    }

    insumos.push({
      materiaPrima,
      cantidad: cantidad as number,
      costoUnitario: costoUnitario as number,
      ...(compraId !== null ? { compraId } : {}),
    });
  });

  // No se puede usar de una compra más de lo que queda (lo comprado menos lo que usan las demás órdenes).
  for (const [compraId, { uso, primeraLinea }] of usoPorCompra) {
    const compra = e.compras.find((c) => c.id === compraId)!;
    const disponible = round2(stockDeCompra(compra) - usadoDeCompra(e.ordenesProduccion, compraId, id ?? undefined));
    if (uso > disponible + EPSILON) {
      const unidad = unidadCorta(e.materiaPrima.find((m) => m.id === compra.materiaPrimaId)?.unidad ?? "");
      poner(
        `insumos.${primeraLinea}.cantidad`,
        `De la compra OP N° ${compraId} quedan ${fmtNumero(Math.max(disponible, 0))} ${unidad} y esta orden usa ${fmtNumero(round2(uso))} ${unidad}. Si sale de otra compra, agregá otra línea con esa compra.`
      );
    }
  }

  return resultado(errores, () => ({
    productoId: productoId as number,
    fechaMaceracion,
    fechaEmbotellado: fechaEmbotellado || null,
    responsable,
    cantidadProducida,
    insumos,
  }));
}

// ── Libro de compras ────────────────────────────────────────────────────────

export function validarCompra(v: unknown, e: Estado, id: number | null): Resultado<CompraInput> {
  const o = objeto(v);
  const { errores, poner, tiene } = recolector();

  const fecha = texto(o.fecha);
  poner("fecha", validarFecha(fecha, { que: "la fecha de la compra", requerido: true }));

  const materiaPrimaId = leerId(o.materiaPrimaId);
  const mp = e.materiaPrima.find((m) => m.id === materiaPrimaId);
  if (materiaPrimaId === null) poner("materiaPrimaId", "Elegí la materia prima.");
  else if (!mp) poner("materiaPrimaId", "La materia prima elegida ya no existe.");

  const cantidad = parsearNumero(o.cantidad);
  poner("cantidad", validarNumero(cantidad, reglaCantidad("la cantidad", esUnidades(mp?.unidad))));
  const costoUnitario = parsearNumero(o.costoUnitario);
  poner("costoUnitario", validarNumero(costoUnitario, reglaMonto("el costo unitario", "850")));

  // La cáscara solo se registra en materias primas por kilo (cítricos).
  const porKilo = mp?.unidad === "Kilogramos";
  const cantidadCascara = porKilo ? parsearNumero(o.cantidadCascara) : null;
  poner(
    "cantidadCascara",
    validarNumero(cantidadCascara, { que: "los kilos de cáscara", ejemplo: "7,2", positivo: true, max: CANTIDAD_MAX })
  );

  const lote = texto(o.lote);
  poner("lote", validarTexto(lote, { que: "el lote", max: LARGO_CORTO }));

  const proveedorId = leerId(o.proveedorId);
  if (proveedorId === null) poner("proveedorId", "Elegí el proveedor.");
  else if (!e.proveedores.some((p) => p.id === proveedorId)) poner("proveedorId", "El proveedor elegido ya no existe.");

  // Comprobante: opcional, pero si hay número tiene que tener su forma y su tipo.
  const comprobanteForm = texto(o.comprobanteForm);
  const comprobanteTipo = texto(o.comprobanteTipo);
  const numeroTexto = texto(o.comprobanteNumero);
  const comprobanteNumero = numeroTexto ? normalizarNumeroComprobante(numeroTexto) : "";
  if (comprobanteForm) poner("comprobanteForm", validarOpcion(comprobanteForm, COMPROBANTE_FORMS, "la forma del comprobante"));
  if (comprobanteTipo) poner("comprobanteTipo", validarOpcion(comprobanteTipo, COMPROBANTE_TIPOS, "el tipo de comprobante"));
  if (comprobanteNumero === null) {
    poner("comprobanteNumero", "Usá el formato punto de venta - número, por ejemplo 0001 - 00021952.");
  }
  if ((comprobanteNumero || comprobanteTipo) && !comprobanteForm) {
    poner("comprobanteForm", "Elegí la forma del comprobante (Factura, Remito…).");
  }
  if (comprobanteNumero && !comprobanteTipo) poner("comprobanteTipo", "Elegí el tipo (A, B, C o X).");

  const medioPago = texto(o.medioPago);
  poner("medioPago", validarOpcion(medioPago, MEDIOS_PAGO.map((m) => m.value), "el medio de pago"));

  // Al editar una compra que ya usan órdenes, no puede dejar de cerrar con ellas.
  if (id !== null) {
    const anterior = e.compras.find((c) => c.id === id);
    const queUsan = e.ordenesProduccion.filter((ord) => ord.insumos.some((i) => i.compraId === id));
    const lista = queUsan.map((ord) => ord.id).join(", ");
    const usado = usadoDeCompra(e.ordenesProduccion, id);
    if (anterior && usado > 0 && materiaPrimaId !== null && anterior.materiaPrimaId !== materiaPrimaId) {
      poner("materiaPrimaId", `No se puede cambiar la materia prima: esta compra ya se usó en las órdenes N° ${lista}.`);
    }
    // Con cáscara, las órdenes usan kilos de cáscara (ver stockDeCompra).
    const enStock = cantidadCascara ?? cantidad;
    const campoStock = cantidadCascara !== null ? "cantidadCascara" : "cantidad";
    if (enStock !== null && !tiene(campoStock) && enStock + EPSILON < usado) {
      poner(campoStock, `Las órdenes N° ${lista} ya usan ${fmtNumero(usado)} de esta compra: la ${campoStock === "cantidad" ? "cantidad" : "cáscara"} no puede ser menor.`);
    }
    if (queUsan.length > 0 && !tiene("fecha")) {
      const primera = queUsan.reduce((min, ord) => (ord.fechaMaceracion < min ? ord.fechaMaceracion : min), queUsan[0].fechaMaceracion);
      if (fecha > primera) {
        poner("fecha", `La usan las órdenes N° ${lista}, la primera macerada el ${fmtFecha(primera)}: la compra no puede ser posterior.`);
      }
    }
  }

  if (comprobanteNumero && Object.keys(errores).length === 0) {
    const nuevo = { comprobanteForm, comprobanteTipo, comprobanteNumero };
    const duplicada = e.compras.find(
      (c) => c.id !== id && c.proveedorId === proveedorId && c.materiaPrimaId === materiaPrimaId && formatComprobante(c) === formatComprobante(nuevo)
    );
    if (duplicada) {
      poner("comprobanteNumero", `Esta compra ya está cargada: la OP N° ${duplicada.id} tiene el mismo proveedor, comprobante y materia prima.`);
    }
  }

  return resultado(errores, () => ({
    fecha,
    materiaPrimaId: materiaPrimaId as number,
    cantidad: cantidad as number,
    costoUnitario: costoUnitario as number,
    cantidadCascara: cantidadCascara ?? undefined,
    lote,
    proveedorId: proveedorId as number,
    comprobanteForm,
    comprobanteTipo,
    comprobanteNumero: comprobanteNumero ?? "",
    medioPago: medioPago as MedioPago,
  }));
}

// ── Productos terminados (lotes) ────────────────────────────────────────────

/** Fecha de embotellado de un lote (la de su orden), si se conoce. */
export function embotelladoDeLote(lote: LoteTerminado, e: Estado): string | null {
  if (lote.origenOrdenId === undefined) return null;
  return e.ordenesProduccion.find((o) => o.id === lote.origenOrdenId)?.fechaEmbotellado ?? null;
}

const TIPOS_MOVIMIENTO = ["entrada", "salida"];

export function validarMovimientoLote(v: unknown, lote: LoteTerminado, e: Estado): Resultado<Movimiento> {
  const o = objeto(v);
  const { errores, poner, tiene } = recolector();

  const tipo = texto(o.tipo);
  poner("tipo", validarOpcion(tipo, TIPOS_MOVIMIENTO, "el tipo de movimiento"));

  const fecha = texto(o.fecha);
  poner("fecha", validarFecha(fecha, { que: "la fecha", requerido: true }));
  const embotellado = embotelladoDeLote(lote, e);
  if (embotellado && !tiene("fecha") && fecha < embotellado) {
    poner("fecha", `No puede ser anterior al embotellado del lote (${fmtFecha(embotellado)}).`);
  }

  const cantidad = parsearNumero(o.cantidad);
  poner("cantidad", validarNumero(cantidad, reglaCantidad("la cantidad de botellas", true)));
  if (tipo === "salida" && cantidad !== null && !tiene("cantidad")) {
    const saldo = round2(saldoLote(lote));
    if (saldo <= 0) poner("cantidad", `El lote no tiene botellas en stock (saldo ${fmtNumero(saldo)}): no se puede registrar una salida.`);
    else if (cantidad > saldo + EPSILON) poner("cantidad", `El lote tiene ${fmtNumero(saldo)} botellas: no se puede sacar más que eso.`);
  }

  const puEntrada = tipo === "entrada" ? parsearNumero(o.puEntrada) : null;
  poner("puEntrada", validarNumero(puEntrada, { ...reglaMonto("el costo unitario", "4200"), requerido: false }));

  return resultado(errores, () => ({
    fecha,
    tipo: tipo as Movimiento["tipo"],
    cantidad: cantidad as number,
    ...(puEntrada !== null ? { puEntrada } : {}),
  }));
}

/** Existencia inicial + costo, con las reglas comunes a lotes e inventario. */
function validarExistenciaYCosto(
  o: Record<string, unknown>,
  poner: (campo: string, v: Validacion) => void,
  entero: boolean,
  ejemplo: string
) {
  const existenciaInicial = parsearNumero(o.existenciaInicial);
  poner(
    "existenciaInicial",
    validarNumero(existenciaInicial, { que: "la existencia inicial", ejemplo, requerido: true, entero, max: CANTIDAD_MAX })
  );
  // Sin existencia el costo puede quedar en 0; con existencia tiene que tener costo.
  const costoUnitario = parsearNumero(o.costoUnitario);
  poner(
    "costoUnitario",
    validarNumero(costoUnitario, {
      que: "el costo unitario",
      ejemplo: "850",
      requerido: true,
      positivo: (existenciaInicial ?? 0) > 0,
      max: MONTO_MAX,
    })
  );
  return { existenciaInicial, costoUnitario };
}

/** No se puede bajar la existencia inicial si eso deja (o empeora) un saldo negativo. */
function chequearSaldo(
  poner: (campo: string, v: Validacion) => void,
  saldoAntes: number,
  saldoDespues: number,
  minimo: number,
  unidad: string
) {
  if (saldoDespues < -EPSILON && saldoDespues < saldoAntes - EPSILON) {
    poner(
      "existenciaInicial",
      `Con las salidas ya registradas el saldo quedaría negativo: la existencia inicial tiene que ser de al menos ${fmtNumero(minimo)} ${unidad}.`
    );
  }
}

/** Lote con stock previo al sistema: producto del catálogo, N° de lote, existencia y costo. */
export function validarAltaLote(v: unknown, e: Estado): Resultado<NuevoLoteInput> {
  const o = objeto(v);
  const { errores, poner } = recolector();

  const productoId = leerId(o.productoId);
  if (productoId === null) poner("productoId", "Elegí el producto.");
  else if (!e.productos.some((p) => p.id === productoId)) poner("productoId", "El producto elegido ya no existe.");

  const lote = parsearNumero(o.lote);
  poner("lote", validarNumero(lote, { que: "el número de lote", ejemplo: "8", requerido: true, positivo: true, entero: true, max: CANTIDAD_MAX }));

  const { existenciaInicial, costoUnitario } = validarExistenciaYCosto(o, poner, true, "120");
  if (existenciaInicial === 0) poner("existenciaInicial", "Ingresá la existencia inicial mayor a 0, por ejemplo 120.");

  const fechaVencimiento = texto(o.fechaVencimiento);
  poner("fechaVencimiento", validarFecha(fechaVencimiento, { que: "la fecha de vencimiento", max: fechaMaximaVencimiento() }));

  return resultado(errores, () => ({
    productoId: productoId as number,
    lote: lote as number,
    existenciaInicial: existenciaInicial as number,
    costoUnitario: costoUnitario as number,
    fechaVencimiento: fechaVencimiento || null,
  }));
}

export function validarEncabezadoLote(v: unknown, lote: LoteTerminado, e: Estado): Resultado<LoteHeaderInput> {
  const o = objeto(v);
  const { errores, poner, tiene } = recolector();

  const { existenciaInicial, costoUnitario } = validarExistenciaYCosto(o, poner, true, "120");
  if (existenciaInicial !== null && !tiene("existenciaInicial")) {
    const antes = saldoLote(lote);
    const despues = saldoLote({ ...lote, existenciaInicial });
    chequearSaldo(poner, antes, despues, round2(lote.existenciaInicial - antes), "botellas");
  }

  const fechaVencimiento = texto(o.fechaVencimiento);
  const embotellado = embotelladoDeLote(lote, e);
  poner(
    "fechaVencimiento",
    validarFecha(fechaVencimiento, { que: "la fecha de vencimiento", max: fechaMaximaVencimiento() })
  );
  if (fechaVencimiento && embotellado && !tiene("fechaVencimiento") && fechaVencimiento <= embotellado) {
    poner("fechaVencimiento", `Tiene que ser posterior al embotellado del lote (${fmtFecha(embotellado)}).`);
  }

  return resultado(errores, () => ({
    existenciaInicial: existenciaInicial as number,
    costoUnitario: costoUnitario as number,
    fechaVencimiento: fechaVencimiento || null,
  }));
}

// ── Inventario de materia prima ─────────────────────────────────────────────

function unidadDe(row: Pick<InventarioMateriaPrimaRow, "materiaPrimaId">, e: Estado): UnidadMedida | undefined {
  return e.materiaPrima.find((m) => m.id === row.materiaPrimaId)?.unidad;
}

export function validarMovimientoInventario(v: unknown, row: InventarioMateriaPrimaRow, e: Estado): Resultado<Movimiento> {
  const o = objeto(v);
  const { errores, poner, tiene } = recolector();
  const unidad = unidadDe(row, e);

  const tipo = texto(o.tipo);
  poner("tipo", validarOpcion(tipo, TIPOS_MOVIMIENTO, "el tipo de movimiento"));
  const fecha = texto(o.fecha);
  poner("fecha", validarFecha(fecha, { que: "la fecha", requerido: true }));

  const cantidad = parsearNumero(o.cantidad);
  poner("cantidad", validarNumero(cantidad, reglaCantidad("la cantidad", esUnidades(unidad))));
  if (tipo === "salida" && cantidad !== null && !tiene("cantidad")) {
    const saldo = saldoInventario(row);
    const u = unidadCorta(unidad ?? "");
    if (saldo <= 0) poner("cantidad", `No hay stock de esta materia prima (saldo ${fmtNumero(saldo)} ${u}): no se puede registrar un consumo.`);
    else if (cantidad > saldo + EPSILON) poner("cantidad", `Hay ${fmtNumero(saldo)} ${u} en stock: el consumo no puede ser mayor.`);
  }

  const entrada = tipo === "entrada";
  const puEntrada = entrada ? parsearNumero(o.puEntrada) : null;
  poner("puEntrada", validarNumero(puEntrada, { ...reglaMonto("el costo unitario", "850"), requerido: false }));
  const cantidadSecundaria = entrada ? parsearNumero(o.cantidadSecundaria) : null;
  poner(
    "cantidadSecundaria",
    validarNumero(cantidadSecundaria, { que: "la cantidad de cáscara", ejemplo: "7,2", positivo: true, max: CANTIDAD_MAX })
  );

  return resultado(errores, () => ({
    fecha,
    tipo: tipo as Movimiento["tipo"],
    cantidad: cantidad as number,
    ...(puEntrada !== null ? { puEntrada } : {}),
    ...(cantidadSecundaria !== null ? { cantidadSecundaria } : {}),
  }));
}

export function validarEncabezadoInventario(
  v: unknown,
  row: InventarioMateriaPrimaRow,
  e: Estado
): Resultado<InventarioMateriaPrimaHeaderInput> {
  const o = objeto(v);
  const { errores, poner, tiene } = recolector();
  const unidad = unidadDe(row, e);

  const { existenciaInicial, costoUnitario } = validarExistenciaYCosto(o, poner, esUnidades(unidad), esUnidades(unidad) ? "300" : "12,5");
  if (existenciaInicial !== null && !tiene("existenciaInicial")) {
    const antes = saldoInventario(row);
    const despues = saldoInventario({ ...row, existenciaInicial });
    chequearSaldo(poner, antes, despues, round2(row.existenciaInicial - antes), unidadCorta(unidad ?? ""));
  }

  return resultado(errores, () => ({
    existenciaInicial: existenciaInicial as number,
    costoUnitario: costoUnitario as number,
  }));
}

export function validarAltaInventario(v: unknown, e: Estado): Resultado<NuevaMateriaPrimaInventarioInput> {
  const o = objeto(v);
  const { errores, poner } = recolector();

  const materiaPrimaId = leerId(o.materiaPrimaId);
  const mp = e.materiaPrima.find((m) => m.id === materiaPrimaId);
  if (materiaPrimaId === null) poner("materiaPrimaId", "Elegí la materia prima.");
  else if (!mp) poner("materiaPrimaId", "La materia prima elegida ya no existe.");
  else if (e.inventarioMateriaPrima.some((r) => r.materiaPrimaId === materiaPrimaId)) {
    poner("materiaPrimaId", "Esta materia prima ya está en el inventario.");
  }

  const entero = esUnidades(mp?.unidad);
  const { existenciaInicial, costoUnitario } = validarExistenciaYCosto(o, poner, entero, entero ? "300" : "12,5");

  return resultado(errores, () => ({
    materiaPrimaId: materiaPrimaId as number,
    existenciaInicial: existenciaInicial as number,
    costoUnitario: costoUnitario as number,
  }));
}
