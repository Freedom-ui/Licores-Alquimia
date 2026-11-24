import { test, expect, type Page } from "@playwright/test";
import { paginaConSesionPropia } from "./sesion-propia";

// Revisión funcional de formularios y flujos (Chromium, 1366×768), sobre la
// copia de la base. Complementa las pruebas de humo (humo.spec.ts): acá se
// prueban las validaciones que ve el usuario, las formas de cerrar un
// formulario y las protecciones de la pantalla.

async function irA(page: Page, url: string, titulo: string) {
  await page.goto(url);
  await expect(page.locator(".topbar-title")).toHaveText(titulo);
  await expect(page.getByText("Cargando…")).toHaveCount(0);
}

/** Total de registros de la tabla según el pie («Mostrando … de N registros»). */
async function totalRegistros(page: Page): Promise<number> {
  const texto = (await page.locator(".dt-footer-texto").textContent()) ?? "";
  const m = /de ([\d.]+) registros(?!.*filtrados)/.exec(texto) ?? /filtrados de ([\d.]+)/.exec(texto);
  return Number(m![1].replace(/\./g, ""));
}

function hoy() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}${String(d.getMonth() + 1).padStart(2, "0")}${d.getFullYear()}`;
}

async function completarVenta(page: Page, cantidad = "1") {
  await page.locator("#op-fecha").fill("");
  await page.locator("#op-fecha").pressSequentially(hoy());
  await page.locator("#op-clienteId").selectOption({ index: 1 });
  await page.locator("#op-vendedor").selectOption({ index: 1 });
  await page.locator("#op-productoId").selectOption({ index: 1 });
  await page.locator("#op-canal").selectOption({ index: 1 });
  await page.locator("#op-condicion").selectOption({ index: 1 });
  await page.locator("#op-pu").fill("10000");
  await page.locator("#op-cantidad").fill(cantidad);
}

test.describe("Validación de formularios", () => {
  test("FUN-01 guardar un cliente vacío marca los obligatorios y no guarda", async ({ page }) => {
    await irA(page, "/clientes", "Clientes");
    const antes = await totalRegistros(page);
    await page.locator(".rf-trigger-btn").click();
    const modal = page.locator(".rf-modal");

    await modal.getByRole("button", { name: "Guardar" }).click();

    await expect(modal).toBeVisible();
    await expect(modal.locator(".rf-field-error").first()).toBeVisible();
    expect(await modal.locator(".rf-field-error").count()).toBeGreaterThanOrEqual(2);
    await modal.getByRole("button", { name: "Cancelar" }).click();
    expect(await totalRegistros(page)).toBe(antes);
  });

  test("FUN-02 un CUIT con el dígito verificador mal se marca debajo del campo", async ({ page }) => {
    await irA(page, "/clientes", "Clientes");
    await page.locator(".rf-trigger-btn").click();
    const modal = page.locator(".rf-modal");

    await modal.getByLabel("Razón social").fill("E2E CUIT");
    await modal.getByLabel("Cond. IVA").selectOption("R. Inscripto");
    await modal.getByLabel("CUIT/CUIL").fill("20-12345678-7");
    await modal.getByRole("button", { name: "Guardar" }).click();

    await expect(modal).toBeVisible();
    await expect(modal.locator(".rf-field-error", { hasText: "dígito verificador" })).toBeVisible();
  });

  test("FUN-03 una venta con cantidad 0 no se guarda y avisa en el campo", async ({ page }) => {
    await irA(page, "/operaciones", "Operaciones");
    await page.locator(".rf-trigger-btn").click();
    const modal = page.locator(".rf-modal");

    await completarVenta(page, "0");
    await modal.getByRole("button", { name: /^Guardar/ }).click();

    await expect(modal).toBeVisible();
    await expect(page.locator("#op-cantidad-error")).toBeVisible();
  });
});

test.describe("Cerrar un formulario", () => {
  test("FUN-04 sin nada cargado, clic afuera, Esc o Cancelar lo cierran (no hay nada que perder)", async ({ page }) => {
    await irA(page, "/clientes", "Clientes");
    const modal = page.locator(".rf-modal");

    await page.locator(".rf-trigger-btn").click();
    await page.locator(".rf-overlay").click({ position: { x: 5, y: 5 } });
    await expect(modal).toHaveCount(0);

    await page.locator(".rf-trigger-btn").click();
    await page.keyboard.press("Escape");
    await expect(modal).toHaveCount(0);

    await page.locator(".rf-trigger-btn").click();
    await modal.getByRole("button", { name: "Cancelar" }).click();
    await expect(modal).toHaveCount(0);
  });

  test("FUN-05 un clic dentro del formulario (no en un botón) no lo cierra", async ({ page }) => {
    await irA(page, "/clientes", "Clientes");
    await page.locator(".rf-trigger-btn").click();
    const modal = page.locator(".rf-modal");

    await modal.locator("h2").click();
    await modal.getByLabel("Razón social").click();

    await expect(modal).toBeVisible();
  });
});

test.describe("Protecciones de la pantalla", () => {
  test("FUN-06 doble clic en «Guardar» de una venta guarda una sola venta", async ({ page }) => {
    await irA(page, "/operaciones", "Operaciones");
    const antes = await totalRegistros(page);
    await page.locator(".rf-trigger-btn").click();
    const modal = page.locator(".rf-modal");

    await completarVenta(page, "1");
    await modal.getByRole("button", { name: /^Guardar/ }).dblclick();

    await expect(modal).toHaveCount(0);
    await expect.poll(() => totalRegistros(page)).toBe(antes + 1);
    await page.reload();
    await expect(page.getByText("Cargando…")).toHaveCount(0);
    expect(await totalRegistros(page)).toBe(antes + 1);
  });

  test("FUN-07 la sesión se cierra sola tras el tiempo sin uso y vuelve al login", async ({ browser }) => {
    // Reloj simulado: el límite del servidor de pruebas es de 240 minutos (playwright.config.ts).
    // Sesión propia: esta prueba la cierra.
    const page = await paginaConSesionPropia(browser);
    await page.clock.install();
    await irA(page, "/operaciones", "Operaciones");

    await page.clock.fastForward(241 * 60_000);

    await expect(page).toHaveURL(/\/login\?motivo=inactividad/);
    // Y la sesión quedó cerrada también en el servidor: volver atrás no muestra datos.
    await page.goto("/operaciones");
    await expect(page).toHaveURL(/\/login/);
    await page.context().close();
  });
});
