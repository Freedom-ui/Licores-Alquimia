"use client";

// Cierra la sesión después de `minutos` sin actividad (mouse, teclado, scroll,
// toques) y vuelve al login, para que la pantalla no quede mostrando datos si
// la persona se aleja de la PC. Mientras hay actividad, avisa al servidor cada
// tanto para que la sesión no venza allá (el servidor también controla el
// vencimiento: ver lib/auth/sesion.ts).
//
// Varias pestañas comparten la última actividad por localStorage, así una
// pestaña olvidada no cierra la sesión de la que se está usando.

import { useEffect } from "react";
import { cerrarSesion, mantenerSesion } from "../(acceso)/acciones";

const CLAVE = "alquimia_ultima_actividad";
const REVISION_MS = 15_000;
const EVENTOS = ["mousemove", "mousedown", "keydown", "wheel", "touchstart", "scroll"] as const;

function leerCompartida(): number {
  try {
    return Number(localStorage.getItem(CLAVE)) || 0;
  } catch {
    return 0;
  }
}

function guardarCompartida(ms: number) {
  try {
    localStorage.setItem(CLAVE, String(ms));
  } catch {
    // Sin almacenamiento: cada pestaña controla lo suyo.
  }
}

/** Navegación completa (no del router): descarta todo lo que había en memoria. */
export function irAlLogin(motivo: "inactividad" | "salida" | "expirada") {
  window.location.replace(`/login?motivo=${motivo}`);
}

export default function ControlInactividad({ minutos }: { minutos: number }) {
  useEffect(() => {
    const limite = minutos * 60_000;
    const cadaCuantoAvisar = Math.min(2 * 60_000, limite / 3);
    let ultimaActividad = Date.now();
    let ultimoAviso = Date.now();
    let ultimoGuardado = 0;
    let saliendo = false;
    guardarCompartida(ultimaActividad);

    const salir = async (motivo: "inactividad" | "expirada") => {
      if (saliendo) return;
      saliendo = true;
      try {
        await cerrarSesion();
      } finally {
        irAlLogin(motivo);
      }
    };

    const actividad = () => {
      ultimaActividad = Date.now();
      if (ultimaActividad - ultimoGuardado > 5_000) {
        ultimoGuardado = ultimaActividad;
        guardarCompartida(ultimaActividad);
      }
    };

    const revisar = async () => {
      if (saliendo) return;
      const ahora = Date.now();
      const ultima = Math.max(ultimaActividad, leerCompartida());
      if (ahora - ultima >= limite) return salir("inactividad");
      if (ultima > ultimoAviso && ahora - ultimoAviso >= cadaCuantoAvisar) {
        ultimoAviso = ahora;
        try {
          const { activa } = await mantenerSesion();
          if (!activa) await salir("expirada");
        } catch {
          // Sin conexión con el servidor: se reintenta en la próxima revisión.
          ultimoAviso = 0;
        }
      }
    };

    // Al volver a la pestaña (o al despertar la PC) se revisa enseguida.
    const alVolver = () => {
      if (document.visibilityState === "visible") void revisar();
    };

    for (const e of EVENTOS) window.addEventListener(e, actividad, { passive: true, capture: true });
    document.addEventListener("visibilitychange", alVolver);
    const intervalo = window.setInterval(revisar, REVISION_MS);
    return () => {
      for (const e of EVENTOS) window.removeEventListener(e, actividad, { capture: true });
      document.removeEventListener("visibilitychange", alVolver);
      window.clearInterval(intervalo);
    };
  }, [minutos]);

  return null;
}
