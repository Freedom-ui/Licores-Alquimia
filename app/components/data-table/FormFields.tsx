"use client";

import type { Column } from "./types";
import { getEditableFields, resolveFormInput } from "./format";

export default function FormFields<T>({
  columns,
  values,
  onChange,
}: {
  columns: Column<T>[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  const fields = getEditableFields(columns);

  return (
    <>
      {fields.map((f) => {
        const input = resolveFormInput(f);
        const fieldId = `rf-${f.key}`;
        return (
          <div className="rf-field" key={f.key}>
            <label htmlFor={fieldId}>
              {f.label}
              {f.form?.required && <span className="rf-required">*</span>}
            </label>

            {input === "select" ? (
              <select id={fieldId} value={values[f.key] ?? ""} onChange={(e) => onChange(f.key, e.target.value)}>
                <option value="">Seleccionar…</option>
                {f.form?.options?.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : input === "textarea" ? (
              <textarea
                id={fieldId}
                placeholder={f.form?.placeholder}
                value={values[f.key] ?? ""}
                onChange={(e) => onChange(f.key, e.target.value)}
              />
            ) : (
              <input
                id={fieldId}
                type={input}
                placeholder={f.form?.placeholder}
                value={values[f.key] ?? ""}
                onChange={(e) => onChange(f.key, e.target.value)}
              />
            )}
          </div>
        );
      })}
    </>
  );
}
