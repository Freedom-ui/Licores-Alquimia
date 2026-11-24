// Corre todas las pruebas y arma el resumen para presentar (reportes/RESUMEN.md).
//
//   npm run test:todo                  → unitarias + integración (con cobertura), build,
//                                        API, funcionales, defectos y humo en Chromium
//   npm run test:todo -- --navegadores → además, las pruebas de humo en Firefox y WebKit
//
// Cada paso corre aunque el anterior falle (los defectos abiertos fallan a
// propósito); el resumen dice qué pasó en cada uno. Reportes:
//   reportes/vitest/index.html      → resultado de cada test de Vitest
//   reportes/cobertura/index.html   → cobertura por archivo
//   playwright-report/index.html    → resultado de cada prueba de Playwright (con trazas de las que fallan)
//   reportes/RESUMEN.md             → totales, fallos y módulos con poca cobertura

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const navegadores = process.argv.includes("--navegadores");
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function correr(titulo, args) {
  console.log(`\n▶ ${titulo}\n  ${["npx", ...args].join(" ")}\n`);
  const inicio = Date.now();
  const r = spawnSync(npx, args, { stdio: "inherit", shell: process.platform === "win32" });
  return { titulo, codigo: r.status ?? 1, segundos: Math.round((Date.now() - inicio) / 1000) };
}

mkdirSync("reportes/vitest", { recursive: true });
const pasos = [];
pasos.push(
  correr("Vitest: unitarias + integración, con cobertura", [
    "vitest", "run", "--coverage",
    "--reporter=default", "--reporter=json", "--reporter=html", "--reporter=junit",
    "--outputFile.json=reportes/vitest/resultados.json",
    "--outputFile.html=reportes/vitest/index.html",
    "--outputFile.junit=reportes/vitest/junit.xml",
  ])
);
const build = correr("Build de producción (para las pruebas en el navegador y de API)", ["next", "build"]);
pasos.push(build);
if (build.codigo === 0) {
  const proyectos = ["api", "funcional", "defectos", "chromium", ...(navegadores ? ["firefox", "webkit"] : [])];
  pasos.push(correr("Playwright: " + proyectos.join(", "), ["playwright", "test", ...proyectos.flatMap((p) => ["--project", p])]));
}

// ── Resumen ────────────────────────────────────────────────────────────────

const leer = (archivo) => (existsSync(archivo) ? JSON.parse(readFileSync(archivo, "utf8")) : null);
const lineas = [];
const L = (s = "") => lineas.push(s);

L("# Resumen de pruebas");
L();
L("Generado por `npm run test:todo`. Detalle de cada prueba en los reportes HTML (ver abajo).");
L();

const grupos = new Map(); // nombre → { pasan, fallan, omitidas, fallos: [] }
const grupo = (n) => grupos.get(n) ?? grupos.set(n, { pasan: 0, fallan: 0, omitidas: 0, sinNavegador: 0, fallos: [] }).get(n);

const vitest = leer("reportes/vitest/resultados.json");
if (vitest) {
  for (const archivo of vitest.testResults) {
    const rel = path.relative(process.cwd(), archivo.name).replace(/\\/g, "/");
    const g = grupo(rel.startsWith("pruebas/integracion/") ? "Integración (Vitest + SQLite)" : "Unitarias (Vitest)");
    for (const t of archivo.assertionResults) {
      if (t.status === "passed") g.pasan++;
      else if (t.status === "failed") {
        g.fallan++;
        g.fallos.push(`${rel} › ${t.fullName}`);
      } else g.omitidas++;
    }
  }
}

const NOMBRES = { api: "API por HTTP (Playwright)", funcional: "Funcionales (Playwright)", defectos: "Defectos abiertos (Playwright)", login: "Ingreso de las pruebas (Playwright)" };
const playwright = leer("reportes/playwright/resultados.json");
if (playwright) {
  const recorrer = (suite, camino) => {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests) {
        const g = grupo(NOMBRES[t.projectName] ?? `Humo en ${t.projectName} (Playwright)`);
        const error = t.results.map((x) => x.error?.message ?? "").join(" ");
        if (t.status === "expected" || t.status === "flaky") g.pasan++;
        else if (t.status === "skipped") g.omitidas++;
        else if (error.includes("browserType.launch")) g.sinNavegador++;
        else {
          g.fallan++;
          g.fallos.push(`${[...camino, spec.title].filter(Boolean).join(" › ")}`);
        }
      }
    }
    for (const s of suite.suites ?? []) recorrer(s, [...camino, s.title]);
  };
  for (const s of playwright.suites) recorrer(s, []);
}

