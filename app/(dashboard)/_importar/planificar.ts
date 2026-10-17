// Plan de importación: parte de lo que ya tiene la app (`base`) y le agrega
// los registros de la planilla que todavía no están, aplicando cada uno con
// `aplicar()` (las mismas reglas y sincronizaciones que la carga a mano:
// inventario, consumos, lotes, FIFO de ventas). Lo que una regla rechaza queda
// como error de esa fila y no se importa; lo que se completó o se tomó por
// parecido queda como aviso.
//
// Importación incremental: el cliente puede seguir usando su Excel unos meses
// y volver a subirlo. Lo que ya está en la app se reconoce y no se toca:
//  - catálogos: por CUIT (si lo tiene) o por nombre; productos también por
//    código de barras; materias primas por nombre (los vendedores salen de las
//    ventas: si el nombre no está, se agrega);
//  - compras: misma fecha, materia prima y cantidad;
//  - órdenes: mismo producto y fecha de maceración;
//  - ventas: misma fecha, cliente, producto y cantidad;
//  - existencias iniciales: si esa materia prima ya está en el inventario, o
//    si ya hay un lote previo con ese número y producto.
// En compras, órdenes y ventas se cuentan las repeticiones (dos ventas
// iguales el mismo día en la planilla y una en la app → una es nueva).
//
// Lo que ya estaba se compara dato por dato con la planilla (modificar): lo
// que en la app estaba vacío se completa solo (ej. un CBU que faltaba); si la
// app ya tenía otro dato no se pisa: el usuario elige cuál dejar
// (`elecciones`). Un dato vacío en la planilla no borra el de la app. No se
// cambian los nombres (identifican el registro) ni los insumos de las órdenes.
//
// Puro: corre en el navegador para la vista previa y otra vez en el servidor
// al confirmar (el servidor no confía en lo que calculó la pantalla).
//
// Orden: vendedores, materias primas, productos, proveedores y clientes →
// existencias iniciales → compras → órdenes → ventas.

import { aplicar, ErrorNegocio, ESTADO_VACIO, type Accion, type Estado } from "../_dominio/acciones";
import {
  validarAltaInventario,
  validarAltaLote,
  validarCliente,
  validarCompra,
  validarMateriaPrima,
  validarOperacion,
  validarOrden,
  validarProducto,
  validarProveedor,
  validarVendedor,
} from "../_dominio/reglas";
import { saldoInventario, usadoDeCompra } from "../_dominio/sync";
import { CONDICIONES_IVA } from "../clientes/data";
import { CANALES, CONDICIONES } from "../operaciones/data";
import { UNIDADES_MEDIDA, type UnidadMedida } from "../materia-prima/data";
import { productoLabel, type ProductoRow } from "../productos/data";
import { COMPROBANTE_FORMS, MEDIOS_PAGO, stockDeCompra } from "../trazabilidad/data";
import type { OrdenInsumo } from "../ordenes-produccion/data";
import { fmtNumero } from "@/app/components/data-table/validacion";
import {
  a2,
  aFecha,
  aNumero,
  aTexto,
  buscarParecido,
  claveEnc,
  inferirUnidad,
  opcionDe,
  SINONIMOS_CANAL,
  SINONIMOS_CONDICION,
  SINONIMOS_IVA,
  SINONIMOS_MEDIO_PAGO,
} from "./normalizar";
import type { Extraccion, Origen, Registro, SeccionRegistro, Valor } from "./tipos";

export type Problema = {
  tipo: "error" | "aviso";
  seccion: SeccionRegistro;
  /** Registro al que corresponde (para corregirlo); sin clave = aviso general. */
  clave?: string;
  origen?: Origen;
  /** Campo del registro que se puede corregir. */
  campo?: string;
  mensaje: string;
};

export type ResumenSeccion = {
  seccion: SeccionRegistro;
  nombre: string;
  total: number;
  /** Ya estaban en la app, sin cambios: no se tocan. */
  existentes: number;
  /** Ya estaban en la app y en la planilla cambió algún dato: se actualizan. */
  modificados: number;
  /** Nuevos que se agregan. */
  importados: number;
  conError: number;
};

/** Qué dato dejar cuando la app y la planilla tienen datos distintos. */
export type Eleccion = "app" | "planilla";

/** Un dato que cambió en la planilla respecto de lo que tiene la app. */
export type CambioCampo = {
  campo: string;
  etiqueta: string;
  /** Lo que tiene la app ("(vacío)" si no tenía nada). */
  antes: string;
  /** Lo que trae la planilla (como queda guardado, si se aplicó). */
  despues: string;
  /** La app ya tenía otro dato: el usuario elige cuál dejar. Si estaba vacío, se completa solo. */
  conflicto: boolean;
  /** null = conflicto sin elegir (mientras tanto queda el de la app). */
  eleccion: Eleccion | null;
  aplicado: boolean;
  /** Por qué la app no aceptó el dato de la planilla. */
  rechazo?: string;
};

/** Clave de una elección: registro + campo. */
export const claveEleccion = (clave: string, campo: string) => `${clave}|${campo}`;

/** Un registro que ya estaba en la app y que la planilla trae con datos distintos. */
export type Modificacion = {
  clave: string;
  seccion: SeccionRegistro;
  origen: Origen;
  /** Qué registro es, para el usuario (ej. "LA COLMENA", "OP 12 · Alcohol"). */
  nombre: string;
  cambios: CambioCampo[];
  /** Se cambió al menos un dato. */
  aplicada: boolean;
};

/**
 * Resultado de comparar un total de la planilla con la app:
 *  - coincide: lo de la planilla quedó igual en la app.
 *  - yaEstaba: coincide y ya estaba todo en la app (no se agrega nada).
 *  - otrosDatos: no coincide porque la app tiene además datos cargados aparte
 *    (ej. el stock incluye compras hechas en la app). No es un problema.
 *  - conErrores: faltan las filas con error (se arregla corrigiéndolas).
 *  - distinto: no coincide por otra razón (ej. cálculos propios de la planilla).
 */
export type EstadoCotejo = "coincide" | "yaEstaba" | "otrosDatos" | "conErrores" | "distinto";

export type FilaCotejo = {
  concepto: string;
  planilla: number | null;
  /** Lo que queda en la app de lo que vino en la planilla (lo que ya estaba + lo nuevo). */
  app: number;
  /** Todo lo que tiene la app, con lo cargado aparte (que no está en la planilla). */
  totalApp: number;
  formato: "moneda" | "numero";
  coincide: boolean;
  estado: EstadoCotejo;
  /** Explicación para la pantalla. */
  detalle: string;
};

/** Compras, órdenes y ventas que la app ya tenía y que también están en la planilla (por id). */
type EnApp = { compras: Set<number>; ordenes: Set<number>; ventas: Set<number> };

export type UnidadMateria = { nombre: string; unidad: UnidadMedida; inferida: boolean };

export type Plan = {
  estado: Estado;
  problemas: Problema[];
  resumen: ResumenSeccion[];
  cotejo: FilaCotejo[];
  /** Unidades de las materias primas nuevas (las que ya están en la app no cambian). */
  unidades: UnidadMateria[];
  /** Claves de los registros que se agregan (para mostrar qué es nuevo). */
  nuevos: string[];
  /** Registros que ya estaban y cambiaron en la planilla (aplicados o no, según eligió el usuario). */
  modificaciones: Modificacion[];
};

export type OpcionesPlan = {
  /** Unidad elegida por el usuario para cada materia prima (clave: claveEnc del nombre). */
  unidades?: Record<string, UnidadMedida>;
  /** Lo que ya tiene la app: se le agrega lo nuevo. Sin base = app vacía. */
  base?: Estado;
  /** Qué dato dejar en cada conflicto (clave: claveEleccion). Sin elegir = queda el de la app. */
  elecciones?: Record<string, Eleccion>;
};

/** Hay algo para guardar: registros nuevos o datos que cambian. */
export const hayCambios = (p: Plan) => p.nuevos.length > 0 || p.modificaciones.some((m) => m.aplicada);

