// Integración: acceso a la app (app/(acceso)/acciones.ts + lib/auth/sesion.ts
// + base real). Primer arranque, ingreso, bloqueo por intentos, vencimiento de
// la sesión, cierre y recuperación con el código.

import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { COOKIE_SESION, DURACION_MAX_HORAS, MAX_INTENTOS } from "@/lib/auth/reglas";
import { obtenerSesion } from "@/lib/auth/sesion";
import {
  cerrarSesion,
  crearCuentaInicial,
  iniciarSesion,
  mantenerSesion,
  recuperarAcceso,
} from "@/app/(acceso)/acciones";
import { galletas, Redireccion } from "./galletas";
import { CLAVE_DE_PRUEBA, crearUsuario, entrar, formulario, vaciarBase } from "./ayudantes";

const MINUTO = 60_000;
const login = (usuario: string, contrasena: string) => iniciarSesion({}, formulario({ usuario, contrasena }));
const cuentaInicial = (usuario: string, contrasena: string, repetir = contrasena) =>
  crearCuentaInicial({}, formulario({ usuario, contrasena, repetir }));

/** La server action terminó con redirect() a `destino`. */
async function redirigeA(p: Promise<unknown>, destino: string) {
  await expect(p).rejects.toBeInstanceOf(Redireccion);
  await p.catch((e: Redireccion) => expect(e.destino).toBe(destino));
}

beforeEach(() => vaciarBase());

describe("Primer arranque (crearCuentaInicial)", () => {
  it("IT-A01 crea la cuenta, inicia sesión y muestra el código de recuperación", async () => {
    await redirigeA(cuentaInicial("maria.lopez", "clave1234"), "/codigo-recuperacion");

    const u = await prisma.usuario.findUnique({ where: { username: "maria.lopez" } });
    expect(u).not.toBeNull();
    expect(u!.passwordHash).not.toContain("clave1234"); // guardada con bcrypt
    expect(u!.codigoPendiente).toMatch(/^[A-Za-z0-9]{7}$/);
    expect(galletas.has(COOKIE_SESION)).toBe(true);
  });

  it("IT-A02 con usuario corto, contraseña sin números y confirmación distinta devuelve un error por campo", async () => {
    const r = await cuentaInicial("ab", "solotexto", "otra");

    expect(r.campos?.usuario).toContain("al menos 3");
    expect(r.campos?.contrasena).toContain("una letra y un número");
    expect(await prisma.usuario.count()).toBe(0);
    expect(galletas.size).toBe(0);
  });

  it.each([
    ["usuario con espacios", "maria lopez", "clave1234", "clave1234", "usuario"],
    ["usuario con tilde", "maría", "clave1234", "clave1234", "usuario"],
    ["contraseña de 7 caracteres", "maria.lopez", "clave12", "clave12", "contrasena"],
    ["contraseña igual al usuario", "maria1234", "MARIA1234", "MARIA1234", "contrasena"],
    ["confirmación distinta", "maria.lopez", "clave1234", "clave1235", "repetir"],
  ])("IT-A03 %s → rechazo en «%s» y no se crea nada", async (_n, usuario, contrasena, repetir, campo) => {
    const r = await cuentaInicial(usuario, contrasena, repetir);

    expect(r.campos?.[campo as "usuario"]).toBeTruthy();
    expect(await prisma.usuario.count()).toBe(0);
  });

  it("IT-A04 si ya existe una cuenta no crea otra (va al login)", async () => {
    await crearUsuario("qa.tester");

    await redirigeA(cuentaInicial("intruso", "clave1234"), "/login");

    expect(await prisma.usuario.count()).toBe(1);
    expect(galletas.size).toBe(0);
  });
});

