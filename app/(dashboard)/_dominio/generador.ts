// Generador de datos de prueba con volumen: varios años de operación de un
// elaborador artesanal de licores, falsos pero coherentes. Lo usa el seed
// (prisma/seed.ts) para cargar una base de prueba; se puede volver a correr y,
// con la misma semilla y la misma fecha final, da exactamente lo mismo.
//
// Todo se arma con `aplicar(estado, accion)`, día por día y en orden: pasa por
// las mismas reglas y sincronizaciones que una carga a mano (compra →
// inventario, orden → consumos y lote, venta → salida FIFO). Si alguna acción
// se rechaza es un error del generador y se corta con el mensaje.
//
// Lo que se respeta:
//  - El catálogo real (productos y materias primas de la planilla del cliente).
//  - Trazabilidad: cada insumo sale de una compra con saldo (o de la existencia
//    previa al sistema) anterior a la maceración; cada lote sale de una orden.
//  - Solo se vende lo que ya está embotellado ese día: ningún lote queda en
//    negativo, y como el N° de lote y el embotellado crecen juntos, el FIFO de
//    las ventas sigue el orden en que se embotelló.
//  - Precios y costos con inflación, ventas con estacionalidad (verano y
//    fiestas) y crecimiento anual; clientes con su propia frecuencia de compra.

import { materiaPrimaDemo } from "../materia-prima/data";
import { productosDemo, type ProductoRow } from "../productos/data";
import type { MedioPago } from "../trazabilidad/data";
import type { OrdenInsumo } from "../ordenes-produccion/data";
import { digitoVerificadorCuit, hoyLocal, verificadorCbu } from "@/app/components/data-table/validacion";
import { aplicar, ErrorNegocio, ESTADO_VACIO, type Accion, type Estado } from "./acciones";
import { stockDisponible } from "./reglas";
import { round2, saldoInventario, saldoLote } from "./sync";

export type OpcionesGenerador = {
  /** Misma semilla + misma fecha final = mismos datos. */
  semilla?: number;
  /** Primer día con ventas (la producción arranca unas semanas antes). */
  desde?: string;
  /** Último día con datos (por defecto, hoy). */
  hasta?: string;
};

// ── Azar con semilla ────────────────────────────────────────────────────────

function mulberry32(semilla: number) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Azar = ReturnType<typeof crearAzar>;

function crearAzar(semilla: number) {
  const r = mulberry32(semilla);
  const entre = (min: number, max: number) => min + Math.floor(r() * (max - min + 1));
  return {
    r,
    entre,
    /** Real entre min y max. */
    real: (min: number, max: number) => min + r() * (max - min),
    prob: (p: number) => r() < p,
    elegir: <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)],
    pesado: <T,>(xs: readonly (readonly [T, number])[]): T => {
      const total = xs.reduce((s, [, p]) => s + p, 0);
      let x = r() * total;
      for (const [v, p] of xs) if ((x -= p) < 0) return v;
      return xs[xs.length - 1][0];
    },
    /** Cantidad de eventos de un proceso de Poisson con media λ. */
    poisson: (lambda: number) => {
      const L = Math.exp(-lambda);
      let k = 0;
      let p = 1;
      do {
        k++;
        p *= r();
      } while (p > L);
      return k - 1;
    },
    digitos: (n: number) => Array.from({ length: n }, () => entre(0, 9)).join(""),
    /** Copia mezclada (Fisher-Yates). */
    mezclar: <T,>(xs: readonly T[]): T[] => {
      const copia = [...xs];
      for (let i = copia.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [copia[i], copia[j]] = [copia[j], copia[i]];
      }
      return copia;
    },
  };
}

// ── Fechas (texto AAAA-MM-DD, calculadas en UTC para no depender del huso) ──

const aDate = (f: string) => new Date(`${f}T00:00:00Z`);
const aTexto = (d: Date) => d.toISOString().slice(0, 10);
const sumarDias = (f: string, n: number) => aTexto(new Date(aDate(f).getTime() + n * 86_400_000));
const diasEntre = (a: string, b: string) => Math.round((aDate(b).getTime() - aDate(a).getTime()) / 86_400_000);
/** 0 = domingo … 6 = sábado. */
const diaSemana = (f: string) => aDate(f).getUTCDay();
const mesDe = (f: string) => Number(f.slice(5, 7));
const anioDe = (f: string) => Number(f.slice(0, 4));
/** Meses corridos desde el año 0 (para indexar la inflación). */
const mesAbsoluto = (f: string) => anioDe(f) * 12 + mesDe(f) - 1;

// ── Inflación: índice mensual (≈ 4 %/mes en 2024 bajando a ≈ 2 %) ───────────

const TASAS_2024 = [0.08, 0.07, 0.06, 0.05, 0.04, 0.04, 0.035, 0.035, 0.03, 0.025, 0.025, 0.025];

function tasaMensual(mesAbs: number): number {
  const anio = Math.floor(mesAbs / 12);
  if (anio <= 2023) return 0.08;
  if (anio === 2024) return TASAS_2024[mesAbs % 12];
  if (anio === 2025) return 0.022;
  return 0.018;
}

/** Cuánto vale hoy (en `hasta`) lo que en el mes de `f` costaba 1, invertido: precio(f) = precioHoy × factor(f). */
function crearIndice(hasta: string) {
  const fin = mesAbsoluto(hasta);
  const cache = new Map<number, number>();
  return (f: string) => {
    const m = mesAbsoluto(f);
    let v = cache.get(m);
    if (v === undefined) {
      v = 1;
      for (let k = m + 1; k <= fin; k++) v /= 1 + tasaMensual(k);
      cache.set(m, v);
    }
    return v;
  };
}

/** Lo que se compra fresco para cada orden (no se guarda stock). */
const esFresco = (nombre: string) => MATERIAS[nombre]?.cascara !== undefined || nombre === "Menta" || nombre === "Jengibre";

const redondearA = (n: number, paso: number) => Math.max(paso, Math.round(n / paso) * paso);

// ── Estacionalidad y crecimiento ────────────────────────────────────────────

/** Ventas por mes (1 = promedio): pico en verano y fiestas, bajón en invierno, algo en el Día del Padre. */
const TEMPORADA = [1.35, 1.2, 0.95, 0.85, 0.8, 0.9, 0.75, 0.75, 0.85, 0.95, 1.1, 1.6];
/** Ventas al público por día de la semana (domingo primero). */
const DIA_SEMANA_PUBLICO = [0.8, 0.7, 0.8, 0.9, 1.0, 1.3, 1.5];

const temporada = (f: string) => TEMPORADA[mesDe(f) - 1];

// ── Catálogo real: recetas por botella ──────────────────────────────────────

type Linea = "LIM" | "LMJ" | "LNPH";
type Envase = "500" | "750" | "5000";

/** Insumos por botella de cada línea y envase (cítricos en kilos de cáscara). */
function receta(linea: Linea, envase: Envase): [string, number][] {
  const f = envase === "500" ? 1 : envase === "750" ? 1.5 : 10;
  const base: [string, number][] =
    linea === "LIM"
      ? [["Alcohol", 0.47], ["Limón", 0.08], ["Azúcar", 0.23]]
      : linea === "LMJ"
        ? [["Alcohol", 0.45], ["Limón", 0.06], ["Menta", 0.2], ["Jengibre", 0.1], ["Azúcar", 0.25]]
        : [["Alcohol", 0.47], ["Limón", 0.05], ["Naranja", 0.1], ["Pomelo", 0.1], ["Hibiscus", 0.07], ["Azúcar", 0.23]];
  const insumos = base.map(([m, q]): [string, number] => [m, q * f]);
  if (envase === "500") {
    insumos.push(
      [linea === "LNPH" ? "Env. 500 ml Ambar" : "Env. 500 ml Transparente", 1],
      [linea === "LNPH" ? "Tapa dorada" : "Tapa gris", 1],
      [`Etiq. ${linea} x 500 cc`, 1],
      ["Precintos env. 500 ml", 1]
    );
  } else if (envase === "750") {
    insumos.push(["Env. 750 ml Transp. c/tapón", 1], [`Etiq. ${linea} Prem. x 750 cc`, 1], ["Precintos env. 750 ml", 1]);
  } else {
    insumos.push(["Bidón 5 lts. Con Tapa", 1], ["Etiq. LIM x 5000 cc", 1], ["Precintos env. 5000 ml", 1]);
  }
  return insumos;
}

