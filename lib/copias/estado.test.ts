import { describe, expect, it } from "vitest";
import { alertasCopias, type EstadoCopias } from "./estado";

const ahora = new Date("2026-10-24T12:00:00");
const hace = (dias: number) => new Date(ahora.getTime() - dias * 86_400_000).toISOString();

const estado = (cambios: Partial<EstadoCopias> = {}, drive: Partial<EstadoCopias["drive"]> = {}): EstadoCopias => ({
  automaticas: true,
  escritorio: true,
  carpeta: "",
  locales: [{ nombre: "x", fecha: hace(0), motivo: "automatica", tamano: 1 }],
  ...cambios,
  drive: { disponible: true, conectado: true, email: "a@b.com", conectadoEn: hace(10), desconectada: false, ultimaSubida: { nombre: "x", fecha: hace(0) }, error: null, ...drive },
});

const textos = (e: EstadoCopias) => alertasCopias(e, ahora).map((a) => `${a.nivel}: ${a.texto}`);

describe("alertasCopias", () => {
  it("todo al día: sin alertas", () => {
    expect(textos(estado())).toEqual([]);
  });

  it("sin copias automáticas (desarrollo, pruebas) no avisa nada", () => {
    expect(textos(estado({ automaticas: false, locales: [] }, { conectado: false }))).toEqual([]);
  });

  it("copia local vieja o ninguna", () => {
    expect(textos(estado({ locales: [{ nombre: "x", fecha: hace(5), motivo: "automatica", tamano: 1 }] }))).toEqual([
      "aviso: La última copia de seguridad es de hace 5 días",
    ]);
    expect(textos(estado({ locales: [{ nombre: "x", fecha: hace(3), motivo: "automatica", tamano: 1 }] }))).toEqual([]);
    expect(textos(estado({ locales: [] }))).toEqual(["aviso: Todavía no hay copias de seguridad"]);
  });

  it("Drive sin conectar, desconectado, con errores o atrasado", () => {
    expect(textos(estado({}, { conectado: false }))).toEqual([]); // lo pide el cartel del Panel
    expect(textos(estado({}, { desconectada: true }))).toEqual(["critico: Google Drive se desconectó"]);
    expect(textos(estado({}, { error: { mensaje: "No hay conexión a internet.", desde: hace(1) } }))).toEqual([]);
    expect(textos(estado({}, { error: { mensaje: "No hay conexión a internet.", desde: hace(4) }, ultimaSubida: { nombre: "x", fecha: hace(4) } }))).toEqual([
      "aviso: Las copias no se suben a Google Drive desde hace 4 días",
    ]);
    expect(textos(estado({}, { ultimaSubida: { nombre: "x", fecha: hace(6) } }))).toEqual(["aviso: La última copia en Google Drive es de hace 6 días"]);
  });

  it("si la app no trae la conexión con Google, no pide conectarla", () => {
    expect(textos(estado({}, { disponible: false, conectado: false }))).toEqual([]);
  });
});