/** Conflictos (la app y la planilla tienen datos distintos) en los que todavía no se eligió cuál dejar. */
export const conflictosSinElegir = (p: Plan) =>
  p.modificaciones.reduce((n, m) => n + m.cambios.filter((c) => c.conflicto && c.eleccion === null).length, 0);

export const NOMBRES_SECCION: Record<SeccionRegistro, string> = {
  materiaPrima: "Materia prima",
  productos: "Productos",
  proveedores: "Proveedores",
  clientes: "Clientes",
  existenciaMP: "Existencias iniciales de materia prima",
  existenciaPT: "Lotes previos de productos terminados",
  compras: "Libro de compras",
  ordenes: "Órdenes de producción",
  ventas: "Ventas (Operaciones)",
};

const SIN_DATO = "Sin dato";
export const PROVEEDOR_SIN_IDENTIFICAR = "Proveedor sin identificar (planilla)";

/** Campo de la regla de la app → campo del registro (lo que el usuario puede corregir). */
const CAMPO_REGISTRO: Record<string, string> = {
  clienteId: "cliente",
  productoId: "producto",
  materiaPrimaId: "materiaPrima",
  proveedorId: "proveedor",
};

/** Aplica las correcciones que el usuario escribió en la pantalla de revisión. */
export function aplicarCorrecciones(registros: Registro[], correcciones: Record<string, Record<string, string>>): Registro[] {
  return registros.map((r) => (correcciones[r.clave] ? { ...r, v: { ...r.v, ...correcciones[r.clave] } } : r));
}

const numero = (v: Valor | undefined): number | null => {
  const n = aNumero(v ?? null);
  return n === null || Number.isNaN(n) ? null : n;
};

/** Los ids de la app por clave (para reconocer registros repetidos que ya están, contando repeticiones). */
function idsPorClave<T extends { id: number }>(filas: T[], clave: (x: T) => string): Map<string, number[]> {
  const m = new Map<string, number[]>();
  for (const x of filas) {
    const k = clave(x);
    m.set(k, [...(m.get(k) ?? []), x.id]);
  }
  return m;
}
/** Si la clave está entre las que ya tenía la app, la consume y devuelve el id del registro de la app. */
function consumir(m: Map<string, number[]>, k: string): number | null {
  return m.get(k)?.shift() ?? null;
}
const claveCompra = (fecha: string, mpId: number | null, cantidad: number | null) => `${fecha}|${mpId}|${cantidad === null ? "" : a2(cantidad)}`;
const claveOrden = (productoId: number | null, fechaMaceracion: string) => `${productoId}|${fechaMaceracion}`;
const claveVenta = (fecha: string, clienteId: number | null, productoId: number | null, cantidad: number | null) =>
  `${fecha}|${clienteId}|${productoId}|${cantidad === null ? "" : a2(cantidad)}`;
const soloDigitos = (t: string) => t.replace(/\D/g, "");

/** Un dato de un registro que ya está en la app, comparado con el de la planilla (ya normalizado como en el alta). */
type CampoComparado = {
  campo: string;
  etiqueta: string;
  actual: unknown;
  planilla: unknown;
  /** Si son el mismo dato aunque se escriban distinto (ej. CUIT con o sin guiones). */
  igual?: (a: unknown, b: unknown) => boolean;
  mostrar?: (v: unknown) => string;
};
const vacio = (v: unknown) => v === null || v === undefined || (typeof v === "string" && !v.trim());
/** Mismo dato: números a 2 decimales; textos sin distinguir mayúsculas, tildes ni signos ("Azúcar" = "AZUCAR"). */
const mismoValor = (a: unknown, b: unknown) =>
  typeof a === "number" || typeof b === "number" ? a2(Number(a)) === a2(Number(b)) : claveEnc(a) === claveEnc(b);
const mismosDigitos = (a: unknown, b: unknown) => soloDigitos(String(a ?? "")) === soloDigitos(String(b ?? ""));
const sinMayusculas = (a: unknown, b: unknown) => aTexto(String(a ?? "")).toLowerCase() === aTexto(String(b ?? "")).toLowerCase();
const mostrarValor = (v: unknown) => (typeof v === "number" ? fmtNumero(v) : aTexto(String(v ?? "")));
const mostrarPesos = (v: unknown) => (typeof v === "number" ? `$ ${fmtNumero(v)}` : mostrarValor(v));
/** CUIT como lo guarda la app (20-12345678-9). */
const mostrarCuit = (v: unknown) => {
  const d = soloDigitos(String(v ?? ""));
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : mostrarValor(v);
};
const fechaDMA = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split("-").reverse().join("/") : mostrarValor(v));

