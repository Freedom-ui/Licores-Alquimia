"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import type { EChartsOption } from "echarts";
import { ajustarAlAncho } from "./graficos";

/** Cada cuántos px de cambio de tamaño se vuelve a ajustar la opción (etiquetas, leyenda). */
const PASO_AJUSTE = 24;
const pasoDe = (i: echarts.ECharts) => `${Math.round(i.getWidth() / PASO_AJUSTE)}x${Math.round(i.getHeight() / PASO_AJUSTE)}`;

/** Gráfico de ECharts que se ajusta solo al ancho de su tarjeta. */
export default function Grafico({ option, alto }: { option: EChartsOption; alto: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const opcion = useRef(option);
  const paso = useRef("");

  // Arma la opción para el tamaño actual. Al cambiar de tamaño solo se rehace
  // si cambió de "paso", y sin la animación de entrada.
  function aplicar(animar: boolean) {
    const instancia = chart.current;
    if (!instancia) return;
    paso.current = pasoDe(instancia);
    const o = ajustarAlAncho(opcion.current, instancia.getWidth(), instancia.getHeight());
    instancia.setOption(animar ? o : { ...o, animation: false }, { notMerge: true });
  }

  useEffect(() => {
    if (!ref.current) return;
    const instancia = echarts.init(ref.current, null, { renderer: "canvas" });
    chart.current = instancia;
    const observer = new ResizeObserver(() => {
      instancia.resize();
      if (pasoDe(instancia) !== paso.current) aplicar(false);
    });
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      instancia.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    opcion.current = option;
    aplicar(true);
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
  instancia.setOption({ ...ajustarAlAncho(option, anchoPx, altoPx), animation: false });
  // JPEG y no PNG: con PNG el PDF completo pesaba decenas de MB; así queda nítido y liviano.
  const uri = instancia.getDataURL({ type: "jpeg", pixelRatio: 2, backgroundColor: "#ffffff" });
  instancia.dispose();
  div.remove();
  return uri;
}
