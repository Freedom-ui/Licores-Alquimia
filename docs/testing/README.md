# Pruebas de Licores Alquimia

Documentación de las pruebas del sistema: qué se prueba, cómo, con qué resultado y qué defectos se encontraron.

## Índice

| Documento | Qué tiene |
| --- | --- |
| [estrategia.md](estrategia.md) | Objetivo, alcance, niveles y tipos de prueba, herramientas, entornos y criterios |
| [api.md](api.md) | Cada endpoint (server actions y rutas HTTP) con sus casos y resultados |
| [casos-de-prueba.md](casos-de-prueba.md) | Los casos formales: id, tipo, precondiciones, datos, pasos, esperado, obtenido y estado |
| [reportes.md](reportes.md) | Resultados de la última corrida, cobertura, módulos con poca cobertura y registro de errores |
| [defectos.md](defectos.md) | Defectos encontrados (con evidencia, impacto y propuesta) y otras observaciones |
| [revision-general.md](revision-general.md) | Revisión de secciones, formularios y flujos, estabilidad y riesgos para una demo en vivo |
| [guia-de-estudio.md](guia-de-estudio.md) | Cómo está hecho el sistema y dónde tocar para cambiar cada cosa |

## Cómo correr las pruebas

Todo se corre desde la carpeta `app`.

### Antes de la primera vez

```powershell
npm install
npx playwright install chromium webkit
```

Las pruebas en el navegador entran con una **cuenta de prueba** que tiene que existir en la base de desarrollo (`dev.db`). Sus datos se leen de las variables de entorno `E2E_USUARIO` y `E2E_CLAVE`:

```powershell
$env:E2E_USUARIO = "<usuario de prueba>"; $env:E2E_CLAVE = "<contraseña de prueba>"
```

También se pueden guardar en un archivo local que git ignora (ver `e2e/credenciales.ts`).

Las pruebas unitarias y de integración no necesitan cuenta: crean la suya en una base temporal.

### Comandos

| Comando | Qué corre |
| --- | --- |
| `npm run test:todo` | **Todo**: unitarias, integración y cobertura; build; API, funcionales, defectos y humo en Chromium. Escribe `reportes/RESUMEN.md` |
| `npm run test:todo -- --navegadores` | Lo mismo, y además humo en Firefox y WebKit. En la última corrida tardó unos 3 minutos |
| `npm run test:unit` | Solo unitarias |
| `npm run test:integracion` | Solo integración (base SQLite temporal) |
| `npm run test:cobertura` | Unitarias + integración, con el informe de cobertura |
| `npm run test:api` | Build + API por HTTP |
| `npm run test:funcional` | Build + funcionales |
| `npm run test:defectos` | Build + defectos abiertos (**fallan** mientras el defecto siga) |
| `npm run e2e` | Build + humo en Chromium, Firefox y WebKit |

Para correr un solo caso, se filtra por su id o su nombre:

```powershell
npx vitest run -t "IT-D10"
```

```powershell
npx playwright test --project=api -g "API-04"
```

### Dónde quedan los reportes

| Reporte | Cómo abrirlo |
| --- | --- |
| `reportes/RESUMEN.md` | Totales por tipo, pruebas fallidas, cobertura y módulos con poca cobertura. Se abre en cualquier editor |
| `reportes/vitest/index.html` | Cada prueba de Vitest: `npx vite preview --outDir reportes/vitest` |
| `reportes/cobertura/index.html` | Cobertura por carpeta y archivo, con las líneas sin cubrir marcadas. Se abre directo en el navegador |
| `playwright-report/index.html` | Cada prueba del navegador, con la traza (capturas paso a paso) de las que fallaron: `npx playwright show-report` |
| `reportes/vitest/junit.xml` | Formato JUnit, para integración continua |
| `reportes/evidencias/` | Salida completa de la última corrida y de las pruebas de mutación |

La carpeta `reportes/` no se sube a git: se genera en cada corrida.

### Los datos reales no se tocan

- **Unitarias:** no usan base.
- **Integración:** crea una base nueva en la carpeta temporal del sistema y la borra al terminar.
- **Navegador y API:** el servidor de pruebas (puerto 3005) arranca sobre `e2e/.datos/e2e.db`, una **copia** de `dev.db` hecha en ese momento. Las copias de seguridad que se hacen en las pruebas van a `e2e/.datos/copias`.

Detalle en [estrategia.md](estrategia.md#5-entornos-y-datos-de-prueba-separados-de-los-reales).
