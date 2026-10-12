# Licores Alquimia — Spec de lo que falta

> Documento vivo para retomar el trabajo sin historial de chat. Leerlo completo
> antes de empezar cualquier tarea. Actualizar el estado (☐ / ◐ / ☑) al cerrar cada fase.

## 1. Reglas de trabajo (obligatorias)
- **Una fase por vez.** Implementar → testear en el navegador → corregir → mostrarle el
  resultado al usuario → **esperar sus instrucciones** antes de pasar a la siguiente.
  Nunca encadenar fases por cuenta propia.
- **Nada de commits ni push** salvo pedido explícito. El usuario commitea y pushea a mano;
  cuando lo pida, darle el texto del commit (formato `git commit -m "tipo: ..."` con lista
  de cambios, terminando con la línea `Co-Authored-By`).
- Idioma: español rioplatense, en la UI y al hablar con el usuario.
- Next.js 16 (Turbopack) tiene cambios respecto de lo conocido: antes de usar una API de
  Next, leer la guía en `node_modules/next/dist/docs/` (ver `AGENTS.md`).
- **Todos los datos de la app son de prueba**, incluidos los que pasó el cliente (nombres
  de proveedores, lotes, comprobantes). Se pueden reemplazar o ampliar libremente con
  datos **falsos pero coherentes**: personas, empresas, CUIT con formato válido, ventas,
  compras y operaciones que parezcan reales y respeten la lógica del negocio (fechas en
  orden, trazabilidad compra → orden → lote → venta, FIFO, stock que cierra).
- Pendientes para confirmar con el cliente (no bloquean, pero preguntarlos cuando toque):
  qué significan los medios de pago **MPR** y **MPA**; datos del establecimiento para los
  PDF (razón social, CUIT, domicilio, N° PUPAA, N° REBA → `app/empresa.ts`); si el
  proveedor debe ser obligatorio en el Libro de compras.

## 2. Estado actual (al 06/10/2026, rama `main`)
App local para un elaborador artesanal de licores (Prov. de Buenos Aires, registro PUPAA
+ REBA). Next.js 16.3 + React 19 + TypeScript. Secciones terminadas y mergeadas:
Clientes, Proveedores, Materia prima, Productos, Operaciones (ventas), Órdenes de
producción, Productos terminados (kardex por lote), Inventario de materia prima (kardex),
Trazabilidad (Libro de compras + rastreo de lotes + ficha PUPAA), Estadísticas (6
pantallas con ECharts + PDF).

Arquitectura clave:
- **Todos los datos viven en memoria** en `app/(dashboard)/store.tsx` (`useStore()`), con
  datos de demo en cada `*/data.ts`. Se pierden al recargar.
- Las automatizaciones entre secciones son **funciones puras** en `store.tsx`
  (`syncEntradaParaCompra`, `syncConsumosParaOrden`, `syncLoteParaOrden`,
  `syncSalidaParaOperacion` FIFO entre lotes, `usadoDeCompra`) + guardas al borrar.
  Cadena: Compra → Inventario MP ← consumo ← Orden (insumo con `compraId`) → Lote →
  ← Venta (salida tageada `origenOperacionId`).
- Componentes genéricos: `app/components/data-table/*` (DataTable con columnas
  agrupadas y `rowActions`, modales, `LineItemsField`, `kardex.ts`, `exportPdf.ts`).
- Estadísticas: `app/(dashboard)/estadisticas/*` (cálculos puros en `calculos.ts`,
  pantallas como bloques en `secciones.ts`, PDF en `exportEstadisticasPdf.ts`).
- Prisma 7 + SQLite (`dev.db`, `lib/prisma.ts`) existe pero **solo se usa para
  usuarios/login**; el `schema.prisma` actual está desactualizado respecto del modelo real.
- Login (Fase 3): cuenta única con sesión guardada en la base, código de recuperación y
  cierre por inactividad (`lib/auth/`, `app/(acceso)/`, `proxy.ts`).
