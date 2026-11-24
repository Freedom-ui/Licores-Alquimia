import { expect, type Browser, type Page } from "@playwright/test";
import { credenciales } from "./credenciales";

/**
 * Página con una sesión nueva, solo para esta prueba. Para las pruebas que
 * cierran la sesión (inactividad, salir): si usaran la sesión compartida de
 * e2e/.auth, las demás pruebas que corren en paralelo quedarían sin sesión.
 * Si la prueba usa el reloj simulado, instalarlo después de esto y antes de
 * navegar a la sección.
 */
export async function paginaConSesionPropia(browser: Browser): Promise<Page> {
  // storageState vacío: si no, el contexto hereda la sesión compartida del proyecto.
  const contexto = await browser.newContext({ storageState: { cookies: [], origins: [] }, viewport: { width: 1366, height: 768 } });
  const page = await contexto.newPage();
  const { usuario, clave } = credenciales();
  await page.goto("/login");
  await page.locator("#usuario").fill(usuario);
  await page.locator("#contrasena").fill(clave);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page.locator(".topbar-title")).toHaveText("Panel principal");
  return page;
}
