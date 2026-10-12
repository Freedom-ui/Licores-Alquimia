"use client";

// Piezas compartidas de las pantallas de acceso (login, primer arranque,
// recuperar, código): la tarjeta, los campos con su error debajo y los
// errores por campo que combinan lo que dijo el servidor con lo que se valida
// al salir de cada campo.

import { useState } from "react";

export function TarjetaAcceso({
  subtitulo,
  ancha = false,
  children,
}: {
  subtitulo: string;
  ancha?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="login-screen">
      <div className={`login-card${ancha ? " login-card-ancha" : ""}`}>
        <div className="login-brand">Licores Alquimia</div>
        <div className="login-brand-sub">{subtitulo}</div>
        {children}
      </div>
    </div>
  );
}

export function CampoAcceso({
  id,
  name,
  label,
  value,
  onChange,
  onBlur,
  error,
  ayuda,
  type = "text",
  autoComplete,
  autoFocus,
  maxLength,
}: {
  id: string;
  /** Nombre en el formulario (por defecto, el id). */
  name?: string;
  label: string;
  value: string;
  onChange: (valor: string) => void;
  onBlur?: () => void;
  error?: string | null;
  ayuda?: string;
  type?: "text" | "password";
  autoComplete?: string;
  autoFocus?: boolean;
  maxLength?: number;
}) {
  const [visible, setVisible] = useState(false);
  const esClave = type === "password";
  const descripcion = error ? `${id}-error` : ayuda ? `${id}-ayuda` : undefined;
  return (
    <div className="login-form-group">
      <label htmlFor={id}>{label}</label>
      <div className={`login-clave${esClave ? " con-boton" : ""}`}>
        <input
          id={id}
          name={name ?? id}
          type={esClave && !visible ? "password" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          maxLength={maxLength}
          spellCheck={false}
          autoCapitalize="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={descripcion}
          className={error ? "login-input-error" : undefined}
        />
        {esClave && (
          <button
            type="button"
            className="login-ver-clave"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
            aria-pressed={visible}
          >
            {visible ? "Ocultar" : "Mostrar"}
          </button>
        )}
      </div>
      {error ? (
        <span id={`${id}-error`} className="campo-error">
          {error}
        </span>
      ) : (
        ayuda && (
          <span id={`${id}-ayuda`} className="campo-ayuda">
            {ayuda}
          </span>
        )
      )}
    </div>
  );
}

/**
 * Errores visibles por campo. Los del servidor se muestran hasta que el campo
 * se vuelve a validar al salir de él (o se corrige); cada respuesta nueva del
 * servidor reemplaza todo.
 */
export function useErroresCampos<C extends string>(delServidor: Partial<Record<C, string>> | undefined) {
  const [locales, setLocales] = useState<Partial<Record<C, string | null>>>({});
  const [ultimo, setUltimo] = useState(delServidor);
  if (delServidor !== ultimo) {
    setUltimo(delServidor);
    setLocales({});
  }
  return {
    error: (campo: C) => (campo in locales ? locales[campo] : delServidor?.[campo]),
    validar: (campo: C, resultado: string | null) => setLocales((l) => ({ ...l, [campo]: resultado })),
    /** Al escribir: si el campo mostraba un error, se revalida en vivo para que desaparezca al corregirlo. */
    revalidar: (campo: C, resultado: string | null) =>
      setLocales((l) => {
        const mostrado = campo in l ? l[campo] : delServidor?.[campo];
        return mostrado ? { ...l, [campo]: resultado } : l;
      }),
  };
}
