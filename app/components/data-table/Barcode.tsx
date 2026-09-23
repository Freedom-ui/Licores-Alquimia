"use client";

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

type BarcodeProps = {
  value: string;
};

export default function Barcode({ value }: BarcodeProps) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (ref.current && value) {
      JsBarcode(ref.current, value, {
        format: "CODE39",
        width: 1.2,
        height: 28,
        displayValue: true,
        fontSize: 10,
        margin: 2,
      });
    }
  }, [value]);

  if (!value) return null;

  return <svg ref={ref} />;
}