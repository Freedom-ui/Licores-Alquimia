# Reportes de ejecución y cobertura

Resultados **reales** de la última corrida completa (`npm run test:todo -- --navegadores`, 23/11/2026). Se pueden regenerar en cualquier momento: ver [README.md](README.md#cómo-correr-las-pruebas). La salida completa de la consola quedó en `reportes/evidencias/corrida-completa.txt`.

## 1. Resumen

| Tipo | Pasan | Fallan | Omitidas | No ejecutadas |
| --- | ---: | ---: | ---: | ---: |
| Unitarias (Vitest) | 469 | 0 | 1 | — |
| Integración (Vitest + SQLite) | 87 | 0 | 0 | — |
| Ingreso de las pruebas (Playwright) | 1 | 0 | 0 | — |
| API por HTTP (Playwright) | 27 | 0 | 0 | — |
| Funcionales (Playwright, Chromium) | 7 | 0 | 0 | — |
| Humo en Chromium | 19 | 0 | 0 | — |
| Humo en WebKit | 19 | 0 | 0 | — |
| Humo en Firefox | — | — | — | 19 |
| Defectos abiertos (Playwright) | 0 | **6** | 0 | — |
| **Total** | **629** | **6** | **1** | **19** |

**Cómo leerlo**
- **Las 6 que fallan son las de defectos.** Describen el comportamiento esperado donde hoy hay un defecto, y fallan a propósito mientras no se corrija. Todas las demás pasan: 629 de 629.
- **La omitida** solo corre con la planilla real del cliente (`PLANILLA_REAL=<ruta>`), que no está en el repositorio porque tiene datos del cliente.
- **Firefox no se ejecutó**: el navegador no abre en esta PC y falla antes de llegar a la app (OBS-01). No se cuenta como aprobada ni como fallida.

| Paso | Resultado | Duración |
| --- | --- | ---: |
| Vitest: unitarias + integración, con cobertura | Sin fallos | 17 s |
| Build de producción | Sin fallos | 14 s |
| Playwright: API, funcionales, defectos y humo | Fallan solo las 6 de defectos | 100 s |

### Integración por archivo

| Archivo | Casos | Pruebas | Resultado |
| --- | --- | ---: | --- |
| `datos.test.ts` | IT-D01 a IT-D18 | 32 | 32 ✅ |
| `acceso.test.ts` | IT-A01 a IT-A22 | 26 | 26 ✅ |
| `configuracion-y-rutas.test.ts` | IT-R01 a IT-R07, IT-C01 a IT-C09 | 21 | 21 ✅ |
| `importacion.test.ts` | IT-I01 a IT-I05 | 8 | 8 ✅ |

Hay más pruebas que casos porque algunos casos se repiten con varios datos (por ejemplo, IT-D11 corre una vez por cada uno de sus 9 datos inválidos).

## 2. Cobertura de código

Mide qué parte de la **lógica** (archivos `.ts`) se ejecuta en las pruebas unitarias y de integración. Las pantallas (`.tsx`) no entran en este número: se prueban en el navegador con Playwright, que no mide cobertura.

| Líneas | Sentencias | Ramas | Funciones |
| ---: | ---: | ---: | ---: |
| **85,69 %** | 82,67 % | 74,34 % | 74,69 % |

### Por carpeta (líneas)

| Carpeta | Archivos | Líneas cubiertas | % |
| --- | ---: | ---: | ---: |
| `lib/auth` (sesión, contraseñas, reglas de acceso) | 2 | 85 / 85 | 100 % |
| `lib/datos` (migraciones) | 2 | 50 / 50 | 100 % |
| `_panel` (cálculos del Panel) | 1 | 50 / 50 | 100 % |
| `_dominio` (reglas del negocio, acciones, FIFO) | 6 | 1046 / 1096 | 95,4 % |
| `_importar` (lectura y análisis de planillas) | 9 | 979 / 1030 | 95,0 % |
| `(acceso)` (login, primer arranque, recuperación) | 1 | 74 / 78 | 94,9 % |
| `lib/copias` (copias de seguridad y Drive) | 5 | 268 / 311 | 86,2 % |
| `api/drive` | 1 | 12 / 14 | 85,7 % |
| `_datos` (server actions y repositorio) | 3 | 181 / 218 | 83,0 % |
| `trazabilidad` | 2 | 77 / 95 | 81,1 % |
| `components/data-table` (validaciones, formato, tablas) | 6 | 187 / 239 | 78,2 % |
| `configuracion` | 1 | 36 / 63 | 57,1 % |
| `estadisticas` | 5 | 254 / 492 | 51,6 % |
| `lib` (archivos sueltos) | 5 | 10 / 35 | 28,6 % |

Las secciones con pocas líneas de lógica propia (`clientes`, `productos`, `operaciones`, etc.) están todas entre el 92 % y el 100 %.

### Módulos con poca cobertura

Módulos con menos del 50 % de las líneas cubiertas, y por qué:

| Archivo | Líneas | Qué es | Por qué está bajo | ¿Se prueba de otra forma? |
| --- | ---: | --- | --- | --- |
| `estadisticas/secciones.ts` | 20,9 % | Arma cada pantalla de Estadísticas: tarjetas, gráficos y tablas (1039 líneas) | Son definiciones de gráficos (opciones de ECharts) para cada pantalla. Los **cálculos** que usa están en `calculos.ts`, que sí tiene pruebas | Sí: humo (los gráficos dibujan y el PDF de Estadísticas sale). **Es el que más conviene completar** |
| `lib/copias/programador.ts` | 32,14 % | Copias automáticas cada hora y al cerrar la app | Depende de temporizadores y del ciclo de vida de la app de escritorio | En parte: las funciones que llama (copiar, rotar, subir a Drive) sí tienen pruebas. **Conviene agregar pruebas con reloj simulado** |
| `_importar/plantilla.ts` | 18,18 % | Plantilla vacía de Excel para descargar | Las pruebas usan la lista de hojas, pero no la descarga (necesita el navegador) | No. Riesgo bajo: arma un Excel vacío |
| `lib/escritorio.ts` | 20 % | Mensajes con la app de escritorio (Electron) | Solo hace algo dentro de Electron; fuera de Electron no hace nada | No. Se prueba a mano al sacar cada versión |
| `lib/arranque.ts` | 0 % | Lo que hace el servidor al arrancar: restauración pendiente y migraciones | Corre una sola vez, al iniciar el servidor | Sí, por partes: las migraciones (`migrar.test.ts`) y la restauración (IT-C09, `lib/copias`) |
| `lib/empresa.ts` | 0 % | Lee los datos del establecimiento (6 líneas) | Se usa al dibujar páginas en el servidor | Sí: humo («datos del establecimiento en los PDF») |
| `useErroresFormulario.ts` | 0 % | Errores debajo de cada campo de los formularios | Es un hook de React, solo corre en la pantalla | Sí: FUN-01, FUN-02, FUN-03 y humo |
| `importar/enCurso.ts` | 0 % | Avisa si hay una importación a medias al cerrar sesión | Hook de React | No directamente |
| `nav-data.ts` | 0 % | La lista de secciones del menú | Son solo datos | Sí: humo recorre las 13 secciones del menú |

## 3. Registro de errores

### En la última corrida

| Dónde | Error | Qué es |
| --- | --- | --- |
| Pruebas de defectos | 6 pruebas fallan: DEF-01a, DEF-01b, DEF-05, DEF-02, DEF-03 y DEF-04 | Los defectos documentados. Cada una muestra lo esperado y lo obtenido. Ejemplos: DEF-02 esperaba `qa.tester` y obtuvo `Qa.Tester`; DEF-04 esperaba 1 venta y obtuvo 2. Detalle en [defectos.md](defectos.md) |
| Humo en Firefox | `browserType.launch: spawn UNKNOWN` (19 veces) | Firefox no abre en esta PC (OBS-01) |
| Log del servidor | `SyntaxError: Unexpected token 'e', "esto no es json" is not valid JSON` | Lo provoca **a propósito** API-07, que manda un cuerpo que no es JSON. Next responde 500 y no se guarda nada (OBS-02) |
| Log del servidor | `Failed to find Server Action "000…0"` | Lo provoca **a propósito** API-08, con un id de server action inexistente. Next responde 404 |

### Durante el armado de las pruebas

Errores que aparecieron mientras se escribían las pruebas, y qué se hizo. Ninguno se resolvió cambiando lo que la prueba verifica.

| Error | Causa | Qué se hizo |
| --- | --- | --- |
| IT-C04 fallaba: «se esperaban 0 copias» | En la carpeta temporal quedaban copias de pruebas anteriores del mismo archivo. Error de **la prueba** | Comparar la cantidad de copias antes y después, en vez de esperar 0 |
| FUN-02 no encontraba el campo CUIT | La prueba buscaba una opción y una etiqueta con otro texto («R. Inscripto», «CUIT/CUIL»). Error de **la prueba** | Usar los textos reales de la pantalla |
| DEF-03 pasaba cuando tenía que fallar | Buscaba la palabra «sesión» en toda la página y encontraba el botón «Cerrar sesión» | Buscar solo dentro de avisos y diálogos. Ahora falla, como corresponde |
| Pruebas del navegador fallaban al azar | FUN-07 cerraba la sesión compartida por las demás (OBS-04) | FUN-07 y DEF-03 usan una sesión propia |
| `generador.test.ts` fallaba por tiempo con la cobertura encendida | Medir la cobertura lo hace más lento (OBS-03) | Tiempo máximo de las unitarias a 15 s; la verificación no se tocó |
| Humo en WebKit, «configuración…», falló 1 vez en la corrida completa y 2 de 4 al repetirla | La prueba escribía antes de que React terminara de hidratar la página (OBS-05) | Escribir y reintentar hasta que la pantalla lo refleje. Después pasó 12 de 12 veces y en la corrida final |

## 4. Evidencias

| Archivo | Qué muestra |
| --- | --- |
| `reportes/evidencias/corrida-completa.txt` | La salida completa de la última corrida |
| `reportes/evidencias/mutacion-inactividad.txt` | Con la sesión cambiada a 45 minutos, IT-A14 falla |
| `reportes/evidencias/mutacion-sin-control-de-sesion.txt` | Sin el control de sesión en `ejecutar`, IT-D01 a IT-D03 fallan |
| `playwright-report/index.html` | Cada prueba del navegador; las que fallaron tienen la traza, con capturas paso a paso (`npx playwright show-report`) |
| `reportes/cobertura/index.html` | Cobertura archivo por archivo, con las líneas sin cubrir marcadas |
| `reportes/RESUMEN.md` | El resumen que arma `npm run test:todo` en cada corrida |

**Datos reales:** `dev.db` tiene la misma fecha de modificación antes y después de todas las corridas (03/11/2026 21:25).