function lineaYEnvase(p: ProductoRow): { linea: Linea; envase: Envase } {
  const linea: Linea = p.nombre.includes("M. y J.") ? "LMJ" : p.nombre.includes("N., P. e H.") ? "LNPH" : "LIM";
  const envase: Envase = p.formato.startsWith("5000") ? "5000" : p.formato.startsWith("750") ? "750" : "500";
  return { linea, envase };
}

/** Botellas por día que se esperan vender de cada producto (promedio anual, se ajusta con lo vendido). */
const DEMANDA_BASE: Record<string, number> = {
  "LIM-500": 2.7,
  "LMJ-500": 1.5,
  "LNPH-500": 1.4,
  "LIM-5000": 0.13,
  "LIM-750": 0.45,
  "LMJ-750": 0.35,
  "LNPH-750": 0.25,
};

// ── Costos de compra hoy y lotes típicos ────────────────────────────────────

type InfoMateria = {
  /** Costo por unidad de compra (hoy). */
  costo: number;
  /** Cantidades típicas por compra (en unidades de compra); vacío = se compra lo justo. */
  lotes?: number[];
  /** Fracción de cáscara de un cítrico (se compra fruta, se usa cáscara). */
  cascara?: [number, number];
  proveedores: string[];
};

const MATERIAS: Record<string, InfoMateria> = {
  Alcohol: { costo: 3100, lotes: [60, 100, 150, 200], proveedores: ["DESTILERÍA PAMPEANA S.A.", "ALCOHOLES DEL PLATA SRL"] },
  Limón: { costo: 950, cascara: [0.22, 0.26], proveedores: ["FRUTAS Y VERDURAS DON CARMELO", "CITRÍCOLA BATÁN", "MERCADO FRUTIHORTÍCOLA PUESTO 14"] },
  Azúcar: { costo: 1050, lotes: [25, 50, 100], proveedores: ["DISTRIBUIDORA AZUCARERA DEL SUR SRL", "MAYORISTA EL TRÉBOL"] },
  Menta: { costo: 1900, proveedores: ["HIERBAS DEL SUDESTE"] },
  Jengibre: { costo: 3200, proveedores: ["HIERBAS DEL SUDESTE", "FRUTAS Y VERDURAS DON CARMELO"] },
  Naranja: { costo: 750, cascara: [0.2, 0.24], proveedores: ["FRUTAS Y VERDURAS DON CARMELO", "CITRÍCOLA BATÁN"] },
  Pomelo: { costo: 800, cascara: [0.21, 0.25], proveedores: ["FRUTAS Y VERDURAS DON CARMELO", "CITRÍCOLA BATÁN"] },
  Hibiscus: { costo: 9000, lotes: [1, 2, 3], proveedores: ["ESPECIAS Y DESHIDRATADOS NUTRIMAR"] },
  "Env. 500 ml Transparente": { costo: 680, lotes: [240, 360, 480], proveedores: ["CRISTALERÍA ATLÁNTICA S.A."] },
  "Env. 500 ml Ambar": { costo: 920, lotes: [120, 240], proveedores: ["CRISTALERÍA ATLÁNTICA S.A."] },
  "Tapa gris": { costo: 130, lotes: [500, 1000], proveedores: ["TAPAS Y CIERRES MDP SRL"] },
  "Tapa dorada": { costo: 160, lotes: [250, 500], proveedores: ["TAPAS Y CIERRES MDP SRL"] },
  "Bidón 5 lts. Con Tapa": { costo: 2100, lotes: [10, 20], proveedores: ["ENVASES PLÁSTICOS COSTA SRL"] },
  "Precintos env. 500 ml": { costo: 48, lotes: [500, 1000, 2000], proveedores: ["TERMOCONTRAÍBLES ARGENTINOS SRL"] },
  "Precintos env. 5000 ml": { costo: 85, lotes: [50, 100], proveedores: ["TERMOCONTRAÍBLES ARGENTINOS SRL"] },
  "Precintos env. 750 ml": { costo: 62, lotes: [200, 500], proveedores: ["TERMOCONTRAÍBLES ARGENTINOS SRL"] },
  "Etiq. LIM x 500 cc": { costo: 190, lotes: [250, 500, 1000], proveedores: ["GRÁFICA DEL PUERTO", "IMPRENTA LITORAL SRL"] },
  "Etiq. LMJ x 500 cc": { costo: 190, lotes: [250, 500], proveedores: ["GRÁFICA DEL PUERTO", "IMPRENTA LITORAL SRL"] },
  "Etiq. LNPH x 500 cc": { costo: 190, lotes: [250, 500], proveedores: ["GRÁFICA DEL PUERTO", "IMPRENTA LITORAL SRL"] },
  "Etiq. LIM x 5000 cc": { costo: 380, lotes: [50, 100], proveedores: ["GRÁFICA DEL PUERTO"] },
  Bolsas: { costo: 95, lotes: [200, 500], proveedores: ["BOLSAS Y PACKAGING LA COSTA"] },
  "Caja x 6": { costo: 650, lotes: [50, 100], proveedores: ["CARTONERA MARPLATENSE SRL"] },
  "Caja x 20": { costo: 1500, lotes: [25, 50], proveedores: ["CARTONERA MARPLATENSE SRL"] },
  "Env. 750 ml Transp. c/tapón": { costo: 1500, lotes: [60, 120, 180], proveedores: ["CRISTALERÍA ATLÁNTICA S.A."] },
  "Etiq. LIM Prem. x 750 cc": { costo: 270, lotes: [100, 200], proveedores: ["GRÁFICA DEL PUERTO", "IMPRENTA LITORAL SRL"] },
  "Etiq. LMJ Prem. x 750 cc": { costo: 270, lotes: [100, 200], proveedores: ["GRÁFICA DEL PUERTO", "IMPRENTA LITORAL SRL"] },
  "Etiq. LNPH Prem. x 750 cc": { costo: 270, lotes: [100, 200], proveedores: ["GRÁFICA DEL PUERTO", "IMPRENTA LITORAL SRL"] },
};

/** Stock previo al sistema (existencia inicial del inventario). */
const EXISTENCIA_PREVIA: [string, number][] = [
  ["Alcohol", 30],
  ["Azúcar", 20],
  ["Env. 500 ml Transparente", 96],
  ["Tapa gris", 300],
  ["Tapa dorada", 120],
  ["Precintos env. 500 ml", 400],
  ["Etiq. LIM x 500 cc", 180],
  ["Caja x 6", 40],
  ["Bolsas", 150],
];

// ── Proveedores ─────────────────────────────────────────────────────────────

type Comprobante = { form: string; tipo: string } | null;

type PerfilProveedor = {
  razonSocial: string;
  contacto: string;
  producto: string;
  ciudad: Ciudad;
  /** Persona (CUIL 20/27) o empresa (30/33). */
  persona?: boolean;
  /** Comprobantes que entrega (null = sin comprobante), con su peso. */
  comprobantes: [Comprobante, number][];
  medios: [MedioPago, number][];
  banco?: boolean;
};

const FA: Comprobante = { form: "Factura", tipo: "A" };
const FB: Comprobante = { form: "Factura", tipo: "B" };
const FC: Comprobante = { form: "Factura", tipo: "C" };
const RX: Comprobante = { form: "Remito", tipo: "X" };
const TC: Comprobante = { form: "Ticket", tipo: "C" };

