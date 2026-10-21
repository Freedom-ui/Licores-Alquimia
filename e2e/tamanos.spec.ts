import { existsSync, mkdirSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";

// Recorre cada sección y los modales principales en los tamaños de pantalla
// horizontales de la Fase 7 (px CSS efectivos: pantalla × escalado/zoom, menos
// las barras del navegador y de tareas). Saca capturas a test-results/tamanos y
// marca lo que se puede detectar solo: scroll horizontal de la página,
// elementos que se salen de su tarjeta/modal/barra y modales que no entran.
// Las superposiciones dentro de los gráficos se revisan mirando las capturas.
//
//   npm run e2e:tamanos                       → todos los tamaños
//   E2E_TAMANOS=1366x640,911x380 npm run e2e:tamanos → solo esos

type Tamano = { ancho: number; alto: number; dpr?: number; nota: string };

const TAMANOS: Tamano[] = [
  { ancho: 911, alto: 380, nota: "1366×768 al 150 %" },
  { ancho: 1024, alto: 470, nota: "1280×720 al 125 %" },
  { ancho: 1024, alto: 640, nota: "1024×768" },
  { ancho: 1093, alto: 485, dpr: 1.25, nota: "1366×768 al 125 %" },
  { ancho: 1152, alto: 590, dpr: 1.25, nota: "1440×900 al 125 %" },
  { ancho: 1280, alto: 590, dpr: 1.5, nota: "1280×720 / 1920×1080 al 150 %" },
  { ancho: 1280, alto: 670, nota: "1280×800" },
  { ancho: 1366, alto: 640, nota: "1366×768" },
  { ancho: 1440, alto: 770, dpr: 2, nota: "1440×900 / MacBook Air" },
  { ancho: 1470, alto: 866, dpr: 2, nota: "MacBook Air 15 (1470×956)" },
  { ancho: 1512, alto: 892, dpr: 2, nota: "MacBook Pro 14 (1512×982)" },
  { ancho: 1536, alto: 735, dpr: 1.25, nota: "1536×864 / 1920×1080 al 125 %" },
  { ancho: 1600, alto: 770, nota: "1600×900" },
  { ancho: 1728, alto: 1027, dpr: 2, nota: "MacBook Pro 16 (1728×1117)" },
  { ancho: 1920, alto: 950, nota: "1920×1080" },
  { ancho: 2048, alto: 1020, dpr: 1.25, nota: "2560×1440 al 125 %" },
  { ancho: 2400, alto: 1190, nota: "1920×1080 con zoom 80 %" },
  { ancho: 2560, alto: 1310, nota: "2560×1440" },
  { ancho: 3440, alto: 1310, nota: "ultrawide 3440×1440" },
];

const PLANILLA = [process.env.E2E_PLANILLA, `${process.env.USERPROFILE ?? process.env.HOME}/Downloads/planilla-claude.xlsx`].find(
  (r) => r && existsSync(r)
);

type Vista = {
  nombre: string;
  url: string;
  /** Abre algo después de cargar la página. */
  abrir?: (page: Page) => Promise<void>;
  /** La vista es un modal abierto. */
  modal?: boolean;
};

const nuevo = (page: Page) => page.locator(".rf-trigger-btn").first().click();
const editar = (page: Page) => page.getByRole("button", { name: "Editar" }).first().click();
const guardar = (page: Page) => page.locator(".rf-modal").getByRole("button", { name: /^Guardar/ }).click();

/** Hoy en dd/mm/aaaa sin barras, como se escribe en CampoFecha. */
function hoySinBarras() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}${String(d.getMonth() + 1).padStart(2, "0")}${d.getFullYear()}`;
}

/** Venta por más botellas de las que hay: queda el aviso de «Guardar igual». */
async function ventaSinStock(page: Page) {
  await page.locator("#op-fecha").pressSequentially(hoySinBarras());
  for (const id of ["#op-clienteId", "#op-vendedor", "#op-productoId", "#op-canal", "#op-condicion"]) {
    await page.locator(id).selectOption({ index: 1 });
  }
  await page.locator("#op-cantidad").fill("99999");
  await page.locator("#op-pu").fill("10000");
  await guardar(page);
  await page.getByRole("button", { name: "Guardar igual" }).waitFor();
}

/** Cambia el período de Estadísticas ("todo" = personalizado desde el 01/01/2024). */
async function periodo(page: Page, valor: string) {
  const select = page.getByLabel("Período");
  if (valor === "todo") {
    await select.selectOption("personalizado");
    const desde = page.getByLabel("Desde");
    await desde.fill("");
    await desde.pressSequentially("01012024");
  } else if (valor === "sinComparar") {
    await page.getByLabel("Comparación").selectOption("ninguna");
  } else {
    await select.selectOption(valor);
  }
  await page.waitForTimeout(1200);
}

const VISTAS: Vista[] = [
  { nombre: "panel", url: "/" },
  { nombre: "clientes", url: "/clientes" },
  { nombre: "clientes-alta", url: "/clientes", abrir: nuevo, modal: true },
  { nombre: "clientes-edicion", url: "/clientes", abrir: (p) => p.getByRole("button", { name: "Editar" }).first().click(), modal: true },
  { nombre: "proveedores", url: "/proveedores" },
  { nombre: "materia-prima", url: "/materia-prima" },
  { nombre: "productos", url: "/productos" },
  { nombre: "operaciones", url: "/operaciones" },
  { nombre: "operaciones-alta", url: "/operaciones?nuevo=1", modal: true },
  { nombre: "ordenes", url: "/ordenes-produccion" },
  { nombre: "ordenes-alta", url: "/ordenes-produccion?nuevo=1", modal: true },
  { nombre: "productos-terminados", url: "/productos-terminados" },
  {
    nombre: "productos-terminados-abierto",
    url: "/productos-terminados",
    abrir: (p) => p.locator(".pt-card-toggle").first().click(),
  },
  { nombre: "productos-terminados-movimiento", url: "/productos-terminados", abrir: (p) => p.locator(".pt-card-add-btn").first().click(), modal: true },
  { nombre: "inventario", url: "/inventario-materia-prima" },
  { nombre: "inventario-alta", url: "/inventario-materia-prima", abrir: nuevo, modal: true },
  { nombre: "trazabilidad", url: "/trazabilidad" },
  { nombre: "trazabilidad-compra", url: "/trazabilidad?nuevo=1", modal: true },
  { nombre: "trazabilidad-ficha", url: "/trazabilidad", abrir: (p) => p.locator(".tz-secondary-btn").first().click(), modal: true },
  ...["resumen", "ventas", "produccion", "stock", "compras", "rentabilidad"].map((s) => ({
    nombre: `estadisticas-${s}`,
    url: `/estadisticas?seccion=${s}`,
  })),
  { nombre: "importar", url: "/importar" },

  // Más modales y estados (en todas las secciones).
  { nombre: "clientes-errores", url: "/clientes", abrir: async (p) => (await nuevo(p), await guardar(p)), modal: true },
  { nombre: "clientes-borrar", url: "/clientes", abrir: (p) => p.getByRole("button", { name: "Eliminar" }).first().click(), modal: true },
  { nombre: "proveedores-alta", url: "/proveedores", abrir: nuevo, modal: true },
  { nombre: "proveedores-edicion", url: "/proveedores", abrir: editar, modal: true },
  { nombre: "materia-prima-edicion", url: "/materia-prima", abrir: editar, modal: true },
  { nombre: "productos-alta", url: "/productos", abrir: nuevo, modal: true },
  { nombre: "productos-edicion", url: "/productos", abrir: editar, modal: true },
  { nombre: "operaciones-edicion", url: "/operaciones", abrir: editar, modal: true },
  { nombre: "operaciones-guardar-igual", url: "/operaciones?nuevo=1", abrir: ventaSinStock, modal: true },
  { nombre: "operaciones-errores", url: "/operaciones?nuevo=1", abrir: guardar, modal: true },
  { nombre: "ordenes-edicion", url: "/ordenes-produccion", abrir: editar, modal: true },
  { nombre: "ordenes-errores", url: "/ordenes-produccion?nuevo=1", abrir: guardar, modal: true },
  { nombre: "productos-terminados-edicion", url: "/productos-terminados", abrir: (p) => p.getByRole("button", { name: "Editar lote" }).first().click(), modal: true },
  { nombre: "inventario-abierto", url: "/inventario-materia-prima", abrir: (p) => p.locator(".pt-card-toggle").first().click() },
  { nombre: "inventario-movimiento", url: "/inventario-materia-prima", abrir: (p) => p.locator(".pt-card-add-btn").first().click(), modal: true },
  { nombre: "inventario-edicion", url: "/inventario-materia-prima", abrir: editar, modal: true },
  { nombre: "trazabilidad-edicion", url: "/trazabilidad", abrir: editar, modal: true },
  { nombre: "trazabilidad-errores", url: "/trazabilidad?nuevo=1", abrir: guardar, modal: true },
  { nombre: "trazabilidad-rastreo", url: "/trazabilidad", abrir: (p) => p.getByRole("button", { name: "Rastrear lote" }).first().click(), modal: true },
  { nombre: "cerrar-sesion", url: "/", abrir: (p) => p.locator(".logout-btn").click(), modal: true },

  // Estadísticas con otros períodos (más barras, meses, años) y sin comparación.
  ...["resumen", "ventas", "produccion", "stock", "compras", "rentabilidad"].flatMap((s) =>
    ["anio", "anioAnterior", "30d", "todo", "sinComparar"].map((per) => ({
      nombre: `estadisticas-${s}-${per}`,
      url: `/estadisticas?seccion=${s}`,
      abrir: (p: Page) => periodo(p, per),
    }))
  ),

  // Importar con una planilla cargada (paso «Revisar»). Necesita E2E_PLANILLA o la de prueba en Descargas.
  ...(PLANILLA
    ? [
        {
          nombre: "importar-revision",
          url: "/importar",
          abrir: async (p: Page) => {
            await p.locator('input[type="file"]').setInputFiles(PLANILLA);
            await p.locator(".im-tarjetas").waitFor({ timeout: 60_000 });
            await p.waitForTimeout(500);
          },
        },
      ]
    : []),
];

const filtro = process.env.E2E_TAMANOS?.split(",").map((t) => t.trim());
const tamanos = filtro ? TAMANOS.filter((t) => filtro.includes(`${t.ancho}x${t.alto}`)) : TAMANOS;
const filtroVistas = process.env.E2E_VISTAS?.split(",").map((t) => t.trim());
const vistas = filtroVistas ? VISTAS.filter((v) => filtroVistas.some((f) => v.nombre.startsWith(f))) : VISTAS;

/** Problemas de layout detectables desde el DOM (corre en el navegador). */
function revisarLayout(): string[] {
  const problemas: string[] = [];
  const describir = (el: Element) => {
    const clase = typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).join(".") : "";
    const texto = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
    return `${el.tagName.toLowerCase()}${clase}${texto ? ` «${texto}»` : ""}`;
  };

  const doc = document.scrollingElement!;
  if (doc.scrollWidth > doc.clientWidth + 1) problemas.push(`la página tiene scroll horizontal (${doc.scrollWidth} > ${doc.clientWidth})`);
  for (const sel of [".main", ".content"]) {
    const el = document.querySelector(sel);
    if (el && el.scrollWidth > el.clientWidth + 1) problemas.push(`${sel} tiene scroll horizontal (${el.scrollWidth} > ${el.clientWidth})`);
  }

  // Elementos que se salen de su contenedor (sin contar lo que está dentro de
  // algo con scroll o recortado a propósito, como las tablas).
  const contenedores = document.querySelectorAll(
    ".topbar, .dt-toolbar, .es-toolbar, .es-bloque, .pp-encabezado, .rf-modal, .pt-card-header, .im-wrapper > *, .sidebar",
  );
  for (const cont of contenedores) {
    const rc = cont.getBoundingClientRect();
    if (rc.width === 0) continue;
    let reportados = 0;
    const walker = document.createTreeWalker(cont, NodeFilter.SHOW_ELEMENT, {
      acceptNode(n) {
        // Lo fijo (modales, menús) no pertenece al contenedor donde está en el DOM.
        const cs = getComputedStyle(n as Element);
        const fuera = cs.display === "none" || cs.visibility === "hidden" || cs.position === "fixed";
        return fuera ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      },
    });
    // Lo que recorta o scrollea se revisa él mismo, su contenido no.
    const recortados = new Set<Element>();
    for (let n = walker.nextNode(); n && reportados < 3; n = walker.nextNode()) {
      const el = n as Element;
      if ([...recortados].some((r) => r.contains(el))) continue;
      const cs = getComputedStyle(el);
      if (cs.overflowX !== "visible" || el.tagName === "svg" || el.tagName === "CANVAS") recortados.add(el);
      if (cs.position === "absolute") continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > rc.right + 1 || r.left < rc.left - 1) {
        problemas.push(`${describir(el)} se sale de ${describir(cont).slice(0, 60)} (${Math.round(r.left)}–${Math.round(r.right)} vs ${Math.round(rc.left)}–${Math.round(rc.right)})`);
        reportados++;
      }
    }
  }

  // Texto cortado sin forma de leerlo entero (sin title ni tooltip).
  for (const el of document.querySelectorAll(".content *, .rf-modal *, .sidebar *")) {
    const cs = getComputedStyle(el);
    if (cs.textOverflow !== "ellipsis" || el.scrollWidth <= el.clientWidth + 1) continue;
    if (el.closest("[title]") || el.closest("[data-tooltip]")) continue;
    problemas.push(`texto cortado sin tooltip: ${describir(el)}`);
    if (problemas.length > 40) break;
  }

  // Modales: tienen que entrar en la pantalla (el cuerpo puede scrollear).
  for (const m of document.querySelectorAll(".rf-modal")) {
    const r = m.getBoundingClientRect();
    if (r.top < -1 || r.bottom > innerHeight + 1 || r.left < -1 || r.right > innerWidth + 1) {
      problemas.push(`el modal no entra en la pantalla (${Math.round(r.top)}–${Math.round(r.bottom)} de ${innerHeight})`);
    }
    // Título y botones de guardar/cancelar a la vista sin tener que scrollear.
    for (const sel of [".rf-modal-header", ".rf-actions-row"]) {
      const el = m.querySelector(sel);
      if (!el) continue;
      const e = el.getBoundingClientRect();
      if (e.top < r.top - 1 || e.bottom > r.bottom + 1) problemas.push(`${sel} del modal queda fuera de la vista`);
    }
  }

  // Todas las secciones de la sidebar a la vista sin scrollearla (desde 470 px
  // de alto: más bajo, 1366 al 150 %, se acepta el scroll).
  const nav = document.querySelector(".sidebar-nav");
  if (nav && innerHeight >= 470 && nav.scrollHeight > nav.clientHeight + 1) {
    problemas.push(`la sidebar necesita scroll para ver todas las secciones (${nav.scrollHeight} > ${nav.clientHeight})`);
  }

  // La sidebar no puede tapar el contenido (salvo desplegada encima a propósito).
  const sb = document.querySelector(".sidebar");
  const main = document.querySelector(".main");
  if (sb && main && !sb.matches(".sidebar-desplegada")) {
    const a = sb.getBoundingClientRect();
    const b = main.getBoundingClientRect();
    if (a.right > b.left + 1) problemas.push(`la sidebar tapa el contenido (${Math.round(a.right)} > ${Math.round(b.left)})`);
  }
  return problemas;
}

async function esperarVista(page: Page) {
  await expect(page.locator(".topbar-title")).toBeVisible();
  await expect(page.getByText("Cargando…")).toHaveCount(0);
  // Gráficos: ECharts anima la entrada (~1 s).
  if (await page.locator(".content canvas").count()) await page.waitForTimeout(1200);
  await page.waitForTimeout(250);
}

/** Captura del contenido entero (lo que queda abajo con scroll). */
async function capturaCompleta(page: Page, ruta: string) {
  await page.addStyleTag({
    content:
      ".app-shell{height:auto!important;min-height:100vh} .main,.content{overflow:visible!important}" +
      " .dt-table-scroll{max-height:900px}",
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: ruta, fullPage: true });
}

test.describe.configure({ mode: "parallel", timeout: 120_000 });

for (const t of tamanos) {
  test.describe(`${t.ancho}x${t.alto} (${t.nota})`, () => {
    test.use({ viewport: { width: t.ancho, height: t.alto }, deviceScaleFactor: t.dpr ?? 1 });

    for (const v of vistas) {
      test(v.nombre, async ({ page }) => {
        const errores: string[] = [];
        page.on("pageerror", (e) => errores.push(e.message));
        const motor = test.info().project.name.replace(/^tamanos-?/, "");
        const dir = `test-results/tamanos${motor ? `-${motor}` : ""}/${v.nombre}`;
        mkdirSync(dir, { recursive: true });

        await page.goto(v.url);
        await esperarVista(page);
        if (v.abrir) {
          await v.abrir(page);
          await page.waitForTimeout(400);
        }
        if (v.modal) await expect(page.locator(".rf-modal")).toBeVisible();

        const archivo = `${t.ancho}x${t.alto}`;
        await page.screenshot({ path: `${dir}/${archivo}.png` });
        const problemas = await page.evaluate(revisarLayout);
        if (!v.modal) await capturaCompleta(page, `${dir}/${archivo}-completa.png`);

        expect.soft(errores, "errores de JavaScript").toEqual([]);
        expect(problemas, `problemas de layout en ${v.nombre} a ${archivo}`).toEqual([]);
      });
    }
  });
}
