import type { Column, ColumnType, FormInputType } from "./types";

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function formatCellValue(value: unknown, type: ColumnType = "text"): string {
  if (value === null || value === undefined || value === "") return "—";

  switch (type) {
    case "currency": {
      const n = typeof value === "number" ? value : Number(value);
      return Number.isNaN(n) ? String(value) : currencyFormatter.format(n);
    }
    case "date": {
      const d = value instanceof Date ? value : new Date(value as string);
      return Number.isNaN(d.getTime()) ? String(value) : dateFormatter.format(d);
    }
    case "number":
      return String(value);
    default:
      return String(value);
  }
}

export function searchableText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).toLowerCase();
}

/** Infiere qué input de formulario corresponde a una columna, salvo que se lo indique explícitamente. */
export function resolveFormInput<T>(col: Column<T>): FormInputType {
  if (col.form?.input) return col.form.input;

  switch (col.type ?? "text") {
    case "number":
    case "currency":
      return "number";
    case "date":
      return "date";
    case "email":
      return "email";
    case "tag":
      return col.form?.options?.length ? "select" : "text";
    default:
      return "text";
  }
}

/** Columnas que corresponden a un campo del formulario (alta o edición). Excluye "id" salvo que se lo pida explícitamente. */
export function getEditableFields<T>(columns: Column<T>[]): Column<T>[] {
  return columns.filter((c) => c.form?.include ?? c.key !== "id");
}

/** Primer campo obligatorio sin completar, o null si está todo OK. */
export function findMissingRequiredField<T>(
  fields: Column<T>[],
  values: Record<string, string>
): Column<T> | null {
  for (const f of fields) {
    if (f.form?.required && !(values[f.key] ?? "").trim()) return f;
  }
  return null;
}

/** Convierte los valores de texto del formulario a su tipo final (number para inputs numéricos). */
export function parseFormValues<T>(
  fields: Column<T>[],
  values: Record<string, string>
): Record<string, string | number> {
  const parsed: Record<string, string | number> = {};
  for (const f of fields) {
    const raw = values[f.key] ?? "";
    parsed[f.key] = resolveFormInput(f) === "number" ? Number(raw || 0) : raw;
  }
  return parsed;
}

/** Vuelca los valores actuales de una fila al shape de texto que usa el formulario. */
export function rowToFormValues<T extends Record<string, unknown>>(
  fields: Column<T>[],
  row: T
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const f of fields) {
    const v = row[f.key];
    values[f.key] = v === null || v === undefined ? "" : String(v);
  }
  return values;
}