const PROVEEDORES: PerfilProveedor[] = [
  { razonSocial: "DESTILERÍA PAMPEANA S.A.", contacto: "Sergio Paredes", producto: "Alcohol", ciudad: "Mar del Plata", comprobantes: [[FA, 1]], medios: [["MPR", 3], ["MPA", 1]], banco: true },
  { razonSocial: "ALCOHOLES DEL PLATA SRL", contacto: "Mariela Quiroga", producto: "Alcohol", ciudad: "La Plata", comprobantes: [[FA, 1]], medios: [["MPR", 1], ["MPA", 1]], banco: true },
  { razonSocial: "DISTRIBUIDORA AZUCARERA DEL SUR SRL", contacto: "Carolina Ríos", producto: "Azúcar", ciudad: "Mar del Plata", comprobantes: [[FA, 1]], medios: [["MPR", 1]], banco: true },
  { razonSocial: "MAYORISTA EL TRÉBOL", contacto: "Héctor Maidana", producto: "Azúcar y almacén", ciudad: "Mar del Plata", persona: true, comprobantes: [[FB, 3], [TC, 1]], medios: [["EFE", 2], ["CDNI", 1]] },
  { razonSocial: "FRUTAS Y VERDURAS DON CARMELO", contacto: "Carmelo Russo", producto: "Limones y cítricos", ciudad: "Mar del Plata", persona: true, comprobantes: [[null, 3], [RX, 1]], medios: [["EFE", 3], ["CDNI", 2]] },
  { razonSocial: "CITRÍCOLA BATÁN", contacto: "Julián Ferreyra", producto: "Cítricos", ciudad: "Batán", persona: true, comprobantes: [[FC, 2], [null, 1]], medios: [["CDNI", 2], ["EFE", 1], ["MPA", 1]], banco: true },
  { razonSocial: "MERCADO FRUTIHORTÍCOLA PUESTO 14", contacto: "Rosa Villalba", producto: "Limones", ciudad: "Mar del Plata", persona: true, comprobantes: [[TC, 1], [null, 1]], medios: [["EFE", 1]] },
  { razonSocial: "HIERBAS DEL SUDESTE", contacto: "Lucía Benítez", producto: "Menta y jengibre", ciudad: "Sierra de los Padres", persona: true, comprobantes: [[FC, 1], [null, 1]], medios: [["CDNI", 1], ["EFE", 1]] },
  { razonSocial: "ESPECIAS Y DESHIDRATADOS NUTRIMAR", contacto: "Diego Ferreyra", producto: "Hibiscus", ciudad: "Mar del Plata", comprobantes: [[FB, 1]], medios: [["MPR", 1], ["CDNI", 1]], banco: true },
  { razonSocial: "CRISTALERÍA ATLÁNTICA S.A.", contacto: "Laura Medina", producto: "Envases de vidrio", ciudad: "Buenos Aires", comprobantes: [[FA, 1]], medios: [["MPR", 2], ["MPA", 1]], banco: true },
  { razonSocial: "ENVASES PLÁSTICOS COSTA SRL", contacto: "Martín Acosta", producto: "Bidones", ciudad: "Mar del Plata", comprobantes: [[FA, 1]], medios: [["MPR", 1]], banco: true },
  { razonSocial: "TAPAS Y CIERRES MDP SRL", contacto: "Gustavo Lemos", producto: "Tapas", ciudad: "Mar del Plata", comprobantes: [[FA, 1]], medios: [["MPR", 1], ["MPA", 1]] },
  { razonSocial: "TERMOCONTRAÍBLES ARGENTINOS SRL", contacto: "Valeria Duarte", producto: "Precintos", ciudad: "Buenos Aires", comprobantes: [[FA, 1]], medios: [["MPR", 1]], banco: true },
  { razonSocial: "GRÁFICA DEL PUERTO", contacto: "Pablo Correa", producto: "Etiquetas", ciudad: "Mar del Plata", persona: true, comprobantes: [[FC, 1]], medios: [["MPA", 1], ["CDNI", 1]], banco: true },
  { razonSocial: "IMPRENTA LITORAL SRL", contacto: "Andrea Sosa", producto: "Etiquetas", ciudad: "Mar del Plata", comprobantes: [[FA, 1]], medios: [["MPR", 1]] },
  { razonSocial: "BOLSAS Y PACKAGING LA COSTA", contacto: "Ramiro Ojeda", producto: "Bolsas", ciudad: "Mar del Plata", persona: true, comprobantes: [[FC, 1], [RX, 1]], medios: [["EFE", 1], ["CDNI", 1]] },
  { razonSocial: "CARTONERA MARPLATENSE SRL", contacto: "Silvina Castro", producto: "Cajas", ciudad: "Mar del Plata", comprobantes: [[FA, 1]], medios: [["MPR", 1], ["EFE", 1]], banco: true },
];

// ── Clientes ────────────────────────────────────────────────────────────────

type Ciudad =
  | "Mar del Plata"
  | "Batán"
  | "Sierra de los Padres"
  | "Balcarce"
  | "Miramar"
  | "Necochea"
  | "Pinamar"
  | "Villa Gesell"
  | "Santa Clara del Mar"
  | "Tandil"
  | "La Plata"
  | "Buenos Aires";

const CARACTERISTICA: Record<Ciudad, string> = {
  "Mar del Plata": "223",
  Batán: "223",
  "Sierra de los Padres": "223",
  "Santa Clara del Mar": "223",
  Balcarce: "2266",
  Miramar: "2291",
  Necochea: "2262",
  Pinamar: "2254",
  "Villa Gesell": "2255",
  Tandil: "249",
  "La Plata": "221",
  "Buenos Aires": "11",
};

const CALLES: Record<Ciudad, string[]> = {
  "Mar del Plata": ["Av. Colón", "Güemes", "Alem", "Rivadavia", "San Martín", "Córdoba", "Olavarría", "Av. Independencia", "Av. Constitución", "Belgrano", "Moreno", "Bolívar", "Alberti", "Gascón", "Falucho", "Av. Juan B. Justo", "12 de Octubre", "Av. Martínez de Hoz", "Mitre", "Brown"],
  Batán: ["Calle 135", "Calle 149", "Av. Antártida Argentina"],
  "Sierra de los Padres": ["Av. Fortunato de la Plaza", "Los Ciervos", "Las Liebres"],
  "Santa Clara del Mar": ["Av. Acapulco", "Copacabana", "Mar del Plata"],
  Balcarce: ["Calle 17", "Calle 19", "Av. Kelly", "Calle 24"],
  Miramar: ["Calle 21", "Av. 9", "Calle 26", "Calle 30"],
  Necochea: ["Calle 83", "Av. 59", "Calle 62", "Calle 4"],
  Pinamar: ["Av. Bunge", "Del Libertador", "De las Gaviotas", "Jasón"],
  "Villa Gesell": ["Av. 3", "Paseo 105", "Av. Buenos Aires", "Paseo 112"],
  Tandil: ["Av. España", "Pinto", "Rodríguez", "9 de Julio", "Av. Santamarina"],
  "La Plata": ["Calle 7", "Calle 12", "Av. 51", "Diagonal 74", "Calle 47"],
  "Buenos Aires": ["Av. Santa Fe", "Honduras", "Thames", "Gorriti", "Av. Corrientes"],
};

type PerfilCliente = {
  razonSocial: string;
  /** "RI" responsable inscripto (empresa), "MT" monotributista. */
  iva: "RI" | "MT";
  ciudad: Ciudad;
  /** Días promedio entre pedidos. */
  cada: number;
  /** Botellas típicas por producto y pedido. */
  cantidad: number;
  /** Descuento sobre la lista (precio = lista × factor). */
  factor: number;
  premium?: boolean;
  bidon?: boolean;
  /** Fracción del período en la que empieza / deja de comprar (0 = desde el principio, 1 = hasta el final). */
  activo?: [number, number];
  domicilio?: string;
};

