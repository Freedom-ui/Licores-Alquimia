// Se ejecuta una vez al arrancar el servidor, antes de atender pedidos: deja la
// base lista (restauración pendiente, migraciones) y empieza las copias
// automáticas. Ver lib/arranque.ts.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { arrancar } = await import("./lib/arranque");
  arrancar();
}
