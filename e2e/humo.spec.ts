import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { credenciales } from "./credenciales";

// Suite de humo en cada motor (Chromium, Firefox, WebKit y, con E2E_MARCAS=1,
// Edge y Chrome): login, cada sección, un alta/edición/baja, una venta, una
// orden macerando, los campos de fecha y número, PDFs, gráficos y que nada se
// pida a internet. Corre sobre la copia de la base (e2e/preparar-base.mjs).

const SECCIONES: [string, string][] = [
  ["/", "Panel principal"],
  ["/trazabilidad", "Trazabilidad"],
  ["/operaciones", "Operaciones"],
  ["/productos-terminados", "Productos terminados"],
  ["/ordenes-produccion", "Órdenes de producción"],
  ["/inventario-materia-prima", "Inventario de materia prima"],
  ["/materia-prima", "Materia prima"],
  ["/productos", "Productos"],
  ["/proveedores", "Proveedores"],
  ["/clientes", "Clientes"],
  ["/estadisticas", "Estadísticas"],
  ["/importar", "Importar planilla"],
  ["/configuracion", "Configuración"],
];

/** Hoy en dd/mm/aaaa, como se escribe en CampoFecha. */
function hoy() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/** Bloquea todo pedido que no vaya a localhost y junta errores de la página. */
function vigilar(page: Page) {
  const externos: string[] = [];
  const errores: string[] = [];
  page.route(/^(?!https?:\/\/(localhost|127\.0\.0\.1)[:/]).+/, (route) => {
    const url = route.request().url();
    if (url.startsWith("data:") || url.startsWith("blob:")) return route.continue();
    externos.push(url);
    return route.abort();
  });
  page.on("pageerror", (e) => errores.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errores.push(m.text());
  });
  return { externos, errores };
}

async function irA(page: Page, url: string, titulo: string) {
  await page.goto(url);
  await expect(page.locator(".topbar-title")).toHaveText(titulo);
  await expect(page.getByText("Cargando…")).toHaveCount(0);
}

/**
 * Descarga lo que dispara `accion`, verifica que sea un PDF de verdad y deja
 * una copia en test-results/pdf/<navegador>/ para revisarlo a ojo.
 */
async function descargaPdf(page: Page, accion: () => Promise<void>): Promise<Buffer> {
  const [descarga] = await Promise.all([page.waitForEvent("download"), accion()]);
  expect(descarga.suggestedFilename()).toMatch(/\.pdf$/);
  const ruta = await descarga.path();
  const contenido = readFileSync(ruta);
  expect(contenido.length).toBeGreaterThan(1000);
  expect(contenido.subarray(0, 5).toString()).toBe("%PDF-");
  const dir = `test-results/pdf/${test.info().project.name}`;
  mkdirSync(dir, { recursive: true });
  copyFileSync(ruta, `${dir}/${descarga.suggestedFilename()}`);
  return contenido;
}

test("cada sección carga sin errores ni pedidos a internet", async ({ page }) => {
  const { externos, errores } = vigilar(page);
  await irA(page, "/", "Panel principal");
  // Con clics en la sidebar, como el usuario (un page.goto en medio de las
  // precargas de Next las cancela y WebKit lo anota como error).
  for (const [url, titulo] of SECCIONES) {
    await page.locator(`.sidebar a[href="${url}"]`).click();
    await expect(page.locator(".topbar-title")).toHaveText(titulo);
    await expect(page.getByText("Cargando…")).toHaveCount(0);
    await expect(page.locator(".content")).not.toBeEmpty();
    await expect(page).toHaveTitle(`${titulo} · Licores Alquimia`);
  }
  expect(externos, "pedidos a internet").toEqual([]);
  expect(errores, "errores en la consola").toEqual([]);
});