const CLIENTES: PerfilCliente[] = [
  { razonSocial: "VINOTECA EL DESCORCHE", iva: "MT", ciudad: "Mar del Plata", cada: 21, cantidad: 6, factor: 0.68, premium: true },
  { razonSocial: "LA CAVA DE GÜEMES SRL", iva: "RI", ciudad: "Mar del Plata", cada: 18, cantidad: 12, factor: 0.62, premium: true },
  { razonSocial: "ALMACÉN DE CAMPO LOS ÁLAMOS", iva: "MT", ciudad: "Balcarce", cada: 35, cantidad: 6, factor: 0.7 },
  {
    razonSocial: "DISTRIBUIDORA MAYORISTA DE BEBIDAS Y ALIMENTOS DEL ATLÁNTICO SUR S.R.L.",
    iva: "RI",
    ciudad: "Mar del Plata",
    cada: 28,
    cantidad: 24,
    factor: 0.52,
    premium: true,
    bidon: true,
    activo: [0.3, 1],
    domicilio: "Av. Presidente Perón 10450, Parque Industrial General Savio, Lote 23, Batán",
  },
  { razonSocial: "CERVECERÍA ACANTILADOS", iva: "RI", ciudad: "Mar del Plata", cada: 25, cantidad: 6, factor: 0.64, bidon: true },
  { razonSocial: "BAR NOTABLE LA PERLA", iva: "MT", ciudad: "Mar del Plata", cada: 30, cantidad: 4, factor: 0.7, bidon: true, activo: [0, 0.6] },
  { razonSocial: "DIETÉTICA GIRASOL", iva: "MT", ciudad: "Miramar", cada: 40, cantidad: 4, factor: 0.72 },
  { razonSocial: "REGALERÍA PUERTO NORTE", iva: "MT", ciudad: "Necochea", cada: 45, cantidad: 6, factor: 0.68, premium: true },
  { razonSocial: "HOTEL BRISAS DEL MAR S.A.", iva: "RI", ciudad: "Mar del Plata", cada: 30, cantidad: 12, factor: 0.6, premium: true, activo: [0.15, 1] },
  { razonSocial: "RESTAURANTE LA MARINERA", iva: "RI", ciudad: "Mar del Plata", cada: 24, cantidad: 6, factor: 0.64, bidon: true },
  { razonSocial: "VINOS & SABORES PINAMAR SRL", iva: "RI", ciudad: "Pinamar", cada: 22, cantidad: 12, factor: 0.6, premium: true },
  { razonSocial: "ALMACÉN GOURMET DOÑA ROSA", iva: "MT", ciudad: "Villa Gesell", cada: 30, cantidad: 6, factor: 0.7 },
  { razonSocial: "PARADOR PLAYA SERENA", iva: "RI", ciudad: "Santa Clara del Mar", cada: 20, cantidad: 8, factor: 0.64, bidon: true, activo: [0.05, 0.85] },
  { razonSocial: "DESPENSA LOS TILOS", iva: "MT", ciudad: "Tandil", cada: 40, cantidad: 4, factor: 0.72, activo: [0.4, 1] },
  { razonSocial: "TIENDA DE QUESOS EL TAMBO", iva: "MT", ciudad: "Tandil", cada: 35, cantidad: 6, factor: 0.7, premium: true },
  { razonSocial: "COOPERATIVA DE PRODUCTORES COSTEROS LTDA.", iva: "RI", ciudad: "Batán", cada: 45, cantidad: 12, factor: 0.55 },
  { razonSocial: "FERIA VERDE DEL PUERTO", iva: "MT", ciudad: "Mar del Plata", cada: 14, cantidad: 4, factor: 0.72, activo: [0, 0.5] },
  { razonSocial: "LICORERÍA SAN MARTÍN", iva: "MT", ciudad: "La Plata", cada: 30, cantidad: 8, factor: 0.66, premium: true },
  { razonSocial: "BODEGÓN EL FARO", iva: "RI", ciudad: "Mar del Plata", cada: 28, cantidad: 6, factor: 0.64 },
  { razonSocial: "CAFÉ DE LA ESTACIÓN", iva: "MT", ciudad: "Balcarce", cada: 45, cantidad: 4, factor: 0.72, activo: [0.5, 1] },
  { razonSocial: "EL RINCÓN DEL VINO SAS", iva: "RI", ciudad: "La Plata", cada: 26, cantidad: 12, factor: 0.6, premium: true },
  { razonSocial: "SUPERMERCADO FAMILIAR LA ESQUINA SRL", iva: "RI", ciudad: "Miramar", cada: 21, cantidad: 12, factor: 0.58 },
  { razonSocial: "PANADERÍA Y CONFITERÍA LA NUEVA AURORA", iva: "MT", ciudad: "Mar del Plata", cada: 40, cantidad: 4, factor: 0.72, activo: [0.2, 0.75] },
  { razonSocial: "QUINTA LOS NOGALES - PRODUCTOS REGIONALES", iva: "MT", ciudad: "Sierra de los Padres", cada: 30, cantidad: 6, factor: 0.68 },
  { razonSocial: "DISTRIBUIDORA COSTA AZUL S.A.", iva: "RI", ciudad: "Necochea", cada: 35, cantidad: 20, factor: 0.52, premium: true, activo: [0.55, 1] },
  { razonSocial: "TERRAZA BAR MIRAMAR", iva: "MT", ciudad: "Miramar", cada: 30, cantidad: 4, factor: 0.7, bidon: true },
  { razonSocial: "CERVECERÍA ARTESANAL OLAS ALTAS", iva: "RI", ciudad: "Mar del Plata", cada: 30, cantidad: 6, factor: 0.64 },
  { razonSocial: "VINOTECA BODEGAS DEL SUR", iva: "MT", ciudad: "Buenos Aires", cada: 35, cantidad: 12, factor: 0.62, premium: true, activo: [0.35, 1] },
  { razonSocial: "PULPERÍA LA TRANQUERA", iva: "MT", ciudad: "Balcarce", cada: 45, cantidad: 4, factor: 0.72 },
  {
    razonSocial: "ESPACIO GASTRONÓMICO LA ESTACIÓN DEL PUERTO",
    iva: "RI",
    ciudad: "Mar del Plata",
    cada: 28,
    cantidad: 6,
    factor: 0.62,
    premium: true,
    bidon: true,
    activo: [0.65, 1],
    domicilio: "Av. Martínez de Hoz 1150, Local 4 y 5, Centro Comercial del Puerto",
  },
  { razonSocial: "BOUTIQUE DE REGALOS ALMA", iva: "MT", ciudad: "Pinamar", cada: 40, cantidad: 4, factor: 0.7, premium: true },
  { razonSocial: "HOSTERÍA EL ROBLE", iva: "MT", ciudad: "Tandil", cada: 45, cantidad: 4, factor: 0.7, activo: [0.1, 0.9] },
];

/** Consumidores finales con nombre (compran de vez en cuando al público). */
const CONSUMIDORES: [string, Ciudad][] = [
  ["BENÍTEZ LAURA", "Mar del Plata"],
  ["ROMERO JUAN PABLO", "Mar del Plata"],
  ["ACUÑA SOFÍA", "Miramar"],
  ["DOMÍNGUEZ ESTEBAN", "Mar del Plata"],
  ["PERALTA MARÍA JOSÉ", "Balcarce"],
  ["VILLAREAL TOMÁS", "Mar del Plata"],
];

const NOMBRES = ["María", "Juan", "Lucía", "Martín", "Sofía", "Pablo", "Valeria", "Diego", "Florencia", "Nicolás", "Carolina", "Federico", "Agustina", "Gonzalo", "Romina", "Sebastián", "Paula", "Matías", "Natalia", "Ezequiel", "Julieta", "Leandro", "Mariana", "Hernán"];
const APELLIDOS = ["González", "Rodríguez", "Fernández", "López", "Martínez", "García", "Pérez", "Sánchez", "Romero", "Sosa", "Álvarez", "Torres", "Ruiz", "Ramírez", "Flores", "Acosta", "Benítez", "Medina", "Herrera", "Aguirre", "Giménez", "Molina", "Castro", "Ortiz"];

const VENDEDORES: { nombre: string; activo: [number, number]; peso: number }[] = [
  { nombre: "ALQUIMIA", activo: [0, 1], peso: 4 },
  { nombre: "MONEY, LEANDRO", activo: [0, 1], peso: 2 },
  { nombre: "VIOLINO, CLAUDIO", activo: [0, 0.7], peso: 2 },
  { nombre: "VICENTE, RODRIGO", activo: [0, 1], peso: 2 },
  { nombre: "FERRARO, DOMINGO", activo: [0.1, 1], peso: 1 },
  { nombre: "SALINAS, MICAELA", activo: [0.45, 1], peso: 2 },
  { nombre: "IBARRA, NAHUEL", activo: [0.6, 1], peso: 1 },
  { nombre: "CORREA, BRENDA", activo: [0.25, 0.8], peso: 1 },
];

const RESPONSABLES: [string, number][] = [
  ["ALQUIMIA", 5],
  ["VICENTE, RODRIGO", 2],
  ["GIMÉNEZ, PAULA", 2],
];

