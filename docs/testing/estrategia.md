# Estrategia de testing

## 1. Objetivo

Demostrar con pruebas que se ejecutan de verdad que Licores Alquimia:
1. **calcula bien** (ventas, stock por lote, costos, márgenes, estadísticas);
2. **no guarda datos inválidos**, vengan de la pantalla o de alguien que llama al servidor directamente;
3. **protege el acceso** (sesión, bloqueo por intentos, vencimiento);
4. **no pierde datos** (transacciones, copias de seguridad, importación sin duplicados);
5. **funciona en los navegadores** en los que se usa: Chromium (base de Chrome, Edge y la ventana de escritorio) y WebKit (base de Safari, en Mac).

Y, donde no lo cumple, **detectarlo y documentarlo** con una prueba que lo demuestre: ver [defectos.md](defectos.md).

## 2. Alcance

| Se prueba | No se prueba (y por qué) |
| --- | --- |
| Reglas del negocio y validaciones de todas las secciones | **Carga y concurrencia masiva**: la app la usa una persona en una PC |
| Server actions y rutas HTTP: códigos, sesión, datos inválidos, recursos inexistentes, pedidos repetidos | **Google Drive real**: necesita una cuenta y salir a internet. Se prueba con respuestas simuladas (`lib/copias/drive.test.ts`) |
| Lo que queda escrito en la base después de cada operación | **Instalador y actualización automática** (Electron): se prueban a mano al sacar cada versión (README, «Instaladores y versiones») |
| Flujos de pantalla: altas, ediciones, bajas, ventas, órdenes, compras, PDFs, gráficos | **Celulares**: la app no tiene versión móvil |
| Comportamiento al cerrar formularios y cómo se muestra el usuario | **Accesibilidad completa** (lector de pantalla). Se usan roles y etiquetas en las pruebas, pero no hay una auditoría |

## 3. Niveles y tipos de prueba

Se sigue la **pirámide de pruebas**: muchas pruebas chicas y rápidas abajo, y pocas grandes y lentas arriba. Cada nivel prueba lo que los de abajo no pueden ver.

```
                 ▲  pocas, lentas, prueban todo junto
          ┌──────────────┐
          │  Navegador   │  humo · funcionales · defectos     (Playwright)
          ├──────────────┤
          │  API (HTTP)  │  rutas · server actions · proxy     (Playwright request)
          ├──────────────┤
          │ Integración  │  server action + base SQLite real   (Vitest)
          ├──────────────┤
          │  Unitarias   │  reglas, cálculos, validadores      (Vitest)
          └──────────────┘
                 ▼  muchas, rápidas, prueban una cosa
```

| Nivel | Cuántas (última corrida) | Dónde | Qué ve que el nivel de abajo no ve |
| --- | ---: | --- | --- |
| **Unitarias** | 469 | `app/**/*.test.ts`, `lib/**/*.test.ts` | — |
| **Integración** | 87 | `pruebas/integracion/` | La base real: transacciones, claves foráneas, lo que queda guardado, sesiones en la base |
| **API por HTTP** | 27 | `e2e/api.spec.ts` | El servidor armado de verdad: proxy, códigos HTTP, encabezados, formato de las server actions |
| **Funcionales** | 7 | `e2e/funcional.spec.ts` | La pantalla: mensajes de error, formas de cerrar formularios, doble clic, cierre por inactividad |
| **Humo (por navegador)** | 19 × 2 motores | `e2e/humo.spec.ts` | Cada sección carga, cada flujo principal anda, PDFs y gráficos, en Chromium y WebKit |
| **Defectos** | 6 | `e2e/defectos.spec.ts` | El comportamiento esperado donde hoy hay un defecto |

Los tipos de prueba que pide la consigna son **enfoques**, no carpetas. Cada uno aparece en varios niveles:

| Tipo | Qué es | Ejemplos (id → archivo) |
| --- | --- | --- |
| **Unit testing** | Una función sola, sin base ni pantalla | Validación del CUIT (`validacion.test.ts`); reparto FIFO de una venta entre lotes (`fifo.test.ts`); margen y cobertura de Estadísticas (`estadisticas/calculos.test.ts`) |
| **Integration testing** | Varias partes juntas con la base real | IT-D10: una venta queda guardada y descuenta stock, y la salida del lote apunta a la venta. IT-I03: la planilla importada encadena orden → lote → venta |
| **API testing** | Pedidos HTTP: métodos, parámetros, códigos, errores, sesión | API-01 a API-18 (`e2e/api.spec.ts`); inventario completo en [api.md](api.md) |
| **Functional testing** | Una funcionalidad completa como la usa la persona | Humo: «venta: aviso de stock con Guardar igual y alta»; FUN-06: doble clic guarda una sola venta |
| **Validation testing** | Campos obligatorios, formatos, rangos | FUN-01 (obligatorios), FUN-02 (CUIT), IT-D11 (9 datos inválidos de una venta), IT-A03 (usuario y contraseña), IT-C03 (datos del establecimiento) |
| **Negative testing** | Entradas que tienen que dar error | API-03 a API-08 (datos inválidos, sin sesión, cookie inventada, acción desconocida, cuerpo no JSON, id inexistente); IT-R03 (`../`, ruta absoluta); IT-I02 (importación malformada) |
| **Edge cases** | Bordes y situaciones poco habituales | Valores límite: 11/12 botellas, CUIT de 10/11/12 dígitos, usuario de 2/3/30/31 caracteres, 29/31 minutos de inactividad, 12 horas de sesión. Fechas: enero → diciembre del año anterior, 29 de febrero. Vender más de lo que hay (IT-D12). Importar dos veces el mismo archivo (IT-I04). Sin datos: el gráfico lo dice (Panel) |