let totalPasan = 0;
let totalFallan = 0;
L("## Totales por tipo de prueba");
L();
L("| Tipo | Pasan | Fallan | Omitidas |");
L("| --- | ---: | ---: | ---: |");
const sinNavegador = [];
for (const [nombre, g] of grupos) {
  if (g.sinNavegador && !g.pasan && !g.fallan) {
    sinNavegador.push(`${nombre}: ${g.sinNavegador} pruebas`);
    continue;
  }
  totalPasan += g.pasan;
  totalFallan += g.fallan;
  L(`| ${nombre} | ${g.pasan} | ${g.fallan} | ${g.omitidas} |`);
}
L(`| **Total** | **${totalPasan}** | **${totalFallan}** | |`);
L();
if (sinNavegador.length) {
  L(`> **No se ejecutaron** porque el navegador no se pudo abrir en este equipo (error al lanzarlo, antes de llegar a la app): ${sinNavegador.join("; ")}. No cuentan ni como aprobadas ni como fallidas.`);
  L();
}

L("## Pruebas que fallaron");
L();
const fallos = [...grupos].filter(([, g]) => g.fallos.length);
if (!fallos.length) L("Ninguna.");
for (const [nombre, g] of fallos) {
  L(`**${nombre}**`);
  L();
  for (const f of g.fallos) L(`- ${f}`);
  L();
}
if (grupos.get(NOMBRES.defectos)?.fallan) {
  L("> Las pruebas de **Defectos abiertos** describen el comportamiento esperado donde hoy hay un defecto: fallan mientras el defecto siga. Detalle en `docs/testing/defectos.md`.");
  L();
}

const cobertura = leer("reportes/cobertura/coverage-summary.json");
if (cobertura) {
  const t = cobertura.total;
  L("## Cobertura de código (Vitest, lógica en .ts)");
  L();
  L(`| Líneas | Sentencias | Ramas | Funciones |`);
  L(`| ---: | ---: | ---: | ---: |`);
  L(`| ${t.lines.pct} % | ${t.statements.pct} % | ${t.branches.pct} % | ${t.functions.pct} % |`);
  L();
  const bajos = Object.entries(cobertura)
    .filter(([k, v]) => k !== "total" && v.lines.total > 0 && v.lines.pct < 50) // sin líneas = solo tipos
    .map(([k, v]) => [path.relative(process.cwd(), k).replace(/\\/g, "/"), v.lines.pct])
    .sort((a, b) => a[1] - b[1]);
  L("### Módulos con menos del 50 % de líneas cubiertas");
  L();
  if (!bajos.length) L("Ninguno.");
  else {
    L("| Archivo | Líneas |");
    L("| --- | ---: |");
    for (const [archivo, pct] of bajos) L(`| \`${archivo}\` | ${pct} % |`);
  }
  L();
  L("Las pantallas (.tsx) no se miden acá: se prueban en el navegador con Playwright. Motivo de cada módulo bajo: `docs/testing/reportes.md`.");
  L();
}

L("## Pasos");
L();
L("| Paso | Resultado | Duración |");
L("| --- | --- | ---: |");
for (const p of pasos) L(`| ${p.titulo} | ${p.codigo === 0 ? "sin fallos" : "con fallos"} | ${p.segundos} s |`);
L();
L("## Reportes");
L();
L("- `reportes/vitest/index.html` — cada test de Vitest (abrir con `npx vite preview --outDir reportes/vitest` o el visor de Vitest).");
L("- `reportes/cobertura/index.html` — cobertura por carpeta y archivo, con las líneas sin cubrir marcadas.");
L("- `playwright-report/index.html` — cada prueba de Playwright, con la traza (capturas paso a paso) de las que fallaron (`npx playwright show-report`).");
L("- `reportes/vitest/junit.xml` — formato JUnit, para integración continua.");

writeFileSync("reportes/RESUMEN.md", lineas.join("\n") + "\n");
console.log("\n" + lineas.join("\n"));
console.log("\nResumen guardado en reportes/RESUMEN.md");
process.exitCode = totalFallan > 0 ? 1 : 0;
