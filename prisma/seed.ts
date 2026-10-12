// Carga los datos de prueba en la base: borra clientes, proveedores, catálogos,
// compras, órdenes, lotes, inventario y ventas, y los reemplaza por el demo de
// cada sección (app/(dashboard)/*/data.ts), armado con las mismas
// sincronizaciones que usa la app. Los usuarios NO se tocan.
//
//   npm run db:seed                  → solo si la base no tiene datos
//   npm run db:seed -- --reemplazar  → borra lo que haya y carga el demo

import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { ESTADO_VACIO } from "@/app/(dashboard)/_dominio/acciones";
import { estadoDemo } from "@/app/(dashboard)/_dominio/demo";
import { guardarCambios } from "@/app/(dashboard)/_datos/repositorio";

async function main() {
  const reemplazar = process.argv.includes("--reemplazar");
  const conDatos = (await prisma.cliente.count()) + (await prisma.operacion.count()) + (await prisma.compra.count());
  if (conDatos > 0 && !reemplazar) {
    console.error("La base ya tiene datos. Para borrarlos y cargar el demo: npm run db:seed -- --reemplazar");
    process.exitCode = 1;
    return;
  }

  const demo = estadoDemo();
  await prisma.$transaction(
    async (tx) => {
      // Primero lo que referencia a otras tablas, al final los catálogos.
      await tx.operacion.deleteMany();
      await tx.loteTerminado.deleteMany();
      await tx.inventarioMateriaPrima.deleteMany();
      await tx.ordenProduccion.deleteMany();
      await tx.compra.deleteMany();
      await tx.producto.deleteMany();
      await tx.materiaPrima.deleteMany();
      await tx.proveedor.deleteMany();
      await tx.cliente.deleteMany();
      await guardarCambios(tx, ESTADO_VACIO, demo);
    },
    { timeout: 60_000 }
  );

  console.log(
    `Demo cargado: ${demo.clientes.length} clientes, ${demo.proveedores.length} proveedores, ` +
      `${demo.materiaPrima.length} materias primas, ${demo.productos.length} productos, ${demo.compras.length} compras, ` +
      `${demo.ordenesProduccion.length} órdenes, ${demo.productosTerminados.length} lotes, ${demo.operaciones.length} ventas.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
