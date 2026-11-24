# Guía de estudio del código

Para entender cómo está construida Licores Alquimia, poder explicarla, mantenerla y cambiarla sin romper otra cosa. Cada sección dice **qué archivo mirar**.

**Orden sugerido de lectura**
1. La idea general (sección 1).
2. Un recorrido completo: qué pasa cuando se guarda una venta (sección 5).
3. Las carpetas (sección 2).
4. El resto, según lo que haga falta.

---

## 1. La idea en un párrafo

Es una **aplicación web** (Next.js + React) que corre **en la PC del cliente** dentro de una ventana de escritorio (Electron), con una **base de datos SQLite**, que es un único archivo. No hay un servidor en internet: el «servidor» es un proceso que corre en la misma PC.

La lógica del negocio vive en **funciones puras**: reciben datos y devuelven datos, sin tocar la pantalla ni la base. La usan las dos puntas:
- la pantalla, para avisar errores antes de mandar;
- el servidor, para validar todo de nuevo antes de guardar.

Esa decisión es la que hace que la app sea fácil de probar.

```
┌──────────────────────── PC del cliente ────────────────────────┐
│  Ventana de Electron (escritorio/)                              │
│   └─ Navegador interno  ── muestra ──►  Pantallas React (.tsx)  │
│                                          │  llama a              │
│                                          ▼                      │
│   Servidor Next (mismo equipo) ◄── server actions (POST)        │
│    ├─ valida la sesión (lib/auth)                               │
│    ├─ aplica la regla del negocio (_dominio, funciones puras)   │
│    └─ guarda las diferencias (_datos/repositorio, Prisma)       │
│                                          │                      │
│                                          ▼                      │
│   alquimia.db (SQLite) + copias/ + drive.json                   │
└─────────────────────────────────────────────────────────────────┘
             │ copias de seguridad (opcional)
             ▼
        Google Drive del cliente
```

## 2. Estructura del proyecto

| Carpeta / archivo | Qué hay |
| --- | --- |
| `app/` | La aplicación Next: pantallas, lógica y server actions. Cada carpeta con `page.tsx` es una URL |
| `app/(acceso)/` | Login, primer arranque, código y recuperación de acceso. Los paréntesis agrupan sin cambiar la URL: `/login`, no `/acceso/login` |
| `app/(dashboard)/` | Todo lo que se ve con sesión iniciada: menú, panel y las secciones |
| `app/(dashboard)/_dominio/` | **Reglas del negocio**, puras: `reglas.ts` (validaciones), `acciones.ts` (qué hace cada cambio), `sync.ts` (cómo un cambio repercute en otras secciones), más el generador y el revisor de datos de prueba. El `_` hace que Next no la tome como URL |
| `app/(dashboard)/_datos/` | **Puente con la base**: `acciones.ts` (server actions que guardan), `repositorio.ts` (lee y escribe con Prisma), `importar.ts` (server action de la importación) |
| `app/(dashboard)/_importar/` | Lectura y análisis de la planilla de Excel (puro) |
| `app/(dashboard)/<sección>/` | Una carpeta por sección: `page.tsx` (la página), `<Sección>View.tsx` (la pantalla), `data.ts` (tipos y datos de ejemplo) y, si hace falta, sus formularios y PDFs |
| `app/components/data-table/` | Componentes compartidos: la tabla (`DataTable.tsx`), los formularios, el marco de los formularios (`ModalShell.tsx`), validadores (`validacion.ts`), kardex y PDFs |
| `app/api/` | Las dos rutas HTTP propias: descarga de copias y vuelta de Google Drive |
| `app/generated/prisma/` | Código **generado** por Prisma a partir del esquema. No se edita a mano |
| `lib/auth/` | Reglas del acceso (`reglas.ts`, puro) y sesiones (`sesion.ts`: cookie, base, vencimiento, bloqueo) |
| `lib/copias/` | Copias de seguridad locales, Google Drive y restauración |
| `lib/datos/` | Migraciones de la base sin la consola de Prisma (`migrar.ts`) y rutas de los archivos de datos (`rutas.ts`) |
| `lib/prisma.ts` | El cliente de la base (uno solo para toda la app) |
| `lib/arranque.ts`, `instrumentation.ts` | Lo que hace el servidor al arrancar: restauración pendiente, migraciones, copias automáticas |
| `proxy.ts` | Filtro de cada pedido: sin cookie de sesión, al login |
| `prisma/schema.prisma` | **El modelo de datos**: tablas, columnas y relaciones |
| `prisma/migrations/` | Los cambios de la base, en orden. Se aplican solos al arrancar |
| `prisma/seed.ts` | Carga datos de prueba (`npm run db:seed`) |
| `escritorio/` | La app de escritorio (Electron): abre la ventana, levanta el servidor, se actualiza sola |
| `e2e/` | Pruebas en el navegador y de API por HTTP (Playwright) |
| `pruebas/integracion/` | Pruebas de integración con base real (Vitest) |
| `docs/` | Manuales para el cliente y esta documentación de testing |
| `scripts/` | Empaquetado, íconos y `pruebas.mjs` (corre todas las pruebas y arma el resumen) |
| `spec.md` | Estado del proyecto y decisiones tomadas |

