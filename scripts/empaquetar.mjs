// Arma el instalador de la app de escritorio.
//
//   npm run app:build                      → instalador para esta PC (dist/)
//   node scripts/empaquetar.mjs --mac --arch=x64
//   node scripts/empaquetar.mjs --publicar → además lo sube a GitHub Releases (borrador; necesita GH_TOKEN)
//
// Pasos:
// 1. `prisma generate` + `next build` en modo standalone (solo lo que usa el servidor).
// 2. Arma build/app/: servidor/ (standalone + estáticos + migraciones), node/
//    (el mismo Node con el que se compila, bajado de nodejs.org y verificado con su
//    SHA-256: la PC del cliente no necesita tener Node) y config.json (credenciales
//    de Google Drive, de GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET del entorno o del .env).
// 3. Si el destino es otro sistema o arquitectura, baja la librería de SQLite que
//    corresponde (better-sqlite3 precompilada para ese Node).
// 4. Compila escritorio/ (proceso de Electron) y corre electron-builder.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import "dotenv/config";

const raiz = process.cwd();
const args = process.argv.slice(2);
const plataforma = args.includes("--mac") ? "darwin" : args.includes("--win") ? "win32" : process.platform;
const arch = (args.find((a) => a.startsWith("--arch=")) ?? `--arch=${process.arch}`).slice(7);
const publicar = args.includes("--publicar");
const versionNode = process.versions.node;
const esWindows = process.platform === "win32";

const paso = (t) => console.log(`\n▶ ${t}`);
const correr = (cmd, argumentos, opciones = {}) =>
  execFileSync(cmd, argumentos, { stdio: "inherit", shell: esWindows, ...opciones, env: { ...process.env, ...opciones.env } });

if (!["win32", "darwin"].includes(plataforma) || !["x64", "arm64"].includes(arch)) {
  console.error(`Destino no soportado: ${plataforma} ${arch}`);
  process.exit(1);
}
console.log(`Empaquetando para ${plataforma} ${arch} con Node ${versionNode}${publicar ? " (publicar)" : ""}`);

// ── 1. Build de Next ─────────────────────────────────────────
paso("Build de producción (standalone)");
// El build usa una base vacía propia (con las tablas, sin datos): no depende de la dev.db de esta PC
// (en GitHub Actions no hay) y ningún dato puede quedar en lo que se compila.
const baseBuild = path.join(raiz, "build", "cache", "build.db");
mkdirSync(path.dirname(baseBuild), { recursive: true });
for (const sufijo of ["", "-journal", "-wal", "-shm"]) rmSync(`${baseBuild}${sufijo}`, { force: true });
const envBuild = { ALQUIMIA_BUILD_ESCRITORIO: "1", DATABASE_URL: `file:${baseBuild}`, NEXT_TELEMETRY_DISABLED: "1" };
correr("npx", ["prisma", "generate"], { env: envBuild });
correr("npx", ["prisma", "migrate", "deploy"], { env: envBuild });
correr("npx", ["next", "build"], { env: envBuild });

// ── 2. build/app ─────────────────────────────────────────────
paso("Armando build/app");
const destino = path.join(raiz, "build", "app");
const servidor = path.join(destino, "servidor");
rmSync(destino, { recursive: true, force: true });
mkdirSync(destino, { recursive: true });
cpSync(path.join(raiz, ".next", "standalone"), servidor, { recursive: true, verbatimSymlinks: true });

// Next deja en .next/node_modules enlaces (<paquete>-<hash>) a la carpeta node_modules de
// ESTA PC: en otra computadora no existen. Se reemplazan por la copia recortada del
// paquete que el mismo standalone trae en node_modules/.
const externos = path.join(servidor, ".next", "node_modules");
const entradas = (carpeta) =>
  readdirSync(carpeta).flatMap((n) => (n.startsWith("@") ? readdirSync(path.join(carpeta, n)).map((m) => `${n}/${m}`) : [n]));