- Dependencia `xlsx` (SheetJS) ya instalada → para la migración desde Excel.

Particularidades del entorno de pruebas:
- Usuarios en la base de desarrollo (12/10/2026 se borraron los demás): `tadeoqa` (el del
  usuario; la contraseña la tiene él) y, para los recorridos automáticos de Claude, `claude_qa`, con la contraseña en `.claude/qa-usuario.local`
  (ignorado por git).
- En el panel del navegador de Claude, entrar a una página por recarga directa a veces
  queda en "Cargando…" (el panel oculto no pinta y React no revela el Suspense): navegar
  a otra sección y volver con un clic. Las descargas aparecen en `C:\Users\patan\Downloads`.
- Si el dev server del usuario no toma un cambio, hacer `touch` del archivo y refrescar
  la caché del navegador.

## 3. Plan por fases (en orden de prioridad)

### Fase 1 — Panel principal ☑ (aprobada por el usuario)
Hoy es un placeholder (`app/(dashboard)/page.tsx`, título "Dashboard"). El cliente tiene que
ver lo importante del día apenas entra y poder saltar desde cualquier dato a su sección de la
sidebar. Estética de Estadísticas (fondo crema, tarjetas blancas, naranja solo para acentos),
limpia, sin huecos en la grilla.

Problema detectado: los datos de demo terminan el 08/09/2026 y no hay órdenes macerando →
hoy el panel saldría casi vacío. Se amplían un poco los datos (paso 6).

**Diseño** (grilla de 12 columnas, mismas clases `es-grid` / `es-bloque`):
```
┌───────────────────────────────────────────────────────────────────────────┐
│ Buenas tardes, test_qa                    [+ Nueva venta][+ Compra][+ Orden]│
│ Martes 6 de octubre de 2026 · 17:42                                        │
├───────────────────────────────────────────────────────────────────────────┤
│ VENTAS DEL MES │ UNIDADES │ BOTELLAS EN STOCK │ MACERANDO │ COMPRAS │ ALERTAS│  ← tira (clickeable)
├──────────────────────────────────────────────┬────────────────────────────┤
│ Ventas de las últimas 12 semanas  Ver más ›  │ Alertas (n)                 │
├───────────────┬───────────────┬──────────────┴────────────────────────────┤
│ Últimas ventas│ Últimas compras│ Producción en curso                       │
└───────────────┴───────────────┴───────────────────────────────────────────┘
```
- **Encabezado** (franja sin tarjeta): "Buen día / Buenas tardes / Buenas noches, {usuario}",
  fecha larga es-AR + hora en vivo (cada 30 s). A la derecha 3 accesos rápidos
  (`rf-trigger-btn` el principal, `tz-secondary-btn` los otros) que abren el formulario de
  alta en Operaciones / Trazabilidad / Órdenes.
- **Tira de indicadores** (componente `Kpis` de Estadísticas, 6 celdas clickeables):
  Ventas del mes (delta vs. mismo tramo del mes anterior + sparkline diaria → `/operaciones`) ·
  Unidades vendidas del mes (→ `/operaciones`) · Botellas en stock (nota "N lotes", mini barra
  por producto → `/productos-terminados`) · Órdenes macerando (nota: días de la más antigua →
  `/ordenes-produccion`) · Compras del mes (→ `/trazabilidad`) · Alertas (mini barra
  crítico/aviso/info → `/estadisticas?seccion=stock`).
- **Gráfico** (span 8): facturación por semana, últimas 12 semanas (`barras`, serie naranja),
  link "Ver estadísticas ›" → `/estadisticas?seccion=ventas`.
- **Alertas** (span 4): `construirAlertas()` tal cual, máx. 6, con sus `Destino`. Misma altura
  que el gráfico.
