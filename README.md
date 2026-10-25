# Licores Alquimia

App para un elaborador artesanal de licores (Prov. de Buenos Aires, registro PUPAA + REBA):
clientes, proveedores, compras con trazabilidad, órdenes de producción, stock por lote (FIFO),
ventas con remito, estadísticas e importación de la planilla de Excel.

Se entrega como **app de escritorio** (Windows y Mac): un instalador que trae todo adentro
(no hace falta instalar Node ni nada más), guarda los datos en la carpeta del usuario, hace copias
de seguridad solas (en la PC y en Google Drive) y se actualiza sola desde las Releases de GitHub.

- Guía para el cliente: [docs/guia-instalacion.md](docs/guia-instalacion.md) y [docs/manual-de-uso.md](docs/manual-de-uso.md).
- Estado del proyecto y decisiones: [spec.md](spec.md).

## Cómo está armada

| Parte | Dónde |
| --- | --- |
| App web (Next.js 16 + React 19 + TypeScript) | `app/` |
| Lógica del negocio, pura y con tests | `app/(dashboard)/_dominio/` |
| Base de datos SQLite con Prisma 7 | `prisma/`, `lib/prisma.ts` |
| Migraciones al arrancar (sin la CLI de Prisma) | `lib/datos/migrar.ts`, `instrumentation.ts` |
| Copias de seguridad, Google Drive y restauración | `lib/copias/`, `app/(dashboard)/configuracion/` |
| App de escritorio (Electron) | `escritorio/` (proyecto aparte, solo depende de `electron-updater`) |
| Empaquetado e instaladores | `scripts/empaquetar.mjs`, `electron-builder.yml`, `.github/workflows/release.yml` |

La app de escritorio levanta el servidor standalone de Next con un Node propio (el mismo con el que se
compila, que viaja dentro de la app) y lo muestra en su ventana. Los datos van a la carpeta del usuario:
`%APPDATA%\Licores Alquimia` en Windows y `~/Library/Application Support/Licores Alquimia` en Mac
(`alquimia.db`, `copias/`, `drive.json`, `registro/`).

## Desarrollo

Requisitos: Node 22 (el mismo de `.github/workflows/release.yml`).

```bash
npm ci
npm ci --prefix escritorio
```

Crear `.env` en la raíz:

```
DATABASE_URL="file:./dev.db"
# Opcional: conexión con Google Drive (ver más abajo)
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
# Opcional: copias automáticas también en desarrollo (van a respaldos/)
ALQUIMIA_COPIAS=1
```

```bash
npx prisma generate
npm run db:seed        # datos de prueba (opcional)
npm run dev            # http://localhost:3000 — la primera vez pide crear el usuario
npm run app:dev        # la misma app dentro de la ventana de Electron (con npm run dev corriendo)
```

Las migraciones se aplican solas al arrancar el servidor (también `npm run db:migrate`).

Chequeos: `npm test` · `npx tsc --noEmit` · `npx eslint` · `npm run e2e` (Playwright en Chromium,
Firefox y WebKit sobre una copia de la base).

## Instaladores y versiones

- **Probar un instalador en esta PC:** `npm run app:build` → `dist/Licores-Alquimia-Setup-<versión>.exe`
  (en una Mac, el `.dmg`).
- **Sacar una versión** (se actualiza sola en las PCs del cliente):
  1. Subir `version` en `package.json` (ej. `1.0.1`) y commitear.
  2. `git tag v1.0.1 && git push && git push --tags`.
  3. GitHub Actions arma el instalador de Windows y los de Mac y los deja en una Release en
     **borrador**. Revisarla y publicarla: recién ahí las apps instaladas la ven.

Los instaladores no están firmados: la primera vez Windows muestra "Windows protegió su PC" (Más
información → Ejecutar de todos modos) y en Mac hay que permitir la app en Ajustes → Privacidad y
seguridad. En Mac, sin firma de Apple, la app avisa de las versiones nuevas pero no se instala sola.

## Conexión con Google Drive (una sola vez)

Las copias se suben con OAuth de "app de escritorio" y el permiso `drive.file` (la app solo ve los
archivos que ella crea). Para obtener las credenciales:

1. En [Google Cloud Console](https://console.cloud.google.com/) crear un proyecto (ej. "Licores Alquimia").
2. **APIs y servicios → Biblioteca**: habilitar **Google Drive API**.
3. **Pantalla de consentimiento de OAuth**: tipo **Externo**, nombre "Licores Alquimia", email de
   soporte; en permisos agregar `.../auth/drive.file`, `openid` y `email`. Después **Publicar la app**
   (pasarla a "En producción": en "Prueba" el permiso vence a los 7 días). Con estos permisos no hace
   falta la verificación de Google.
4. **Credenciales → Crear credenciales → ID de cliente de OAuth → App de escritorio**.
5. Copiar el ID y el secreto a `.env` (para desarrollo y `npm run app:build`) y como secretos del repo
   en GitHub (**Settings → Secrets and variables → Actions**): `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`.

En una app de escritorio estas credenciales no son secretas (Google lo indica así): lo que protege los
datos es que el usuario da el permiso con su propia cuenta.
