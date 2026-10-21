// Datos de prueba completos, armados con las mismas sincronizaciones que usa
// la app al cargar cada cosa a mano (compras → inventario, órdenes → consumos
// y lotes, ventas → salidas FIFO). Los usa el seed (prisma/seed.ts).

import { clientesDemo } from "../clientes/data";
import { proveedoresDemo } from "../proveedores/data";
import { materiaPrimaDemo } from "../materia-prima/data";
import { productosDemo } from "../productos/data";
import { operacionesDemo, vendedoresDemo } from "../operaciones/data";
import { ordenesProduccionDemo } from "../ordenes-produccion/data";
import { productosTerminadosDemo } from "../productos-terminados/data";
import { inventarioMateriaPrimaDemo } from "../inventario-materia-prima/data";
import { comprasDemo } from "../trazabilidad/data";
import type { Estado } from "./acciones";
import { recalcularFifo, syncConsumosParaOrden, syncEntradaParaCompra, syncLoteParaOrden } from "./sync";

export function estadoDemo(): Estado {
  let inventario = inventarioMateriaPrimaDemo;
  for (const c of comprasDemo) inventario = syncEntradaParaCompra(inventario, c);
  for (const o of ordenesProduccionDemo) inventario = syncConsumosParaOrden(inventario, o, materiaPrimaDemo);

  let lotes = productosTerminadosDemo;
  for (const o of ordenesProduccionDemo) lotes = syncLoteParaOrden(lotes, o);
  lotes = recalcularFifo(lotes, operacionesDemo, ordenesProduccionDemo, new Set(operacionesDemo.map((op) => op.productoId)));

  return {
    clientes: clientesDemo,
    proveedores: proveedoresDemo,
    materiaPrima: materiaPrimaDemo,
    productos: productosDemo,
    vendedores: vendedoresDemo,
    operaciones: operacionesDemo,
    ordenesProduccion: ordenesProduccionDemo,
    productosTerminados: lotes,
    inventarioMateriaPrima: inventario,
    compras: comprasDemo,
  };
}