- **3 listas** (span 4 c/u, misma altura, 5 ítems, "Ver todas ›" y filas clickeables):
  Últimas ventas (fecha, cliente, producto corto × cant., subtotal → `/operaciones`) ·
  Últimas compras (fecha, materia prima, proveedor, total → `/trazabilidad`) ·
  Producción en curso (macerando "día N" + últimas embotelladas → `/ordenes-produccion`).
- Responsive: <1100 px todo a span 12 (regla existente); la tira reparte columnas sola.
  Colores: solo tokens actuales (verde/rojo/ámbar únicamente en deltas y alertas).

**Implementación:**
1. Extraer `Kpis`, `Sparkline`, `MiniBarra`, `Alertas` de `EstadisticasView.tsx` a
   `estadisticas/Indicadores.tsx`; Estadísticas los importa (sin cambio visual).
2. `app/(dashboard)/_panel/calculos.ts`: función pura `construirPanel(datos)` reusando
   `ventasEn`, `resumenVentas`, `porBucket`, `stockLotes`, `enMaceracion`, `comprasEn`,
   `sumarPor` (calculos.ts), `resolverPeriodo`, `buckets`, `sumarDias`, `diasEntre`
   (periodo.ts), `construirAlertas`, `nombreCorto`, `delta` (exportarlo de secciones.ts),
   `barras`, `COLOR`, `PALETA` (graficos.ts), `fmtMoneda`, `fmtNumero` (formato.ts).
3. `app/(dashboard)/_panel/PanelView.tsx` ("use client"): arma `Datos` desde `useStore()`
   como `EstadisticasView`, usa `Grafico`/`Kpis`/`Alertas`, navega con `router.push`.
   Reloj/saludo con `useSyncExternalStore` (snapshot de servidor `null`: sin desajuste de
   hidratación ni setState en effect).
4. `page.tsx`: topbar "Panel principal", `metadata = { title: "Panel principal" }`, pasa el
   usuario a la vista. Helper `leerSesion()` en `app/(dashboard)/sesion.ts` (lo usan
   `layout.tsx` y la página).
5. Accesos "+ Nueva …" → `/operaciones?nuevo=1`, `/trazabilidad?nuevo=1`,
   `/ordenes-produccion?nuevo=1`; esas vistas leen `useSearchParams()`, abren el modal con
   `target="new"` y limpian el parámetro con `router.replace`. Sus `page.tsx` envuelven la
   vista en `<Suspense>`.
6. Ampliar datos de demo (coherentes; el store los sincroniza al iniciar, FIFO incluido):
   ~8 ventas 15/09–05/10 sin superar el stock de los lotes; 1–2 compras de fines de
   septiembre; 1–2 órdenes macerando (~20/09 y ~01/10) con insumos de compras con saldo
   (`compraId`). Verificar que no aparezcan alertas de stock negativo.
7. `app/layout.tsx`: `title: { default: "Licores Alquimia", template: "%s · Licores Alquimia" }`,
   descripción en español, `lang="es"`.
8. CSS `.pp-*` en `globals.css` después de `.es-*`: saludo 20 px bold, fecha/hora muted,
   listas compactas con divisoria fina y hover `#FCF8F2` + borde naranja izquierdo, link
   "Ver todas ›" chico en naranja, `gap: 14px`.

**Test:** verificación estándar (§4) + saludo con el nombre y hora que avanza; Ventas del mes
= Estadísticas "Este mes"; clic en cada celda, alerta, "Ver todas", fila y "+ Nueva …" (abre el
modal correcto); `<title>` = "Panel principal · Licores Alquimia"; 1024/1366/1440/1920 px sin
huecos ni scroll horizontal; Estadísticas sin cambios tras la extracción.

### Fase 2 — Base de datos real ☑ (aprobada por el usuario)
- Rediseñar `prisma/schema.prisma` espejando los tipos reales de cada `*/data.ts`
  (Cliente, Proveedor, MateriaPrima, Producto, Operacion, OrdenProduccion + OrdenInsumo,
  LoteTerminado + Movimiento, InventarioMP + Movimiento, Compra, Usuario) con FKs e
  índices. Nueva migración.