## 3. Secciones del sistema

| Sección (URL) | Responsabilidad | Archivos principales |
| --- | --- | --- |
| **Panel principal** (`/`) | Lo importante al entrar: ventas, stock, órdenes macerando, compras y alertas del mes | `page.tsx`, `_panel/PanelView.tsx`, `_panel/calculos.ts` |
| **Trazabilidad** (`/trazabilidad`) | Libro de compras de materia prima con su lote y comprobante. Rastreo de un lote de proveedor hasta los clientes, y ficha de un lote de licor | `TrazabilidadView.tsx`, `CompraFormModal.tsx`, `rastreo.ts`, `exportTrazabilidadPdf.ts` |
| **Operaciones** (`/operaciones`) | Ventas: cliente, producto, cantidad, precio. Remito en PDF y vendedores | `OperacionesView.tsx`, `OperacionFormModal.tsx`, `precio.ts`, `remito.ts` |
| **Productos terminados** (`/productos-terminados`) | Lotes de licor embotellado y su kardex (entradas, salidas, saldo) | `Productosterminadosview.tsx`, `EditLoteModal.tsx` |
| **Órdenes de producción** (`/ordenes-produccion`) | Cada elaboración: producto, insumos usados (de qué compra), maceración y embotellado | `OrdenesProduccionView.tsx`, `OrdenFormModal.tsx` |
| **Inventario de materia prima** (`/inventario-materia-prima`) | Stock de cada materia prima con kardex | `InventarioMateriaPrimaView.tsx` |
| **Materia prima / Productos / Proveedores / Clientes** | Catálogos | `<Sección>View.tsx` + `data.ts` |
| **Estadísticas** (`/estadisticas`) | Ventas, márgenes, producción, stock y compras por período, con gráficos y PDF | `calculos.ts`, `periodo.ts`, `secciones.ts`, `graficos.ts` |
| **Importar planilla** (`/importar`) | Pasar los datos del Excel del cliente a la app, sin duplicar | `ImportarView.tsx`, `_importar/*`, `_datos/importar.ts` |
| **Configuración** (`/configuracion`) | Datos del establecimiento (salen en los PDF), copias de seguridad, Google Drive, restaurar | `ConfiguracionView.tsx`, `configuracion/acciones.ts`, `lib/copias/*` |
| **Acceso** (`/login`, `/configuracion-inicial`, `/recuperar`, `/codigo-recuperacion`) | Cuenta única, login, código de recuperación | `app/(acceso)/*`, `lib/auth/*` |

### Cómo se conectan las secciones (la trazabilidad)

```
Compra de materia prima ──► Inventario de materia prima (entrada)
        ▲ compraId                     ▲ consumo
Orden de producción ───────────────────┘
        │ al embotellar
        ▼
Lote de producto terminado ◄── Venta (salida del lote, por FIFO)
```

Ese encadenamiento es lo que exige el registro PUPAA. Con él, de un lote de proveedor se llega a los clientes que recibieron el licor, y al revés. Está explicado en el comentario de `app/(dashboard)/store.tsx` y programado en `_dominio/sync.ts`.

## 4. Cómo funciona cada parte

### 4.1 Entrar a la app

1. `proxy.ts` mira si el pedido trae la cookie `alquimia_sesion`. Si no la trae, redirige a `/login`. Es un control rápido, sin leer la base.
2. `app/(dashboard)/layout.tsx` valida la sesión **de verdad** con `obtenerSesion()` (`lib/auth/sesion.ts`):
   - la cookie lleva un token al azar;
   - en la base se guarda su **hash SHA-256**, así una copia de la base no sirve para entrar;
   - la sesión vence a los 30 minutos sin uso o a las 12 horas.
3. Si la sesión es válida, el layout **lee todos los datos** (`cargarEstado`) y se los pasa a la pantalla (`StoreProvider`).

El login (`iniciarSesion` en `app/(acceso)/acciones.ts`):
- compara la contraseña con **bcrypt**;
- da el mismo mensaje si el usuario no existe, para no revelar qué usuarios hay;
- bloquea 15 minutos a los 5 fallos;
- guarda un hash del **código de recuperación**, que permite cambiar usuario y contraseña sin ayuda.