describe("Ingreso (iniciarSesion)", () => {
  beforeEach(async () => {
    await crearUsuario("qa.tester");
  });

  it("IT-A05 con usuario y contraseña correctos entra al panel; en la base queda el hash del token, no el token", async () => {
    await redirigeA(login("qa.tester", CLAVE_DE_PRUEBA), "/codigo-recuperacion");

    const token = galletas.get(COOKIE_SESION)!;
    expect(token).toBeTruthy();
    const sesiones = await prisma.sesion.findMany();
    expect(sesiones).toHaveLength(1);
    expect(sesiones[0].id).not.toBe(token);
    expect((await obtenerSesion())?.username).toBe("qa.tester");
  });

  it("IT-A06 los espacios alrededor del usuario no importan", async () => {
    await redirigeA(login("  qa.tester  ", CLAVE_DE_PRUEBA), "/codigo-recuperacion");
  });

  it("IT-A07 contraseña incorrecta: mensaje genérico, intento registrado y sin cookie", async () => {
    const r = await login("qa.tester", "otra12345");

    expect(r.error).toBe("Usuario o contraseña incorrectos.");
    expect(await prisma.intentoFallido.count()).toBe(1);
    expect(galletas.size).toBe(0);
  });

  it("IT-A08 un usuario que no existe recibe el mismo mensaje (no revela qué usuarios hay)", async () => {
    const r = await login("nadie", CLAVE_DE_PRUEBA);

    expect(r.error).toBe("Usuario o contraseña incorrectos.");
  });

  it("IT-A09 el usuario distingue mayúsculas: «Qa.Tester» no es «qa.tester»", async () => {
    const r = await login("Qa.Tester", CLAVE_DE_PRUEBA);

    expect(r.error).toBe("Usuario o contraseña incorrectos.");
  });

  it("IT-A10 con campos vacíos pide completarlos y no cuenta como intento", async () => {
    const r = await login("", "");

    expect(r.error).toBe("Ingresá tu usuario y tu contraseña.");
    expect(await prisma.intentoFallido.count()).toBe(0);
  });

  it(`IT-A11 avisa cuando quedan 2 intentos y bloquea al ${MAX_INTENTOS}.º fallo, aunque después la contraseña sea correcta`, async () => {
    const mensajes: (string | undefined)[] = [];
    for (let i = 0; i < MAX_INTENTOS; i++) mensajes.push((await login("qa.tester", "mala12345")).error);

    expect(mensajes[0]).toBe("Usuario o contraseña incorrectos.");
    expect(mensajes[2]).toContain("quedan 2 intentos");
    expect(mensajes[3]).toContain("queda 1 intento");
    expect(mensajes[4]).toContain("Demasiados intentos fallidos");

    const conLaCorrecta = await login("qa.tester", CLAVE_DE_PRUEBA);
    expect(conLaCorrecta.error).toContain("esperá 15 minutos");
    expect(galletas.size).toBe(0);
  });

  it("IT-A12 un ingreso correcto antes del bloqueo borra los fallos anteriores", async () => {
    await login("qa.tester", "mala12345");
    await login("qa.tester", "mala12345");

    await redirigeA(login("qa.tester", CLAVE_DE_PRUEBA), "/codigo-recuperacion");

    expect(await prisma.intentoFallido.count()).toBe(0);
  });
});

