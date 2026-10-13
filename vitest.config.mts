import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Tests de la lógica pura (validadores, reglas y acciones del dominio): corren
// en Node, sin navegador ni base de datos. `npm test`.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
  },
});