### 4.2 Las pantallas

Cada `page.tsx` es chico: el título y la «View». La View (`'use client'`) lee los datos con `useStore()` y arma una `DataTable` con columnas, búsqueda, orden, páginas, selección y ficha. Las altas y ediciones abren un formulario dentro de `ModalShell`.

Los formularios validan **mientras se escribe**, con las mismas funciones que el servidor (`_dominio/reglas.ts` y `components/data-table/validacion.ts`). El error aparece debajo de cada campo (`useErroresFormulario.ts`).

### 4.3 La lógica del negocio (`_dominio/`)

- **`reglas.ts`**: una función `validarX(valores, estado)` por formulario. Recibe **cualquier cosa** (lo que llega no es confiable) y devuelve el objeto limpio con solo los campos permitidos, o los errores por campo.
- **`acciones.ts`**: `aplicar(estado, accion)` devuelve el **estado nuevo** sin modificar el anterior, o lanza `ErrorNegocio` con un mensaje para el usuario. Hay 31 acciones: alta, edición y baja de cada cosa, más pagar compras.
- **`sync.ts`**: las repercusiones. Una compra suma al inventario; una orden consume insumos y, al embotellarse, crea un lote; una venta saca botellas de los lotes **por FIFO**, primero los más viejos (`asignarFifo`, `recalcularFifo`). Cada movimiento generado queda marcado con su origen (`origenOperacionId`, `origenOrdenId`, `origenCompraId`). Así se puede corregir o borrar en cascada sin duplicar.

### 4.4 La base de datos

`prisma/schema.prisma` define 18 modelos. Los principales:
- **Catálogos:** `Cliente`, `Proveedor`, `MateriaPrima`, `Producto`, `Vendedor`.
- **Movimientos:** `Compra`, `OrdenProduccion` (+ `OrdenInsumo`), `LoteTerminado` (+ `MovimientoLote`), `InventarioMateriaPrima` (+ `MovimientoInventario`), `Operacion` (ventas).
- **Acceso:** `Usuario`, `Sesion`, `IntentoFallido`.
- **Otros:** `Empresa` y `SubidaPlanilla` (historial de importaciones).

Las fechas se guardan como texto `AAAA-MM-DD`: se comparan como texto y no tienen problemas de zona horaria.

`_datos/repositorio.ts` convierte en las dos direcciones:
- `cargarEstado` lee todo y arma el `Estado` de la app;
- `guardarCambios(tx, antes, después)` compara los dos estados y escribe **solo las diferencias**, en orden para respetar las claves foráneas: primero las bajas, después altas y cambios.

### 4.5 Arranque, copias y escritorio

- `instrumentation.ts` → `lib/arranque.ts`, antes de atender pedidos:
  - si se pidió restaurar una copia, la pone en lugar de la base;
  - aplica las migraciones pendientes (`lib/datos/migrar.ts`), con una copia previa si la base tenía datos;
  - arranca las copias automáticas.
- `lib/copias/local.ts`: la copia se hace con `VACUUM INTO` y se verifica con `PRAGMA integrity_check` antes de quedar con su nombre definitivo. Restaurar no reemplaza la base abierta: la deja como `restaurar-pendiente.db` y se aplica al reiniciar.
- `lib/copias/drive.ts`: sube las copias comprimidas a una carpeta propia en Google Drive, con el permiso mínimo `drive.file`.
- `escritorio/src/main.ts` (Electron): levanta el servidor con un Node propio y muestra la app en su ventana. Además:
  - guarda los datos en la carpeta del usuario;
  - pide una copia al cerrar;
  - se actualiza desde GitHub.

## 5. Procesos principales, paso a paso

### 5.1 Guardar una venta (el recorrido completo)

1. **Pantalla** (`operaciones/OperacionFormModal.tsx`):
   - la persona completa el formulario y cada campo se valida al salir;
   - al tocar **Guardar**, si la cantidad supera el stock, avisa y pide «Guardar igual» (`faltanteDeVenta`);
   - el botón se desactiva mientras guarda, para que un doble clic no mande dos veces.
2. **Store** (`app/(dashboard)/store.tsx`): llama a la server action `ejecutar({ tipo: "addOperacion", v: {…} })`.
3. **Next** convierte esa llamada en un `POST /operaciones` con el encabezado `Next-Action` (ver `docs/testing/api.md`).
4. **Proxy** (`proxy.ts`): hay cookie, sigue.
5. **Server action** (`_datos/acciones.ts → ejecutar`):
   - `obtenerSesion()`: si no es válida, responde `{ ok: false, sinSesion: true }` y la pantalla vuelve al login;
   - `esAccion()`: si no tiene forma de acción, responde «Acción desconocida.»;
   - abre una **transacción**: `cargarEstado` → `aplicar(antes, acción)` → `guardarCambios(antes, después)` → `cargarEstado`.
