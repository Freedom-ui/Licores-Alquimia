import type { ReactNode } from "react";

export type ColumnType = "text" | "number" | "currency" | "date" | "tag" | "email";

export type FormInputType = "text" | "number" | "date" | "email" | "select" | "textarea";

export type ColumnFormConfig = {
  /** Si esta columna aparece en el formulario de alta. Default: true, salvo la columna "id". */
  include?: boolean;
  /** Tipo de input a renderizar. Si se omite, se infiere del `type` de la columna. */
  input?: FormInputType;
  /** Si el campo es obligatorio para poder guardar. */
  required?: boolean;
  /** Opciones para un input "select" (ej. valores posibles de un tag). */
  options?: string[];
  placeholder?: string;
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
  /** Ancho fijo opcional (css), ej. "120px". */
  width?: string;
  align?: "left" | "right" | "center";
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
  /** Si se provee, agrega el botón de editar en cada fila y llama con la fila clickeada. */
  onEditRow?: (row: T) => void;
  /** Si se provee, agrega el botón de eliminar en cada fila. Se llama recién tras confirmar en el modal. */
  onDeleteRow?: (row: T) => void | Promise<void>;
};

export type RecordFormModalProps<T> = {
  /** Nombre de la sección, se usa en el título del modal (ej. "Clientes", "Órdenes de producción"). */
  title: string;
  /** Misma definición de columnas que usa la DataTable de la sección. */
  columns: Column<T>[];
  /** Texto del botón que abre el modal. Default: "+ Nuevo". */
  triggerLabel?: string;
  /** Se llama al confirmar el formulario con los valores ya tipados (number para campos numéricos). */
  onSubmit: (values: Record<string, string | number>) => void | Promise<void>;
};

export type EditRecordModalProps<T> = {
  /** Nombre de la sección, se usa en el título del modal. */
  title: string;
  /** Misma definición de columnas que usa la DataTable de la sección. */
  columns: Column<T>[];
  /** Fila a editar; el modal está abierto mientras no sea null. */
  row: T | null;
  onClose: () => void;
  /** Se llama al confirmar el formulario con los valores ya tipados. */
  onSubmit: (values: Record<string, string | number>) => void | Promise<void>;
};
