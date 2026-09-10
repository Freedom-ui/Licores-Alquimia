import { prisma } from "@/lib/prisma";
import ClientesClient from "./clientes-client";

export default async function ClientesPage() {
  const clientes = await prisma.cliente.findMany({
    orderBy: [{ razonSocial: "asc" }, { apellidoNombre: "asc" }],
  });

  return <ClientesClient clientesIniciales={clientes} />;
}