export function planificar(ext: Extraccion, op: OpcionesPlan = {}): Plan {
  let e: Estado = op.base ?? ESTADO_VACIO;
  const base = e;
  const problemas: Problema[] = [];
  const nuevos: string[] = [];
  const modificaciones: Modificacion[] = [];
  const conteo = new Map<SeccionRegistro, { total: number; existentes: number; modificados: number; importados: number; conError: number }>();
  // Lo que ya tenía la app, para reconocer compras, órdenes y ventas repetidas.
  const comprasBase = idsPorClave(base.compras, (c) => claveCompra(c.fecha, c.materiaPrimaId, c.cantidad));
  const ordenesBase = idsPorClave(base.ordenesProduccion, (o) => claveOrden(o.productoId, o.fechaMaceracion));
  const ventasBase = idsPorClave(base.operaciones, (o) => claveVenta(o.fecha, o.clienteId, o.productoId, o.cantidad));
  // Registros que la app ya tenía y que están en la planilla (para la comparación).
  const yaEnApp: EnApp = { compras: new Set(), ordenes: new Set(), ventas: new Set() };
  const grupos = new Map<string, { seccion: SeccionRegistro; n: number; ejemplo: string }>();
  const regs = (s: SeccionRegistro) => ext.registros.filter((r) => r.seccion === s);

  const contar = (s: SeccionRegistro, campo: "total" | "existentes" | "modificados" | "importados" | "conError") => {
    const c = conteo.get(s) ?? { total: 0, existentes: 0, modificados: 0, importados: 0, conError: 0 };
    c[campo]++;
    conteo.set(s, c);
  };
  /** El registro ya está en la app: no se toca. */
  const yaEstaba = (r: Registro) => {
    contar(r.seccion, "total");
    contar(r.seccion, "existentes");
  };
  const aviso = (r: Registro | null, s: SeccionRegistro, mensaje: string, campo?: string) =>
    problemas.push({ tipo: "aviso", seccion: s, ...(r ? { clave: r.clave, origen: r.origen } : {}), ...(campo ? { campo } : {}), mensaje });
  /** Aviso que se repite: se muestra una sola vez con la cantidad ("12 órdenes no tienen responsable…"). */
  const avisoGrupal = (s: SeccionRegistro, grupo: string, ejemplo = "") => {
    const g = grupos.get(grupo) ?? { seccion: s, n: 0, ejemplo };
    g.n++;
    grupos.set(grupo, g);
  };
  const error = (r: Registro, mensaje: string, campo?: string) =>
    problemas.push({ tipo: "error", seccion: r.seccion, clave: r.clave, origen: r.origen, ...(campo ? { campo } : {}), mensaje });

  let redondeos = 0;
  let ejemploRedondeo = "";
  /** Montos y cantidades a 2 decimales (lo que admite la app), contando cuántos se redondearon. */
  const r2 = (n: number | null): number | null => {
    if (n === null) return null;
    const x = a2(n);
    if (Math.abs(x - n) > 1e-6) {
      redondeos++;
      if (!ejemploRedondeo) ejemploRedondeo = `${n.toLocaleString("es-AR", { maximumFractionDigits: 4 })} → ${fmtNumero(x)}`;
    }
    return x;
  };

  /** Todos los errores de una fila (la acción frena en el primero): así se corrigen de una vez. */
  function todosLosErrores(a: Accion): [string, string][] {
    const v = "v" in a ? a.v : null;
    const r =
      a.tipo === "addCliente" ? validarCliente(v, e, null)
      : a.tipo === "addProveedor" ? validarProveedor(v, e, null)
      : a.tipo === "addMateriaPrima" ? validarMateriaPrima(v, e, null)
      : a.tipo === "addProducto" ? validarProducto(v, e, null)
      : a.tipo === "addVendedor" ? validarVendedor(v, e, null)
      : a.tipo === "saveCompra" ? validarCompra(v, e, null)
      : a.tipo === "saveOrden" ? validarOrden(v, e, null)
      : a.tipo === "addOperacion" ? validarOperacion(v, e)
      : a.tipo === "addInventarioMateriaPrima" ? validarAltaInventario(v, e)
      : a.tipo === "addLote" ? validarAltaLote(v, e)
      : null;
    return r && !r.ok ? Object.entries(r.errores) : [];
  }

  function errorDeCampo(r: Registro, campo: string | undefined, mensaje: string) {
    const lineaInsumo = campo ? /^insumos\.(\d+)\./.exec(campo) : null;
    const prefijo = lineaInsumo ? `Insumo ${Number(lineaInsumo[1]) + 1}: ` : "";
    // La regla dice "Elegí el producto." porque no lo encontró: acá se sabe cómo se llamaba en la planilla.
    const producto = aTexto(r.v.producto);
    if (campo === "productoId" && producto) {
      mensaje = `"${producto}" no está entre los productos de la app: elegí cuál es o agregalo a la lista de productos de la planilla y volvé a subirla.`;
    }
    error(r, prefijo + mensaje, campo ? (CAMPO_REGISTRO[campo] ?? (lineaInsumo ? undefined : campo)) : undefined);
  }

  /**
   * Aplica la acción de un registro. Si la regla rechaza un campo de
   * `descartables` (dato opcional mal cargado, ej. un teléfono), lo deja vacío,
   * avisa y prueba de nuevo. Cualquier otro rechazo es un error de la fila.
   */
  function intentar(r: Registro, accion: (v: Record<string, unknown>) => Accion, valores: Record<string, unknown>, descartables: Record<string, string> = {}): boolean {
    const v = { ...valores };
    contar(r.seccion, "total");
    for (let intento = 0; intento < 12; intento++) {
      try {
        e = aplicar(e, accion(v));
        contar(r.seccion, "importados");
        nuevos.push(r.clave);
        return true;
      } catch (err) {
        if (!(err instanceof ErrorNegocio)) throw err;
        const campo = err.campo;
        const vacio = campo === "precioPremium" ? null : "";
        if (campo && campo in descartables && v[campo] !== vacio && v[campo] !== "" && v[campo] !== null && v[campo] !== undefined) {
          aviso(r, r.seccion, `Se dejó vacío ${descartables[campo]} ("${String(v[campo])}"): ${err.message}`, campo);
          v[campo] = vacio;
          continue;
        }
        const todos = todosLosErrores(accion(v)).filter(([c]) => !(c in descartables));
        if (todos.length) for (const [c, m] of todos) errorDeCampo(r, c, m);
        else errorDeCampo(r, campo, err.message);
        contar(r.seccion, "conError");
        return false;
      }
    }
    contar(r.seccion, "conError");
    return false;
  }

  /**
   * Un registro que ya está en la app: compara campo por campo con la
   * planilla. Un dato vacío en la planilla no borra el de la app.
   *  - Si en la app estaba vacío (ej. un CBU que faltaba), se completa solo.
   *  - Si la app ya tenía otro dato, no se pisa: queda como conflicto y el
   *    usuario elige cuál dejar (`elecciones`); hasta que elija, queda el de la app.
   * Si la regla de la app rechaza un dato, ese no se cambia (aviso) y el resto sí.
   */
  function modificar(
    r: Registro,
    nombre: string,
    campos: CampoComparado[],
    accion: (cambios: Record<string, unknown>) => Accion,
    /** El registro como quedó en la app (para mostrar el dato nuevo ya normalizado, ej. el CUIT con guiones). */
    leer: () => object
  ) {
    const distintos = campos.filter((c) => !vacio(c.planilla) && !(c.igual ?? mismoValor)(c.actual, c.planilla));
    if (!distintos.length) {
      yaEstaba(r);
      return;
    }
    const cambios: CambioCampo[] = distintos.map((c) => {
      const ver = c.mostrar ?? mostrarValor;
      const conflicto = !vacio(c.actual);
      return {
        campo: c.campo,
        etiqueta: c.etiqueta,
        antes: conflicto ? ver(c.actual) : "(vacío)",
        despues: ver(c.planilla),
        conflicto,
        eleccion: conflicto ? (op.elecciones?.[claveEleccion(r.clave, c.campo)] ?? null) : "planilla",
        aplicado: false,
      };
    });
    let aAplicar = distintos.filter((_, i) => cambios[i].eleccion === "planilla");
    while (aAplicar.length) {
      try {
        e = aplicar(e, accion(Object.fromEntries(aAplicar.map((c) => [c.campo, c.planilla]))));
        const guardado = leer() as Record<string, unknown>;
        for (const c of aAplicar) {
          const cambio = cambios[distintos.indexOf(c)];
          cambio.aplicado = true;
          if (c.campo in guardado) cambio.despues = (c.mostrar ?? mostrarValor)(guardado[c.campo]);
        }
        break;
      } catch (err) {
        if (!(err instanceof ErrorNegocio)) throw err;
        const rechazado = aAplicar.find((c) => c.campo === err.campo);
        if (!rechazado) {
          aviso(r, r.seccion, `No se pudieron actualizar los datos que cambiaron en la planilla: ${err.message}`);
          break;
        }
        cambios[distintos.indexOf(rechazado)].rechazo = err.message;
        aviso(r, r.seccion, `No se cambió ${rechazado.etiqueta.toLowerCase()} ("${(rechazado.mostrar ?? mostrarValor)(rechazado.planilla)}"): ${err.message}`, rechazado.campo);
        aAplicar = aAplicar.filter((c) => c !== rechazado);
      }
    }
    // Lo que la app rechazó ya quedó como aviso: no hay nada que mostrar ni elegir.
    const validos = cambios.filter((c) => !c.rechazo);
    const aplicada = validos.some((c) => c.aplicado);
    if (validos.length) modificaciones.push({ clave: r.clave, seccion: r.seccion, origen: r.origen, nombre, cambios: validos, aplicada });
    if (aplicada) {
      contar(r.seccion, "total");
      contar(r.seccion, "modificados");
    } else yaEstaba(r);
  }

  // ── Vendedores: los que aparecen en las ventas (la lista de la planilla no se importa) ──
  const vendedores: string[] = [];
  for (const r of regs("ventas")) {
    const nombre = aTexto(r.v.vendedor);
    if (nombre && !buscarParecido(nombre, [...vendedores.map((n) => ({ nombre: n })), ...base.vendedores], (x) => [x.nombre])) {
      vendedores.push(nombre);
    }
  }
  for (const nombre of vendedores) {
    try {
      e = aplicar(e, { tipo: "addVendedor", v: { nombre } });
      avisoGrupal("ventas", "vendedores que figuran en las ventas y no estaban en la app: se agregaron", nombre);
    } catch {
      /* nombre inválido: la venta lo va a marcar */
    }
  }
  const vendedorDe = (texto: string) => buscarParecido(texto, e.vendedores, (x) => [x.nombre]);

  // ── Materias primas: la lista + las que aparecen en compras, órdenes e inventarios ──
  /** Nombre en la planilla → nombre en el catálogo de la app. */
  const materiaDe = new Map<string, string>();
  type Materia = { nombre: string; unidad: string; r: Registro | null; existente?: true };
  // Las que ya tiene la app primero: así lo de la planilla se reconoce contra ellas.
  const materias: Materia[] = base.materiaPrima.map((m) => ({ nombre: m.nombre, unidad: m.unidad, r: null, existente: true }));
  for (const r of regs("materiaPrima")) {
    const nombre = aTexto(r.v.nombre);
    if (!nombre) continue;
    const ya = buscarParecido(nombre, materias, (m) => [m.nombre]);
    if (ya?.valor.existente) {
      materiaDe.set(claveEnc(nombre), ya.valor.nombre);
      yaEstaba(r);
      continue;
    }
    if (ya && claveEnc(ya.valor.nombre) === claveEnc(nombre)) {
      aviso(r, "materiaPrima", `"${nombre}" está repetida en la lista: se carga una sola vez.`);
      continue;
    }
    materias.push({ nombre, unidad: aTexto(r.v.unidad), r });
  }
  const referidas: { nombre: string; donde: string }[] = [
    ...regs("existenciaMP").map((r) => ({ nombre: aTexto(r.v.materiaPrima), donde: "el inventario" })),
    ...regs("compras").map((r) => ({ nombre: aTexto(r.v.materiaPrima), donde: "las compras" })),
    ...regs("ordenes").flatMap((r) => (r.insumos ?? []).map((i) => ({ nombre: aTexto(i.v.materiaPrima), donde: "las órdenes" }))),
  ];
  for (const { nombre, donde } of referidas) {
    const k = claveEnc(nombre);
    if (!k || materiaDe.has(k)) continue;
    const p = buscarParecido(nombre, materias, (m) => [m.nombre]);
    if (p) {
      materiaDe.set(k, p.valor.nombre);
      if (!p.exacto) aviso(null, "materiaPrima", `"${nombre}" (en ${donde}) se tomó como la materia prima "${p.valor.nombre}".`);
    } else {
      materias.push({ nombre, unidad: "", r: null });
      materiaDe.set(k, nombre);
      avisoGrupal("materiaPrima", "materias primas que figuran en compras, órdenes o inventarios pero no en la lista: se agregaron", nombre);
    }
  }
  const unidades: UnidadMateria[] = [];
  for (const m of materias) {
    const k = claveEnc(m.nombre);
    materiaDe.set(k, m.nombre);
    if (m.existente) continue;
    const elegida = op.unidades?.[k];
    const deLaPlanilla = opcionDe(m.unidad, UNIDADES_MEDIDA, { kg: "Kilogramos", kilos: "Kilogramos", kilo: "Kilogramos", l: "Litros", lt: "Litros", lts: "Litros", u: "Unidades", un: "Unidades", unid: "Unidades", m: "Metros", mts: "Metros" });
    const valida = (UNIDADES_MEDIDA as string[]).includes(deLaPlanilla) ? (deLaPlanilla as UnidadMedida) : null;
    const unidad = elegida ?? valida ?? inferirUnidad(m.nombre);
    unidades.push({ nombre: m.nombre, unidad, inferida: !elegida && !valida });
    const r = m.r ?? { seccion: "materiaPrima" as const, clave: `materiaPrima:${m.nombre}`, origen: { hoja: "", fila: 0 }, v: { nombre: m.nombre } };
    intentar(r, (v) => ({ tipo: "addMateriaPrima", v }), { nombre: m.nombre, unidad });
  }
  const materiaId = (nombre: string) => e.materiaPrima.find((m) => m.nombre === materiaDe.get(claveEnc(nombre)))?.id ?? null;
  const unidadDe = (id: number | null) => e.materiaPrima.find((m) => m.id === id)?.unidad;

  // ── Productos ──
  const nombreExcel = new Map<number, string>();
  for (const r of regs("productos")) {
    const codigo = aTexto(r.v.codigoBarras).toUpperCase();
    const ya = base.productos.find(
      (p) =>
        (codigo && p.codigoBarras.toUpperCase() === codigo) ||
        (claveEnc(p.nombre) === claveEnc(aTexto(r.v.nombre)) && claveEnc(p.formato) === claveEnc(aTexto(r.v.formato)))
    );
    if (ya) {
      // Se recuerda cómo lo nombra la planilla, para reconocerlo en ventas y órdenes.
      nombreExcel.set(ya.id, aTexto(r.v.nombreExcel));
      const { id, ...actual } = e.productos.find((p) => p.id === ya.id)!;
      modificar(
        r,
        productoLabel(ya),
        [
          { campo: "codigoBarras", etiqueta: "Código de barras", actual: actual.codigoBarras, planilla: aTexto(r.v.codigoBarras), igual: sinMayusculas },
          { campo: "precioUnitario", etiqueta: "Precio unitario", actual: actual.precioUnitario, planilla: r2(numero(r.v.precioUnitario)), mostrar: mostrarPesos },
        ],
        (c) => ({ tipo: "updateProducto", id, v: { ...actual, ...c } }),
        () => e.productos.find((x) => x.id === id)!
      );
      continue;
    }
    const idPrevio = e.productos.length;
    const ok = intentar(
      r,
      (v) => ({ tipo: "addProducto", v }),
      {
        nombre: aTexto(r.v.nombre),
        formato: aTexto(r.v.formato) || "Unidad",
        codigoBarras: aTexto(r.v.codigoBarras),
        precioUnitario: r2(numero(r.v.precioUnitario)),
      },
      { codigoBarras: "el código de barras" }
    );
    if (ok && e.productos.length > idPrevio) nombreExcel.set(e.productos[e.productos.length - 1].id, aTexto(r.v.nombreExcel));
  }
  const clavesProducto = (p: ProductoRow) => [nombreExcel.get(p.id) ?? "", `${p.nombre} ${p.formato}`, productoLabel(p)];
  const productoDe = (texto: string) => buscarParecido(texto, e.productos, clavesProducto);

  // ── Proveedores ──
  const mismoCuit = (a: string, b: string) => soloDigitos(a).length === 11 && soloDigitos(a) === soloDigitos(b);
  for (const r of regs("proveedores")) {
    const cuitProv = aTexto(r.v.cuitCuil);
    const contacto = aTexto(r.v.contacto);
    const producto = aTexto(r.v.producto);
    const original = aTexto(r.v.cbuAliasOriginal);
    const avisoAlias = () =>
      r.v.aliasAjustado &&
      aviso(r, "proveedores", `Se tomó el alias "${aTexto(r.v.alias)}" de "${original}" (sin los espacios, que un alias no admite): revisalo en Proveedores.`, "alias");
    const ya =base.proveedores.find((p) => mismoCuit(cuitProv, p.cuitCuil) || claveEnc(p.razonSocial) === claveEnc(aTexto(r.v.razonSocial)));
    if (ya) {
      const { id, ...actual } = e.proveedores.find((p) => p.id === ya.id)!;
      if (!sinMayusculas(actual.alias ?? "", r.v.alias)) avisoAlias();
      modificar(
        r,
        actual.razonSocial,
        [
          { campo: "contacto", etiqueta: "Contacto", actual: actual.contacto === SIN_DATO ? "" : actual.contacto, planilla: contacto },
          { campo: "producto", etiqueta: "Producto", actual: actual.producto === SIN_DATO ? "" : actual.producto, planilla: producto },
          { campo: "cuitCuil", etiqueta: "CUIT / CUIL", actual: actual.cuitCuil, planilla: cuitProv, igual: mismosDigitos, mostrar: mostrarCuit },
          { campo: "email", etiqueta: "Email", actual: actual.email, planilla: aTexto(r.v.email), igual: sinMayusculas },
          { campo: "telefono", etiqueta: "Teléfono", actual: actual.telefono, planilla: aTexto(r.v.telefono), igual: mismosDigitos },
          { campo: "cbu", etiqueta: "CBU", actual: actual.cbu ?? "", planilla: aTexto(r.v.cbu), igual: mismosDigitos },
          { campo: "alias", etiqueta: "Alias", actual: actual.alias ?? "", planilla: aTexto(r.v.alias), igual: sinMayusculas },
        ],
        (c) => ({ tipo: "updateProveedor", id, v: { ...actual, ...c } }),
        () => e.proveedores.find((x) => x.id === id)!
      );
      continue;
    }
    if (!contacto) avisoGrupal("proveedores", `proveedores sin contacto en la planilla: se cargaron con "${SIN_DATO}" (completalo en Proveedores)`, aTexto(r.v.razonSocial));
    if (!producto) avisoGrupal("proveedores", `proveedores sin producto en la planilla: se cargaron con "${SIN_DATO}"`, aTexto(r.v.razonSocial));
    if (original && !aTexto(r.v.cbu) && !aTexto(r.v.alias)) {
      aviso(r, "proveedores", `No se encontró un CBU (22 números) ni un alias en "${original}": quedaron vacíos.`, "cbu");
    }
    avisoAlias();
    intentar(
      r,
      (v) => ({ tipo: "addProveedor", v }),
      {
        razonSocial: aTexto(r.v.razonSocial),
        contacto: contacto || SIN_DATO,
        producto: producto || SIN_DATO,
        cuitCuil: aTexto(r.v.cuitCuil),
        email: aTexto(r.v.email),
        telefono: aTexto(r.v.telefono),
        cbu: aTexto(r.v.cbu),
        alias: aTexto(r.v.alias),
      },
      { cuitCuil: "el CUIT/CUIL", email: "el email", telefono: "el teléfono", cbu: "el CBU", alias: "el alias" }
    );
  }
  const proveedorDe = (texto: string) => buscarParecido(texto, e.proveedores, (p) => [p.razonSocial]);

  // ── Clientes ──
  const preciosTrad = regs("clientes").map((r) => numero(r.v.precioTradicional)).filter((n): n is number => n !== null && n > 0);
  const moda = preciosTrad.length
    ? [...preciosTrad.reduce((m, p) => m.set(p, (m.get(p) ?? 0) + 1), new Map<number, number>())].sort((a, b) => b[1] - a[1])[0][0]
    : null;
  for (const r of regs("clientes")) {
    const cuit = aTexto(r.v.cuit);
    const ya = base.clientes.find((c) => mismoCuit(cuit, c.cuit) || claveEnc(c.razonSocial) === claveEnc(aTexto(r.v.razonSocial)));
    if (ya) {
      const { id, ...actual } = e.clientes.find((c) => c.id === ya.id)!;
      modificar(
        r,
        actual.razonSocial,
        [
          { campo: "apellidoNombre", etiqueta: "Apellido y nombre", actual: actual.apellidoNombre, planilla: aTexto(r.v.apellidoNombre) },
          { campo: "condicionIva", etiqueta: "Condición de IVA", actual: actual.condicionIva, planilla: opcionDe(r.v.condicionIva, CONDICIONES_IVA, SINONIMOS_IVA) },
          { campo: "cuit", etiqueta: "CUIT", actual: actual.cuit, planilla: cuit, igual: mismosDigitos, mostrar: mostrarCuit },
          { campo: "telefono", etiqueta: "Teléfono", actual: actual.telefono, planilla: aTexto(r.v.telefono), igual: mismosDigitos },
          { campo: "email", etiqueta: "Email", actual: actual.email, planilla: aTexto(r.v.email), igual: sinMayusculas },
          { campo: "domicilio", etiqueta: "Domicilio", actual: actual.domicilio, planilla: aTexto(r.v.domicilio) },
          { campo: "precioTradicional", etiqueta: "Precio tradicional", actual: actual.precioTradicional, planilla: r2(numero(r.v.precioTradicional)), mostrar: mostrarPesos },
          { campo: "precioPremium", etiqueta: "Precio premium", actual: actual.precioPremium, planilla: r2(numero(r.v.precioPremium)), mostrar: mostrarPesos },
        ],
        (c) => ({ tipo: "updateCliente", id, v: { ...actual, ...c } }),
        () => e.clientes.find((x) => x.id === id)!
      );
      continue;
    }
    let condicionIva = opcionDe(r.v.condicionIva, CONDICIONES_IVA, SINONIMOS_IVA);
    if (!condicionIva) {
      condicionIva = "Consumidor Final";
      if (cuit) aviso(r, "clientes", `No tiene condición de IVA en la planilla: se cargó como Consumidor Final (revisala en Clientes).`, "condicionIva");
      else avisoGrupal("clientes", "clientes sin CUIT ni condición de IVA: se cargaron como Consumidor Final", aTexto(r.v.razonSocial));
    }
    let precioTradicional = r2(numero(r.v.precioTradicional));
    if (!precioTradicional && moda) {
      precioTradicional = moda;
      aviso(r, "clientes", `No tiene precio tradicional: se usó el más común de la lista ($ ${fmtNumero(moda)}).`, "precioTradicional");
    }
    intentar(
      r,
      (v) => ({ tipo: "addCliente", v }),
      {
        razonSocial: aTexto(r.v.razonSocial),
        apellidoNombre: aTexto(r.v.apellidoNombre),
        condicionIva,
        cuit,
        telefono: aTexto(r.v.telefono),
        email: aTexto(r.v.email),
        domicilio: aTexto(r.v.domicilio),
        precioTradicional,
        precioPremium: r2(numero(r.v.precioPremium)),
      },
      { telefono: "el teléfono", email: "el email", domicilio: "el domicilio", apellidoNombre: "el apellido y nombre", precioPremium: "el precio premium" }
    );
  }
  const clienteDe = (texto: string) => buscarParecido(texto, e.clientes, (c) => [c.razonSocial, c.apellidoNombre].filter(Boolean));

  // ── Existencias iniciales de materia prima (fila EI de cada inventario) ──
  for (const r of regs("existenciaMP")) {
    const id = materiaId(aTexto(r.v.materiaPrima));
    if (base.inventarioMateriaPrima.some((x) => x.materiaPrimaId === id)) {
      yaEstaba(r);
      continue;
    }
    const entero = unidadDe(id) === "Unidades";
    const existencia = numero(r.v.existenciaInicial);
    intentar(r, (v) => ({ tipo: "addInventarioMateriaPrima", v: v as never }), {
      materiaPrimaId: id,
      existenciaInicial: entero && existencia !== null ? Math.round(existencia) : r2(existencia),
      costoUnitario: r2(numero(r.v.costoUnitario)) ?? 0,
    });
  }

  // ── Lotes de productos terminados previos (fila EI de cada inventario de producto) ──
  for (const r of regs("existenciaPT")) {
    const p = productoDe(aTexto(r.v.producto));
    let lote = numero(r.v.lote);
    if (lote === null || lote <= 0) {
      lote = e.productosTerminados.reduce((m, l) => Math.max(m, l.lote), 0) + 1;
      aviso(r, "existenciaPT", `El lote no tiene número en la planilla: se le asignó el ${lote}.`);
    }
    if (base.productosTerminados.some((l) => l.lote === lote && l.productoId === p?.valor.id && l.origenOrdenId === undefined)) {
      yaEstaba(r);
      continue;
    }
    intentar(r, (v) => ({ tipo: "addLote", v }), {
      productoId: p?.valor.id ?? null,
      lote,
      existenciaInicial: numero(r.v.existenciaInicial),
      costoUnitario: r2(numero(r.v.costoUnitario)) ?? 0,
      fechaVencimiento: aFecha(r.v.fechaVencimiento ?? null),
    });
  }

  // ── Compras ──
  const porNumero = (a: Registro, b: Registro) =>
    (numero(a.v.numero) ?? Number.MAX_SAFE_INTEGER) - (numero(b.v.numero) ?? Number.MAX_SAFE_INTEGER) || a.origen.fila - b.origen.fila;
  let sinProveedorId: number | null = base.proveedores.find((p) => p.razonSocial === PROVEEDOR_SIN_IDENTIFICAR)?.id ?? null;
  for (const r of regs("compras").sort(porNumero)) {
    const mpId = materiaId(aTexto(r.v.materiaPrima));
    const unidadCompra = unidadDe(mpId);
    const cantidadPlanilla = numero(r.v.cantidad);
    const cantidad =
      unidadCompra === "Unidades" && cantidadPlanilla !== null && Math.abs(cantidadPlanilla - Math.round(cantidadPlanilla)) < 1e-6
        ? Math.round(cantidadPlanilla)
        : r2(cantidadPlanilla);
    const porKilo = unidadCompra === "Kilogramos";
    const comprobanteNumero = aTexto(r.v.comprobanteNumero);
    const comprobanteForm =
      comprobanteNumero || aTexto(r.v.comprobanteTipo) || aTexto(r.v.comprobanteForm) ? opcionDe(r.v.comprobanteForm, COMPROBANTE_FORMS) : "";
    const medio = opcionDe(r.v.medioPago, MEDIOS_PAGO.map((m) => m.value), SINONIMOS_MEDIO_PAGO);
    const enApp = consumir(comprasBase, claveCompra(aFecha(r.v.fecha), mpId, cantidad));
    if (enApp !== null) {
      yaEnApp.compras.add(enApp);
      const { id, ...actual } = e.compras.find((c) => c.id === enApp)!;
      const nombreProv = aTexto(r.v.proveedor);
      const prov = nombreProv ? proveedorDe(nombreProv) : null;
      const proveedorNombre = (pid: unknown) => e.proveedores.find((p) => p.id === pid)?.razonSocial ?? "";
      const campos: CampoComparado[] = [
        { campo: "costoUnitario", etiqueta: "Costo unitario", actual: actual.costoUnitario, planilla: r2(numero(r.v.costoUnitario)), mostrar: mostrarPesos },
        { campo: "lote", etiqueta: "Lote", actual: actual.lote, planilla: aTexto(r.v.lote) },
        { campo: "proveedorId", etiqueta: "Proveedor", actual: actual.proveedorId, planilla: prov?.valor.id ?? null, igual: (a, b) => a === b, mostrar: proveedorNombre },
        { campo: "comprobanteForm", etiqueta: "Comprobante", actual: actual.comprobanteForm, planilla: comprobanteForm },
        { campo: "comprobanteTipo", etiqueta: "Tipo de comprobante", actual: actual.comprobanteTipo, planilla: aTexto(r.v.comprobanteTipo).toUpperCase() },
        { campo: "comprobanteNumero", etiqueta: "N° de comprobante", actual: actual.comprobanteNumero, planilla: comprobanteNumero },
        { campo: "medioPago", etiqueta: "Medio de pago", actual: actual.medioPago, planilla: medio },
      ];
      if (porKilo) {
        campos.push({ campo: "cantidadCascara", etiqueta: "Kilos de cáscara", actual: actual.cantidadCascara ?? null, planilla: r2(numero(r.v.cantidadCascara)) });
      }
      modificar(
        r,
        `OP ${id} · ${materiaDe.get(claveEnc(aTexto(r.v.materiaPrima))) ?? aTexto(r.v.materiaPrima)}`,
        campos,
        (c) => ({ tipo: "saveCompra", id, v: { ...actual, ...c } as never }),
        () => e.compras.find((x) => x.id === id)!
      );
      continue;
    }
    const nombreProveedor = aTexto(r.v.proveedor);
    let proveedorId: number | null = null;
    if (nombreProveedor) {
      const p = proveedorDe(nombreProveedor);
      if (p) {
        proveedorId = p.valor.id;
        if (!p.exacto) aviso(r, "compras", `El proveedor "${nombreProveedor}" se tomó como "${p.valor.razonSocial}".`, "proveedor");
      } else {
        try {
          e = aplicar(e, {
            tipo: "addProveedor",
            v: { razonSocial: nombreProveedor, contacto: SIN_DATO, producto: aTexto(r.v.materiaPrima) || SIN_DATO },
          });
          proveedorId = e.proveedores[e.proveedores.length - 1].id;
          aviso(r, "proveedores", `Se agregó el proveedor "${nombreProveedor}": figura en las compras pero no en la lista de proveedores.`);
        } catch {
          /* nombre inválido: lo marca la compra */
        }
      }
    } else {
      if (sinProveedorId === null) {
        e = aplicar(e, { tipo: "addProveedor", v: { razonSocial: PROVEEDOR_SIN_IDENTIFICAR, contacto: SIN_DATO, producto: SIN_DATO } });
        sinProveedorId = e.proveedores[e.proveedores.length - 1].id;
      }
      proveedorId = sinProveedorId;
      avisoGrupal("compras", `compras sin proveedor en la planilla: quedaron con "${PROVEEDOR_SIN_IDENTIFICAR}" (podés cambiarlo en Trazabilidad)`, `OP ${aTexto(r.v.numero)}`);
    }
    intentar(
      r,
      (v) => ({ tipo: "saveCompra", id: null, v: v as never }),
      {
        fecha: aFecha(r.v.fecha),
        materiaPrimaId: mpId,
        cantidad,
        costoUnitario: r2(numero(r.v.costoUnitario)),
        cantidadCascara: porKilo ? r2(numero(r.v.cantidadCascara)) : null,
        lote: aTexto(r.v.lote),
        proveedorId,
        comprobanteForm,
        comprobanteTipo: aTexto(r.v.comprobanteTipo).toUpperCase(),
        comprobanteNumero,
        medioPago: medio,
      },
      { lote: "el lote", cantidadCascara: "los kilos de cáscara" }
    );
  }

  // ── Órdenes de producción: cada insumo sale de las compras por FIFO ──
  let sinResponsable = 0;
  for (const r of regs("ordenes").sort(porNumero)) {
    const p = productoDe(aTexto(r.v.producto));
    const fechaMaceracion = aFecha(r.v.fechaMaceracion);
    const ordenEnApp = consumir(ordenesBase, claveOrden(p?.valor.id ?? null, fechaMaceracion));
    if (ordenEnApp !== null) {
      yaEnApp.ordenes.add(ordenEnApp);
      // Los insumos no se tocan (salen de las compras por FIFO al cargarla); sí
      // el embotellado, las botellas producidas y el responsable.
      const o = e.ordenesProduccion.find((x) => x.id === ordenEnApp)!;
      const actual = {
        productoId: o.productoId,
        fechaMaceracion: o.fechaMaceracion,
        fechaEmbotellado: o.fechaEmbotellado ?? "",
        responsable: o.responsable,
        cantidadProducida: o.cantidadProducida,
        insumos: o.insumos,
      };
      modificar(
        r,
        `O.P. ${o.id} · ${productoLabel(p!.valor)}`,
        [
          { campo: "fechaEmbotellado", etiqueta: "Fecha de embotellado", actual: actual.fechaEmbotellado, planilla: aFecha(r.v.fechaEmbotellado), mostrar: fechaDMA },
          { campo: "cantidadProducida", etiqueta: "Botellas producidas", actual: actual.cantidadProducida, planilla: numero(r.v.cantidadProducida) },
          { campo: "responsable", etiqueta: "Responsable", actual: actual.responsable === SIN_DATO ? "" : actual.responsable, planilla: aTexto(r.v.responsable) },
        ],
        (c) => ({ tipo: "saveOrden", id: o.id, v: { ...actual, ...c } as never }),
        () => e.ordenesProduccion.find((x) => x.id === o.id)!
      );
      continue;
    }
    if (p && !p.exacto) aviso(r, "ordenes", `El producto "${aTexto(r.v.producto)}" se tomó como "${productoLabel(p.valor)}".`, "producto");
    const insumos: OrdenInsumo[] = [];
    const usadoAca = new Map<number, number>();
    for (const i of r.insumos ?? []) {
      const nombre = materiaDe.get(claveEnc(aTexto(i.v.materiaPrima))) ?? aTexto(i.v.materiaPrima);
      const mpId = materiaId(nombre);
      const cantidadBruta = numero(i.v.cantidad);
      if (!cantidadBruta) {
        aviso(r, "ordenes", `El insumo "${nombre}" de la fila ${i.origen.fila} no tiene cantidad: no se cargó.`);
        continue;
      }
      const costoTotal = numero(i.v.costoTotal);
      const compras = e.compras
        .filter((c) => c.materiaPrimaId === mpId && c.fecha <= fechaMaceracion)
        .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id);
      let costoUnitario = costoTotal !== null ? costoTotal / cantidadBruta : null;
      if (costoUnitario === null) {
        const ultima = compras[compras.length - 1];
        if (ultima) {
          costoUnitario = ultima.costoUnitario;
          aviso(r, "ordenes", `El insumo "${nombre}" no tiene costo en la planilla: se usó el de la última compra ($ ${fmtNumero(ultima.costoUnitario)}).`);
        }
      }
      const entero = unidadDe(mpId) === "Unidades";
      let restante = entero ? Math.round(cantidadBruta) : (r2(cantidadBruta) ?? 0);
      const cu = r2(costoUnitario) ?? (null as unknown as number);
      for (const c of compras) {
        if (restante <= 0) break;
        const disponible = a2(stockDeCompra(c) - usadoDeCompra(e.ordenesProduccion, c.id) - (usadoAca.get(c.id) ?? 0));
        if (disponible <= 0) continue;
        const toma = Math.min(disponible, restante);
        insumos.push({ materiaPrima: nombre, cantidad: a2(toma), costoUnitario: cu, compraId: c.id });
        usadoAca.set(c.id, (usadoAca.get(c.id) ?? 0) + toma);
        restante = a2(restante - toma);
      }
      // Lo que no alcanza con las compras sale de la existencia inicial (sin compra asociada).
      if (restante > 0) insumos.push({ materiaPrima: nombre, cantidad: restante, costoUnitario: cu });
    }
    const costoEI = numero(r.v.costoEI);
    if (costoEI) {
      aviso(r, "ordenes", `La planilla suma $ ${fmtNumero(costoEI)} de existencia inicial (EI) que no es un insumo: el costo del lote en la app no lo incluye.`);
    }
    const responsable = aTexto(r.v.responsable);
    if (!responsable) sinResponsable++;
    intentar(r, (v) => ({ tipo: "saveOrden", id: null, v: v as never }), {
      productoId: p?.valor.id ?? null,
      fechaMaceracion,
      fechaEmbotellado: aFecha(r.v.fechaEmbotellado),
      responsable: responsable || SIN_DATO,
      cantidadProducida: numero(r.v.cantidadProducida),
      insumos,
    });
  }
  if (sinResponsable) {
    grupos.set(`órdenes sin responsable en la planilla: se cargaron con "${SIN_DATO}"`, { seccion: "ordenes", n: sinResponsable, ejemplo: "" });
  }

  // ── Ventas ──
  for (const r of regs("ventas").sort(porNumero)) {
    const nombreCliente = aTexto(r.v.cliente);
    let clienteId: number | null = null;
    const c = clienteDe(nombreCliente);
    const productoVenta = productoDe(aTexto(r.v.producto));
    const ventaEnApp = c && productoVenta ? consumir(ventasBase, claveVenta(aFecha(r.v.fecha), c.valor.id, productoVenta.valor.id, numero(r.v.cantidad))) : null;
    if (ventaEnApp !== null) {
      yaEnApp.ventas.add(ventaEnApp);
      const o = e.operaciones.find((x) => x.id === ventaEnApp)!;
      const actual = { fecha: o.fecha, clienteId: o.clienteId, vendedor: o.vendedor, productoId: o.productoId, cantidad: o.cantidad, canal: o.canal, condicion: o.condicion, pu: o.pu };
      const nombreVendedor = aTexto(r.v.vendedor);
      modificar(
        r,
        `OP ${o.id} · ${o.cliente} · ${o.descripcion}`,
        [
          { campo: "vendedor", etiqueta: "Vendedor", actual: actual.vendedor, planilla: nombreVendedor ? (vendedorDe(nombreVendedor)?.valor.nombre ?? nombreVendedor) : "" },
          { campo: "canal", etiqueta: "Canal", actual: actual.canal, planilla: opcionDe(r.v.canal, CANALES, SINONIMOS_CANAL) },
          { campo: "condicion", etiqueta: "Condición", actual: actual.condicion, planilla: opcionDe(r.v.condicion, CONDICIONES, SINONIMOS_CONDICION) },
          { campo: "pu", etiqueta: "Precio unitario", actual: actual.pu, planilla: r2(numero(r.v.pu)), mostrar: mostrarPesos },
        ],
        (c) => ({ tipo: "updateOperacion", id: o.id, v: { ...actual, ...c } as never }),
        () => e.operaciones.find((x) => x.id === o.id)!
      );
      continue;
    }
    if (c) {
      clienteId = c.valor.id;
      if (!c.exacto) aviso(r, "ventas", `El cliente "${nombreCliente}" se tomó como "${c.valor.razonSocial}".`, "cliente");
    } else if (nombreCliente) {
      try {
        e = aplicar(e, {
          tipo: "addCliente",
          v: { razonSocial: nombreCliente, condicionIva: "Consumidor Final", precioTradicional: r2(numero(r.v.pu)) ?? moda },
        });
        clienteId = e.clientes[e.clientes.length - 1].id;
        aviso(r, "clientes", `Se agregó el cliente "${nombreCliente}" (Consumidor Final): figura en las ventas pero no en la lista de clientes.`);
      } catch {
        /* lo marca la venta */
      }
    }
    const p = productoVenta;
    if (p && !p.exacto) aviso(r, "ventas", `El producto "${aTexto(r.v.producto)}" se tomó como "${productoLabel(p.valor)}".`, "producto");
    const nombreVendedor = aTexto(r.v.vendedor);
    let vendedor = vendedorDe(nombreVendedor)?.valor.nombre ?? nombreVendedor;
    if (!nombreVendedor && e.vendedores.length) {
      vendedor = e.vendedores[0].nombre;
      avisoGrupal("ventas", `ventas sin vendedor en la planilla: se cargaron a "${vendedor}"`);
    }
    let canal = opcionDe(r.v.canal, CANALES, SINONIMOS_CANAL);
    if (!canal) {
      canal = "Menor";
      avisoGrupal("ventas", `ventas sin canal en la planilla: se cargaron como "Menor"`);
    }
    let condicion = opcionDe(r.v.condicion, CONDICIONES, SINONIMOS_CONDICION);
    if (!condicion) {
      condicion = "Contado";
      avisoGrupal("ventas", `ventas sin condición en la planilla: se cargaron como "Contado"`);
    }
    intentar(r, (v) => ({ tipo: "addOperacion", v: v as never }), {
      fecha: aFecha(r.v.fecha),
      clienteId,
      vendedor,
      productoId: p?.valor.id ?? null,
      cantidad: numero(r.v.cantidad),
      canal,
      condicion,
      pu: r2(numero(r.v.pu)),
    });
  }

  // ── Avisos agrupados ──
  for (const [mensaje, g] of grupos) {
    problemas.push({ tipo: "aviso", seccion: g.seccion, mensaje: `${g.n} ${mensaje}${g.ejemplo && g.n > 1 ? ` (ej. ${g.ejemplo})` : g.ejemplo ? `: ${g.ejemplo}` : ""}.` });
  }
  if (redondeos) {
    problemas.push({
      tipo: "aviso",
      seccion: "compras",
      mensaje: `Se redondearon ${redondeos} cantidades o montos a 2 decimales, que es lo que admite la app (ej. ${ejemploRedondeo}).`,
    });
  }

  return {
    estado: e,
    problemas,
    resumen: (Object.keys(NOMBRES_SECCION) as SeccionRegistro[])
      .filter((s) => conteo.has(s))
      .map((s) => ({ seccion: s, nombre: NOMBRES_SECCION[s], ...conteo.get(s)! })),
    cotejo: cotejar(
      ext,
      e,
      base,
      yaEnApp,
      (s) => conteo.get(s)?.conError ?? 0,
      new Set(problemas.filter((p) => p.tipo === "error" && p.clave).map((p) => p.clave!))
    ),
    unidades,
    nuevos,
    modificaciones,
  };
}