- Capa de datos en el servidor (route handlers o server actions — revisar docs de Next 16)
  que ejecute las **mismas funciones puras de sync** dentro de transacciones Prisma, para
  no reescribir la lógica de negocio.
- `store.tsx` pasa a leer/escribir contra esa capa manteniendo **la misma interfaz
  `useStore()`** (las vistas no deberían cambiar).
- Script de seed con los datos de prueba actuales (en la Fase 6 se reemplazan por datos
  falsos más completos).
- Test: cada sección CRUD + automatizaciones (compra→inventario, orden→consumos/lote,
  venta FIFO, guardas de borrado) y que todo persista al recargar/reiniciar.

**Cómo quedó** (para retomar):
- Esquema en `prisma/schema.prisma` + migración `20261008120000_modelo_completo` (Usuario no
  cambia). Fechas como texto `YYYY-MM-DD`, cantidades Float, ids de negocio explícitos,
  movimientos de kardex con clave compuesta (lote/materia + N° de movimiento).
- Lógica pura en `app/(dashboard)/_dominio/`: `sync.ts` (sincronizaciones), `acciones.ts`
  (`aplicar(estado, accion)` con todas las validaciones y guardas), `demo.ts` (datos de prueba).
- Servidor en `app/(dashboard)/_datos/`: `repositorio.ts` (`cargarEstado` / `guardarCambios`,
  que escribe solo las diferencias) y `acciones.ts` (server action `ejecutar`, en transacción).
- `store.tsx` recibe el estado inicial del layout y manda cada cambio a `ejecutar`; las
  funciones de `useStore()` ahora devuelven promesas (errores con mensaje para el usuario).
- Nombres de cliente/producto en ventas, órdenes y lotes se derivan del catálogo al leer.
- `npm run db:migrate` y `npm run db:seed` (`-- --reemplazar` si ya hay datos); no tocan usuarios.
- Probado: 33 acciones automáticas (base = lógica en cada una) + recorrido en el navegador de
  todas las secciones (altas, ediciones, bajas, guardas, FIFO, consumos, lote al embotellar,
  rastreo, renombres, persistencia al recargar). Datos de prueba limpiados: base = demo.

### Fase 3 — Rework del login ☑ (aprobada por el usuario)
Seguro pero simple: **una sola cuenta en una sola PC** (la usa únicamente el cliente) para
proteger los datos en la computadora. Sin registro público, sin roles ni pantalla de usuarios
(decisión del usuario, 12/10/2026).
- **Primer arranque**: si no hay ninguna cuenta, la app pide crear usuario + contraseña.
- **Código de recuperación** de 7 caracteres (mezcla minúsculas, mayúsculas y números). Se
  muestra **una sola vez** al entrar por primera vez, con botón Copiar y el aviso de que es muy
  importante guardarlo; hay que tildar "Ya lo anoté" para seguir. Sirve para recuperar el
  usuario y/o la contraseña; al usarlo se genera uno nuevo y el anterior deja de servir.
- Sesión con token al azar en cookie httpOnly (en la base solo su SHA-256), vence a los
  **15 minutos sin uso** (la pantalla vuelve sola al login) o a las 12 h; "Cerrar sesión" la
  borra de la base.
- Reglas mínimas: usuario 3–30 caracteres (letras, números, `.` `_` `-`); contraseña ≥ 8 con
  al menos una letra y un número. Bloqueo de 15 min tras 5 intentos fallidos (login o código).
- Sin pantalla "Mi cuenta" (el usuario la pidió sacar): el pie de la sidebar muestra solo el
  nombre de usuario (grande, naranja) y "Cerrar sesión". Cambiar usuario o contraseña se hace
  con "¿Olvidaste tu usuario o contraseña?" + el código de recuperación.
- `middleware.ts` → `proxy.ts`; la sesión se valida contra la base en el layout, el login y
  cada server action.