test("login: contraseña incorrecta, ingreso y cierre de sesión", async ({ browser }) => {
  // Contexto nuevo, sin la sesión compartida (cerrarla no afecta al resto).
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  const { usuario, clave } = credenciales();

  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);

  // Usuario que no existe: no suma intentos a la cuenta de prueba.
  await page.locator("#usuario").fill("e2e_no_existe");
  await page.locator("#contrasena").fill("Incorrecta123");
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page.locator(".login-error")).toBeVisible();

  await page.locator("#usuario").fill(usuario);
  await page.locator("#contrasena").fill(clave);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page.locator(".topbar-title")).toHaveText("Panel principal");

  // La cookie de sesión se guarda en http://localhost (Safari no guarda `Secure` ahí).
  const cookies = await ctx.cookies();
  const sesion = cookies.find((c) => c.httpOnly);
  expect(sesion, "cookie de sesión").toBeTruthy();
  expect(sesion!.secure).toBe(false);

  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/clientes");
  await expect(page).toHaveURL(/\/login/);
  await ctx.close();
});

test("cliente: alta, edición y baja", async ({ page, browserName }) => {
  const nombre = `E2E ${browserName} ${Date.now()}`;
  await irA(page, "/clientes", "Clientes");

  await page.locator(".rf-trigger-btn").click();
  const modal = page.locator(".rf-modal");
  await modal.getByLabel("Razón social").fill(nombre);
  await modal.getByLabel("Cond. IVA").selectOption("Consumidor Final");
  await modal.getByLabel("Precio Tradicional").fill("12500");
  await modal.getByRole("button", { name: "Guardar" }).click();
  await expect(modal).toHaveCount(0);

  await page.locator(".dt-search").fill(nombre);
  const fila = page.locator("tbody tr", { hasText: nombre });
  await expect(fila).toHaveCount(1);

  await fila.getByRole("button", { name: "Editar" }).click();
  await modal.getByLabel("Tel/Cel").fill("223 - 555 - 0101");
  await modal.getByRole("button", { name: "Guardar" }).click();
  await expect(modal).toHaveCount(0);
  await expect(fila).toContainText("223 - 555 - 0101");

  await fila.getByRole("button", { name: "Eliminar" }).click();
  await page.locator(".cf-danger-btn").click();
  await expect(fila).toHaveCount(0);
});

test("campos de número y fecha: no entran letras y una fecha imposible se marca", async ({ page }) => {
  await irA(page, "/operaciones", "Operaciones");
  await page.locator(".rf-trigger-btn").click();

  const cantidad = page.locator("#op-cantidad");
  await cantidad.pressSequentially("1a2b");
  await expect(cantidad).toHaveValue("12");

  const fecha = page.locator("#op-fecha");
  await fecha.fill("");
  await fecha.pressSequentially("31022026");
  await expect(fecha).toHaveValue("31/02/2026");
  await fecha.blur();
  await expect(page.locator("#op-fecha-error")).toBeVisible();
});

