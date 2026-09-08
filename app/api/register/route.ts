import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const { username, password, nombre } = await request.json();

    if (!username || !password || !nombre) {
      return NextResponse.json(
        { error: "Faltan campos obligatorios" },
        { status: 400 }
      );
    }

    const existente = await prisma.usuario.findUnique({ where: { username } });
    if (existente) {
      return NextResponse.json(
        { error: "Ese nombre de usuario ya existe" },
        { status: 409 }
      );
    }

    const cantidadUsuarios = await prisma.usuario.count();
    const rol = cantidadUsuarios === 0 ? "ADMIN" : "OPERADOR";

    const passwordHash = await bcrypt.hash(password, 10);

    const usuario = await prisma.usuario.create({
      data: { username, passwordHash, nombre, rol },
    });

    return NextResponse.json({
      id: usuario.id,
      username: usuario.username,
      nombre: usuario.nombre,
      rol: usuario.rol,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Error al registrar usuario" },
      { status: 500 }
    );
  }
}