6. **Dominio** (`_dominio/acciones.ts → aplicar → case "addOperacion"`):
   - `validarOperacion` (`reglas.ts`): fecha real, cliente y producto existentes, cantidad > 0, canal y condición de la lista, precio válido;
   - calcula el subtotal en el servidor, así no importa lo que mande la pantalla;
   - `recalcularFifo` (`sync.ts`) reparte la venta entre los lotes y genera las salidas.
7. **Repositorio**: inserta la venta y las salidas de los lotes.
8. **Respuesta**: `{ ok: true, estado }`. El store reemplaza su estado y la tabla se actualiza.
9. **Si algo falla**:
   - un error de negocio vuelve con `campo` y se muestra debajo de ese campo;
   - un error de la base deshace la transacción entera y no queda nada a medias.

### 5.2 Embotellar una orden

`saveOrden` con `fechaEmbotellado` → `syncLoteParaOrden` crea (o actualiza) el lote con la cantidad producida y el costo unitario de la orden. Si había ventas de ese producto anteriores sin stock, `recalcularFifo` las reasigna al lote nuevo.

### 5.3 Importar la planilla

1. **En el navegador**:
   - `_importar/leer.ts` lee el Excel o CSV;
   - `detectar.ts` encuentra las tablas y adivina la sección de cada una;
   - `extraer.ts` saca los registros normalizados.
2. Se manda **la extracción**, no el archivo, a `importarPlanilla` (`_datos/importar.ts`).
3. **En el servidor**:
   - `leerEntrada` revisa la forma;
   - `planificar` vuelve a aplicar cada registro con `aplicar()`, partiendo de lo que ya hay. Lo que ya está se reconoce y no se duplica;
   - si hay algo nuevo y la base tenía datos, hace una copia de seguridad;
   - guarda todo en una transacción;
   - anota el resultado en el historial.

### 5.4 Copia de seguridad y restauración

- **Copia manual:** `copiarAhora` → `hacerCopia("manual")` → rotación de las viejas (`rotarCopias`) → subida a Drive en segundo plano.
- **Restaurar:** `restaurarArchivo`, `restaurarLocal` o `restaurarDrive` → `prepararRestauracion`. La copia se verifica, se hace una copia de lo actual y queda pendiente hasta reiniciar la app.

## 6. Flujo de datos

```
LECTURA (al entrar o recargar)
  Base ──Prisma──► repositorio.cargarEstado ──► layout.tsx ──props──► StoreProvider ──useStore()──► Views

ESCRITURA (cada cambio)
  View ──► store.run(acción) ──server action──► ejecutar ──► aplicar (puro) ──► guardarCambios ──► Base
       ◄──────────── { ok, estado actualizado } ◄─────────────────────────────────────────┘
```

- **La pantalla nunca escribe directo en la base**. Todo cambio pasa por `ejecutar` o por las acciones de acceso, configuración e importación.
- **El servidor no confía en la pantalla**: vuelve a validar y recalcula, con las mismas reglas.
- **Todo el estado viaja completo** después de cada cambio. Es simple y alcanza para el volumen de un elaborador artesanal (miles de registros, una persona usando la app).

## 7. APIs

Están documentadas, con los casos probados, en **[api.md](api.md)**. En resumen:

| Punto de entrada | Método | Autenticación | Para qué |
| --- | --- | --- | --- |
| `/api/copias/[nombre]` | GET | Sesión | Descargar una copia |
| `/api/drive/callback` | GET | Pública (`state` de un solo uso) | Vuelta de Google al conectar Drive |
| `ejecutar` / `ejecutarVarios` | POST + `Next-Action` | Sesión | Todos los cambios de datos |
| `crearCuentaInicial`, `iniciarSesion`, `recuperarAcceso`, `cerrarSesion`, `mantenerSesion`, `confirmarCodigoGuardado` | POST + `Next-Action` | Públicas, con validación propia | Acceso |
| `guardarEmpresa`, `copiarAhora`, `restaurar*`, `conectarDrive`… | POST + `Next-Action` | Sesión | Configuración |
| `importarPlanilla`, `registrarSubida` | POST + `Next-Action` | Sesión | Importación |

## 8. Testing

Está explicado en **[estrategia.md](estrategia.md)**. En corto:

| Tipo | Herramienta | Dónde | Qué verifica |
| --- | --- | --- | --- |
| Unitarias | Vitest | `*.test.ts` al lado del código | Cada regla, cálculo y validador, sin base ni pantalla |
| Integración | Vitest + SQLite temporal | `pruebas/integracion/` | Server action → regla → base: qué queda guardado |
| API | Playwright (`request`) | `e2e/api.spec.ts` | Códigos HTTP, encabezados, sesión, datos inválidos |
| Funcionales | Playwright | `e2e/funcional.spec.ts`, `e2e/humo.spec.ts` | Flujos completos en el navegador |
| Defectos | Playwright | `e2e/defectos.spec.ts` | El comportamiento esperado donde hoy hay un defecto |

**Por qué es fácil de probar.** Las reglas son funciones puras: se les da un estado y una acción, y se mira el resultado. Por eso hay cientos de pruebas unitarias que corren en segundos. Las de integración solo agregan la base real, y las del navegador, la pantalla.

## 9. Cómo hacer cambios sin romper el resto

| Quiero… | Dónde | Cuidado con | Qué prueba lo cubre |
| --- | --- | --- | --- |
| Cambiar una validación (ej. el largo de la razón social) | `_dominio/reglas.ts` o `components/data-table/validacion.ts` | Corre en la pantalla **y** en el servidor: un solo cambio alcanza para los dos | `_dominio/acciones.test.ts`, `validacion.test.ts` |
| Agregar un campo a una tabla | 1) `prisma/schema.prisma` 2) `npx prisma migrate dev --name <nombre>` (crea la migración) 3) el tipo en `<sección>/data.ts` 4) `repositorio.ts` (lectura y `fila…`) 5) `reglas.ts` 6) las columnas de la View | La migración se aplica sola en las PCs de los clientes al actualizar: no borrar migraciones viejas | `lib/datos/migrar.test.ts`, integración |
| Cambiar cómo una venta descuenta stock | `_dominio/sync.ts` (`asignarFifo`, `recalcularFifo`) | Afecta stock, costos de Estadísticas y la trazabilidad | `fifo.test.ts`, IT-D10 a IT-D14 |
| Agregar una acción nueva | El tipo en `Accion` y un `case` en `aplicar` (`_dominio/acciones.ts`), y la función en `store.tsx` | Validar con una función de `reglas.ts`; nunca guardar lo que llega sin limpiar | Unitaria nueva en `acciones.test.ts` + integración |
| Cambiar cómo se cierran los formularios (DEF-01, DEF-05) | `components/data-table/ModalShell.tsx` | Lo usan todos los formularios | `e2e/defectos.spec.ts` DEF-01 y DEF-05, `e2e/funcional.spec.ts` FUN-04 y FUN-05 |
| Cambiar la duración de la sesión | `lib/auth/reglas.ts` (`INACTIVIDAD_MIN`) | Lo usan el servidor y `ControlInactividad.tsx` | IT-A13 a IT-A15, FUN-07 |
| Un estilo (colores, tamaños) | `app/globals.css` | Clases con prefijo por componente (`rf-` formularios, `dt-` tablas, `pp-` panel) | `e2e/tamanos.spec.ts` (pantallas en varios tamaños) |
| Un PDF | `export…Pdf.ts` de cada sección y `components/data-table/pdf*.ts` | Corren en el navegador (jsPDF) | `e2e/humo.spec.ts` (descarga y valida los PDF) |

**Regla práctica:** después de cualquier cambio, `npm test` (unitarias + integración, unos 20 segundos). Si tocaste pantallas, también `npm run test:funcional`. Antes de entregar, `npm run test:todo`.

## 10. Decisiones técnicas que conviene saber defender

- **SQLite en la PC, sin servidor en internet.** Un solo usuario, sin abono mensual, funciona sin conexión. Los datos se protegen con copias automáticas locales y en Drive.
- **Reglas puras compartidas entre pantalla y servidor.** No hay dos versiones de la misma validación, y se pueden probar sin levantar nada.
- **Las server actions son públicas.** Cualquiera puede llamarlas con un `POST`. Por eso cada una valida la sesión y revalida los datos. Las pruebas de API lo demuestran mandando datos que la pantalla nunca mandaría.
- **Token de sesión con hash.** La cookie sola no sirve si alguien copia la base, e inventar una cookie no sirve (API-05, API-11).
- **Transacción por cambio.** Una venta y su descuento de stock se guardan juntos o no se guarda nada (IT-D11).
- **Migraciones propias.** En la PC del cliente no está la consola de Prisma: la app aplica sus migraciones al arrancar y hace una copia antes.
