import { defineConfig, devices } from "@playwright/test";

// Pruebas en el navegador (Fase 7). Corren contra un build de producción en
// el puerto 3005 sobre una copia de dev.db (ver e2e/preparar-base.mjs).
//
//   npm run e2e           → suite de humo en Chromium, Firefox y WebKit
//   npm run e2e:tamanos   → recorrido de pantallas en todos los tamaños (Chromium)
//                           + 1366×640 y 1920×950 en Firefox y WebKit
//   E2E_MARCAS=1          → suma Edge y Chrome instalados en la PC
//
// Antes hace falta un build (`npx next build`); los scripts de npm lo hacen.
const PUERTO = 3005;
const SESION = "e2e/.auth/sesion.json";
const marcas = process.env.E2E_MARCAS === "1";

export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results/salida",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 3,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: `http://localhost:${PUERTO}`,
    locale: "es-AR",
    timezoneId: "America/Argentina/Buenos_Aires",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `node e2e/preparar-base.mjs && npx next start -p ${PUERTO}`,
    url: `http://localhost:${PUERTO}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: "file:./e2e/.datos/e2e.db",
      // Los recorridos largos no tocan el mouse: que no se cierre la sesión.
      SESION_INACTIVIDAD_MIN: "240",
    },
  },
  projects: [
    { name: "login", testMatch: /auth\.setup\.ts/ },
    ...[
      { name: "chromium", use: devices["Desktop Chrome"] },
      { name: "firefox", use: devices["Desktop Firefox"] },
      { name: "webkit", use: devices["Desktop Safari"] },
      ...(marcas
        ? [
            { name: "edge", use: { ...devices["Desktop Edge"], channel: "msedge" } },
            { name: "chrome", use: { ...devices["Desktop Chrome"], channel: "chrome" } },
          ]
        : []),
    ].map((p) => ({
      ...p,
      testMatch: /humo\.spec\.ts/,
      dependencies: ["login"],
      use: { ...p.use, storageState: SESION, viewport: { width: 1366, height: 640 } },
    })),
    {
      name: "tamanos",
      testMatch: /tamanos\.spec\.ts/,
      dependencies: ["login"],
      use: { ...devices["Desktop Chrome"], storageState: SESION },
    },
    // Los otros motores, en los dos tamaños de referencia.
    ...[
      { name: "tamanos-firefox", use: devices["Desktop Firefox"] },
      { name: "tamanos-webkit", use: devices["Desktop Safari"] },
    ].map((p) => ({
      ...p,
      testMatch: /tamanos\.spec\.ts/,
      grep: /(1366x640|1920x950) /,
      dependencies: ["login"],
      use: { ...p.use, storageState: SESION },
    })),
  ],
});