// ── Datos de contacto con formato válido ────────────────────────────────────

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

function slug(s: string, max = 24): string {
  return sinTildes(s)
    .toLowerCase()
    .replace(/\b(s\.?r\.?l|s\.?a\.?s?|ltda)\b\.?/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, max);
}

function crearContacto(az: Azar) {
  const usados = new Set<string>();

  function cuit(prefijos: string[], desde: number, hasta: number): string {
    for (;;) {
      const prefijo = az.elegir(prefijos);
      const numero = String(az.entre(desde, hasta)).padStart(8, "0");
      const dv = digitoVerificadorCuit(prefijo + numero);
      const c = `${prefijo}-${numero}-${dv}`;
      if (dv !== null && !usados.has(c)) {
        usados.add(c);
        return c;
      }
    }
  }

  return {
    cuitEmpresa: () => cuit(["30", "30", "30", "33"], 70_000_000, 71_999_999),
    cuitPersona: () => cuit(["20", "27", "23"], 18_000_000, 42_000_000),
    telefono(ciudad: Ciudad): string {
      const area = CARACTERISTICA[ciudad];
      const local = az.entre(4, 6) + az.digitos(9 - area.length);
      return `${area} - ${local.slice(0, -4)} - ${local.slice(-4)}`;
    },
    domicilio(ciudad: Ciudad): string {
      const calle = az.elegir(CALLES[ciudad]);
      const numero = az.entre(1, 40) * 100 + az.entre(0, 99);
      return ciudad === "Mar del Plata" ? `${calle} ${numero}` : `${calle} ${numero}, ${ciudad}`;
    },
    persona: () => `${az.elegir(NOMBRES)} ${az.elegir(APELLIDOS)}`,
    cbu(): string {
      const banco = az.elegir(["007", "011", "014", "017", "072", "285", "191"]);
      const b1 = banco + az.digitos(4);
      const b2 = az.digitos(13);
      return `${b1}${verificadorCbu(b1, [7, 1, 3, 9, 7, 1, 3])}${b2}${verificadorCbu(b2, [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3])}`;
    },
    alias(nombre: string): string {
      const base = slug(nombre, 12) || "cuenta";
      return `${base}.${az.elegir(["mp", "pagos", "cobro", "banco", "cta"])}`.slice(0, 20);
    },
  };
}

// ── Generador ───────────────────────────────────────────────────────────────

/** Días de producción antes de la primera venta (para tener stock en enero). */
const ARRANQUE_PRODUCCION = 45;
const MAX_MACERANDO = 4;

type OrdenPendiente = {
  id: number;
  productoId: number;
  fechaMaceracion: string;
  embotellado: string;
  planificada: number;
  /** La cantidad que se cargó al macerar (null = sin estimar). */
  estimada: number | null;
  responsable: string;
  insumos: OrdenInsumo[];
};

