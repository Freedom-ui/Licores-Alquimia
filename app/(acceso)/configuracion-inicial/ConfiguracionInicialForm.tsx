"use client";

import { useActionState, useState } from "react";
import { crearCuentaInicial, type EstadoForm } from "../acciones";
import { CampoAcceso, TarjetaAcceso, useErroresCampos } from "../componentes";
import { CONTRASENA_MIN, USUARIO_MAX, validarConfirmacion, validarContrasena, validarUsuario } from "@/lib/auth/reglas";

export default function ConfiguracionInicialForm() {
  const [estado, accion, enviando] = useActionState<EstadoForm, FormData>(crearCuentaInicial, {});
  const { error, validar, revalidar } = useErroresCampos(estado.campos);
  const [usuario, setUsuario] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [repetir, setRepetir] = useState("");

  return (
    <TarjetaAcceso subtitulo="Configuración inicial">
      <p className="login-intro">
        Bienvenido/a. Creá el usuario y la contraseña con los que vas a entrar al sistema. Es una
        sola cuenta para esta computadora.
      </p>
      {estado.error && (
        <div className="login-error" role="alert">
          {estado.error}
        </div>
      )}

      <form action={accion}>
        <CampoAcceso
          id="usuario"
          label="Usuario"
          value={usuario}
          onChange={(v) => {
            setUsuario(v);
            revalidar("usuario", validarUsuario(v));
          }}
          onBlur={() => usuario && validar("usuario", validarUsuario(usuario))}
          error={error("usuario")}
          ayuda="Por ejemplo: maria.lopez"
          autoComplete="username"
          autoFocus
          maxLength={USUARIO_MAX}
        />
        <CampoAcceso
          id="contrasena"
          label="Contraseña"
          type="password"
          value={contrasena}
          onChange={(v) => {
            setContrasena(v);
            revalidar("contrasena", validarContrasena(v, usuario));
          }}
          onBlur={() => contrasena && validar("contrasena", validarContrasena(contrasena, usuario))}
          error={error("contrasena")}
          ayuda={`Mínimo ${CONTRASENA_MIN} caracteres, con al menos una letra y un número.`}
          autoComplete="new-password"
        />
        <CampoAcceso
          id="repetir"
          label="Repetir contraseña"
          type="password"
          value={repetir}
          onChange={(v) => {
            setRepetir(v);
            revalidar("repetir", validarConfirmacion(contrasena, v));
          }}
          onBlur={() => repetir && validar("repetir", validarConfirmacion(contrasena, repetir))}
          error={error("repetir")}
          autoComplete="new-password"
        />
        <button type="submit" className="login-btn" disabled={enviando}>
          {enviando ? "Creando la cuenta..." : "Crear cuenta"}
        </button>
      </form>
    </TarjetaAcceso>
  );
}
