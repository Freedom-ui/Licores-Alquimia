import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Dos grupos de pruebas en Node (las del navegador y las de la API por HTTP
// están en e2e/, con Playwright):
//
//   unit         → lógica pura (validadores, reglas, cálculos). Sin base ni red.
//                  Cada archivo *.test.ts vive al lado del código que prueba.
//   integracion  → server actions + repositorio + base SQLite real, cada archivo
//                  con su propia base temporal (pruebas/integracion/entorno.ts).
//                  Nunca tocan dev.db.
//
//   npm test                    → los dos grupos
//   npm run test:unit           → solo unitarias
//   npm run test:integracion    → solo integración
//   npm run test:cobertura      → los dos, con cobertura (reportes/cobertura/index.html)
//   npm run test:reporte        → los dos, con reporte HTML y cobertura (reportes/vitest/index.html)
const alias = { "@": fileURLToPath(new URL(".", import.meta.url)) };

export default defineConfig({
  resolve: { alias },
  test: {
    environment: "node",
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["app/**/*.test.ts", "lib/**/*.test.ts"],
          // Con la cobertura encendida, generar años de datos (generador.test.ts) pasa los 5 s por defecto.
          testTimeout: 15_000,
          exclude: ["node_modules/**", ".next/**", "e2e/**", "pruebas/**"],
        },
      },
      {
        extends: true,
        test: {
          name: "integracion",
          include: ["pruebas/integracion/**/*.test.ts"],
          setupFiles: ["pruebas/integracion/entorno.ts"],
          // bcrypt y la base real: más lentas que las unitarias.
          testTimeout: 20_000,
          hookTimeout: 30_000,
        },
      },
    ],
    coverage: {
      provider: "v8",
      // El reporte se escribe aunque alguna prueba falle (para ver la cobertura igual).
      reportOnFailure: true,
      reportsDirectory: "reportes/cobertura",
      reporter: ["text-summary", "text", "html", "json-summary"],
      // La lógica (servidor, dominio, validaciones). Las pantallas (.tsx) se
      // prueban en el navegador con Playwright, que no mide cobertura de líneas.
      include: ["app/**/*.ts", "lib/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        "app/generated/**",
        "pruebas/**",
        // Generadores de PDF y gráficos: corren en el navegador (jsPDF, ECharts).
        "**/export*Pdf.ts",
        "app/components/data-table/pdf*.ts",
      ],
    },
  },
});
