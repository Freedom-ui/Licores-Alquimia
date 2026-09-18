export type ClienteRow = {
  id: number;
  nombre: string;
  razonSocial: string;
  condicionIva: string;
  telefono: string;
  email: string;
  domicilio: string;
};

// Datos de ejemplo — reemplazar por la consulta real (Prisma) cuando el modelo esté listo.
export const clientesDemo: ClienteRow[] = [
  { id: 1, nombre: "Almacén Don Pedro", razonSocial: "Pedro Gómez", condicionIva: "Monotributo", telefono: "11-4455-2211", email: "donpedro@mail.com", domicilio: "Av. Rivadavia 1234, CABA" },
  { id: 2, nombre: "Vinoteca Sur", razonSocial: "Vinoteca Sur S.R.L.", condicionIva: "Responsable Inscripto", telefono: "11-2233-8899", email: "compras@vinotecasur.com", domicilio: "Calle 50 N° 780, La Plata" },
  { id: 3, nombre: "Kiosco La Esquina", razonSocial: "María López", condicionIva: "Consumidor Final", telefono: "11-6677-1122", email: "malopez@mail.com", domicilio: "San Martín 456, Quilmes" },
  { id: 4, nombre: "Distribuidora Norte", razonSocial: "Distribuidora Norte S.A.", condicionIva: "Responsable Inscripto", telefono: "11-9988-4433", email: "ventas@distrinorte.com", domicilio: "Ruta 8 Km 45, Pilar" },
];