// ── Cotejo con la planilla ──────────────────────────────────────────────────

const igual = (planilla: number | null, app: number, formato: FilaCotejo["formato"]) => {
  const tolerancia = formato === "moneda" ? Math.max(1, Math.abs(planilla ?? 0) * 0.001) : 0.011;
  return planilla === null || Math.abs(planilla - app) <= tolerancia;
};

type DatoCotejo = {
  concepto: string;
  planilla: number | null;
  app: number;
  totalApp: number;
  /** El valor de la app no se puede separar de lo cargado aparte (ej. el stock). */
  incluyeOtros?: boolean;
  formato: FilaCotejo["formato"];
  /** Todo lo de la planilla ya estaba en la app (no se agrega nada de esta sección). */
  todoYaEstaba: boolean;
  /** Qué tiene la app aparte de la planilla, en palabras ("12 ventas cargadas en la app"); vacío = nada. */
  otros: string;
  /** Filas con error de esta sección (no se importan). */
  conError: number;
};

function fila(d: DatoCotejo): FilaCotejo {
  const fmt = (n: number) => (d.formato === "moneda" ? `$ ${fmtNumero(n)}` : fmtNumero(n));
  const coincide = igual(d.planilla, d.app, d.formato);
  const enTotal = d.totalApp !== d.app ? ` (en total: ${fmt(d.totalApp)})` : "";
  const aparte = d.otros ? ` La app además tiene ${d.otros} que no están en la planilla${enTotal}.` : "";
  const filas = d.conError === 1 ? "1 fila con error" : `${fmtNumero(d.conError)} filas con error`;
  let estado: EstadoCotejo;
  let detalle: string;
  if (d.planilla === null) {
    estado = "coincide";
    detalle = "La planilla no tiene este dato para comparar.";
  } else if (coincide) {
    estado = d.todoYaEstaba ? "yaEstaba" : "coincide";
    detalle = (d.todoYaEstaba ? "Ya estaba todo en la app." : "Lo de la planilla queda igual en la app.") + aparte;
  } else if (d.incluyeOtros && d.otros && !d.conError) {
    estado = "otrosDatos";
    detalle = `La diferencia es por lo que la app ya tenía: ${d.otros} que no están en la planilla. No hay que corregir nada.`;
  } else if (d.conError) {
    estado = "conErrores";
    detalle = `Falta lo de ${filas}: corregila${d.conError === 1 ? "" : "s"} arriba para que coincida.${aparte}`;
  } else {
    estado = "distinto";
    detalle = "Puede ser por cálculos propios de la planilla o por redondeos (ver avisos)." + aparte;
  }
  return { concepto: d.concepto, planilla: d.planilla, app: d.app, totalApp: d.totalApp, formato: d.formato, coincide, estado, detalle };
}