describe("Vencimiento y cierre de la sesión", () => {
  async function envejecer(minutosSinUso: number, minutosDesdeCreada = minutosSinUso) {
    const ahora = Date.now();
    await prisma.sesion.updateMany({
      data: { ultimoUso: new Date(ahora - minutosSinUso * MINUTO), creadaEn: new Date(ahora - minutosDesdeCreada * MINUTO) },
    });
  }

  beforeEach(() => entrar());

  it("IT-A13 con 29 minutos sin uso la sesión sigue (límite: 30)", async () => {
    await envejecer(29);

    expect(await obtenerSesion()).not.toBeNull();
  });

  it("IT-A14 con 31 minutos sin uso vence y se borra de la base", async () => {
    await envejecer(31);

    expect(await obtenerSesion()).toBeNull();
    expect(await prisma.sesion.count()).toBe(0);
  });

  it(`IT-A15 aunque se use todo el tiempo, vence a las ${DURACION_MAX_HORAS} horas`, async () => {
    await envejecer(1, DURACION_MAX_HORAS * 60 + 1);

    expect(await obtenerSesion()).toBeNull();
  });

  it("IT-A16 usar la app renueva la sesión (ultimoUso se actualiza)", async () => {
    await envejecer(20);

    expect((await mantenerSesion()).activa).toBe(true);

    const s = (await prisma.sesion.findFirst())!;
    expect(Date.now() - s.ultimoUso.getTime()).toBeLessThan(MINUTO);
  });

  it("IT-A17 cerrar sesión la borra de la base y la cookie vieja ya no sirve", async () => {
    const tokenViejo = galletas.get(COOKIE_SESION)!;

    await cerrarSesion();

    expect(await prisma.sesion.count()).toBe(0);
    expect(galletas.has(COOKIE_SESION)).toBe(false);
    galletas.set(COOKIE_SESION, tokenViejo);
    expect((await mantenerSesion()).activa).toBe(false);
  });
});

describe("Recuperar el acceso con el código (recuperarAcceso)", () => {
  let codigo: string;

  beforeEach(async () => {
    await cuentaInicial("maria.lopez", "clave1234").catch(() => {});
    codigo = (await prisma.usuario.findFirstOrThrow()).codigoPendiente!;
    galletas.clear();
  });

  const recuperar = (campos: Record<string, string>) => recuperarAcceso({}, formulario(campos));

  it("IT-A18 un código con formato inválido se rechaza sin contar como intento", async () => {
    const r = await recuperar({ codigo: "abc" });

    expect(r.campos?.codigo).toContain("7 caracteres");
    expect(await prisma.intentoFallido.count()).toBe(0);
  });

  it("IT-A19 un código con buen formato pero incorrecto cuenta como intento fallido", async () => {
    const otro = codigo === "Abc1234" ? "Abc1235" : "Abc1234";

    const r = await recuperar({ codigo: otro });

    expect(r.error).toContain("no es correcto");
    expect(await prisma.intentoFallido.count()).toBe(1);
  });

  it("IT-A20 paso 1 con el código correcto (aunque tenga espacios) muestra el usuario de la cuenta", async () => {
    const conEspacios = `${codigo.slice(0, 3)} ${codigo.slice(3)}`;

    const r = await recuperar({ codigo: conEspacios });

    expect(r.verificado).toEqual({ codigo, usuario: "maria.lopez" });
  });

  it("IT-A21 paso 2 cambia usuario y contraseña, cierra las otras sesiones y el código usado deja de servir", async () => {
    await entrar("maria.lopez"); // una sesión abierta en "otro navegador"
    galletas.clear();

    await redirigeA(
      recuperar({ codigo, paso: "2", usuario: "maria.nueva", contrasena: "nueva5678", repetir: "nueva5678" }),
      "/codigo-recuperacion?motivo=recuperado"
    );

    const u = await prisma.usuario.findFirstOrThrow();
    expect(u.username).toBe("maria.nueva");
    expect(await prisma.sesion.count()).toBe(1); // solo la nueva
    galletas.clear();
    await redirigeA(login("maria.nueva", "nueva5678"), "/codigo-recuperacion");
    galletas.clear();
    const conElViejo = await recuperar({ codigo });
    expect(conElViejo.error).toContain("no es correcto");
  });

  it("IT-A22 paso 2 con una contraseña inválida no cambia nada", async () => {
    const r = await recuperar({ codigo, paso: "2", usuario: "maria.lopez", contrasena: "corta", repetir: "corta" });

    expect(r.campos?.contrasena).toBeTruthy();
    expect((await prisma.usuario.findFirstOrThrow()).username).toBe("maria.lopez");
  });
});
