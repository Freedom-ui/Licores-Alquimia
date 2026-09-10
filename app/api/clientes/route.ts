import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

async function requireSession() {
  const cookieStore = await cookies();
  return cookieStore.get("session");
}

export async function GET() {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const clientes = await prisma.cliente.findMany({
    orderBy: [{ razonSocial: "asc" }, { apellidoNombre: "asc" }],
  });

  return NextResponse.json(clientes);
}

export async function POST(request: Request) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const razonSocial = (body.razonSocial ?? "").trim() || null;
    const apellidoNombre = (body.apellidoNombre ?? "").trim() || null;
    const condIva = (body.condIva ?? "").trim() || null;
    const cuit = (body.cuit ?? "").trim() || null;
    const telCel = (body.telCel ?? "").trim() || null;
    const mail = (body.mail ?? "").trim() || null;
    const domicilio = (body.domicilio ?? "").trim() || null;

    if (!razonSocial && !apellidoNombre) {
      return NextResponse.json(
        { error: "Ingresá al menos Razón social o Apellido y nombre" },
        { status: 400 }
      );
    }

    const cliente = await prisma.cliente.create({
      data: { razonSocial, apellidoNombre, condIva, cuit, telCel, mail, domicilio },
    });

    return NextResponse.json(cliente, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Error al crear el cliente" },
      { status: 500 }
    );
  }
}
