import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

async function requireSession() {
  const cookieStore = await cookies();
  return cookieStore.get("session");
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const clienteId = Number(id);
  if (!Number.isInteger(clienteId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
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

    const cliente = await prisma.cliente.update({
      where: { id: clienteId },
      data: { razonSocial, apellidoNombre, condIva, cuit, telCel, mail, domicilio },
    });

    return NextResponse.json(cliente);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Error al actualizar el cliente" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const clienteId = Number(id);
  if (!Number.isInteger(clienteId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  try {
    await prisma.cliente.delete({ where: { id: clienteId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "No se pudo eliminar (puede tener ventas asociadas)" },
      { status: 500 }
    );
  }
}
