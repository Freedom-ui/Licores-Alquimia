import { test as setup, expect } from "@playwright/test";
import { credenciales } from "./credenciales";

// Entra una vez y guarda la cookie de sesión para el resto de las pruebas.
setup("ingresar", async ({ page }) => {
  const { usuario, clave } = credenciales();
  await page.goto("/login");
  await page.locator("#usuario").fill(usuario);
  await page.locator("#contrasena").fill(clave);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page.locator(".topbar-title")).toHaveText("Panel principal");
  await page.context().storageState({ path: "e2e/.auth/sesion.json" });
});