**Cómo quedó** (para retomar):
- Migración `20261012120000_login_cuenta_unica`: `Usuario` pierde `nombre` y `rol` y gana
  `codigoRecuperacionHash` (bcrypt) y `codigoPendiente` (texto plano solo hasta que confirma
  que lo guardó, así recargar no lo pierde); tablas `Sesion` e `IntentoFallido`. Los usuarios
  viejos conservan usuario y contraseña; como no tenían código, se les genera en el próximo
  ingreso y ven la pantalla del código.
- `lib/auth/reglas.ts`: constantes y validadores puros (los usan formularios y servidor).
  `lib/auth/sesion.ts`: crear/obtener/cerrar sesión, códigos, bloqueo por intentos.
  `SESION_INACTIVIDAD_MIN` en `.env` cambia los 15 min (solo para pruebas).
- Pantallas en `app/(acceso)/`: `/login`, `/configuracion-inicial`, `/codigo-recuperacion`,
  `/recuperar` (server actions en `acciones.ts`).
- `ControlInactividad.tsx` en el layout del dashboard: cuenta la actividad (compartida entre
  pestañas), mantiene viva la sesión y, al vencer, la cierra y hace una navegación completa al
  login (no queda nada en memoria).
- `proxy.ts` solo mira si existe la cookie (recomendación de Next 16: sin base en Proxy).
- Se borraron `/registro`, `app/api/{login,logout,register}` y `app/(dashboard)/sesion.ts`.
- Si una acción encuentra la sesión vencida (`sinSesion` en `ejecutar`), la
  pantalla va directo al login.
- `lib/prisma.ts` guarda en `globalThis` también la clase del cliente: después de una
  migración + `prisma generate` el dev server toma el cliente nuevo sin reiniciarse (antes
  seguía con el viejo y fallaba con "Cannot read properties of undefined").
- Probado (build de producción en :3001): sin cookie / cookie inventada / cookie vieja JSON →
  login; guardar con la sesión vencida se rechaza y no escribe; cierre por inactividad (con
  `SESION_INACTIVIDAD_MIN=1`); bloqueo a los 5 fallos aun con la contraseña correcta; código
  (Copiar, casilla obligatoria, persiste al recargar, secciones redirigen a él mientras está
  pendiente); recuperar (código mal/bien, reglas, código nuevo e invalidación del viejo);
  cerrar sesión + Atrás; primer arranque con la
  tabla de usuarios vacía (después se restauraron los usuarios). La contraseña y el código
  de `claude_qa` cambiaron: están en `.claude/qa-usuario.local`.

### Fase 4 — Validación de datos en los formularios ☐
Va antes del importador de Excel (que reusa los mismos validadores) y completa la seguridad
de la Fase 3: las server actions son públicas, así que el servidor tiene que revalidar todo.
- Inventario de todos los formularios: genéricos `RecordFormModal` / `EditRecordModal`
  (Clientes, Proveedores, Materia prima, Productos, configurados por columnas en
  `app/components/data-table/types.ts`), `OperacionFormModal`, `OrdenFormModal` (+ líneas
  de insumos), `CompraFormModal`, modales de Inventario (alta, movimiento, edición) y de
  Productos terminados (movimiento, edición de lote) y las pantallas de acceso (login,
  configuración inicial, recuperar: ya validan con `lib/auth/reglas.ts`).
- Reglas por tipo de dato: números sin negativos ni vacíos que se vuelvan 0; enteros donde
  la unidad lo pide (botellas, unidades); montos > 0 y con 2 decimales como máximo; fechas
  reales y en rangos lógicos (no futuras en ventas/compras, embotellado ≥ maceración,
  vencimiento > embotellado); textos sin espacios sobrantes, obligatorios no vacíos y con
  largo máximo; CUIT/CUIL con formato y dígito verificador; email; teléfono; CBU (22
  dígitos + verificador) y alias; código de barras con caracteres válidos para CODE39;
  N° de comprobante (ya existe).