### Técnicas de diseño usadas

- **Valores límite**: probar justo en el borde y a cada lado (29 / 31 minutos; 2, 3, 30 y 31 caracteres).
- **Partición de equivalencia**: un caso por cada clase de dato inválido, no todos los valores posibles (cantidad negativa, cero, texto).
- **Tablas de decisión**: severidad × probabilidad para clasificar defectos ([defectos.md](defectos.md)).
- **Patrón AAA** (Preparar / Ejecutar / Verificar): en las pruebas nuevas, los tres bloques están separados por una línea en blanco.
- **Pruebas de mutación manuales**: para comprobar que las pruebas detectan errores, se rompió el código a propósito y se volvió a correr (sección 6).

## 4. Herramientas

Se usaron las que **ya tenía el proyecto**. Lo único agregado son dos complementos de Vitest, de la misma versión:

| Herramienta | Para qué | ¿Nueva? |
| --- | --- | --- |
| **Vitest 4** | Unitarias e integración. Dos proyectos: `unit` e `integracion` | No |
| **@vitest/coverage-v8** | Porcentaje de cobertura e informe HTML por archivo | **Sí** (el complemento oficial de cobertura de Vitest) |
| **@vitest/ui** | Reporte HTML de los resultados | **Sí** (el reporte oficial de Vitest) |
| **Playwright 1.64** | Navegador (Chromium, WebKit, Firefox) y API por HTTP (`request`) | No |
| **better-sqlite3 + Prisma** | La misma base que usa la app, en una carpeta temporal | No |

No se usó Postman en las pruebas automáticas. La colección de la entrega sigue sirviendo para probar a mano, pero Playwright hace lo mismo desde el proyecto y sin instalar nada.

## 5. Entornos y datos de prueba (separados de los reales)

| Pruebas | Base de datos | Copias de seguridad | ¿Tocan `dev.db`? |
| --- | --- | --- | --- |
| Unitarias | Ninguna (datos en memoria) | — | No |
| Integración | Una base **nueva por archivo**, en la carpeta temporal del sistema, con las migraciones del proyecto (`pruebas/integracion/entorno.ts`). Se borra al terminar | En esa misma carpeta temporal | No |
| API, funcionales, humo y defectos | `e2e/.datos/e2e.db`, una **copia** de `dev.db` hecha al arrancar el servidor de pruebas (`e2e/preparar-base.mjs`) | `e2e/.datos/copias` | No |

- Las credenciales de las pruebas del navegador se leen de variables de entorno o de un archivo local ignorado por git (`e2e/credenciales.ts`). No están en el código.
- Las de integración se crean en la base temporal y desaparecen con ella.
- Se verificó que `dev.db` mantuvo la misma fecha de modificación después de correr todas las pruebas.

## 6. Cómo se comprobó que las pruebas detectan errores

Una prueba que nunca falla no demuestra nada. Por eso se rompió el código **a propósito**, se corrieron las pruebas y después se dejó todo como estaba (el resultado está en `reportes/evidencias/`):

| Cambio a propósito | Pruebas que lo detectaron |
| --- | --- |
| La sesión dura 45 minutos en vez de 30 (`lib/auth/reglas.ts`) | IT-A14 falló: «con 31 minutos sin uso vence» |
| `ejecutar` deja de controlar la sesión (`_datos/acciones.ts`) | IT-D01, IT-D02 y IT-D03 fallaron |

Además, las pruebas de defectos se escribieron **antes de mirar si pasaban**. Fallan por el motivo correcto: el reporte muestra lo esperado y lo obtenido. Por ejemplo, en DEF-02: esperado `qa.tester`, obtenido `Qa.Tester`.

## 7. Criterios

- **Para dar por buena una versión:** unitarias, integración, API, funcionales y humo, todas en verde. Las de defectos pueden fallar solo por defectos **documentados y aceptados**.
- **Un defecto nuevo** se documenta en [defectos.md](defectos.md) con una prueba en `e2e/defectos.spec.ts` antes de corregirlo. Cuando se corrige, esa prueba pasa y se mueve a `funcional.spec.ts`.
- **No se modifica una prueba para que pase.** Si falla, se corrige el código o se documenta el defecto. Cuando el error estaba en la prueba y no en la app, se corrigió cómo prueba, nunca qué verifica: el tiempo máximo de un test lento con la cobertura encendida (OBS-03), la sesión compartida (OBS-04) y escribir antes de que la página esté lista en WebKit (OBS-05). El detalle está en [reportes.md](reportes.md#durante-el-armado-de-las-pruebas).

## 8. Cómo se corren

Ver [README.md](README.md#cómo-correr-las-pruebas).
