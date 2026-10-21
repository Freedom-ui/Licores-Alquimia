type DocPaginable = {
  getNumberOfPages: () => number;
  setPage: (n: number) => unknown;
  setFontSize: (n: number) => unknown;
  setTextColor: (gris: number) => unknown;
  text: (texto: string, x: number, y: number, opciones?: { align?: "left" | "center" | "right" }) => unknown;
  internal: { pageSize: { getWidth: () => number; getHeight: () => number } };
};

/**
 * "Página i de total" abajo a la derecha de cada página. Se llama al final,
 * cuando el documento ya tiene todas sus páginas (justo antes de `save`).
 */
export function numerarPaginas(doc: DocPaginable, margenDerecho = 14) {
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(140);
    doc.text(`Página ${i} de ${total}`, ancho - margenDerecho, alto - 6, { align: "right" });
  }
}
