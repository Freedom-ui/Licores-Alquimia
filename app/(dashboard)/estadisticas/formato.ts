const moneda = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const numero = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
const porcentaje = new Intl.NumberFormat("es-AR", { style: "percent", maximumFractionDigits: 1 });

export const fmtMoneda = (n: number) => moneda.format(n);
export const fmtNumero = (n: number) => numero.format(n);
export const fmtPct = (n: number | null | undefined) => (n === null || n === undefined ? "—" : porcentaje.format(n));

/** Para ejes de gráficos: "$ 1,2 M", "$ 350 k", "$ 900". */
export function fmtMonedaCorta(n: number): string {
  const abs = Math.abs(n);
  const signo = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${signo}$ ${numero.format(Math.round(abs / 100_000) / 10)} M`;
  if (abs >= 10_000) return `${signo}$ ${numero.format(Math.round(abs / 1_000))} k`;
  if (abs >= 1_000) return `${signo}$ ${numero.format(Math.round(abs / 100) / 10)} k`;
  return `${signo}$ ${numero.format(Math.round(abs))}`;
}

export function unidadCorta(unidad: string): string {
  return { Litros: "L", Kilogramos: "kg", Unidades: "u.", Metros: "m" }[unidad] ?? "";
}

export const fmtCantidad = (n: number, unidad: string) => `${fmtNumero(n)} ${unidadCorta(unidad)}`.trim();
