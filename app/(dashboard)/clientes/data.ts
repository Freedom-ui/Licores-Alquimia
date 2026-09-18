export type ClienteRow = {
  id: number;
  razonSocial: string;
  apellidoNombre: string;
  condicionIva: string;
  cuit: string;
  telefono: string;
  email: string;
  domicilio: string;
  /** Precio para la línea Tradicional. */
  precioTradicional: number;
  /** Precio para la línea Premium (no todos los clientes la manejan). */
  precioPremium: number | null;
};

// Los campos que no venían completos en la planilla original (nombre, CUIT/CUIL,
// celular, mail, Cond. IVA, domicilio) se completaron con datos ficticios pero
// coherentes (mismo formato, mismo código de área, localidad acorde al nombre de
// la sucursal) para que la tabla se vea completa en las demos. Reemplazar por los
// datos reales cuando se consigan.
export const clientesDemo: ClienteRow[] = [
  { id: 1, razonSocial: "PARTICULAR", apellidoNombre: "María Fernández", condicionIva: "Consumidor Final", cuit: "27 - 30456712 - 4", telefono: "223 - 611 - 2345", email: "mariafernandez.part@gmail.com", domicilio: "San Martín 1500", precioTradicional: 10000, precioPremium: null },
  { id: 2, razonSocial: "COOP. NUEVO AMANECER", apellidoNombre: "EMANUEL", condicionIva: "R. Inscripto", cuit: "30 - 71401632 - 2", telefono: "223 - 519 - 9971", email: "coopnuevoamanecer@gmail.com", domicilio: "T. del Fuego 1650", precioTradicional: 4900, precioPremium: null },
  { id: 3, razonSocial: "UTT", apellidoNombre: "Roberto Sánchez", condicionIva: "R. Inscripto", cuit: "30 - 71978182 - 4", telefono: "223 - 522 - 3311", email: "utt.contacto@gmail.com", domicilio: "Champagnat 2540", precioTradicional: 5000, precioPremium: null },
  { id: 4, razonSocial: "BOUCHEE BEBIDAS SRL", apellidoNombre: "Martín Bouchée", condicionIva: "R. Inscripto", cuit: "30 - 70907759 - 3", telefono: "223 - 445 - 7788", email: "ventas@bouchebebidas.com", domicilio: "Pque. Log. De Leon Medina - Dep. 13", precioTradicional: 5900, precioPremium: null },
  { id: 5, razonSocial: "LATITUD 37 SRL", apellidoNombre: "Sofía Ramallo", condicionIva: "R. Inscripto", cuit: "30 - 70968696 - 4", telefono: "223 - 478 - 2290", email: "contacto@latitud37.com.ar", domicilio: "Av. Colón 3120", precioTradicional: 4500, precioPremium: null },
  { id: 6, razonSocial: "CHOCOLATES EN ROMA", apellidoNombre: "MARIANO FEDERICO DALVIA", condicionIva: "R. Inscripto", cuit: "20 - 38277358 - 7", telefono: "223 - 493 - 5567", email: "chocolatesenroma@gmail.com", domicilio: "Güemes 1875", precioTradicional: 6800, precioPremium: null },
  { id: 7, razonSocial: "MB - ENSENADA", apellidoNombre: "TAMARA Y GISELLE", condicionIva: "Monotributo", cuit: "27 - 32109876 - 5", telefono: "223 - 604 - 1123", email: "mb.ensenada@gmail.com", domicilio: "Bossinga e Illia", precioTradicional: 10000, precioPremium: null },
  { id: 8, razonSocial: "MB - TAPALQUE", apellidoNombre: "EMANUEL", condicionIva: "Monotributo", cuit: "20 - 31987654 - 3", telefono: "223 - 615 - 4432", email: "mb.tapalque@gmail.com", domicilio: "Los Tilos y Plátanos", precioTradicional: 10000, precioPremium: null },
  { id: 9, razonSocial: "MB - HURLINGHAM", apellidoNombre: "IVAN Y ESTHER", condicionIva: "Monotributo", cuit: "23 - 29876543 - 9", telefono: "223 - 588 - 7621", email: "mb.hurlingham@gmail.com", domicilio: "Av. Gdor. Vergara 2950", precioTradicional: 10000, precioPremium: null },
  { id: 10, razonSocial: "MB - LUJAN", apellidoNombre: "LUCIA Y AMALIA", condicionIva: "Monotributo", cuit: "27 - 33456123 - 8", telefono: "223 - 599 - 3345", email: "mb.lujan@gmail.com", domicilio: "Av. 520 y 115", precioTradicional: 10000, precioPremium: null },
  { id: 11, razonSocial: "MB - LA PLATA", apellidoNombre: "CELESTE Y GABRIELA", condicionIva: "Monotributo", cuit: "27 - 30789456 - 2", telefono: "223 - 620 - 8890", email: "mb.laplata@gmail.com", domicilio: "Mitre 791", precioTradicional: 10000, precioPremium: null },
  { id: 12, razonSocial: "MB - ESCOBAR", apellidoNombre: "Valentina Y Rocío", condicionIva: "Monotributo", cuit: "27 - 31122334 - 6", telefono: "223 - 634 - 2201", email: "mb.escobar@gmail.com", domicilio: "Mitre 450, Escobar", precioTradicional: 10000, precioPremium: null },
  { id: 13, razonSocial: "MB - MORON", apellidoNombre: "Antonella Y Julieta", condicionIva: "Monotributo", cuit: "27 - 30998877 - 1", telefono: "223 - 645 - 9987", email: "mb.moron@gmail.com", domicilio: "Rivadavia 890, Morón", precioTradicional: 10000, precioPremium: null },
  { id: 14, razonSocial: "MB - FLORENCIO VARELA", apellidoNombre: "Micaela Y Agustina", condicionIva: "Monotributo", cuit: "27 - 31556677 - 7", telefono: "223 - 651 - 3345", email: "mb.florenciovarela@gmail.com", domicilio: "San Martín 1220, Florencio Varela", precioTradicional: 10000, precioPremium: null },
  { id: 15, razonSocial: "MB - ITUZAINGO", apellidoNombre: "Camila Y Florencia", condicionIva: "Monotributo", cuit: "27 - 32334455 - 0", telefono: "223 - 662 - 7789", email: "mb.ituzaingo@gmail.com", domicilio: "Belgrano 675, Ituzaingó", precioTradicional: 10000, precioPremium: null },
  { id: 16, razonSocial: "MB - LA MATANZA", apellidoNombre: "Daniela Y Paula", condicionIva: "Monotributo", cuit: "27 - 30776655 - 4", telefono: "223 - 673 - 1102", email: "mb.lamatanza@gmail.com", domicilio: "Av. Juan Manuel de Rosas 1580, La Matanza", precioTradicional: 10000, precioPremium: null },
  { id: 17, razonSocial: "MB - MARCOS PAZ", apellidoNombre: "Brenda Y Milagros", condicionIva: "Monotributo", cuit: "27 - 31889900 - 9", telefono: "223 - 684 - 5543", email: "mb.marcospaz@gmail.com", domicilio: "Sarmiento 210, Marcos Paz", precioTradicional: 10000, precioPremium: null },
  { id: 18, razonSocial: "LUCIANA (Somelier)", apellidoNombre: "Luciana Ibarra", condicionIva: "Monotributo", cuit: "27 - 29334455 - 6", telefono: "223 - 590 - 6612", email: "luciana.sommelier@gmail.com", domicilio: "Alberti 2210", precioTradicional: 4500, precioPremium: null },
  { id: 19, razonSocial: "4020 - MARKET", apellidoNombre: "JUAN", condicionIva: "R. Inscripto", cuit: "20 - 28728067 - 0", telefono: "223 - 400 - 4020", email: "4020market@gmail.com", domicilio: "Funes y Libertad", precioTradicional: 5700, precioPremium: null },
  { id: 20, razonSocial: "CAVA MITRE", apellidoNombre: "FRANCISCO ZARATIEGUI", condicionIva: "R. Inscripto", cuit: "20 - 39098613 - 1", telefono: "223 - 601 - 7744", email: "cavamitre@gmail.com", domicilio: "La Rioja 2126", precioTradicional: 6800, precioPremium: 17000 },
  { id: 21, razonSocial: "JAVIER MATTALUCCI", apellidoNombre: "JAVIER MATTALUCCI", condicionIva: "Monotributo", cuit: "20 - 27665544 - 3", telefono: "223 - 555 - 9021", email: "javier.mattalucci@gmail.com", domicilio: "Rawson 980", precioTradicional: 8000, precioPremium: null },
  { id: 22, razonSocial: "RECOVA DE CERVEZAS SAS", apellidoNombre: "MATIAS", condicionIva: "R. Inscripto", cuit: "30 - 71624315 - 6", telefono: "223 - 456 - 4794", email: "recovadecervezas@gmail.com", domicilio: "Galeria Essenza - Moreno 2941", precioTradicional: 5250, precioPremium: null },
  { id: 23, razonSocial: "FANROZ DOBLEA SRL", apellidoNombre: "FRANCO (dueño) / LETICIA (encargada)", condicionIva: "R. Inscripto", cuit: "33 - 71895176 - 9", telefono: "223 - 650 - 4197", email: "fanrozdoblea@gmail.com", domicilio: "Avellaneda 1206", precioTradicional: 6600, precioPremium: null },
  { id: 24, razonSocial: "TOLOZA CRISTIAN JESUS", apellidoNombre: "CRISTIAN", condicionIva: "R. Inscripto", cuit: "20 - 31476401 - 4", telefono: "223 - 512 - 4944", email: "cristian.toloza@gmail.com", domicilio: "Sarmiento 2831", precioTradicional: 7200, precioPremium: null },
];
