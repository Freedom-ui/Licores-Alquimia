import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

function crearCliente() {
  const adapter = new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL ?? "file:./dev.db",
  });
  return new PrismaClient({ adapter });
}

// En desarrollo el cliente se guarda en globalThis para no abrir una conexión
// nueva en cada recarga en caliente. Junto con él se guarda la clase con la
// que se creó: si después de una migración se corre `prisma generate`, la
// clase cambia y se crea un cliente nuevo (si no, el dev server seguiría con
// el cliente viejo, que no conoce las tablas nuevas, hasta reiniciarlo).
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaClase: typeof PrismaClient | undefined;
};

const vigente =
  globalForPrisma.prisma && globalForPrisma.prismaClase === PrismaClient ? globalForPrisma.prisma : undefined;

export const prisma = vigente ?? crearCliente();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaClase = PrismaClient;
}
