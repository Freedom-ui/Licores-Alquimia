import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { credenciales } from "./credenciales";
import { paginaConSesionPropia } from "./sesion-propia";

// Comportamiento ESPERADO en los puntos donde la app tiene defectos abiertos.
// Cada prueba describe lo que tendría que pasar; mientras el defecto siga,
// falla, y el reporte muestra qué se esperaba y qué pasó. Cuando se corrija,
// pasa sola. No se marcan como "falla esperada" a propósito: el fallo tiene
// que verse.
//
//   npx playwright test --project=defectos
//
// Detalle de cada defecto: docs/testing/defectos.md.

async function irA(page: Page, url: string, titulo: string) {
  await page.goto(url);
  await expect(page.locator(".topbar-title")).toHaveText(titulo);
  await expect(page.getByText("Cargando…")).toHaveCount(0);
}

async function ventaAMedioCargar(page: Page) {
  await irA(page, "/operaciones", "Operaciones");
  await page.locator(".rf-trigger-btn").click();
  await page.locator("#op-clienteId").selectOption({ index: 1 });
  await page.locator("#op-productoId").selectOption({ index: 1 });
  await page.locator("#op-cantidad").fill("3");
  await page.locator("#op-pu").fill("10000");
  return page.locator(".rf-modal");
}

test.describe("DEF-01 · cerrar un formulario con datos cargados", () => {
  test("DEF-01a clic afuera con datos cargados: no se pierde lo cargado sin confirmar", async ({ page }) => {
    const modal = await ventaAMedioCargar(page);

    await page.locator(".rf-overlay").click({ position: { x: 5, y: 5 } });

    // Esperado: el formulario sigue abierto (o pide confirmar antes de descartar).
    await expect(modal).toBeVisible();
    await expect(page.locator("#op-cantidad")).toHaveValue("3");
  });

  test("DEF-01b Esc con datos cargados: no se pierde lo cargado sin confirmar", async ({ page }) => {
    const modal = await ventaAMedioCargar(page);

    await page.keyboard.press("Escape");

    await expect(modal).toBeVisible();
    await expect(page.locator("#op-cantidad")).toHaveValue("3");
  });
});

test.describe("DEF-05 · arrastrar desde un campo hasta afuera del formulario", () => {
  test("DEF-05 seleccionar el texto de un campo soltando el mouse afuera no cierra el formulario", async ({ page }) => {
    await irA(page, "/clientes", "Clientes");
    await page.locator(".rf-trigger-btn").click();
    const modal = page.locator(".rf-modal");
    const campo = modal.getByLabel("Razón social");
    await campo.fill("Almacén La Esquina");

    // Apretar dentro del campo (como para seleccionar el texto), arrastrar y soltar sobre el fondo oscuro.
    const caja = (await campo.boundingBox())!;
    await page.mouse.move(caja.x + caja.width - 5, caja.y + caja.height / 2);
    await page.mouse.down();
    await page.mouse.move(caja.x - 60, caja.y + caja.height / 2, { steps: 5 });
    const fondo = (await modal.boundingBox())!;
    await page.mouse.move(fondo.x - 20, fondo.y + 20, { steps: 5 });
    await page.mouse.up();

    // Esperado: el formulario sigue abierto con lo escrito (solo se seleccionó texto).
    await expect(modal).toBeVisible();
    await expect(campo).toHaveValue("Almacén La Esquina");
  });
});

test.describe("DEF-02 · cómo se muestra el usuario", () => {
  test("DEF-02 el menú muestra el usuario tal como hay que escribirlo para entrar", async ({ page }) => {
    const { usuario } = credenciales();
    await irA(page, "/", "Panel principal");

    // innerText: el texto como lo ve la persona (con el estilo aplicado).
    await expect(page.locator(".sidebar .su-nombre")).toHaveText(usuario, { useInnerText: true });
  });
});

test.describe("DEF-03 · la sesión se cierra sin avisar", () => {
  test("DEF-03 antes de cerrar la sesión por inactividad, avisa", async ({ browser }) => {
    // Reloj simulado; el límite del servidor de pruebas es de 240 minutos. Sesión propia.
    const page = await paginaConSesionPropia(browser);
    await page.clock.install();
    await ventaAMedioCargar(page);

    await page.clock.fastForward(238 * 60_000);

    // Esperado: un aviso (alerta o diálogo, no el botón «Cerrar sesión» del menú) del tipo
    // «Tu sesión se va a cerrar…», con la venta todavía en pantalla.
    const aviso = page.locator('[role="alert"], [role="alertdialog"], [role="dialog"], [role="status"]').filter({ hasText: /sesión/i });
    await expect(aviso.first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("#op-cantidad")).toHaveValue("3");
  });
});

test.describe("DEF-04 · pedido de venta repetido", () => {
  test("DEF-04 el mismo pedido de alta enviado dos veces guarda una sola venta", async ({ request }) => {
    const sesion = JSON.parse(readFileSync("e2e/.auth/sesion.json", "utf8")) as { cookies: { name: string; value: string }[] };
    const token = sesion.cookies.find((c) => c.name === "alquimia_sesion")!.value;
    const manifiesto = JSON.parse(readFileSync(".next/server/server-reference-manifest.json", "utf8")) as {
      node: Record<string, { exportedName?: string; filename?: string }>;
    };
    const id = Object.entries(manifiesto.node).find(([, i]) => i.exportedName === "ejecutar" && i.filename?.includes("_datos"))![0];
    const cuerpo = JSON.stringify([
      { tipo: "addOperacion", v: { fecha: "2026-11-02", clienteId: 1, vendedor: "ALQUIMIA", productoId: 2, cantidad: 7, canal: "Menor", condicion: "Contado", pu: 12345 } },
    ]);
    const enviar = () =>
      request.post("/operaciones", {
        headers: { "Next-Action": id, "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component", Cookie: `alquimia_sesion=${token}` },
        data: cuerpo,
      });
    // Ventas iguales a la del pedido en el estado que devuelve la acción (formato de React: líneas `n:{json}`).
    const ventasIguales = async (texto: string) => {
      for (const linea of texto.split("\n")) {
        const m = /^[0-9a-f]+:(\{.*\})$/.exec(linea.trim());
        const obj = m ? (JSON.parse(m[1]) as { ok?: boolean; estado?: { operaciones: { cantidad: number; pu: number }[] } }) : null;
        if (obj?.ok) return obj.estado!.operaciones.filter((o) => o.cantidad === 7 && o.pu === 12345).length;
      }
      throw new Error(`Respuesta sin resultado: ${texto.slice(0, 300)}`);
    };

    const primera = await enviar();
    const segunda = await enviar();

    const antes = await ventasIguales(await primera.text());
    const despues = await ventasIguales(await segunda.text());
    expect(despues, "la segunda vez no tendría que sumar otra venta igual").toBe(antes);
  });
});
