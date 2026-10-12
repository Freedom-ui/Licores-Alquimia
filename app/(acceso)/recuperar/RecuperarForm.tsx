"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { recuperarAcceso, type EstadoRecuperar } from "../acciones";
import { CampoAcceso, TarjetaAcceso, useErroresCampos } from "../componentes";
import {
  CONTRASENA_MIN,
  LARGO_CODIGO,
  USUARIO_MAX,
  validarConfirmacion,
  validarContrasena,
  validarFormatoCodigo,
  validarUsuario,
} from "@/lib/auth/reglas";

export default function RecuperarForm() {
  const [estado, accion, enviando] = useActionState<EstadoRecuperar, FormData>(recuperarAcceso, {});
  const { error, validar, revalidar } = useErroresCampos(estado.campos);
  const [codigo, setCodigo] = useState("");
  const [usuario, setUsuario] = useState<string | null>(null);
  const [contrasena, setContrasena] = useState("");
  const [repetir, setRepetir] = useState("");

  const verificado = estado.verificado;
  // Paso 2: el usuario arranca con el actual hasta que lo cambie.
  const usuarioNuevo = usuario ?? verificado?.usuario ?? "";

  return (
    <TarjetaAcceso subtitulo="Recuperar acceso">
      {estado.error && (
        <div className="login-error" role="alert">
          {estado.error}
        </div>
      )}

      {!verificado ? (
        <form action={accion} key="paso-1">
          <p className="login-intro">
            Ingresá el código de recuperación de {LARGO_CODIGO} caracteres que guardaste al crear la cuenta.
          </p>
          <CampoAcceso
            id="codigo"
            label="Código de recuperación"
            value={codigo}
            onChange={(v) => {
              setCodigo(v);
              revalidar("codigo", validarFormatoCodigo(v));
            }}
            onBlur={() => codigo && validar("codigo", validarFormatoCodigo(codigo))}
            error={error("codigo")}
            ayuda="Respetá las mayúsculas y minúsculas."
            autoComplete="off"
            autoFocus
            maxLength={LARGO_CODIGO + 4}
          />
          <button type="submit" className="login-btn" disabled={enviando || !codigo.trim()}>
            {enviando ? "Verificando..." : "Verificar código"}
          </button>
        </form>
      ) : (
        <form action={accion} key="paso-2">
          <div className="login-aviso">
            Código correcto. Tu usuario es <strong>{verificado.usuario}</strong>. Podés dejarlo igual o
            cambiarlo, y elegí una contraseña nueva.
          </div>
          <input type="hidden" name="paso" value="2" />
          <input type="hidden" name="codigo" value={verificado.codigo} />
          <CampoAcceso
            id="usuario"
            label="Usuario"
            value={usuarioNuevo}
            onChange={(v) => {
              setUsuario(v);
              revalidar("usuario", validarUsuario(v));
            }}
            onBlur={() => validar("usuario", validarUsuario(usuarioNuevo))}
            error={error("usuario")}
            autoComplete="username"
            maxLength={USUARIO_MAX}
          />
          <CampoAcceso
            id="contrasena"
            label="Contraseña nueva"
            type="password"
            value={contrasena}
            onChange={(v) => {
              setContrasena(v);
              revalidar("contrasena", validarContrasena(v, usuarioNuevo));
            }}
            onBlur={() => contrasena && validar("contrasena", validarContrasena(contrasena, usuarioNuevo))}
            error={error("contrasena")}
            ayuda={`Mínimo ${CONTRASENA_MIN} caracteres, con al menos una letra y un número.`}
            autoComplete="new-password"
            autoFocus
          />
          <CampoAcceso
            id="repetir"
            label="Repetir contraseña nueva"
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
            {enviando ? "Guardando..." : "Guardar y entrar"}
          </button>
        </form>
      )}

      <div className="login-link-row">
        <Link href="/login">Volver al ingreso</Link>
      </div>
    </TarjetaAcceso>
  );
}
