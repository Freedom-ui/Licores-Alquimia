// Lo que en el servidor de verdad da Next (cookies, headers, redirect), en
// memoria para las pruebas de integración. entorno.ts reemplaza los módulos
// `next/headers` y `next/navigation` por estos.

/** Las cookies del "navegador" que hace los pedidos. */
export const galletas = new Map<string, string>();
/** Encabezados del pedido (por ejemplo x-forwarded-proto o host). */
export const cabeceras = new Headers({ host: "127.0.0.1:3000" });

/** Lo que hace `redirect()` de Next: corta la server action con un error especial. */
export class Redireccion extends Error {
  constructor(readonly destino: string) {
    super(`redirect → ${destino}`);
  }
}

export const almacenCookies = {
  get: (nombre: string) => (galletas.has(nombre) ? { name: nombre, value: galletas.get(nombre)! } : undefined),
  has: (nombre: string) => galletas.has(nombre),
  getAll: () => [...galletas].map(([name, value]) => ({ name, value })),
  set: (nombre: string, valor: string) => {
    galletas.set(nombre, valor);
  },
  delete: (nombre: string) => {
    galletas.delete(nombre);
  },
};

/** Un navegador nuevo: sin cookies. */
export function borrarCookies() {
  galletas.clear();
}