- Reglas de negocio: salida manual ≤ saldo del lote/materia prima; insumo ≤ disponible de
  su compra; aviso si una venta supera el stock del producto; no duplicar CUIT ni nombres
  de materia prima/producto+formato; listas cerradas solo con sus valores.
- Cómo se muestra: texto chico en rojo debajo del campo con qué está mal y cómo
  corregirlo (ej. "Ingresá una cantidad mayor a 0, por ejemplo 12"). Se valida al salir
  del campo y al guardar; el foco va al primer error. Los inputs impiden lo imposible desde
  el vamos (`min`, `step`, `inputMode`, `maxLength`, sin letras en campos numéricos).
- Cómo se arma: validadores puros compartidos (un módulo nuevo junto a
  `app/components/data-table/format.ts`). Los usan los formularios **y** el servidor en
  `_dominio/acciones.ts`, que rechaza con `ErrorNegocio` cualquier dato inválido aunque
  no venga de la pantalla.
- Incluye arreglar en Clientes que dejar vacío "Precio Premium" lo guarda como 0 en vez de
  "sin precio" (los formularios genéricos convierten los números vacíos en 0).
- Test: por formulario, una lista de entradas inválidas (negativos, letras, fechas
  imposibles, campos vacíos, valores fuera de la lógica): cada una muestra su mensaje y no
  guarda nada; las mismas, mandadas directo a la server action, se rechazan.

### Fase 5 — Migración de datos desde Excel ☐
Requiere el archivo Excel del cliente (pedírselo al usuario). Su contenido actual también
es de prueba: se usa para validar la estructura de hojas/columnas y el importador; al
entregar, el cliente lo usará con su planilla real.
- Pantalla "Importar Excel" (activar el botón que hoy está deshabilitado en DataTable):
  subir el .xlsx, mapear hojas → secciones, **vista previa con validación** (errores por
  fila, duplicados, referencias faltantes) usando los mismos validadores de la Fase 4,
  confirmar e importar en una transacción.
- Orden de importación por dependencias: catálogos → compras → órdenes → lotes → ventas.
- Reporte final de lo importado y lo rechazado. Idempotente (no duplica si se reimporta).
- Test: con el Excel del cliente; cotejar totales contra la planilla.

### Fase 6 — Inyección de datos falsos + testeo general ☐
- Script que genera datos falsos pero coherentes y realistas (varios meses de operación:
  clientes y proveedores con nombres/CUIT/contactos verosímiles, compras con comprobantes,
  órdenes, lotes, ventas con estacionalidad), respetando la cadena de trazabilidad, FIFO
  y que los saldos cierren. Reemplaza los datos de demo actuales (que también son de
  prueba). Que se pueda volver a correr para regenerar una DB de prueba limpia. Todo lo
  generado tiene que pasar los validadores de la Fase 4.
- Testeo de punta a punta de todas las secciones, PDFs, estadísticas con comparaciones,
  rendimiento con volumen.

### Fase 7 — Pantallas horizontales y navegadores ☐
Va después de tener datos falsos con volumen, nombres largos y montos grandes (lo que más
rompe el layout) y antes de las correcciones estéticas.

**Pantallas** (todas horizontales, con los datos de la Fase 6):
- Tamaños: 1024×768, 1280×720/800, 1366×768 (la notebook más común), 1440×900,
  1536×864 (Windows al 125 %), 1600×900, 1920×1080, 2560×1440 y ultrawide 3440×1440;
  en Mac, los tamaños por defecto de las MacBook (1440×900, 1470×956, 1512×982,
  1728×1117) con pantalla Retina. Además, escalado de Windows 100/125/150 % y zoom del
  navegador del 80 al 150 %.
