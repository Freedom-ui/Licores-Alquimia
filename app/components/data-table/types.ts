import type { ReactNode } from "react";
import type { Resultado } from "./validacion";

export type ColumnType = "text" | "number" | "currency" | "date" | "tag" | "email" | "barcode";
export type FormInputType = "text" | "number" | "date" | "email" | "select" | "textarea";

export type ColumnFormConfig = {
  /** Si esta columna aparece en el formulario de alta. Default: true, salvo la columna "id". */
  include?: boolean;
  /** Tipo de input a renderizar. Si se omite, se infiere del `type` de la columna. */
  input?: FormInputType;
  /**
   * Muestra el asterisco de obligatorio. La validación de verdad (obligatorios,
   * formatos, duplicados) la hace el `validar` del formulario, el mismo que el servidor.
   */
  required?: boolean;
  /** Opciones para un input "select" (ej. valores posibles de un tag). */
  options?: string[];
  placeholder?: string;
  /** Largo máximo que deja escribir el input (el servidor lo vuelve a controlar). */
  maxLength?: number;
  /** En campos numéricos: false = solo enteros (no deja escribir coma ni punto). Default: true. */
  decimales?: boolean;
};

export type Column<T> = {
  /** Clave del campo en cada fila (debe existir en T). */
  key: keyof T & string;
  /** Encabezado visible. */
  label: string;
  /** Tipo de dato: define formato de render y comportamiento de filtro/orden. Default: "text". */
  type?: ColumnType;
  /** Si se incluye en la búsqueda global de texto. Default: true para text/email/tag. */
  searchable?: boolean;
  /** Si muestra un dropdown de filtro con los valores distintos de la columna (ideal para "tag"). */
  filterable?: boolean;
  /** Si permite ordenar al hacer click en el encabezado. Default: true. */
  sortable?: boolean;
  /** Ancho opcional (css), ideal en %, ej. "12%", para que la tabla nunca necesite scroll horizontal. */
  width?: string;
  align?: "left" | "right" | "center";
  /** Texto completo a mostrar como tooltip al pasar el mouse por el encabezado (útil si `label` está abreviado). */
  title?: string;
  /**
   * Encabezado agrupador: columnas consecutivas con el mismo `group` se muestran
   * bajo una celda común (ej. "Proveedor" sobre Nombre / Form. / Tipo / N°), en
   * pantalla y en el PDF.
   */
  group?: string;
  /**
   * Ancho máximo de la celda en px: un texto más largo se corta con "…" y se
   * lee completo al pasar el mouse (y en la ficha de la fila). Default: 260
   * en columnas de texto y email; null = sin tope.
   */
  maxWidth?: number | null;
  /** Metadata para generar el campo correspondiente en RecordFormModal (alta manual de un registro). */
  form?: ColumnFormConfig;
};

export type DataTableProps<T> = {
  /** Nombre de la sección/tabla, usado en el estado vacío y como referencia para export. */
  title: string;
  columns: Column<T>[];
  /** Cada fila debería tener un campo `id` único (se usa como key); si no lo tiene, se usa el índice. */
  rows: T[];
  emptyMessage?: string;
  /** Slot para acciones junto al buscador (típicamente el botón "+ Nuevo" de RecordFormModal). */
  actions?: ReactNode;
  /** Oculta el botón "Descargar PDF" (visible por defecto en toda sección). */
  hideExport?: boolean;
  /** Oculta el botón "Importar Excel" (visible por defecto; su lógica se implementa en otra rama). */
  hideImport?: boolean;
  /** Si se provee, agrega el botón de editar en cada fila y llama con la fila clickeada. */
  onEditRow?: (row: T) => void;
  /** Si se provee, agrega el botón de eliminar en cada fila. Se llama recién tras confirmar en el modal. */
  onDeleteRow?: (row: T) => void | Promise<void>;
  /** Botones extra por fila, antes de editar/eliminar (ej. "Rastrear"). */
  rowActions?: (row: T) => ReactNode;
  /**
   * Borrado de las filas seleccionadas (una sola confirmación y una sola
   * transacción). Devuelve las que no se pudieron borrar y por qué. Sin esto,
   * la selección sirve solo para exportar.
   */
  onDeleteRows?: (rows: T[]) => Promise<{ row: T; mensaje: string }[]>;
  /**
   * Botones extra en la barra de selección (ej. "Marcar pagadas", "Remito"),
   * con las filas seleccionadas y una función para quitar la selección.
   */
  accionesSeleccion?: (rows: T[], quitarSeleccion: () => void) => ReactNode;
  /**
   * Ficha de solo lectura (doble clic o Enter sobre la fila activa) con todos
   * los datos sin cortar y, opcionalmente, información relacionada. Sin
   * ficha, el doble clic abre la edición.
   */
  ficha?: { titulo: (row: T) => string; extra?: (row: T) => ReactNode };
  /** Tope de 1800 px centrado en pantallas muy anchas (catálogos con pocas columnas). */
  anchoMaximo?: boolean;
  /**
   * Id de una fila a mostrar al entrar (ej. `?foco=1620` desde la ficha de un
   * cliente): va a su página, la deja como fila activa y la trae a la vista.
   */
  enfocar?: number | string | null;
};

export type RecordFormModalProps<T> = {
  /** Nombre de la sección, se usa en el título del modal (ej. "Clientes", "Órdenes de producción"). */
  title: string;
  /** Misma definición de columnas que usa la DataTable de la sección. */
  columns: Column<T>[];
  /** Texto del botón que abre el modal. Default: "+ Nuevo". */
  triggerLabel?: string;
  /**
   * Reglas del formulario (las mismas que corre el servidor): recibe los
   * valores tal como se escribieron y devuelve el valor limpio o los errores por campo.
   */
  validar: (values: Record<string, string>) => Resultado<Record<string, unknown>>;
  /** Se llama con el valor limpio que devolvió `validar`. Si falla, el error se muestra en el modal. */
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
};

export type EditRecordModalProps<T> = {
  /** Nombre de la sección, se usa en el título del modal. */
  title: string;
  /** Misma definición de columnas que usa la DataTable de la sección. */
  columns: Column<T>[];
  /** Fila a editar; el modal está abierto mientras no sea null. */
  row: T | null;
  onClose: () => void;
  /** Ver RecordFormModalProps.validar. */
  validar: (values: Record<string, string>) => Resultado<Record<string, unknown>>;
  /** Se llama con el valor limpio que devolvió `validar`. Si falla, el error se muestra en el modal. */
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
};

/**
 * Columna de una sub-tabla de líneas (ej. los insumos de una orden de
 * producción, o los movimientos de un kardex). Es el equivalente de `Column`
 * pero para filas que viven adentro de un formulario maestro-detalle, no en
 * la tabla principal.
 */
export type LineColumn<L> = {
  key: keyof L & string;
  label: string;
  type?: "text" | "number" | "currency" | "select";
  /** Ancho de la columna dentro de la sub-tabla (css, ideal en %). */
  width?: string;
  /** Opciones para un input "select" (ej. la lista de materias primas). */
  options?: string[];
  /** Opciones que dependen de la propia línea (ej. los lotes de la materia prima elegida). Pisa a `options`. */
  optionsFor?: (row: L, index: number) => { value: string; label: string }[];
  /** Si es true, se muestra el valor formateado pero no se puede editar (ej. un total calculado). */
  readOnly?: boolean;
  placeholder?: string;
};
