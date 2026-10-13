export type ProveedorRow = {
  id: number;
  razonSocial: string;
  contacto: string;
  producto: string;
  cuitCuil: string;
  email: string;
  telefono: string;
  cbu?: string;
  alias?: string;
};

// Datos de prueba: los carga el seed (prisma/seed.ts) en la base.
export const proveedoresDemo: ProveedorRow[] = [
  {
    id: 1,
    razonSocial: "Destilería del Sur S.A.",
    contacto: "Marcos",
    producto: "Etiquetas",
    cuitCuil: "30-71234567-1",
    email: "compras@etiquetasmdp.com.ar",
    telefono: "223-4567890",
    cbu: "0720123988000012345678",
    alias: "etiquetasmdp.SUR",
  },
  {
    id: 2,
    razonSocial: "Botellas S.A",
    contacto: "Laura",
    producto: "Botellas",
    cuitCuil: "30-70987654-2",
    email: "ventas@envasescuyo.com.ar",
    telefono: "261-4009988",
    alias: "ENVASES.CUYO",
  },
  {
    id: 3,
    razonSocial: "Citricos Mar del Plata",
    contacto: "Julián",
    producto: "Limones",
    cuitCuil: "27-32456789-0",
    email: "julian@citric.com.ar",
    telefono: "223-5551234",
    cbu: "0110599520000001112229",
  },
  // Proveedores del Libro de compras del cliente. El contacto es obligatorio: se
// completó con nombres ficticios; email, teléfono y CUIT pueden quedar vacíos.
  {
    id: 4,
    razonSocial: "GRUPO PRIMUS",
    contacto: "Sergio Paredes",
    producto: "Alcohol",
    cuitCuil: "30-71826240-9",
    email: "",
    telefono: "",
  },
  {
    id: 5,
    razonSocial: "LODISER",
    contacto: "Carolina Ríos",
    producto: "Azúcar",
    cuitCuil: "30-71034252-7",
    email: "",
    telefono: "",
  },
  {
    id: 6,
    razonSocial: "CIBART SRL",
    contacto: "Martín Acosta",
    producto: "Botellas",
    cuitCuil: "30-71531674-5",
    email: "",
    telefono: "",
    cbu: "0070199620000004630951",
    alias: "CIBARTSRL",
  },
  {
    id: 7,
    razonSocial: "ALINUT",
    contacto: "Lucía Benítez",
    producto: "Hibiscus",
    cuitCuil: "",
    email: "",
    telefono: "",
  },
  {
    id: 8,
    razonSocial: "ABCEMPAQUES SRL",
    contacto: "Diego Ferreyra",
    producto: "Precintos",
    cuitCuil: "30-71441788-2",
    email: "",
    telefono: "",
  },
];