const plural = (n: number, uno: string, varios: string) => `${fmtNumero(n)} ${n === 1 ? uno : varios}`;

/** La fila de la planilla mueve el stock de esa materia prima (compra, insumo de una orden o existencia inicial). */
function tocaMateria(r: Registro, nombre: string): boolean {
  const es = (v: Valor | undefined) => buscarParecido(aTexto(v ?? null), [nombre], (n) => [n]) !== null;
  if (r.seccion === "compras" || r.seccion === "existenciaMP") return es(r.v.materiaPrima);
  if (r.seccion === "ordenes") return (r.insumos ?? []).some((i) => es(i.v.materiaPrima));
  return false;
}

function cotejar(
  ext: Extraccion,
  e: Estado,
  base: Estado,
  yaEnApp: EnApp,
  conError: (s: SeccionRegistro) => number,
  clavesConError: Set<string>
): FilaCotejo[] {
  const ref = ext.referencias;
  const cuenta = (s: SeccionRegistro) => ext.registros.filter((r) => r.seccion === s).length;
  // De la planilla = lo que ya estaba y se reconoció + lo nuevo (todo lo nuevo sale de la planilla).
  const idsBase = (xs: { id: number }[]) => new Set(xs.map((x) => x.id));
  const deLaPlanilla = <T extends { id: number }>(todos: T[], previos: T[], reconocidos: Set<number>) => {
    const antes = idsBase(previos);
    return todos.filter((x) => !antes.has(x.id) || reconocidos.has(x.id));
  };
  const compras = deLaPlanilla(e.compras, base.compras, yaEnApp.compras);
  const ordenes = deLaPlanilla(e.ordenesProduccion, base.ordenesProduccion, yaEnApp.ordenes);
  const ventas = deLaPlanilla(e.operaciones, base.operaciones, yaEnApp.ventas);
  const nuevas = (de: unknown[], previos: Set<number>) => de.length - previos.size;
  const todoYa = { compras: nuevas(compras, yaEnApp.compras) === 0, ordenes: nuevas(ordenes, yaEnApp.ordenes) === 0, ventas: nuevas(ventas, yaEnApp.ventas) === 0 };
  const otrasCompras = e.compras.length - compras.length;
  const otrasOrdenes = e.ordenesProduccion.length - ordenes.length;
  const otrasVentas = e.operaciones.length - ventas.length;
  const otros = {
    compras: otrasCompras ? plural(otrasCompras, "compra cargada", "compras cargadas") : "",
    ordenes: otrasOrdenes ? plural(otrasOrdenes, "orden cargada", "órdenes cargadas") : "",
    ventas: otrasVentas ? plural(otrasVentas, "venta cargada", "ventas cargadas") : "",
  };
  const totalCompras = (xs: Estado["compras"]) => xs.reduce((s, c) => s + c.cantidad * c.costoUnitario, 0);
  const totalVentas = (xs: Estado["operaciones"]) => xs.reduce((s, o) => s + o.subTotal, 0);
  const botellas = (xs: Estado["operaciones"]) => xs.reduce((s, o) => s + o.cantidad, 0);

  // Solo lo que trae la planilla: si no tiene compras, no se compara el total comprado.
  const hay = { compras: cuenta("compras") > 0, ordenes: cuenta("ordenes") > 0, ventas: cuenta("ventas") > 0 };
  const porSeccion: [keyof typeof hay, FilaCotejo][] = [
    ["compras", fila({ concepto: "Compras cargadas", planilla: cuenta("compras"), app: compras.length, totalApp: e.compras.length, formato: "numero", todoYaEstaba: todoYa.compras, otros: otros.compras, conError: conError("compras") })],
    ["compras", fila({ concepto: "Total comprado", planilla: ref.totalCompras, app: totalCompras(compras), totalApp: totalCompras(e.compras), formato: "moneda", todoYaEstaba: todoYa.compras, otros: otros.compras, conError: conError("compras") })],
    ["ordenes", fila({ concepto: "Órdenes de producción", planilla: cuenta("ordenes"), app: ordenes.length, totalApp: e.ordenesProduccion.length, formato: "numero", todoYaEstaba: todoYa.ordenes, otros: otros.ordenes, conError: conError("ordenes") })],
    ["ventas", fila({ concepto: "Ventas cargadas", planilla: cuenta("ventas"), app: ventas.length, totalApp: e.operaciones.length, formato: "numero", todoYaEstaba: todoYa.ventas, otros: otros.ventas, conError: conError("ventas") })],
    ["ventas", fila({ concepto: "Total vendido", planilla: ref.totalVentas, app: totalVentas(ventas), totalApp: totalVentas(e.operaciones), formato: "moneda", todoYaEstaba: todoYa.ventas, otros: otros.ventas, conError: conError("ventas") })],
    ["ventas", fila({ concepto: "Botellas vendidas", planilla: ref.unidadesVendidas, app: botellas(ventas), totalApp: botellas(e.operaciones), formato: "numero", todoYaEstaba: todoYa.ventas, otros: otros.ventas, conError: conError("ventas") })],
  ];
  const out = porSeccion.filter(([s]) => hay[s]).map(([, f]) => f);
  // El stock es uno solo: incluye los movimientos cargados en la app que no están en la planilla.
  const deCompras = new Set(compras.map((c) => c.id));
  const deOrdenes = new Set(ordenes.map((o) => o.id));
  for (const { materia, saldo } of ref.saldosMP) {
    const mp = buscarParecido(materia, e.materiaPrima, (m) => [m.nombre]);
    if (!mp) continue;
    const id = mp.valor.id;
    const row = e.inventarioMateriaPrima.find((r) => r.materiaPrimaId === id);
    const stock = row ? saldoInventario(row) : 0;
    const comprasAparte = e.compras.filter((c) => c.materiaPrimaId === id && !deCompras.has(c.id)).length;
    const usa = (o: Estado["ordenesProduccion"][number]) => o.insumos.some((i) => claveEnc(i.materiaPrima) === claveEnc(mp.valor.nombre));
    const ordenesAparte = e.ordenesProduccion.filter((o) => !deOrdenes.has(o.id) && usa(o)).length;
    const movimientos = [
      comprasAparte ? plural(comprasAparte, "compra", "compras") : "",
      ordenesAparte ? plural(ordenesAparte, "orden que la usa", "órdenes que la usan") : "",
    ].filter(Boolean);
    out.push(
      fila({
        concepto: `Stock de ${mp.valor.nombre}`,
        planilla: a2(saldo),
        app: stock,
        totalApp: stock,
        incluyeOtros: true,
        formato: "numero",
        todoYaEstaba: false,
        otros: movimientos.length ? `${movimientos.join(" y ")} de ${mp.valor.nombre}` : "",
        conError: ext.registros.filter((r) => clavesConError.has(r.clave) && tocaMateria(r, mp.valor.nombre)).length,
      })
    );
  }
  return out;
}
