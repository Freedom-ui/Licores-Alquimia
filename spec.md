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
- Login actual: cookie `session` con JSON sin firmar (falsificable), registro público
  abierto, `middleware.ts` (Next 16 avisa que pasa a llamarse `proxy`).
- Dependencia `xlsx` (SheetJS) ya instalada → para la migración desde Excel.

Particularidades del entorno de pruebas:
- Usuario de prueba local: `test_qa` (la contraseña la tiene el usuario).
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

### Fase 2 — Base de datos real ☐ (la más grande)
- Rediseñar `prisma/schema.prisma` espejando los tipos reales de cada `*/data.ts`
  (Cliente, Proveedor, MateriaPrima, Producto, Operacion, OrdenProduccion + OrdenInsumo,
  LoteTerminado + Movimiento, InventarioMP + Movimiento, Compra, Usuario) con FKs e
  índices. Nueva migración.
- Capa de datos en el servidor (route handlers o server actions — revisar docs de Next 16)
  que ejecute las **mismas funciones puras de sync** dentro de transacciones Prisma, para
  no reescribir la lógica de negocio.
- `store.tsx` pasa a leer/escribir contra esa capa manteniendo **la misma interfaz
  `useStore()`** (las vistas no deberían cambiar).
- Script de seed con los datos de prueba actuales (en la Fase 5 se reemplazan por datos
  falsos más completos).
- Test: cada sección CRUD + automatizaciones (compra→inventario, orden→consumos/lote,
  venta FIFO, guardas de borrado) y que todo persista al recargar/reiniciar.

### Fase 3 — Rework del login ☐
Seguro pero simple, para una PC hogareña (protege datos sensibles de terceros en la casa).
- Sesión firmada (cookie httpOnly con token aleatorio guardado en DB, o JWT firmado con
  secreto en `.env`), expiración por inactividad y "cerrar sesión" real.
- Sin registro público: **primer arranque** crea el usuario administrador; luego el admin
  crea/desactiva usuarios desde una pantalla de Usuarios. Roles ADMIN / OPERADOR.
- Cambio de contraseña; reglas mínimas de contraseña; bloqueo temporal tras varios
  intentos fallidos; recuperación por "reset" desde el admin.
- Migrar `middleware.ts` → `proxy` según Next 16 y validar la sesión del lado servidor en
  el layout y en la capa de datos (no solo por presencia de cookie).
- Test: no se puede entrar sin login, cookie manipulada no sirve, expiración, roles.

### Fase 4 — Migración de datos desde Excel ☐
Requiere el archivo Excel del cliente (pedírselo al usuario). Su contenido actual también
es de prueba: se usa para validar la estructura de hojas/columnas y el importador; al
entregar, el cliente lo usará con su planilla real.
- Pantalla "Importar Excel" (activar el botón que hoy está deshabilitado en DataTable):
  subir el .xlsx, mapear hojas → secciones, **vista previa con validación** (errores por
  fila, duplicados, referencias faltantes), confirmar e importar en una transacción.
- Orden de importación por dependencias: catálogos → compras → órdenes → lotes → ventas.
- Reporte final de lo importado y lo rechazado. Idempotente (no duplica si se reimporta).
- Test: con el Excel del cliente; cotejar totales contra la planilla.

### Fase 5 — Inyección de datos falsos + testeo general ☐
- Script que genera datos falsos pero coherentes y realistas (varios meses de operación:
  clientes y proveedores con nombres/CUIT/contactos verosímiles, compras con comprobantes,
  órdenes, lotes, ventas con estacionalidad), respetando la cadena de trazabilidad, FIFO
  y que los saldos cierren. Reemplaza los datos de demo actuales (que también son de
  prueba). Que se pueda volver a correr para regenerar una DB de prueba limpia.
- Testeo de punta a punta de todas las secciones, PDFs, estadísticas con comparaciones,
  rendimiento con volumen.

### Fase 6 — Correcciones menores y estética ☐
Lista conocida (ampliar durante las fases anteriores):
- Error de lint preexistente en `app/(dashboard)/nav-tree.tsx` (setState en effect).
- Renombrar cliente/producto no actualiza el texto guardado en Operaciones/Órdenes.
- Detalles visuales detectados en el recorrido general (alineaciones, textos, vacíos).

### Fase 7 — Features nuevas ☐
Proponer al usuario una lista para que elija (ejemplos): búsqueda global, avisos de stock
en el panel, cuentas corrientes de clientes (ventas a crédito/cobros), precios por lista
mayorista/minorista, etiquetas con código de barras para imprimir, recordatorios de
vencimiento, respaldo/exportación completa. **No implementar sin aprobación.**

### Fase 8 — Entrega al cliente ☐
- Build de producción y forma simple de abrirla: acceso directo / `.bat` que levanta el
  servidor y abre el navegador (evaluar empaquetado tipo Electron solo si hace falta).
- Backups automáticos del archivo SQLite (diario, con rotación) y restauración simple.
- Instalación guiada (Node incluido o instalador), `.env` generado en el primer arranque.
- README de uso para el cliente (no técnico) + guía corta de instalación.
- Test en una PC limpia simulando al cliente.

## 4. Verificación estándar de cada fase
`npx tsc --noEmit`, `npx eslint`, `npx next build`, prueba en el navegador (golden path
+ casos borde + responsive), PDFs abiertos y revisados, y mostrarle el resultado al
usuario antes de seguir.