for (const entrada of existsSync(externos) ? entradas(externos) : []) {
  const paquete = entrada.replace(/-[0-9a-f]{16}$/, "");
  const origen = path.join(servidor, "node_modules", paquete);
  if (!existsSync(origen)) throw new Error(`No está ${paquete} en el standalone (lo usa .next/node_modules/${entrada}).`);
  rmSync(path.join(externos, entrada), { recursive: true, force: true });
  cpSync(origen, path.join(externos, entrada), { recursive: true });
}
cpSync(path.join(raiz, ".next", "static"), path.join(servidor, ".next", "static"), { recursive: true });
if (existsSync(path.join(raiz, "public"))) cpSync(path.join(raiz, "public"), path.join(servidor, "public"), { recursive: true });
cpSync(path.join(raiz, "prisma", "migrations"), path.join(servidor, "migraciones"), { recursive: true });

// Nada de datos ni configuración de esta PC en el instalador (Next copia el .env al
// standalone y, por el análisis de rutas, algunas fuentes y copias de respaldos/).
const prohibidos = [];
for (const fuente of ["app", "lib", "prisma", "build"]) {
  const ruta = path.join(servidor, fuente);
  if (existsSync(ruta)) {
    rmSync(ruta, { recursive: true, force: true });
    prohibidos.push(ruta);
  }
}
(function limpiar(carpeta) {
  for (const e of readdirSync(carpeta, { withFileTypes: true })) {
    const ruta = path.join(carpeta, e.name);
    if (e.isDirectory()) {
      if (e.name === "respaldos" || e.name === ".datos") {
        rmSync(ruta, { recursive: true, force: true });
        prohibidos.push(ruta);
      } else limpiar(ruta);
    } else if (/^\.env/.test(e.name) || /\.(db|db-journal|db-wal|sqlite)$/i.test(e.name)) {
      rmSync(ruta, { force: true });
      prohibidos.push(ruta);
    }
  }
})(servidor);
if (prohibidos.length) console.log(`  Se sacaron del paquete: ${prohibidos.map((p) => path.relative(destino, p)).join(", ")}`);

// Prisma trae el compilador de consultas de cada base de datos (~60 MB): la app usa solo SQLite.
let motores = 0;
(function podar(carpeta) {
  for (const e of readdirSync(carpeta, { withFileTypes: true })) {
    const ruta = path.join(carpeta, e.name);
    if (e.isDirectory()) podar(ruta);
    else if (/^query_compiler_.*\.(cockroachdb|mysql|postgresql|sqlserver)\./.test(e.name)) {
      rmSync(ruta, { force: true });
      motores++;
    }
  }
})(servidor);
console.log(`  Motores de Prisma que no se usan: ${motores} archivos fuera`);

writeFileSync(
  path.join(destino, "config.json"),
  JSON.stringify({ googleClientId: process.env.GOOGLE_CLIENT_ID ?? "", googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "" }, null, 2)
);
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  console.warn("  ⚠ Sin GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET: esta versión no va a poder conectarse a Google Drive.");
}

// ── 3. Node y SQLite para el destino ────────────────────────
paso(`Node ${versionNode} para ${plataforma} ${arch}`);
const cache = path.join(raiz, "build", "cache");
mkdirSync(cache, { recursive: true });

async function bajar(url, archivo) {
  if (existsSync(archivo)) return readFileSync(archivo);
  console.log(`  Bajando ${url}`);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`No se pudo bajar ${url} (${r.status})`);
  const datos = Buffer.from(await r.arrayBuffer());
  writeFileSync(archivo, datos);
  return datos;
}

