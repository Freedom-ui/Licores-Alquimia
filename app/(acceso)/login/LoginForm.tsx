"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { iniciarSesion, type EstadoForm } from "../acciones";
import { CampoAcceso, TarjetaAcceso } from "../componentes";
import { USUARIO_MAX } from "@/lib/auth/reglas";

export default function LoginForm({ aviso }: { aviso?: string }) {
  const [estado, accion, enviando] = useActionState<EstadoForm, FormData>(iniciarSesion, {});
  const [usuario, setUsuario] = useState("");
  const [contrasena, setContrasena] = useState("");

  return (
    <TarjetaAcceso subtitulo="Sistema de Gestión">
      {estado.error ? (
        <div className="login-error" role="alert">
          {estado.error}
        </div>
      ) : (
        aviso && <div className="login-aviso">{aviso}</div>
      )}

      <form action={accion}>
        <CampoAcceso
          id="usuario"
          label="Usuario"
          value={usuario}
          onChange={setUsuario}
          autoComplete="username"
          autoFocus
          maxLength={USUARIO_MAX}
        />
        <CampoAcceso
          id="contrasena"
          label="Contraseña"
          type="password"
          value={contrasena}
          onChange={setContrasena}
          autoComplete="current-password"
        />
        <button type="submit" className="login-btn" disabled={enviando || !usuario.trim() || !contrasena}>
          {enviando ? "Ingresando..." : "Ingresar"}
        </button>
      </form>

      <div className="login-link-row">
        <Link href="/recuperar">¿Olvidaste tu usuario o contraseña?</Link>
      </div>
    </TarjetaAcceso>
  );
}
