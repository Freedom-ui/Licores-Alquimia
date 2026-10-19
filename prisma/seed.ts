// Carga datos de prueba en la base: borra clientes, proveedores, catálogos,
// compras, órdenes, lotes, inventario y ventas, y los reemplaza por datos
// generados (app/(dashboard)/_dominio/generador.ts): desde enero de 2024 hasta
// hoy, falsos pero coherentes, armados con las mismas reglas y
// sincronizaciones que usa la app. Los usuarios NO se tocan.
//
//   npm run db:seed                                  → solo si la base no tiene datos
//   npm run db:seed -- --reemplazar                  → borra lo que haya y carga los datos generados
//   npm run db:seed -- --reemplazar --semilla=7      → otra variante (misma semilla = mismos datos)
//   npm run db:seed -- --reemplazar --hasta=2026-09-30  → con datos hasta esa fecha (no futura)
//   npm run db:seed -- --reemplazar --demo           → el demo chico de antes (el de los tests)

import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { ESTADO_VACIO, type Estado } from "@/app/(dashboard)/_dominio/acciones";
import { estadoDemo } from "@/app/(dashboard)/_dominio/demo";
import { generarDatos } from "@/app/(dashboard)/_dominio/generador";
import { revisarEstado } from "@/app/(dashboard)/_dominio/revisar";
import { borrarDatosNegocio, guardarCambios } from "@/app/(dashboard)/_datos/repositorio";
import { esFechaReal, hoyLocal } from "@/app/components/data-table/validacion";

function opcion(nombre: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${nombre}=`))?.slice(nombre.length + 3);
}

function armarEstado(): Estado {
  if (process.argv.includes("--demo")) return estadoDemo();
  const semillaTexto = opcion("semilla");
  const semilla = semillaTexto === undefined ? 1 : Number(semillaTexto);
  if (!Number.isInteger(semilla)) throw new Error(`--semilla tiene que ser un número entero (llegó "${semillaTexto}").`);
  const hasta = opcion("hasta") ?? hoyLocal();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hasta) || !esFechaReal(hasta) || hasta > hoyLocal() || hasta < "2024-01-01") {
    throw new Error(`--hasta tiene que ser una fecha AAAA-MM-DD entre el 2024-01-01 y hoy (llegó "${hasta}").`);
  }
  return generarDatos({ semilla, hasta });
}

async function main() {
  const reemplazar = process.argv.includes("--reemplazar");
  const conDatos = (await prisma.cliente.count()) + (await prisma.operacion.count()) + (await prisma.compra.count());
  if (conDatos > 0 && !reemplazar) {
    console.error("La base ya tiene datos. Para borrarlos y cargar los datos de prueba: npm run db:seed -- --reemplazar");
    process.exitCode = 1;
    return;
  }

  const inicio = Date.now();
  const estado = armarEstado();
  const problemas = revisarEstado(estado);
  if (problemas.length > 0) {
    console.error(`Los datos generados no pasan las reglas de la app (${problemas.length} problemas). No se cargó nada:`);
    for (const p of problemas.slice(0, 20)) console.error(` - ${p}`);
    process.exitCode = 1;
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      await borrarDatosNegocio(tx);
      await guardarCambios(tx, ESTADO_VACIO, estado);
    },
    { timeout: 300_000 }
  );

  const fechas = estado.operaciones.map((o) => o.fecha).sort();
  console.log(
    `Datos cargados en ${((Date.now() - inicio) / 1000).toFixed(1)} s: ${estado.clientes.length} clientes, ${estado.proveedores.length} proveedores, ` +
      `${estado.materiaPrima.length} materias primas, ${estado.productos.length} productos, ${estado.vendedores.length} vendedores, ` +
      `${estado.compras.length} compras, ${estado.ordenesProduccion.length} órdenes, ${estado.productosTerminados.length} lotes, ` +
      `${estado.operaciones.length} ventas${fechas.length ? ` (del ${fechas[0]} al ${fechas.at(-1)})` : ""}.`
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
