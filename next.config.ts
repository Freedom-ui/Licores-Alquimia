import type { NextConfig } from "next";

// Entrar a la app desde otra dirección además de localhost (ej. el port
// forwarding de VS Code: https://<id>-3000.<región>.devtunnels.ms).
//
// Next rechaza el login y todo cambio de datos con "Invalid Server Actions
// request" si el origen del pedido no coincide con el host que le llega
// (protección contra CSRF). El túnel de VS Code manda el host real del túnel
// en `x-forwarded-host` pero reescribe el `Origin` a `localhost:<puerto>`, así
// que lo que hay que permitir es ese origen local (que es la propia app).
//
// Se activa con ORIGENES_PERMITIDOS en .env (separados por coma; se acepta la
// URL entera, con o sin https:// y barra final). Vacío = solo localhost, sin
// excepciones.
const origenesExtra = (process.env.ORIGENES_PERMITIDOS ?? "")
  .split(",")
  .map((o) => o.trim().replace(/^[a-z]+:\/\//i, "").replace(/\/.*$/, ""))
  .filter(Boolean);

const PUERTOS_LOCALES = Array.from({ length: 10 }, (_, i) => 3000 + i);
const origenesLocales = origenesExtra.length ? PUERTOS_LOCALES.flatMap((p) => [`localhost:${p}`, `127.0.0.1:${p}`]) : [];

const nextConfig: NextConfig = {
  // Recursos del servidor de desarrollo (recarga en caliente) desde esos orígenes.
  allowedDevOrigins: origenesExtra.map((o) => o.replace(/:\d+$/, "")),
  experimental: {
    serverActions: {
      // La importación de la planilla manda todos los registros extraídos de
      // una vez (el límite por defecto, 1 MB, no alcanza con años de datos).
      bodySizeLimit: "20mb",
      allowedOrigins: [...origenesExtra, ...origenesLocales],
    },
  },
};

export default nextConfig;