export function generarDatos(op: OpcionesGenerador = {}): Estado {
  const semilla = op.semilla ?? 1;
  const desde = op.desde ?? "2024-01-01";
  const hasta = op.hasta ?? hoyLocal();
  if (hasta < desde) throw new Error(`La fecha final (${hasta}) es anterior al inicio (${desde}).`);

  const az = crearAzar(semilla);
  // Los pagos a proveedores usan su propio azar: así no cambia el resto de los
  // datos que salen de cada semilla (la base del usuario se puede reproducir).
  const azPago = crearAzar(semilla ^ 0x9e3779b9);
  const contacto = crearContacto(az);
  const factor = crearIndice(hasta);
  const inicio = sumarDias(desde, -ARRANQUE_PRODUCCION);
  const totalDias = diasEntre(desde, hasta);
  /** Fracción del período (0 al principio, 1 al final) de una fecha. */
  const avance = (f: string) => (totalDias <= 0 ? 1 : Math.min(1, Math.max(0, diasEntre(desde, f) / totalDias)));
  const activo = (rango: [number, number] | undefined, f: string) => !rango || (avance(f) >= rango[0] && avance(f) <= rango[1]);
  const crecimiento = (f: string) => 1 + 0.15 * Math.max(0, diasEntre(desde, f)) / 365;

  let e: Estado = ESTADO_VACIO;
  let accionActual = "";
  const hacer = (a: Accion) => {
    try {
      e = aplicar(e, a);
    } catch (error) {
      if (error instanceof ErrorNegocio) {
        throw new Error(`El generador armó un dato inválido (${a.tipo}, ${accionActual}): ${error.message}${error.campo ? ` [${error.campo}]` : ""}`);
      }
      throw error;
    }
  };

  // ── Catálogo real ──
  for (const m of materiaPrimaDemo) hacer({ tipo: "addMateriaPrima", v: { nombre: m.nombre, unidad: m.unidad, reposicion: m.reposicion } });
  const mpId = new Map(e.materiaPrima.map((m) => [m.nombre, m.id]));
  const mpUnidades = new Set(e.materiaPrima.filter((m) => m.unidad === "Unidades").map((m) => m.nombre));

  // Precio de lista de un producto en una fecha: el de hoy llevado atrás por la
  // inflación, en escalones (la lista se actualiza cada 3 meses).
  const mesDeLista = (f: string) => {
    const m = mesAbsoluto(f);
    const escalon = m - (m % 3);
    return `${Math.floor(escalon / 12)}-${String((escalon % 12) + 1).padStart(2, "0")}-01`;
  };
  const precioLista = (p: ProductoRow, f: string) => {
    const lista = mesDeLista(f);
    const ultima = mesDeLista(hasta);
    const paso = p.formato.startsWith("5000") ? 1000 : 500;
    return lista === ultima ? p.precioUnitario : redondearA(p.precioUnitario * factor(lista), paso);
  };
  const productosHoy = productosDemo;
  for (const p of productosHoy) {
    hacer({ tipo: "addProducto", v: { nombre: p.nombre, formato: p.formato, codigoBarras: p.codigoBarras, precioUnitario: precioLista(p, inicio) } });
  }
  const productoHoy = (id: number) => productosHoy.find((p) => p.id === id)!;
  const claveProducto = (p: ProductoRow) => {
    const { linea, envase } = lineaYEnvase(p);
    return `${linea}-${envase}`;
  };

  // ── Vendedores, proveedores y clientes inventados ──
  for (const v of VENDEDORES) hacer({ tipo: "addVendedor", v: { nombre: v.nombre } });

  const proveedorId = new Map<string, number>();
  const numeracion = new Map<string, { pv: string; n: number }>();
  for (const p of PROVEEDORES) {
    const cbu = p.banco && az.prob(0.8) ? contacto.cbu() : "";
    accionActual = p.razonSocial;
    hacer({
      tipo: "addProveedor",
      v: {
        razonSocial: p.razonSocial,
        contacto: p.contacto,
        producto: p.producto,
        cuitCuil: p.persona ? contacto.cuitPersona() : contacto.cuitEmpresa(),
        email: p.persona && az.prob(0.5) ? `${slug(p.contacto)}@gmail.com` : `ventas@${slug(p.razonSocial, 18)}.com.ar`,
        telefono: contacto.telefono(p.ciudad),
        cbu,
        alias: p.banco && (!cbu || az.prob(0.6)) ? contacto.alias(p.razonSocial) : "",
      },
    });
    proveedorId.set(p.razonSocial, e.proveedores.at(-1)!.id);
    numeracion.set(p.razonSocial, { pv: String(az.entre(1, 12)).padStart(4, "0"), n: az.entre(800, 25_000) });
  }

  const lista500 = productoHoy(1);
  const lista750 = productoHoy(5);
  const precioCliente = (perfil: PerfilCliente, base: ProductoRow, f: string) => redondearA(precioLista(base, f) * perfil.factor, 100);

  const idParticular = (() => {
    hacer({
      tipo: "addCliente",
      v: {
        razonSocial: "PARTICULAR",
        apellidoNombre: "Ventas al público",
        condicionIva: "Consumidor Final",
        cuit: "",
        telefono: "",
        email: "",
        domicilio: "",
        precioTradicional: precioLista(lista500, inicio),
        precioPremium: precioLista(lista750, inicio),
      },
    });
    return e.clientes.at(-1)!.id;
  })();

  type Mayorista = PerfilCliente & { id: number; proximo: string; productos: number[]; condicion: string; vendedor: string };
  const mayoristas: Mayorista[] = [];
  for (const perfil of CLIENTES) {
    accionActual = perfil.razonSocial;
    const persona = contacto.persona();
    hacer({
      tipo: "addCliente",
      v: {
        razonSocial: perfil.razonSocial,
        apellidoNombre: persona,
        condicionIva: perfil.iva === "RI" ? "R. Inscripto" : "Monotributo",
        cuit: perfil.iva === "RI" ? contacto.cuitEmpresa() : contacto.cuitPersona(),
        telefono: contacto.telefono(perfil.ciudad),
        email: az.prob(0.6) ? `${slug(perfil.razonSocial, 20)}@gmail.com` : `contacto@${slug(perfil.razonSocial, 18)}.com.ar`,
        domicilio: perfil.domicilio ?? contacto.domicilio(perfil.ciudad),
        precioTradicional: precioCliente(perfil, lista500, inicio),
        precioPremium: perfil.premium ? precioCliente(perfil, lista750, inicio) : null,
      },
    });
    // Qué productos compra: siempre el tradicional, a veces las otras líneas, Premium y bidón si los maneja.
    const productos = [1];
    if (az.prob(0.7)) productos.push(2);
    if (az.prob(0.7)) productos.push(3);
    if (perfil.premium) productos.push(5, ...(az.prob(0.6) ? [6] : []), ...(az.prob(0.6) ? [7] : []));
    if (perfil.bidon) productos.push(4);
    const arranque = perfil.activo ? sumarDias(desde, Math.round(perfil.activo[0] * totalDias)) : desde;
    mayoristas.push({
      ...perfil,
      id: e.clientes.at(-1)!.id,
      proximo: sumarDias(arranque, az.entre(0, perfil.cada)),
      productos,
      condicion: az.pesado([["Crédito", 6], ["Contado", 3], ["Consignación", 2]] as const),
      vendedor: az.prob(0.6) ? "ALQUIMIA" : az.elegir(VENDEDORES.slice(1)).nombre,
    });
  }

  const consumidores: number[] = [];
  for (const [nombre, ciudad] of CONSUMIDORES) {
    const [apellido, ...resto] = nombre.split(" ");
    hacer({
      tipo: "addCliente",
      v: {
        razonSocial: nombre,
        apellidoNombre: [...resto, apellido].map((w) => w[0] + w.slice(1).toLowerCase()).join(" "),
        condicionIva: "Consumidor Final",
        cuit: az.prob(0.5) ? contacto.cuitPersona() : "",
        telefono: contacto.telefono(ciudad),
        email: `${slug(nombre)}@gmail.com`,
        domicilio: contacto.domicilio(ciudad),
        precioTradicional: precioLista(lista500, inicio),
        precioPremium: precioLista(lista750, inicio),
      },
    });
    consumidores.push(e.clientes.at(-1)!.id);
  }

  // ── Existencia previa al sistema ──
  /** Lo que queda sin usar de cada compra (en unidades de stock: cáscara en los cítricos) y de la existencia previa. */
  const restoCompra = new Map<number, number>();
  const restoPrevio = new Map<string, number>();
  const costoHoy = (nombre: string, f: string) => round2(Math.max(0.01, MATERIAS[nombre].costo * factor(f) * az.real(0.96, 1.04)));
  for (const [nombre, cantidad] of EXISTENCIA_PREVIA) {
    hacer({ tipo: "addInventarioMateriaPrima", v: { materiaPrimaId: mpId.get(nombre)!, existenciaInicial: cantidad, costoUnitario: costoHoy(nombre, inicio) } });
    restoPrevio.set(nombre, cantidad);
  }

  // ── Compras ──
  let ultimaCompra = inicio;
  const comprobanteDelDia = new Map<
    string,
    { form: string; tipo: string; numero: string; medio: MedioPago; pago: string | null; materias: Set<string> }
  >();

  /**
   * Cuándo se le paga una factura al proveedor: en efectivo, en el día; el
   * resto, hasta 30 días después. Lo que todavía no se pagó a la fecha final
   * (y parte de lo del último mes y medio) queda pendiente.
   */
  function fechaDePago(fecha: string, medio: MedioPago): string | null {
    if (medio === "EFE") return fecha;
    const pago = sumarDias(fecha, azPago.pesado([[0, 30], [azPago.entre(1, 15), 45], [azPago.entre(16, 30), 25]] as const));
    if (pago > hasta) return null;
    if (diasEntre(fecha, hasta) <= 45 && azPago.prob(0.35)) return null;
    return pago;
  }

  function comprar(nombre: string, cantidad: number, fecha: string, cascara?: number) {
    const info = MATERIAS[nombre];
    const elegido = az.elegir(info.proveedores);
    const proveedor = PROVEEDORES.find((p) => p.razonSocial === elegido)!;
    const clave = `${proveedor.razonSocial}|${fecha}`;
    // Mismo proveedor el mismo día = misma factura (una fila por materia prima, como en la planilla).
    // (Si ya tiene esa materia prima, es otra compra: otro comprobante.)
    let comp = comprobanteDelDia.get(clave);
    if (!comp || comp.materias.has(nombre)) {
      const tipo = az.pesado(proveedor.comprobantes);
      const num = numeracion.get(proveedor.razonSocial)!;
      num.n += az.entre(3, 60);
      const medio = az.pesado(proveedor.medios);
      comp = tipo
        ? { form: tipo.form, tipo: tipo.tipo, numero: `${num.pv} - ${String(num.n).padStart(8, "0")}`, medio, pago: fechaDePago(fecha, medio), materias: new Set<string>() }
        : { form: "", tipo: "", numero: "", medio, pago: fechaDePago(fecha, medio), materias: new Set<string>() };
      comprobanteDelDia.set(clave, comp);
    }
    comp.materias.add(nombre);
    const yymmdd = fecha.slice(2).replaceAll("-", "");
    const lote =
      nombre === "Alcohol"
        ? `CE${yymmdd}${az.entre(0, 9)}`
        : nombre === "Azúcar"
          ? `L${fecha.slice(8, 10)}/${fecha.slice(5, 7)}/${fecha.slice(2, 4)}M${az.entre(1, 3)}`
          : nombre.startsWith("Env.") || nombre.startsWith("Bidón")
            ? `V${yymmdd.slice(0, 4)}-${az.digitos(3)}`
            : "";
    accionActual = `compra de ${nombre} del ${fecha}`;
    hacer({
      tipo: "saveCompra",
      id: null,
      v: {
        fecha,
        materiaPrimaId: mpId.get(nombre)!,
        cantidad,
        costoUnitario: costoHoy(nombre, fecha),
        cantidadCascara: cascara,
        lote,
        proveedorId: proveedorId.get(proveedor.razonSocial)!,
        comprobanteForm: comp.form,
        comprobanteTipo: comp.tipo,
        comprobanteNumero: comp.numero,
        medioPago: comp.medio,
        fechaPago: comp.pago,
      },
    });
    const compra = e.compras.at(-1)!;
    restoCompra.set(compra.id, cascara ?? cantidad);
    ultimaCompra = fecha;
  }

  /** Lo fresco de más de una semana ya no se usa (se descarta como merma). */
  const vencida = (nombre: string, compra: string, fecha: string) => esFresco(nombre) && diasEntre(compra, fecha) > 7;

  /** Stock libre de una materia prima (previo + lo que queda de sus compras hasta esa fecha). */
  function libre(nombre: string, fecha: string): number {
    const id = mpId.get(nombre)!;
    let total = restoPrevio.get(nombre) ?? 0;
    for (const c of e.compras) if (c.materiaPrimaId === id && c.fecha <= fecha && !vencida(nombre, c.fecha, fecha)) total += restoCompra.get(c.id) ?? 0;
    return round2(total);
  }

  /** Compra lo que falte para tener `necesita` disponible el día `fecha` (fecha de la compra: unos días antes, nunca antes de la última). */
  function asegurar(nombre: string, necesita: number, fecha: string) {
    const falta = round2(necesita - libre(nombre, fecha));
    if (falta <= 0) return;
    const info = MATERIAS[nombre];
    const fresco = esFresco(nombre);
    const dia = [ultimaCompra, sumarDias(fecha, -az.entre(0, fresco ? 1 : 4))].sort()[1];
    if (info.cascara) {
      const proporcion = round2(az.real(...info.cascara));
      const fruta = Math.ceil((falta / proporcion) * az.real(1.02, 1.12));
      comprar(nombre, fruta, dia, round2(fruta * proporcion));
    } else if (info.lotes) {
      // Lo que no es fresco se compra con margen (alcanza para un par de órdenes más).
      const lote = info.lotes.find((l) => l >= falta * 2) ?? Math.ceil((falta * 2) / info.lotes.at(-1)!) * info.lotes.at(-1)!;
      comprar(nombre, lote, dia);
    } else {
      comprar(nombre, Math.max(0.5, Math.ceil(falta * az.real(1.1, 1.4) * 2) / 2), dia);
    }
  }

  /** Reparte una cantidad entre la existencia previa y las compras con saldo, de la más vieja a la más nueva. */
  function asignar(nombre: string, cantidad: number, fecha: string): OrdenInsumo[] {
    const lineas: OrdenInsumo[] = [];
    let resta = round2(cantidad);
    const previo = restoPrevio.get(nombre) ?? 0;
    if (previo > 0) {
      const toma = round2(Math.min(previo, resta));
      const fila = e.inventarioMateriaPrima.find((r) => r.materiaPrimaId === mpId.get(nombre))!;
      lineas.push({ materiaPrima: nombre, cantidad: toma, costoUnitario: fila.costoUnitario });
      restoPrevio.set(nombre, round2(previo - toma));
      resta = round2(resta - toma);
    }
    const id = mpId.get(nombre)!;
    for (const c of e.compras) {
      if (resta <= 0) break;
      if (c.materiaPrimaId !== id || c.fecha > fecha || vencida(nombre, c.fecha, fecha)) continue;
      const queda = restoCompra.get(c.id) ?? 0;
      if (queda <= 0) continue;
      const toma = round2(Math.min(queda, resta));
      const costo = c.cantidadCascara ? round2((c.cantidad * c.costoUnitario) / c.cantidadCascara) : c.costoUnitario;
      lineas.push({ materiaPrima: nombre, cantidad: toma, costoUnitario: costo, compraId: c.id });
      restoCompra.set(c.id, round2(queda - toma));
      resta = round2(resta - toma);
    }
    if (resta > 0) throw new Error(`Faltan ${resta} de ${nombre} para la orden del ${fecha}.`);
    return lineas;
  }

  // ── Producción ──
  const pendientes: OrdenPendiente[] = [];
  let ultimoEmbotellado = inicio;
  const vendidoPorDia = new Map<string, number[]>(); // clave de producto → botellas vendidas por día (desde `desde`)

  function demanda(p: ProductoRow, fecha: string): number {
    const clave = claveProducto(p);
    const previsto = DEMANDA_BASE[clave] * temporada(sumarDias(fecha, 25)) * crecimiento(fecha);
    const ventas = vendidoPorDia.get(clave) ?? [];
    const ultimos = ventas.slice(-90);
    const real = ultimos.length >= 30 ? ultimos.reduce((s, x) => s + x, 0) / ultimos.length : 0;
    return Math.max(previsto, real * 1.05, 0.05);
  }

  function enProceso(productoId: number): number {
    return pendientes.filter((o) => o.productoId === productoId).reduce((s, o) => s + o.planificada, 0);
  }

  function lanzarOrden(fecha: string) {
    if (pendientes.length >= MAX_MACERANDO || diaSemana(fecha) === 0 || diaSemana(fecha) === 6) return;
    // El producto con menos días de stock (contando lo que está macerando).
    let elegido: { p: ProductoRow; cobertura: number; ritmo: number } | null = null;
    for (const p of productosHoy) {
      const ritmo = demanda(p, fecha);
      const cobertura = (stockDisponible(e, p.id) + enProceso(p.id)) / ritmo;
      if (!elegido || cobertura < elegido.cobertura) elegido = { p, cobertura, ritmo };
    }
    if (!elegido || elegido.cobertura > 42) return;

    const { linea, envase } = lineaYEnvase(elegido.p);
    const [min, max, paso] = envase === "5000" ? [4, 12, 1] : envase === "750" ? [18, 60, 6] : [36, 120, 6];
    const planificada = Math.min(max, Math.max(min, redondearA(elegido.ritmo * 65, paso)));

    // Insumos: se compra lo que falte y se asigna por FIFO.
    const necesidades = receta(linea, envase).map(([m, q]): [string, number] => [m, mpUnidades.has(m) ? Math.ceil(q * planificada) : round2(q * planificada)]);
    for (const [m, q] of necesidades) asegurar(m, q, fecha);
    const insumos = necesidades.flatMap(([m, q]) => asignar(m, q, fecha));
    // Punto de reposición: lo que no es fresco se repone si no alcanza para otra orden igual.
    for (const [m, q] of necesidades) if (!MATERIAS[m].cascara && MATERIAS[m].lotes) asegurar(m, q, fecha);

    const embotellado = [sumarDias(ultimoEmbotellado, 1), sumarDias(fecha, az.entre(14, 21))].sort()[1];
    ultimoEmbotellado = embotellado;
    const estimada = az.prob(0.7) ? planificada : null;
    const responsable = az.pesado(RESPONSABLES);
    accionActual = `orden de ${productoHoy(elegido.p.id).nombre} del ${fecha}`;
    hacer({
      tipo: "saveOrden",
      id: null,
      v: { productoId: elegido.p.id, fechaMaceracion: fecha, fechaEmbotellado: null, responsable, cantidadProducida: estimada, insumos },
    });
    pendientes.push({ id: e.ordenesProduccion.at(-1)!.id, productoId: elegido.p.id, fechaMaceracion: fecha, embotellado, planificada, estimada, responsable, insumos });
  }

  function embotellar(fecha: string) {
    for (const o of pendientes.filter((x) => x.embotellado === fecha)) {
      const { envase } = lineaYEnvase(productoHoy(o.productoId));
      // Alguna botella se rompe o se usa para control al embotellar.
      const producidas = envase === "5000" ? o.planificada : o.planificada - az.pesado([[0, 5], [1, 3], [2, 1]] as const);
      accionActual = `embotellado de la orden ${o.id}`;
      hacer({
        tipo: "saveOrden",
        id: o.id,
        v: {
          productoId: o.productoId,
          fechaMaceracion: o.fechaMaceracion,
          fechaEmbotellado: fecha,
          responsable: o.responsable,
          cantidadProducida: producidas,
          insumos: o.insumos,
        },
      });
      const lote = e.productosTerminados.find((l) => l.origenOrdenId === o.id)!;
      hacer({
        tipo: "updateLote",
        loteId: lote.id,
        v: { existenciaInicial: lote.existenciaInicial, costoUnitario: lote.costoUnitario, fechaVencimiento: sumarDias(fecha, 730) },
      });
      pendientes.splice(pendientes.indexOf(o), 1);
    }
  }

  // ── Ventas ──
  const vendedorDelDia = (f: string) =>
    az.pesado(VENDEDORES.filter((v) => activo(v.activo, f)).map((v) => [v.nombre, v.peso] as const));

  let mayoristaDelMes = 0;
  let publicoDelMes = 0;

  function vender(fecha: string, clienteId: number, producto: ProductoRow, cantidad: number, pu: number, canal: string, condicion: string, vendedor: string): number {
    const disponible = stockDisponible(e, producto.id);
    // Solo se vende lo que hay embotellado: si no alcanza, se vende lo que hay (si vale la pena) o se pierde la venta.
    const cant = Math.min(cantidad, Math.floor(disponible));
    if (cant < 1 || cant < cantidad / 2) return 0;
    accionActual = `venta del ${fecha}`;
    hacer({ tipo: "addOperacion", v: { fecha, clienteId, vendedor, productoId: producto.id, cantidad: cant, canal, condicion, pu } });
    return cant;
  }

  function ventasDelDia(fecha: string) {
    const vendido = new Map<string, number>();
    const anotar = (p: ProductoRow, n: number) => vendido.set(claveProducto(p), (vendido.get(claveProducto(p)) ?? 0) + n);
    const t = temporada(fecha) * crecimiento(fecha);

    // Al público (Menor, precio de lista, contado).
    const n = az.poisson(0.5 * t * DIA_SEMANA_PUBLICO[diaSemana(fecha)]);
    for (let i = 0; i < n; i++) {
      const p = productoHoy(az.pesado([[1, 50], [2, 15], [3, 15], [5, 9], [6, 5], [7, 4], [4, 2]] as const));
      const cliente = az.prob(0.85) ? idParticular : az.elegir(consumidores);
      const cant = az.pesado([[1, 60], [2, 25], [3, 9], [4, 6]] as const);
      const hecho = vender(fecha, cliente, p, cant, precioLista(p, fecha), "Menor", "Contado", vendedorDelDia(fecha));
      anotar(p, hecho);
      publicoDelMes += hecho;
    }

    // Mayoristas: cada uno con su frecuencia (más seguido en temporada), en días hábiles.
    if (diaSemana(fecha) !== 0) {
      for (const c of mayoristas) {
        if (fecha < c.proximo || !activo(c.activo, fecha)) continue;
        if (diaSemana(fecha) === 6 && az.prob(0.7)) continue;
        const cuantos = Math.min(c.productos.length, az.pesado([[1, 6], [2, 3], [3, 1]] as const));
        const elegidos = az.mezclar(c.productos).slice(0, cuantos);
        for (const id of elegidos) {
          const p = productoHoy(id);
          const { envase } = lineaYEnvase(p);
          const base = envase === "5000" ? az.entre(1, 3) : envase === "750" ? Math.max(2, Math.round(c.cantidad / 2)) : c.cantidad;
          const cant = Math.max(1, Math.round(base * az.real(0.6, 1.3) * Math.sqrt(temporada(fecha))));
          const pu = envase === "500" ? precioCliente(c, lista500, fecha) : envase === "750" ? precioCliente(c, lista750, fecha) : precioCliente(c, p, fecha);
          const hecho = vender(fecha, c.id, p, cant, pu, "Mayor", c.condicion, c.vendedor);
          anotar(p, hecho);
          mayoristaDelMes += hecho;
        }
        c.proximo = sumarDias(fecha, Math.max(5, Math.round((c.cada * 1.3 * az.real(0.7, 1.3)) / temporada(fecha))));
      }
    }

    for (const p of productosHoy) {
      const clave = claveProducto(p);
      const serie = vendidoPorDia.get(clave) ?? [];
      serie.push(vendido.get(clave) ?? 0);
      vendidoPorDia.set(clave, serie);
    }
  }

  // ── Movimientos manuales ──
  function ajustesDelDia(fecha: string) {
    // Roturas y degustaciones de vez en cuando (sobre un lote con stock).
    if (az.prob(0.03)) {
      const conStock = e.productosTerminados.filter((l) => saldoLote(l) >= 3);
      if (conStock.length > 0) {
        const lote = az.elegir(conStock);
        accionActual = `salida manual del lote ${lote.lote}`;
        hacer({ tipo: "addMovimiento", loteId: lote.id, movimiento: { fecha, tipo: "salida", cantidad: az.entre(1, 2) } });
      }
    }
    // Fin de mes: consumo de cajas (envíos a mayoristas) y bolsas (ventas al público), que no pasan por las órdenes.
    if (sumarDias(fecha, 1).slice(8) === "01" && fecha >= desde) {
      for (const [nombre, usado] of [
        ["Caja x 6", Math.ceil(mayoristaDelMes / 6 / 2)],
        ["Bolsas", Math.ceil(publicoDelMes * 0.6)],
      ] as const) {
        if (usado <= 0) continue;
        asegurar(nombre, usado, fecha);
        const filaActual = e.inventarioMateriaPrima.find((r) => r.materiaPrimaId === mpId.get(nombre))!;
        const cantidad = Math.min(usado, Math.floor(saldoInventario(filaActual)));
        if (cantidad < 1) continue;
        accionActual = `consumo de ${nombre} del ${fecha}`;
        hacer({ tipo: "addInventarioMovimiento", rowId: filaActual.id, movimiento: { fecha, tipo: "salida", cantidad } });
        descontarLibre(nombre, cantidad);
      }
      mayoristaDelMes = 0;
      publicoDelMes = 0;
    }
    // Los lunes se descarta lo fresco (cítricos, menta, jengibre) que sobró de compras de hace más de una semana.
    if (diaSemana(fecha) === 1) {
      for (const nombre of Object.keys(MATERIAS).filter(esFresco)) {
        const id = mpId.get(nombre)!;
        const viejas = e.compras.filter((c) => c.materiaPrimaId === id && diasEntre(c.fecha, fecha) > 7 && (restoCompra.get(c.id) ?? 0) > 0);
        const sobra = round2(viejas.reduce((s, c) => s + restoCompra.get(c.id)!, 0));
        const fila = e.inventarioMateriaPrima.find((r) => r.materiaPrimaId === id);
        if (!fila || sobra <= 0 || sobra > saldoInventario(fila) + 1e-9) continue;
        accionActual = `merma de ${nombre} del ${fecha}`;
        hacer({ tipo: "addInventarioMovimiento", rowId: fila.id, movimiento: { fecha, tipo: "salida", cantidad: sobra } });
        for (const c of viejas) restoCompra.set(c.id, 0);
      }
    }
    // Una vez por año, recuento físico de tapas: aparecen algunas de más.
    if (fecha.slice(5) === "06-30") {
      const fila = e.inventarioMateriaPrima.find((r) => r.materiaPrimaId === mpId.get("Tapa gris"))!;
      accionActual = `ajuste de inventario del ${fecha}`;
      hacer({ tipo: "addInventarioMovimiento", rowId: fila.id, movimiento: { fecha, tipo: "entrada", cantidad: az.entre(8, 24) } });
    }
  }

  /** Un consumo manual sale primero de la existencia previa y después de las compras más viejas. */
  function descontarLibre(nombre: string, cantidad: number) {
    let resta = cantidad;
    const previo = restoPrevio.get(nombre) ?? 0;
    const toma = Math.min(previo, resta);
    restoPrevio.set(nombre, round2(previo - toma));
    resta = round2(resta - toma);
    const id = mpId.get(nombre)!;
    for (const c of e.compras) {
      if (resta <= 0) break;
      if (c.materiaPrimaId !== id) continue;
      const queda = restoCompra.get(c.id) ?? 0;
      const t = Math.min(queda, resta);
      restoCompra.set(c.id, round2(queda - t));
      resta = round2(resta - t);
    }
  }

  // ── Actualización de precios (cada 3 meses: lista y precios de cada cliente) ──
  function actualizarPrecios(fecha: string) {
    accionActual = `precios del ${fecha}`;
    for (const p of productosHoy) {
      const actual = e.productos.find((x) => x.id === p.id)!;
      const nuevo = precioLista(p, fecha);
      if (actual.precioUnitario !== nuevo) hacer({ tipo: "updateProducto", id: p.id, v: { ...actual, precioUnitario: nuevo } });
    }
    for (const c of e.clientes) {
      const perfil = mayoristas.find((m) => m.id === c.id);
      const precioTradicional = perfil ? precioCliente(perfil, lista500, fecha) : precioLista(lista500, fecha);
      const precioPremium = perfil ? (perfil.premium ? precioCliente(perfil, lista750, fecha) : null) : precioLista(lista750, fecha);
      if (c.precioTradicional !== precioTradicional || c.precioPremium !== precioPremium) {
        hacer({ tipo: "updateCliente", id: c.id, v: { ...c, precioTradicional, precioPremium } });
      }
    }
  }

  // ── Día por día ──
  for (let fecha = inicio; fecha <= hasta; fecha = sumarDias(fecha, 1)) {
    if (fecha.slice(8) === "01" && mesDeLista(fecha) === fecha) actualizarPrecios(fecha);
    embotellar(fecha);
    lanzarOrden(fecha);
    if (fecha >= desde) ventasDelDia(fecha);
    ajustesDelDia(fecha);
  }

  return e;
}
