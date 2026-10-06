"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import type { EChartsOption } from "echarts";

/** Gráfico de ECharts que se ajusta solo al ancho de su tarjeta. */
export default function Grafico({ option, alto }: { option: EChartsOption; alto: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const instancia = echarts.init(ref.current, null, { renderer: "canvas" });
    chart.current = instancia;
    const observer = new ResizeObserver(() => instancia.resize());
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      instancia.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    chart.current?.setOption(option, { notMerge: true });
  }, [option]);

  // Ocupa al menos `alto` y, si la tarjeta es más alta (porque la de al lado
  // en la misma fila lo es), se estira hasta el final: sin hueco abajo.
  return <div ref={ref} className="es-llenar" style={{ width: "100%", minHeight: alto }} />;
}

/** Renderiza un gráfico fuera de pantalla y devuelve la imagen (para el PDF). */
export function graficoComoImagen(option: EChartsOption, anchoPx: number, altoPx: number): string {
  const div = document.createElement("div");
  div.style.cssText = `position:fixed;left:-10000px;top:0;width:${anchoPx}px;height:${altoPx}px;`;
  document.body.appendChild(div);
  const instancia = echarts.init(div, null, { renderer: "canvas", width: anchoPx, height: altoPx });
  instancia.setOption({ ...option, animation: false });
  // JPEG y no PNG: con PNG el PDF completo pesaba decenas de MB; así queda nítido y liviano.
  const uri = instancia.getDataURL({ type: "jpeg", pixelRatio: 2, backgroundColor: "#ffffff" });
  instancia.dispose();
  div.remove();
  return uri;
}
