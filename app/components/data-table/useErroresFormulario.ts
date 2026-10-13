"use client";

import { useState } from "react";
import type { Errores } from "./validacion";

/**
 * Errores por campo de un formulario del dashboard (texto chico en rojo
 * debajo de cada campo). `validar(valores)` corre las reglas completas del
 * formulario, las mismas que repite el servidor (_dominio/reglas.ts), y
 * devuelve los errores por campo:
 *  - al salir de un campo se muestra su error;
 *  - al escribir, los campos que ya mostraban error se revalidan (así el
 *    mensaje desaparece apenas se corrige, también si dependía de otro campo);
 *  - al guardar se muestran todos y el foco va al primero.
 * Los errores sin un campo visible (o los del servidor sin campo) van al
 * cartel general del formulario.
 *
 * Cada input recibe `props(campo)`: id `<prefijo>-<campo>` + `data-campo`
 * para ubicarlo, y el estado accesible (aria-invalid / aria-describedby).
 */
export function useErroresFormulario<V>(prefijo: string, validar: (valores: V) => Errores) {
  const [errores, setErrores] = useState<Errores>({});
  const [general, setGeneral] = useState<string | null>(null);

  const idDe = (campo: string) => `${prefijo}-${campo.replace(/\./g, "-")}`;

  /** Campos de este formulario que están en pantalla, en el orden en que se ven. */
  function camposEnPantalla(): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>(`[data-campo][id^="${prefijo}-"]`));
  }

  /** Muestra los errores: los de campos visibles debajo de cada uno, el resto en el cartel. Devuelve el primer campo con error. */
  function mostrar(todos: Errores): HTMLElement | null {
    const visibles = camposEnPantalla();
    const conElemento = new Set(visibles.map((el) => el.dataset.campo));
    const sueltos = Object.entries(todos).filter(([campo]) => !conElemento.has(campo));
    setErrores(todos);
    setGeneral(sueltos.length > 0 ? sueltos.map(([, m]) => m).join(" ") : null);
    return visibles.find((el) => el.dataset.campo && el.dataset.campo in todos) ?? null;
  }

  return {
    errores,
    general,
    idDe,
    error: (campo: string): string | null => errores[campo] ?? null,

    /** Atributos para el input/select del campo. */
    props: (campo: string) => {
      const id = idDe(campo);
      const conError = Boolean(errores[campo]);
      return {
        id,
        "data-campo": campo,
        "aria-invalid": conError || undefined,
        "aria-describedby": conError ? `${id}-error` : undefined,
        className: conError ? "rf-input-error" : undefined,
      };
    },

    /** Al salir de un campo: muestra (o saca) su error. */
    alSalir(campo: string, valores: V) {
      const mensaje = validar(valores)[campo];
      setErrores((e) => {
        const resto = { ...e };
        delete resto[campo];
        return mensaje ? { ...resto, [campo]: mensaje } : resto;
      });
    },

    /** Al escribir: revalida los campos que ya mostraban un error. */
    alEscribir(valores: V) {
      setErrores((e) => {
        if (Object.keys(e).length === 0) return e;
        const nuevos = validar(valores);
        const out: Errores = {};
        for (const campo of Object.keys(e)) if (nuevos[campo]) out[campo] = nuevos[campo];
        return out;
      });
    },

    /** Al guardar: valida todo, muestra los errores y enfoca el primero. true = se puede guardar. */
    alGuardar(valores: V): boolean {
      const todos = validar(valores);
      if (Object.keys(todos).length === 0) {
        setErrores({});
        setGeneral(null);
        return true;
      }
      mostrar(todos)?.focus();
      return false;
    },

    /** Error que devolvió el servidor al guardar: en su campo si se ve, si no en el cartel. */
    deServidor(err: unknown, porDefecto: string) {
      const mensaje = err instanceof Error ? err.message : porDefecto;
      const campo = (err as { campo?: unknown } | null)?.campo;
      mostrar(typeof campo === "string" ? { [campo]: mensaje } : { "": mensaje })?.focus();
    },

    limpiar() {
      setErrores({});
      setGeneral(null);
    },
  };
}

export type ErroresFormulario = ReturnType<typeof useErroresFormulario>;
