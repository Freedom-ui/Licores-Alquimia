// Precio que se sugiere al cargar una venta. Al público (canal Menor) va el
// precio de lista del producto; a un mayorista (canal Mayor), el precio que
// tiene acordado ese cliente para la línea del producto (Tradicional o
// Premium), o el de lista si no tiene uno. Es solo una sugerencia: el usuario
// puede escribir otro precio.

import type { ClienteRow } from "../clientes/data";
import type { ProductoRow } from "../productos/data";

export type PrecioSugerido = {
  precio: number;
  /** De dónde sale, para mostrarlo debajo del campo. */
  origen: string;
};

export function precioSugerido(
  producto: Pick<ProductoRow, "precioUnitario" | "linea">,
  cliente: Pick<ClienteRow, "precioTradicional" | "precioPremium"> | undefined,
  canal: string
): PrecioSugerido {
  const lista = { precio: producto.precioUnitario, origen: "Precio de lista" };
  if (canal !== "Mayor" || !cliente || producto.linea === "Lista") return lista;
  if (producto.linea === "Premium") {
    return cliente.precioPremium !== null && cliente.precioPremium > 0
      ? { precio: cliente.precioPremium, origen: "Precio del cliente (Premium)" }
      : { ...lista, origen: "Precio de lista (el cliente no tiene precio Premium)" };
  }
  return cliente.precioTradicional > 0
    ? { precio: cliente.precioTradicional, origen: "Precio del cliente (Tradicional)" }
    : { ...lista, origen: "Precio de lista (el cliente no tiene precio Tradicional)" };
}
