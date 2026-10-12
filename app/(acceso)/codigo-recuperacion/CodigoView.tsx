"use client";

import { useRef, useState } from "react";
import { confirmarCodigoGuardado } from "../acciones";
import { TarjetaAcceso } from "../componentes";

export default function CodigoView({ codigo, motivo }: { codigo: string; motivo?: string }) {
  const [copiado, setCopiado] = useState(false);
  const [anotado, setAnotado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const textoRef = useRef<HTMLElement>(null);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(codigo);
    } catch {
      // Sin acceso al portapapeles: deja el código seleccionado para Ctrl+C.
      const nodo = textoRef.current;
      if (nodo) window.getSelection()?.selectAllChildren(nodo);
      return;
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <TarjetaAcceso subtitulo="Código de recuperación" ancha>
      {motivo === "recuperado" && (
        <div className="login-aviso">
          Listo: tu usuario y tu contraseña quedaron cambiados. Tu código anterior ya no sirve; este es el nuevo.
        </div>
      )}

      <p className="login-intro">
        Este es tu código de recuperación. Si algún día te olvidás tu usuario o tu contraseña, es la
        única forma de volver a entrar.
      </p>

      <div className="cr-codigo-fila">
        <code ref={textoRef} className="cr-codigo" aria-label={`Código: ${codigo.split("").join(" ")}`}>
          {codigo}
        </code>
        <button type="button" className={`cr-copiar${copiado ? " copiado" : ""}`} onClick={copiar}>
          {copiado ? "¡Copiado!" : "Copiar"}
        </button>
      </div>
      <p className="cr-detalle">
        {codigo.length} caracteres. Respetá las mayúsculas y minúsculas.
      </p>

      <div className="cr-importante" role="note">
        <strong>Muy importante:</strong> anotalo o guardalo en un lugar seguro (por ejemplo, en un papel
        guardado o en tu celular). <strong>Este código no se vuelve a mostrar.</strong>
      </div>

      <form action={confirmarCodigoGuardado} onSubmit={() => setEnviando(true)}>
        <label className="cr-check">
          <input type="checkbox" checked={anotado} onChange={(e) => setAnotado(e.target.checked)} required />
          Ya lo anoté en un lugar seguro
        </label>
        <button type="submit" className="login-btn" disabled={!anotado || enviando}>
          {enviando ? "Entrando..." : "Continuar"}
        </button>
      </form>
    </TarjetaAcceso>
  );
}