- Qué revisar en cada sección, modal y en el panel: tablas (anchos de columna, textos
  largos cortados con tooltip, scroll horizontal solo dentro de la tabla), tira de
  indicadores, gráficos (ejes, leyendas, etiquetas de datos y donas sin superponerse),
  grillas sin huecos, barras de herramientas que bajan de línea bien, sidebar, y modales
  que entran en pantallas bajas (scroll interno). En ultrawide, decidir ancho máximo o más
  columnas para que nada quede estirado.
- Resultado: una matriz sección × tamaño en este spec con lo verificado y lo corregido
  (CSS con container queries/`minmax`/`clamp` y ajustes de las opciones de ECharts en
  `estadisticas/graficos.ts`).

**Navegadores** (uso local en Windows y Mac):
- Motores a cubrir: Chromium (Chrome, Edge, Brave, Opera, Vivaldi), Gecko (Firefox) y
  WebKit (Safari en Mac).
- Puntos de riesgo: inputs de fecha y número (Firefox deja escribir letras en
  `type=number`), soporte de CSS (container queries, `:has`), descargas de PDF, gráficos en
  canvas, cookie de sesión en `localhost` en el build de producción, y que nada dependa de
  internet al correr (fuentes y librerías servidas localmente). En Safari: selector de
  fechas, descargas de PDF (bloqueo de ventanas emergentes) y scroll dentro de modales.
- Cómo se prueba: suite de humo automatizada con Playwright en Chromium, Firefox y WebKit
  (login, cada sección, un alta/edición/baja, un PDF), más un checklist manual corto para
  que el usuario lo corra en los navegadores de marca (Edge, Brave, Opera) y en Safari en
  una Mac real (Claude no puede manejar una Mac: hace falta acceso a una).
- Definir versiones mínimas soportadas y anotarlas en el README de la entrega.

### Fase 8 — Correcciones menores y estética ☐
Lista conocida (ampliar durante las fases anteriores):
- Error de lint preexistente en `app/(dashboard)/nav-tree.tsx` (setState en effect).
- ~~Renombrar cliente/producto no actualiza el texto guardado en Operaciones/Órdenes.~~
  Resuelto en la Fase 2 (los nombres salen del catálogo).
- Detalles visuales detectados en el recorrido general (alineaciones, textos, vacíos).

### Fase 9 — Features nuevas ☐
Proponer al usuario una lista para que elija (ejemplos): búsqueda global, avisos de stock
en el panel, cuentas corrientes de clientes (ventas a crédito/cobros), precios por lista
mayorista/minorista, etiquetas con código de barras para imprimir, recordatorios de
vencimiento, respaldo/exportación completa. **No implementar sin aprobación.**

### Fase 10 — Entrega al cliente ☐
Para Windows y Mac (Intel y Apple Silicon).
- Build de producción y forma simple de abrirla: en Windows, acceso directo / `.bat`; en
  Mac, un `.command` (o app de Automator) que levanta el servidor y abre el navegador
  (evaluar empaquetado tipo Electron solo si hace falta).
- Backups automáticos del archivo SQLite (diario, con rotación) y restauración simple, con
  rutas que funcionen en ambos sistemas (sin barras ni carpetas propias de Windows).
- Instalación guiada (Node incluido o instalador) para cada sistema, `.env` generado en el
  primer arranque. Las dependencias se instalan en la máquina destino (`npm ci`): la
  librería nativa de SQLite es distinta en Windows y en Mac, no se copia `node_modules`.
- README de uso para el cliente (no técnico) + guía corta de instalación.
- Test en una PC con Windows limpia y en una Mac simulando al cliente, repitiendo ahí el
  checklist de navegadores de la Fase 7.

## 4. Verificación estándar de cada fase
`npx tsc --noEmit`, `npx eslint`, `npx next build`, prueba en el navegador (golden path
+ casos borde + responsive), PDFs abiertos y revisados, y mostrarle el resultado al
usuario antes de seguir. Desde la Fase 7, probar también en Firefox y al menos en
1366×768 y 1920×1080.
