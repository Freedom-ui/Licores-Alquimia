// Períodos de análisis: rango elegido, rango de comparación y cortes
// (buckets) para los gráficos de evolución. Fechas como "YYYY-MM-DD", igual
// que en el resto de la app (se comparan como texto).

export type PresetPeriodo = "30d" | "mes" | "mesAnterior" | "3m" | "anio" | "anioAnterior" | "personalizado";
export type Comparacion = "anterior" | "anioAnterior" | "ninguna";

export const PRESETS: { value: PresetPeriodo; label: string }[] = [
  { value: "30d", label: "Últimos 30 días" },
  { value: "mes", label: "Este mes" },
  { value: "mesAnterior", label: "Mes anterior" },
  { value: "3m", label: "Últimos 3 meses" },
  { value: "anio", label: "Este año" },
  { value: "anioAnterior", label: "Año anterior" },
  { value: "personalizado", label: "Personalizado" },
];

export const COMPARACIONES: { value: Comparacion; label: string }[] = [
  { value: "anterior", label: "vs. período anterior" },
  { value: "anioAnterior", label: "vs. mismo período del año anterior" },
  { value: "ninguna", label: "Sin comparar" },
];

export type Rango = { desde: string; hasta: string };
export type Bucket = Rango & { etiqueta: string };

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function iso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parse(fecha: string): Date {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function sumarDias(fecha: string, dias: number): string {
  const d = parse(fecha);
  d.setDate(d.getDate() + dias);
  return iso(d);
}

export function diasEntre(desde: string, hasta: string): number {
  return Math.round((parse(hasta).getTime() - parse(desde).getTime()) / 86_400_000);
}

export function enRango(fecha: string | null | undefined, r: Rango): boolean {
  return !!fecha && fecha >= r.desde && fecha <= r.hasta;
}

function finDeMes(y: number, m: number): string {
  return iso(new Date(y, m + 1, 0));
}

export function resolverPeriodo(preset: PresetPeriodo, personalizado: Rango, hoy: string): Rango {
  const d = parse(hoy);
  const y = d.getFullYear();
  const m = d.getMonth();
  switch (preset) {
    case "30d":
      return { desde: sumarDias(hoy, -29), hasta: hoy };
    case "mes":
      return { desde: iso(new Date(y, m, 1)), hasta: hoy };
    case "mesAnterior":
      return { desde: iso(new Date(y, m - 1, 1)), hasta: finDeMes(y, m - 1) };
    case "3m":
      return { desde: sumarDias(hoy, -91), hasta: hoy };
    case "anio":
      return { desde: `${y}-01-01`, hasta: hoy };
    case "anioAnterior":
      return { desde: `${y - 1}-01-01`, hasta: `${y - 1}-12-31` };
    case "personalizado":
      return personalizado.desde <= personalizado.hasta
        ? personalizado
        : { desde: personalizado.hasta, hasta: personalizado.desde };
  }
}

export function rangoComparacion(r: Rango, comparacion: Comparacion): Rango | null {
  if (comparacion === "ninguna") return null;
  if (comparacion === "anioAnterior") {
    const corrido = (f: string) => {
      const d = parse(f);
      return iso(new Date(d.getFullYear() - 1, d.getMonth(), d.getDate()));
    };
    return { desde: corrido(r.desde), hasta: corrido(r.hasta) };
  }
  const largo = diasEntre(r.desde, r.hasta);
  const hasta = sumarDias(r.desde, -1);
  return { desde: sumarDias(hasta, -largo), hasta };
}

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export type Granularidad = "dia" | "semana" | "mes";

export function granularidadPara(r: Rango): Granularidad {
  const dias = diasEntre(r.desde, r.hasta) + 1;
  if (dias <= 31) return "dia";
  if (dias <= 120) return "semana";
  return "mes";
}

/** Cortes del rango para los gráficos de evolución (por día, semana o mes según el largo). */
export function buckets(r: Rango, g: Granularidad = granularidadPara(r)): Bucket[] {
  const out: Bucket[] = [];
  if (g === "mes") {
    const ini = parse(r.desde);
    let y = ini.getFullYear();
    let m = ini.getMonth();
    while (iso(new Date(y, m, 1)) <= r.hasta) {
      const desde = iso(new Date(y, m, 1)) < r.desde ? r.desde : iso(new Date(y, m, 1));
      const fin = finDeMes(y, m);
      out.push({ desde, hasta: fin > r.hasta ? r.hasta : fin, etiqueta: `${MESES[m]} ${String(y).slice(2)}` });
      m++;
      if (m === 12) {
        m = 0;
        y++;
      }
    }
    return out;
  }
  const paso = g === "dia" ? 1 : 7;
  for (let desde = r.desde; desde <= r.hasta; desde = sumarDias(desde, paso)) {
    const fin = sumarDias(desde, paso - 1);
    const d = parse(desde);
    out.push({
      desde,
      hasta: fin > r.hasta ? r.hasta : fin,
      etiqueta: g === "dia" ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}` : `Sem. ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`,
    });
  }
  return out;
}

export function formatRango(r: Rango): string {
  const f = (s: string) => {
    const d = parse(s);
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  };
  return `${f(r.desde)} – ${f(r.hasta)}`;
}