const nombreNode = plataforma === "win32" ? `node-v${versionNode}-win-${arch}.zip` : `node-v${versionNode}-darwin-${arch}.tar.gz`;
const base = `https://nodejs.org/dist/v${versionNode}`;
const sumas = (await bajar(`${base}/SHASUMS256.txt`, path.join(cache, `SHASUMS256-${versionNode}.txt`))).toString("utf8");
const esperado = sumas.split("\n").find((l) => l.trim().endsWith(` ${nombreNode}`))?.split(/\s+/)[0];
const paquete = await bajar(`${base}/${nombreNode}`, path.join(cache, nombreNode));
const real = createHash("sha256").update(paquete).digest("hex");
if (!esperado || esperado !== real) {
  rmSync(path.join(cache, nombreNode), { force: true });
  throw new Error(`El SHA-256 de ${nombreNode} no coincide con el publicado por nodejs.org.`);
}
const extraido = path.join(cache, nombreNode.replace(/\.(zip|tar\.gz)$/, ""));
// En Windows, el tar del sistema (bsdtar: abre .zip); el de Git Bash confunde "C:" con un servidor.
const tar = esWindows ? path.join(process.env.SystemRoot ?? "C:\Windows", "System32", "tar.exe") : "tar";
if (!existsSync(extraido)) correr(tar, ["-xf", nombreNode], { cwd: cache, shell: false });
mkdirSync(path.join(destino, "node"), { recursive: true });
if (plataforma === "win32") cpSync(path.join(extraido, "node.exe"), path.join(destino, "node", "node.exe"));
else cpSync(path.join(extraido, "bin", "node"), path.join(destino, "node", "node"));

if (plataforma !== process.platform || arch !== process.arch) {
  paso(`SQLite (better-sqlite3) para ${plataforma} ${arch}`);
  const modulo = path.join(servidor, "node_modules", "better-sqlite3");
  rmSync(path.join(modulo, "build"), { recursive: true, force: true });
  correr(path.join(raiz, "node_modules", ".bin", esWindows ? "prebuild-install.cmd" : "prebuild-install"), ["--runtime", "node", "--target", versionNode, "--platform", plataforma, "--arch", arch], {
    cwd: modulo,
  });
  // Y en la copia de .next/node_modules/better-sqlite3-<hash>.
  const binario = path.join(modulo, "build", "Release", "better_sqlite3.node");
  for (const d of existsSync(externos) ? readdirSync(externos) : []) {
    const copia = path.join(externos, d, "build", "Release", "better_sqlite3.node");
    if (d.startsWith("better-sqlite3") && existsSync(copia)) cpSync(binario, copia);
  }
}

// ── 4. Electron ──────────────────────────────────────────────
paso("Compilando la app de escritorio");
const pkg = JSON.parse(readFileSync(path.join(raiz, "package.json"), "utf8"));
const pkgEscritorio = path.join(raiz, "escritorio", "package.json");
const escritorio = JSON.parse(readFileSync(pkgEscritorio, "utf8"));
if (escritorio.version !== pkg.version) {
  escritorio.version = pkg.version;
  writeFileSync(pkgEscritorio, `${JSON.stringify(escritorio, null, 2)}\n`);
}
if (!existsSync(path.join(raiz, "escritorio", "node_modules"))) correr("npm", ["ci", "--no-audit", "--no-fund"], { cwd: path.join(raiz, "escritorio") });
rmSync(path.join(raiz, "escritorio", "dist"), { recursive: true, force: true });
correr("npx", ["tsc", "-p", "escritorio/tsconfig.json"]);

paso("Instalador (electron-builder)");
correr("npx", [
  "electron-builder",
  plataforma === "win32" ? "--win" : "--mac",
  `--${arch}`,
  "--publish",
  publicar ? "always" : "never",
  `-c.electronVersion=${pkg.devDependencies.electron}`,
]);
// Que el servidor tenga lo que necesita para arrancar fuera de la carpeta del proyecto.
if (plataforma === "win32") {
  const armado = path.join(raiz, "dist", "win-unpacked", "resources", "servidor");
  for (const necesario of ["server.js", path.join("node_modules", "next", "package.json"), path.join(".next", "BUILD_ID"), "migraciones"]) {
    if (!existsSync(path.join(armado, necesario))) throw new Error(`Al instalador le falta servidor/${necesario}.`);
  }
}
console.log("\n✓ Listo: el instalador está en dist/");
