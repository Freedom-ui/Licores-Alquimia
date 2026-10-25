import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Salidas de Playwright (reporte HTML y capturas).
    "playwright-report/**",
    "test-results/**",
    // App de escritorio: compilado e instaladores.
    "escritorio/dist/**",
    "escritorio/node_modules/**",
    "dist/**",
  ]),
]);

export default eslintConfig;