test("venta: aviso de stock con «Guardar igual» y alta de una venta", async ({ page }) => {
  await irA(page, "/operaciones", "Operaciones");
  const total = await page.locator(".dt-footer, .dt-count").first().textContent();
  await page.locator(".rf-trigger-btn").click();
  const modal = page.locator(".rf-modal");

  await page.locator("#op-fecha").fill("");
  await page.locator("#op-fecha").pressSequentially(hoy().replace(/\//g, ""));
  await page.locator("#op-clienteId").selectOption({ index: 1 });
  await page.locator("#op-vendedor").selectOption({ index: 1 });
  await page.locator("#op-productoId").selectOption({ index: 1 });
  await page.locator("#op-canal").selectOption({ index: 1 });
  await page.locator("#op-condicion").selectOption({ index: 1 });
  await page.locator("#op-pu").fill("10000");

  // Más que el stock: avisa y pide confirmar.
  await page.locator("#op-cantidad").fill("99999");
  await modal.getByRole("button", { name: "Guardar" }).click();
  await expect(modal.getByRole("button", { name: "Guardar igual" })).toBeVisible();

  await page.locator("#op-cantidad").fill("1");
  await modal.getByRole("button", { name: /^Guardar/ }).click();
  await expect(modal).toHaveCount(0);
  await expect(page.locator(".dt-footer, .dt-count").first()).not.toHaveText(total ?? "");
});

test("orden: alta macerando sin cantidad", async ({ page }) => {
  await irA(page, "/ordenes-produccion", "Órdenes de producción");
  await page.locator(".rf-trigger-btn").click();
  const modal = page.locator(".rf-modal");

  await page.locator("#orden-productoId").selectOption({ index: 1 });
  await page.locator("#orden-fechaMaceracion").pressSequentially(hoy().replace(/\//g, ""));
  await page.locator("#orden-responsable").fill("E2E");
  await expect(page.locator("#orden-cantidadProducida")).toHaveAttribute("placeholder", "Opcional mientras macera");

  await modal.getByRole("button", { name: "+ Agregar línea" }).click();
  const mp = modal.getByLabel("Materia prima, línea 1");
  const alcohol = await mp.locator("option", { hasText: /alcohol/i }).first().getAttribute("value");
  await mp.selectOption(alcohol!);
  await modal.getByLabel("Cantidad, línea 1").fill("1");
  await modal.getByRole("button", { name: "Guardar" }).click();
  await expect(modal).toHaveCount(0);
  // La tabla pagina de a 50: la orden nueva se busca.
  await page.locator(".dt-search").fill("E2E");
  await expect(page.locator("tbody tr", { hasText: "E2E" }).first()).toBeVisible();
});

test("tabla: fila activa, selección con Shift / Ctrl, ficha y páginas", async ({ page }) => {
  await irA(page, "/operaciones", "Operaciones");
  const filas = page.locator(".dt-table tbody tr");
  await expect(filas).toHaveCount(50);

  // Clic: fila activa. Shift + clic: rango. Ctrl (⌘) + clic: una suelta más.
  await filas.nth(0).locator("td").first().click();
  await expect(filas.nth(0)).toHaveClass(/dt-row-activa/);
  await filas.nth(3).locator("td").first().click({ modifiers: ["Shift"] });
  await expect(page.locator(".dt-seleccion")).toContainText("4 seleccionadas");
  await filas.nth(6).locator("td").first().click({ modifiers: ["ControlOrMeta"] });
  await expect(page.locator(".dt-seleccion")).toContainText("5 seleccionadas");
  await expect(page.locator(".dt-pdf-btn")).toHaveText("Descargar PDF (5)");
  await page.keyboard.press("Escape");
  await expect(page.locator(".dt-seleccion")).toHaveCount(0);

  // Doble clic: ficha de solo lectura; Esc la cierra.
  await filas.nth(1).locator("td").nth(2).dblclick();
  const modal = page.locator(".rf-modal");
  await expect(modal).toContainText("Lote de origen");
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);

  await page.getByRole("button", { name: "Página 2", exact: true }).click();
  await expect(page.locator(".dt-footer")).toContainText("Mostrando 51–100");
});

test("borrado de varias filas: borra las que puede y avisa las que no", async ({ page, browserName }) => {
  const nombre = `E2E SEL ${browserName} ${Date.now()}`;
  await irA(page, "/clientes", "Clientes");
  const modal = page.locator(".rf-modal");
  await page.locator(".rf-trigger-btn").click();
  await modal.getByLabel("Razón social").fill(nombre);
  await modal.getByLabel("Cond. IVA").selectOption("Consumidor Final");
  await modal.getByLabel("Precio Tradicional").fill("12500");
  await modal.getByRole("button", { name: "Guardar" }).click();
  await expect(modal).toHaveCount(0);

  // Un cliente con ventas (no se puede borrar) + el nuevo (sí).
  const filas = page.locator(".dt-table tbody tr");
  await filas.filter({ hasText: "PARTICULAR" }).first().locator("td").first().click();
  await filas.filter({ hasText: nombre }).locator("td").first().click({ modifiers: ["ControlOrMeta"] });
  await expect(page.locator(".dt-seleccion")).toContainText("2 seleccionadas");
  await page.keyboard.press("Delete");
  await expect(modal.getByRole("button", { name: "Cancelar" })).toBeFocused();
  await modal.getByRole("button", { name: "Eliminar 2 registros" }).click();
  await expect(modal).toContainText("Se eliminó 1 registro");
  await expect(modal).toContainText("PARTICULAR");
  await modal.getByRole("button", { name: "Entendido" }).click();
  await expect(filas.filter({ hasText: nombre })).toHaveCount(0);
  await expect(filas.filter({ hasText: "PARTICULAR" }).first()).toBeVisible();
});

test("vendedores: alta en mayúsculas, renombrar y eliminar (con ventas no)", async ({ page, browserName }) => {
  const nombre = `e2e ${browserName} ${Date.now()}`;
  const mayus = nombre.toUpperCase();
  await irA(page, "/operaciones", "Operaciones");
  await page.getByRole("button", { name: "Vendedores", exact: true }).click();
  const modal = page.locator(".rf-modal");
  await modal.getByLabel("Nuevo vendedor").fill(nombre);
  await modal.getByRole("button", { name: "Agregar" }).click();
  await expect(modal.locator("tbody tr", { hasText: mayus })).toHaveCount(1);

  await modal.getByRole("button", { name: `Renombrar ${mayus}` }).click();
  await modal.getByLabel(`Nuevo nombre de ${mayus}`).fill(`${mayus} B`);
  await modal.getByRole("button", { name: "Guardar" }).click();
  const renombrado = modal.locator("tbody tr", { hasText: `${mayus} B` });
  await expect(renombrado).toHaveCount(1);

  await modal.getByRole("button", { name: `Eliminar ${mayus} B` }).click();
  await modal.getByRole("button", { name: "Sí", exact: true }).click();
  await expect(renombrado).toHaveCount(0);

  await modal.getByRole("button", { name: "Eliminar ALQUIMIA" }).click();
  await modal.getByRole("button", { name: "Sí", exact: true }).click();
  await expect(modal.locator(".rf-error")).toContainText("ventas cargadas");
});

test("ficha: una venta del cliente lleva a esa venta en Operaciones", async ({ page }) => {
  await irA(page, "/clientes", "Clientes");
  await page.locator(".dt-table tbody tr", { hasText: "PARTICULAR" }).first().locator("td").first().dblclick();
  // La más nueva: está en una de las últimas páginas de Operaciones.
  const venta = page.locator(".fr-tabla tbody tr").first();
  const op = (await venta.locator("td").first().textContent())!.trim();
  await venta.click();
  await expect(page).toHaveURL(new RegExp(`/operaciones\\?foco=${op}$`));
  const activa = page.locator("tr.dt-row-activa");
  await expect(activa).toHaveAttribute("data-clave", op);
  await expect(activa).toBeInViewport();
});

test("textos largos: se cortan con «…» y el completo queda en el tooltip", async ({ page }) => {
  await irA(page, "/clientes", "Clientes");
  const scroll = page.locator(".dt-table-scroll");
  const [ancho, visible] = await scroll.evaluate((s) => [s.scrollWidth, s.clientWidth]);
  expect(ancho, "sin scroll horizontal").toBeLessThanOrEqual(visible + 1);
  const cortada = page.locator("td.dt-td-corta").first();
  await expect(cortada).toHaveAttribute("title", /.+/);
  await expect(cortada).toHaveCSS("text-overflow", "ellipsis");
});

test("PDF de una tabla, de Estadísticas y de la ficha de lote", async ({ page }) => {
  await irA(page, "/clientes", "Clientes");
  await descargaPdf(page, () => page.locator(".dt-pdf-btn").click());

  await irA(page, "/estadisticas?seccion=ventas", "Estadísticas");
  await descargaPdf(page, () => page.getByRole("button", { name: "PDF completo" }).click());

  await irA(page, "/trazabilidad", "Trazabilidad");
  await page.getByRole("button", { name: "Ficha de lote" }).click();
  const modal = page.locator(".rf-modal");
  await modal.locator("select").first().selectOption({ index: 1 });
  await descargaPdf(page, () => modal.getByRole("button", { name: "Descargar PDF" }).click());
});

test("venta mayorista: sugiere el precio del cliente según la línea del producto", async ({ page }) => {
  await irA(page, "/operaciones", "Operaciones");
  await page.locator(".rf-trigger-btn").click();
  const modal = page.locator(".rf-modal");
  const pu = page.locator("#op-pu");
  const ayuda = modal.locator(".op-precio-sugerido");

  await page.locator("#op-productoId").selectOption({ label: "Licor Fino de Limón — 750 cc Premium" });
  const lista = await pu.inputValue();
  await expect(ayuda).toHaveText("Precio de lista");
  await page.locator("#op-canal").selectOption("Mayor");
  await page.locator("#op-clienteId").selectOption({ label: "LA CAVA DE GÜEMES SRL" });
  await expect(ayuda).toHaveText("Precio del cliente (Premium)");
  await expect(pu).not.toHaveValue(lista);
  const delCliente = await pu.inputValue();

  // Un precio escrito a mano no se pisa al cambiar el canal; se puede volver al sugerido.
  await pu.fill("12345");
  await page.locator("#op-canal").selectOption("Menor");
  await expect(pu).toHaveValue("12345");
  await modal.getByRole("button", { name: /Usar sugerido/ }).click();
  await expect(pu).toHaveValue(lista);
  await page.locator("#op-canal").selectOption("Mayor");
  await expect(pu).toHaveValue(delCliente);
  await modal.getByRole("button", { name: "Cancelar" }).click();
});

test("compra: aviso sin lote, pendiente de pago y marcar pagada", async ({ page, browserName }) => {
  const lote = `E2E-${browserName}-${Date.now()}`;
  await irA(page, "/trazabilidad", "Trazabilidad");
  await page.getByRole("button", { name: "+ Nueva compra" }).click();
  const modal = page.locator(".rf-modal");
  await page.locator("#compra-fecha").pressSequentially(hoy().replace(/\//g, ""));
  await page.locator("#compra-materiaPrimaId").selectOption({ index: 1 });
  await page.locator("#compra-cantidad").fill("1");
  await page.locator("#compra-costoUnitario").fill("100");
  await page.locator("#compra-proveedorId").selectOption({ index: 1 });
  await modal.getByRole("radio", { name: "Efectivo" }).click();
  await modal.getByRole("radio", { name: "Pendiente de pago" }).click();
  await expect(page.locator("#compra-fechaPago")).toHaveCount(0);

  // Sin lote del proveedor: avisa y pide confirmar; con lote, guarda.
  await modal.getByRole("button", { name: "Guardar" }).click();
  await expect(modal.getByRole("button", { name: "Guardar igual" })).toBeVisible();
  await expect(modal).toContainText("Falta el lote del proveedor");
  await page.locator("#compra-lote").fill(lote);
  await expect(modal.getByRole("button", { name: "Guardar", exact: true })).toBeVisible();
  await modal.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(modal).toHaveCount(0);

  await page.locator(".dt-search").fill(lote);
  const fila = page.locator(".dt-table tbody tr", { hasText: lote });
  await expect(fila).toContainText("Pendiente");
  await fila.locator("td").first().click();
  await fila.locator("td").first().click({ modifiers: ["Shift"] });
  await page.locator(".dt-seleccion").getByRole("button", { name: "Marcar pagadas" }).click();
  await expect(modal).toContainText("1 compra pendiente");
  await modal.getByRole("button", { name: "Marcar 1 compra" }).click();
  await expect(modal).toContainText("Quedó pagada 1 compra");
  await modal.getByRole("button", { name: "Entendido" }).click();
  await expect(fila).toContainText("Pagada");
});

test("PDF de un remito y de retiro de lote", async ({ page }) => {
  await irA(page, "/operaciones", "Operaciones");
  await descargaPdf(page, () => page.getByRole("button", { name: "Descargar remito" }).first().click());

  await irA(page, "/productos-terminados", "Productos terminados");
  await page.getByRole("button", { name: "Rastrear lote" }).first().click();
  const modal = page.locator(".rf-modal");
  await expect(modal).toContainText("Clientes a avisar si hay que retirar el lote");
  await descargaPdf(page, () => modal.getByRole("button", { name: "PDF de retiro" }).click());
  await page.keyboard.press("Escape");

  await irA(page, "/trazabilidad", "Trazabilidad");
  await page.getByRole("button", { name: "Rastrear lote" }).first().click();
  await descargaPdf(page, () => modal.getByRole("button", { name: "PDF de retiro" }).click());
});

test("configuración: datos del establecimiento en los PDF y copia de seguridad manual", async ({ page, browserName }) => {
  // Los navegadores comparten la base: cada uno guarda su propia razón social (si no, no hay cambios y «Guardar» queda atenuado).
  const razon = `Bodega de Prueba ${browserName} S.R.L.`;
  await irA(page, "/configuracion", "Configuración");
  const empresa = page.locator("#cg-empresa");
  await empresa.getByLabel("CUIT").fill("30-71234567-9");
  await empresa.getByRole("button", { name: "Guardar" }).click();
  await expect(empresa.locator(".rf-field-error")).toContainText("dígito verificador");
  await empresa.getByLabel("Razón social").fill(razon);
  await empresa.getByLabel("CUIT").fill("30-71234567-1");
  await empresa.getByRole("button", { name: "Guardar" }).click();
  await expect(empresa.getByText("✓ Guardado")).toBeVisible();
  // Guardar refresca la página (los PDF toman los datos nuevos): que termine antes de navegar.
  await page.waitForLoadState("networkidle");

  // El encabezado de los PDF sale de esos datos (jsPDF deja el texto sin comprimir).
  await irA(page, "/clientes", "Clientes");
  const pdf = await descargaPdf(page, () => page.locator(".dt-pdf-btn").click());
  // El CUIT (igual en todos los navegadores: la razón social la puede pisar otro que corre en paralelo).
  expect(pdf.toString("latin1")).toContain("CUIT 30-71234567-1");

  await irA(page, "/configuracion", "Configuración");
  const copias = page.locator("#cg-copias");
  await copias.getByRole("button", { name: "Hacer una copia ahora" }).click();
  await expect(copias.getByText("Copia hecha y verificada.")).toBeVisible();
  await expect(copias.locator("tbody tr").filter({ hasText: "Manual" }).first()).toBeVisible();
  await expect(copias.getByText(/Última copia/)).toBeVisible();
});

test("gráficos: ECharts dibuja en el canvas", async ({ page }) => {
  await irA(page, "/estadisticas?seccion=resumen", "Estadísticas");
  const canvas = page.locator(".es-bloque canvas").first();
  await expect(canvas).toBeVisible();
  const caja = await canvas.boundingBox();
  expect(caja!.width).toBeGreaterThan(100);
  expect(caja!.height).toBeGreaterThan(100);
  // Que haya algo pintado (no un canvas vacío).
  const pintado = await canvas.evaluate((c: HTMLCanvasElement) => {
    const ctx = c.getContext("2d")!;
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) return true;
    return false;
  });
  expect(pintado).toBe(true);
});

test.describe("pantalla angosta (1366 al 125 %)", () => {
  test.use({ viewport: { width: 1093, height: 485 } });

  test("sidebar en íconos: se despliega, se cierra con Esc, con un clic afuera y al elegir sección", async ({ page }) => {
    await irA(page, "/", "Panel principal");
    const sidebar = page.locator(".sidebar");
    const boton = page.getByRole("button", { name: "Abrir menú" });
    // Compacta: solo íconos, sin el nombre de las secciones.
    expect((await sidebar.boundingBox())!.width).toBeLessThan(80);
    await expect(sidebar.getByText("Operaciones")).toBeHidden();

    await boton.click();
    await expect(sidebar).toHaveClass(/sidebar-desplegada/);
    await expect(sidebar.getByText("Operaciones")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sidebar).not.toHaveClass(/sidebar-desplegada/);

    await boton.click();
    await page.mouse.click(900, 300);
    await expect(sidebar).not.toHaveClass(/sidebar-desplegada/);

    await boton.click();
    await sidebar.getByText("Operaciones").click();
    await expect(page.locator(".topbar-title")).toHaveText("Operaciones");
    await expect(sidebar).not.toHaveClass(/sidebar-desplegada/);
  });

  test("modal en pantalla baja: los botones quedan a la vista", async ({ page }) => {
    await irA(page, "/ordenes-produccion?nuevo=1", "Órdenes de producción");
    await expect(page.locator(".rf-modal").getByRole("button", { name: "Guardar" })).toBeInViewport();
    await expect(page.locator(".rf-modal").getByRole("button", { name: "Cancelar" })).toBeInViewport();
  });
});
