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

## 2. Estado actual (al 17/10/2026, rama `main`)
App local para un elaborador artesanal de licores (Prov. de Buenos Aires, registro PUPAA
+ REBA). Next.js 16.3 + React 19 + TypeScript. Secciones: Panel principal, Clientes,
Proveedores, Materia prima, Productos, Operaciones (ventas), Órdenes de producción, Productos
terminados (kardex por lote), Inventario de materia prima (kardex), Trazabilidad (Libro de
compras + rastreo de lotes + ficha PUPAA), Estadísticas (6 pantallas con ECharts + PDF) e
Importar planilla.

**Dónde estamos:** Fases 1 a 7 aprobadas (la 6 commiteada en `c5b6c38`; la 7, aprobada el
20/10/2026, la commitea el usuario a mano). La siguiente es la Fase 8, solo cuando el usuario lo
indique.

Arquitectura clave:
- Datos en SQLite con Prisma 7 (`dev.db` en la raíz, `lib/prisma.ts`, config en
  `prisma7.config.ts`). Lógica pura en `app/(dashboard)/_dominio/` (`acciones.ts` con
  `aplicar(estado, accion)`, `reglas.ts` con las validaciones, `sync.ts` con las automatizaciones:
  compra → inventario, orden → consumos y lote, venta → salida FIFO). Servidor en
  `app/(dashboard)/_datos/` (`repositorio.ts`: `cargarEstado` / `guardarCambios`; `acciones.ts`:
  server action `ejecutar` en transacción; `importar.ts`: importación e historial).
  `store.tsx` (`useStore()`) recibe el estado del layout y manda cada cambio al servidor.
- Componentes genéricos: `app/components/data-table/*` (DataTable con columnas
  agrupadas y `rowActions`, modales, `LineItemsField`, `kardex.ts`, `exportPdf.ts`).
- Estadísticas: `app/(dashboard)/estadisticas/*` (cálculos puros en `calculos.ts`,
  pantallas como bloques en `secciones.ts`, PDF en `exportEstadisticasPdf.ts`).
- Login (Fase 3): cuenta única con sesión guardada en la base, código de recuperación y
  cierre por inactividad (`lib/auth/`, `app/(acceso)/`, `proxy.ts`).
- Validación (Fase 4): reglas compartidas pantalla/servidor en `_dominio/reglas.ts` sobre los
  validadores de `app/components/data-table/validacion.ts`; tests con `npm test` (Vitest, 339).
- Pruebas en el navegador (Fase 7): Playwright en `e2e/` (`npm run e2e`, `npm run e2e:tamanos`),
  sobre un build de producción en :3005 y una copia de `dev.db`. Detalle en la Fase 7.
- Importación (Fase 5): `app/(dashboard)/_importar/` (puro) + `app/(dashboard)/importar/`
  (pantalla) + `_datos/importar.ts` (servidor). Detalle en la Fase 5.
- Datos de prueba (Fase 6): `_dominio/generador.ts` (`generarDatos`) + `_dominio/revisar.ts`
  (`revisarEstado`); `npm run db:seed -- --reemplazar` carga ~2 años y 10 meses de operación
  generada hasta hoy. Detalle en la Fase 6.
- Migraciones: `npm run db:migrate` (o `npx prisma migrate deploy --config prisma7.config.ts`) y
  `npx prisma generate --config prisma7.config.ts`. Última: `20261017120000_cantidad_opcional`
  (ya aplicada a `dev.db`).

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

### Fase 4 — Validación de datos en los formularios ☑ (aprobada por el usuario)
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

**Decisiones del usuario (13/10/2026):** venta mayor al stock → aviso y "Guardar igual" (el
servidor la acepta); salida manual mayor al saldo → se bloquea; Proveedores: obligatorios
razón social, contacto y producto (CUIT, email, teléfono, CBU y alias opcionales, validados si
se cargan); Clientes: CUIT obligatorio salvo Consumidor Final; CUIT se guarda como
`30-71234567-8`; fechas reales entre el 01/01/2020 y hoy (vencimiento: posterior al
embotellado y hasta el 31/12 del año actual + 15); compra usada en una orden ≤ su maceración;
movimiento de un lote ≥ su embotellado; Vitest para los tests.

**Cómo quedó** (para retomar):
- `app/components/data-table/validacion.ts`: validadores puros por tipo de dato (texto, número
  con coma o punto, fecha, CUIT con dígito verificador, email, teléfono, CBU, alias, CODE39) y
  los topes (`MONTO_MAX` 100 M, `CANTIDAD_MAX` 1 M, 2 decimales, largos máximos). Tipos
  `Resultado` / `Errores`.
- `app/(dashboard)/_dominio/reglas.ts`: una función por formulario (`validarCliente`,
  `validarOrden`, `validarCompra`, `validarMovimientoLote`, …) que recibe los valores tal
  como llegan y devuelve el objeto limpio (solo las claves permitidas) o los errores por campo
  (líneas de una orden: `insumos.<n°>.<campo>`). También `stockDisponible` (aviso de venta).
  Duplicados que se rechazan: CUIT en Clientes y en Proveedores, nombre de materia prima,
  producto + formato y código de barras.
- `aplicar()` valida cada acción con esas reglas, busca todo id antes de usarlo y tira
  `ErrorNegocio(mensaje, campo)`; `ejecutar(accion: unknown)` devuelve `campo` y el store lo
  propaga en `ErrorGuardado`.
- Pantalla: hook `useErroresFormulario` (error al salir del campo, revalida mientras se
  escribe, al guardar foco en el primer error; errores sin campo visible → cartel `.rf-error`),
  `ErrorCampo`, `CampoNumero` (input de texto que solo deja dígitos y una coma/punto; reemplaza
  a `type="number"`), `CampoFecha` (ver abajo). Todos los formularios con
  `noValidate`. CSS `.rf-field-error` / `.rf-input-error` / `.li-errores`.
- Los formularios genéricos reciben `validar` (la misma regla del servidor) y mandan el valor
  limpio; se sacaron `pattern`, `findMissingRequiredField` y `parseFormValues` (el vacío ya no
  se convierte en 0: Precio Premium vacío = sin precio). Las ediciones de los 4 catálogos
  ahora esperan la promesa (antes el modal se cerraba aunque el servidor rechazara).
  `CompraFormModal` ahora tiene "Guardando…".
- Datos de prueba: CUIT y CBU con dígito verificador corregido, CUIT normalizados, contactos
  ficticios en los proveedores del Excel. Base re-sembrada.
- Tests: `npm test` (Vitest 4; el 5 pide @types/node ≥ 22). `validacion.test.ts`,
  `_dominio/acciones.test.ts` (entradas inválidas por formulario, incluidas claves extra, id
  pisado, ids inexistentes y tipos raros) y `_dominio/demo.test.ts` (el demo pasa todas las
  reglas). 259 tests.
- Fechas: `CampoFecha` (en `FormFields.tsx`) reemplaza a `<input type="date">` en todos los
  formularios y en el filtro "Personalizado" de Estadísticas. Siempre se ve y se escribe
  dd/mm/aaaa (el nativo muestra mm/dd/yyyy si el navegador está en inglés); las barras se
  ponen solas, y el botón de calendario abre el selector del navegador. Se sigue guardando
  "YYYY-MM-DD"; una fecha incompleta o que no existe se marca como inválida (también en los
  campos opcionales).

### Fase 5 — Migración de datos desde Excel ☑ (aprobada y commiteada, `47ac38a`)

**Cierre (17/10/2026):** la pregunta abierta (orden sin cantidad mientras macera) se respondió que
**sí** y se implementó en la Fase 6. **Copias de seguridad: postergadas por el usuario** → se hacen
en la Fase 10 (ahí está la propuesta). No empezarlas antes.

Resumen de cómo funciona hoy (el detalle de cada cambio está abajo, en orden cronológico):
- Se sube un Excel (.xlsx/.xls) o uno o más .csv; se lee en el navegador. Se detecta cada tabla
  (planilla Alquimia o plantilla limpia), se extraen los registros y `planificar()` los aplica
  con las reglas de la app sobre lo que ya hay en la base.
- Incremental: lo que ya está no se duplica (catálogos por CUIT o nombre; compras, órdenes y
  ventas por fecha + producto/materia + cantidad). Lo que ya está se compara dato por dato: vacío
  en la app → se completa solo; distinto → el usuario elige cuál dejar (la importación queda
  bloqueada hasta elegir); vacío en la planilla → no borra nada.
- Errores por fila con corrección en pantalla, avisos, unidades deducidas, comparación con los
  totales de la planilla por estado (verde = bien, ámbar = mirar), copia de seguridad en
  `respaldos/` antes de guardar, historial de subidas (tabla `SubidaPlanilla`).
- La lista de vendedores de la planilla no se importa (salen de las ventas).
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

**Decisiones del usuario (13/10/2026):** migración **única** (se importa una vez al instalar;
si sale mal se rehace: la importación reemplaza todos los datos del negocio — **cambiado el
15/10/2026: ahora es incremental, ver más abajo**) y detección
**híbrida** (reconoce el formato de la planilla Alquimia por títulos, encabezados, sinónimos y
tipo de datos + plantilla limpia descargable como plan B; lo dudoso se elige de un desplegable).

**Cómo es la planilla** (`Planilla-Muestra.xlsx`, 14 MB): varios bloques lado a lado por hoja,
cada uno con la celda "Pagina Principal" + título en la fila 2, encabezado en 2 filas, columna
de navegación a la izquierda y cientos de filas pre-armadas con fórmulas. Compras y ventas en dos
bloques (operaciones + trazabilidad) unidos por el N° de OP; órdenes maestro-detalle; inventarios
(uno por materia prima/producto) de donde se toma solo la fila EI. Hojas ".", "..", "...", "....",
"-" son cálculos auxiliares. Contabilidad, bancos, consignación, transportes, gastos, etc. no se
importan (la app no los maneja: insumo para la Fase 9).

**Cómo quedó** (para retomar):
- `app/(dashboard)/_importar/` (puro, corre en el navegador y en el servidor):
  `leer.ts` (SheetJS, solo en el navegador: el archivo no se sube; fechas por el formato de la
  celda sin pasar por Date; un 0 se lee vacío; sin leer fórmulas porque tarda el doble),
  `detectar.ts` (bloques por la marca o la hoja entera; prueba 3 formas de encabezado; puntaje
  por sinónimos pesados + tipo de dato + bonus de título; alto = asignado, medio = revisar,
  bajo = no se importa; un bloque por sección salvo inventarios; duplicados sin título → se
  ignoran), `secciones.ts` (campos y sinónimos), `extraer.ts` (registros con nombres de la app:
  formato arrastrado, CBU/alias, medio de pago por la "x", cáscara desde el inventario, insumos
  sin sub-encabezados, EI), `planificar.ts` (aplica cada registro con `aplicar()`: mismas reglas
  y sincronizaciones; errores con su hoja/fila y **todos** los campos que fallan; avisos;
  completa "Sin dato"/Consumidor Final/proveedor sin identificar; deja vacío lo opcional mal
  cargado; crea clientes/proveedores/vendedores/materias primas que aparecen y no están en su
  lista; nombres parecidos con aviso; insumos de órdenes asignados a compras por FIFO y el resto
  sin compra; redondeo a 2 decimales con aviso; cotejo con la planilla), `plantilla.ts`.
- Server action `_datos/importar.ts` (`importarPlanilla`): sesión, revalida la forma de lo que
  llega, vuelve a planificar en el servidor, copia la base con `VACUUM INTO` a `respaldos/` si
  tenía datos, y en una transacción `borrarDatosNegocio` + `guardarCambios(ESTADO_VACIO, plan)`.
  Usuarios intactos. `next.config.ts`: `serverActions.bodySizeLimit` 20 MB.
- Pantalla `/importar` (`importar/ImportarView.tsx`, CSS `.im-*`): subir (arrastrar o elegir) →
  revisar (tarjetas por sección, dudosas, "no se importa", resumen, errores agrupados por fila
  con campo/desplegable para corregir, avisos, unidades deducidas, comparación de totales,
  confirmación de reemplazo) → listo (resumen, copia de seguridad, accesos, descargar filas no
  importadas). Ítem "Importar planilla" en la sidebar; el botón "Importar Excel" de cada tabla
  lleva ahí; el Panel muestra un aviso para importar mientras la base esté vacía.
- **Vendedores**: dejaron de ser una lista fija; tabla `Vendedor` (migración
  `20261013120000_vendedores`, arranca con "ALQUIMIA" + los de las ventas cargadas), en `Estado`,
  acción `addVendedor`, el formulario de ventas y la regla leen de ahí. Sin pantalla de ABM.
- Acción `addLote` (`validarAltaLote`): lote con stock previo al sistema (solo la usa la
  importación). FIFO de ventas: primero los lotes previos (sin orden), después por N° de lote.
- `store.reemplazarEstado` para cargar el estado que devuelve la importación.
- Tests: `_importar/importar.test.ts` (libro sintético que imita la planilla + plantilla limpia;
  con `PLANILLA_REAL=<ruta>` prueba también la planilla real). 288 tests.
- Probado con la planilla de muestra en el navegador: todo se reconoce sin preguntar (~3 s),
  6 filas con error (CUIT inválido, 2 compras sin costo ni medio de pago, 3 órdenes macerando
  sin cantidad), correcciones en pantalla, importación de 134 registros, reimportar sin
  duplicar, ventas y total vendido iguales a la planilla, lote 8 (EI 53) queda en 19 como en la
  planilla, stock de alcohol igual. Después se re-sembró el demo.
- Diferencias conocidas (avisos en pantalla): el costo de "EI - TOTAL $" de una orden no es un
  insumo; las cantidades con 3 decimales (0,625 kg) se redondean a 2.

**Decisiones del usuario (15/10/2026):**
- Cítricos: manda el saldo de la planilla. Una compra con kilos de cáscara suma la cáscara al
  inventario (valorizada con el total de la compra) y es lo que pueden usar las órdenes
  (`stockDeCompra` / `costoStockDeCompra` en `trazabilidad/data.ts`; los usan sync, reglas,
  el formulario de órdenes, el rastreo y el importador). Demo ajustado (las órdenes consumen
  cáscara, mismo costo total). Con la planilla de muestra los stocks de limón, naranja,
  pomelo, menta y alcohol coinciden con la planilla.
- Cantidades: siguen con 2 decimales (se redondea con aviso).
- FIFO de ventas por fecha: en la Fase 8.
- Port forwarding de VS Code: el login fallaba con "Invalid Server Actions request". El túnel
  manda su host en `x-forwarded-host` pero reescribe el `Origin` a `localhost:3000`, y Next
  rechaza si no coinciden. Con `ORIGENES_PERMITIDOS` en `.env` (la URL del túnel, con o sin
  https:// y barra) `next.config.ts` permite ese host y los orígenes `localhost:3000-3009`
  (`serverActions.allowedOrigins`, `allowedDevOrigins`). Probado con un build de producción y
  las cabeceras del túnel: pasa, y un origen ajeno se sigue rechazando. Vacío = sin excepciones.
  Hay que reiniciar `npm run dev` después de cambiar `.env` o `next.config.ts`.

**Cambios pedidos por el usuario (15/10/2026):**
- **Importación incremental** (antes reemplazaba todo): el cliente puede usar la app y su Excel
  en paralelo los primeros meses y volver a subir la planilla. `planificar(ext, { base })` parte
  del estado actual y saltea lo que ya está: catálogos por CUIT o nombre (productos también por
  código de barras), compras por fecha + materia prima + cantidad, órdenes por producto + fecha
  de maceración, ventas por fecha + cliente + producto + cantidad (contando repeticiones),
  existencias iniciales si la materia prima ya está en el inventario o el lote previo ya existe.
  Lo que ya estaba no se toca (si una orden figura embotellada en la planilla y no en la app,
  solo se avisa). El servidor arma el plan contra la base dentro de la transacción y escribe
  solo las diferencias (`guardarCambios(antes, plan.estado)`); copia de seguridad antes, salvo
  que no haya nada nuevo. Pantalla: columnas "Ya estaban / Nuevos", lista "Lo nuevo que se va a
  agregar" por sección, botón "Agregar N registros nuevos" (o "No hay nada nuevo para agregar").
  Se sacó la casilla de "se reemplaza todo" (`borrarDatosNegocio` queda solo para el seed).
  Limitación: dos ventas distintas pero iguales en fecha, cliente, producto y cantidad (ej. dos
  ventas de 1 botella a PARTICULAR el mismo día) se cuentan por cantidad de repeticiones.
- **Correcciones**: una fila corregida no desaparece; queda a la vista con todos sus campos
  editables ("✓ Corregido (era: …)" o el error que sigue) y pasa a "✓ Corregida: se va a
  importar" cuando no le queda ninguno.
- **Aviso al salir**: con una planilla en revisión, un clic en cualquier link (sidebar,
  accesos), el botón Atrás o recargar/cerrar la pestaña pide confirmar que se cancela la
  importación (`AvisoAlSalir` en `ImportarView.tsx`).
- Probado (build de producción sobre una copia de la base, la de tu `dev.db` no se tocó): subir
  la misma planilla otra vez → 731 "ya estaban", 0 nuevos, botón deshabilitado; subir la planilla
  de muestra encima → 91 ya estaban, 40 nuevos, se agregaron sin duplicar (compras 116 → 135,
  órdenes 38 → 43, ventas 443 → 457); correcciones de una fila con dos errores; aviso al salir
  por la sidebar, por Atrás (quedarse y salir) y "Salir y cancelar". 294 tests.
- Arreglado: claves de registro repetidas ("Encountered two children with the same key
  existenciaMP:CUENTAS DE ACTIVO!5"). Los inventarios están lado a lado en la misma hoja y la
  clave era hoja + fila; ahora es sección + bloque + fila (\`claveRegistro\` en \`extraer.ts\`). Las
  correcciones también usan esa clave. Test de claves únicas (también contra la planilla real con
  \`PLANILLA_REAL\`). 295 tests.

**Planilla de prueba con volumen** (15/10/2026): \`C:\Users\patan\Downloads\planilla-claude.xlsx\` =
la planilla de muestra con datos ficticios del 02/01 al 14/10/2026 (53 clientes, 19 proveedores, 8
vendedores, 116 compras, 38 órdenes con 2 macerando, 443 ventas) y también las secciones que la app
no usa. Se generó editando el XML de las hojas (conserva formatos, fórmulas y tablas) con
scripts que estaban en el scratchpad de esa sesión (no están en el repo). Al importarla: todo se
reconoce, 2 errores esperables (las órdenes macerando sin cantidad) y, con eso corregido, los 30
valores de la comparación coinciden con la planilla.

**Pendientes de la Fase 5** (pedidos del usuario el 15/10/2026) — **hechos el 15/10/2026**:
1. **Admitir .csv**: `leerCsv` (`_importar/leer.ts`) decodifica UTF-8 (con o sin BOM) o, si no lo es,
   Windows-1252; SheetJS detecta el separador (";" o ","); los valores quedan como texto
   (`raw: true`) para que "10.000,50" y "02/08/2026" los lea `normalizar.ts` al estilo argentino
   (SheetJS los tomaría como EE. UU.); un 0 se lee vacío, como en el Excel. La hoja se llama como
   el archivo sin la extensión ("Clientes.csv" → Clientes). En la pantalla se puede subir una
   planilla de Excel **o uno o más CSV juntos** (cada uno es una hoja del mismo libro; no se
   mezclan Excel y CSV, ni dos CSV con el mismo nombre). Tests: Windows-1252 y UTF-8 con ";",
   un CSV por sección de la plantilla limpia con fechas dd/mm/aaaa y montos con miles, y una
   tabla suelta con otro nombre de archivo (se reconoce por las columnas).
2. **Sección Vendedores de la planilla** → el usuario eligió **(b)**: se sacó la sección
   `vendedores` del importador (`SECCIONES`, `SeccionId`, `SeccionRegistro`, extracción, server
   action y la hoja "Vendedores" de la plantilla limpia). El bloque "VENDEDORES / ACTIVADORES /
   PRE-VENTISTAS" queda en "No se importa" (el texto lo explica) y los vendedores salen solo de
   las ventas: los que no están en la app se agregan con un aviso en Ventas. La tabla `Vendedor`
   sigue (la usa el desplegable de Operaciones). Probado también con la planilla con volumen:
   nada queda "para revisar".
3. **Colores e íconos**: marcas con ícono SVG (`icons.tsx`: `plus`, `equal`, `check`,
   `notEqual`, `alert`) y color (`.im-marca` + variables `--im-*` en `.im-wrapper`): nuevo (+
   verde), ya estaba (= gris azulado), coincide (✓ verde), no coincide (≠ ámbar, con la fila
   resaltada) y error (⚠ rojo). Leyenda arriba de "Qué se va a importar"; chips en "Lo nuevo"
   (y un + en cada ítem), en "Comparación con la planilla" (columna "Resultado"), en las filas
   con error / corregidas y en el resumen final. Se sacaron `.im-rojo` / `.im-verde`.
4. **Confirmar "Cerrar sesión"**: el botón de la sidebar abre "¿Cerrar sesión?" (`ModalShell`).
   Con una planilla en revisión el mensaje avisa que se pierde la importación y el botón dice
   "Cerrar sesión y cancelar" (`importar/enCurso.ts`: `AvisoAlSalir` marca la importación en
   curso y la sidebar lo lee con `useImportacionEnCurso`). `irAlLogin` marca que se va al login
   (`seVaAlLogin`) y el aviso de "salir de la página" ya no frena el cierre de sesión ni el
   cierre por inactividad.
- 299 tests. Sin prueba en el navegador (el usuario prefirió probarlo él).

**Más cambios pedidos por el usuario (15/10/2026):**
- **CBU y alias escritos a mano** (ej. "Bco Macro CBU 2859… / alias:la colmena.mp"):
  `separarCbuAlias` (`extraer.ts`) toma como CBU/CVU una tira de 22 números (puede tener
  espacios, puntos o guiones en el medio; si hay una tira de 18+ que no llega a 22 se toma igual
  y la regla la deja vacía con aviso del motivo) y como alias lo que sigue a "alias" hasta la
  próxima barra / punto y coma / coma / "CBU" (sin espacios: "la colmena.mp" → "lacolmena.mp",
  con aviso para revisarlo) o, sin la palabra, una palabra con puntos que parezca alias (no
  CUIT, teléfonos, abreviaturas ni emails). El resto de la celda (banco, "CBU", "alias:",
  barras, dos puntos) se ignora. Se aplica a las columnas "CBU ó ALIAS", "CBU" y "Alias". Con la
  planilla con volumen, los 17 proveedores con datos bancarios quedan bien.
- **Comparación con la planilla**: ahora compara la planilla con lo que de ella quedó en la app
  (lo reconocido como ya cargado + lo nuevo), sin mezclar lo cargado aparte en la app
  (`planificar` guarda qué compras/órdenes/ventas de la app se reconocieron). Cada fila tiene un
  estado y una explicación (`FilaCotejo.estado` / `detalle`): Coincide (✓ verde), Ya está en la
  app (= verde), Incluye datos de la app (= verde: el stock difiere por compras u órdenes
  cargadas en la app; no hay que corregir nada), Faltan filas con error (⚠ ámbar, con cuántas;
  para el stock solo cuentan las filas de esa materia prima) y No coincide (≠ ámbar). Si la app
  tiene datos aparte, el detalle lo dice ("además tiene 7 ventas cargadas… en total: 450").
  Las marcas pasaron a `importar/Marca.tsx` (las usan la pantalla y el historial).
- **Historial de subidas** (tabla `SubidaPlanilla`, migración `20261015120000_historial_subidas`,
  ya aplicada a `dev.db`): cada subida se anota al terminar de analizarla ("No se importó" si
  después no se confirma), si no se pudo leer (con el motivo) y se actualiza al importar
  (Importada / Ya estaba todo / Falló al guardar). Guarda fecha y hora, usuario, archivos y
  tamaño, hojas, tablas reconocidas (sección ← hoja «título»), tablas que no se importan,
  resumen por sección, filas con error (hasta 1000, descargables en .xlsx), avisos (hasta 300),
  la comparación y la copia de seguridad. `_importar/historial.ts` arma y valida el detalle
  (JSON); server actions `registrarSubida` / `listarSubidas` y `importarPlanilla` recibe
  `subidaId` (`_datos/importar.ts`). En la pantalla (`importar/Historial.tsx`) se ve al subir y
  al terminar: una fila por subida con fecha, archivo y marcas (estado, + agregados, = ya
  estaban, ⚠ con error), que se abre con el detalle. La importación no lo toca.
- 305 tests (CBU/alias, estados de la comparación, historial). Sin prueba en el navegador.
- **Lo que ya estaba también se actualiza** (pedido del usuario: al subir la planilla base no se
  cargaban CBU/alias de proveedores que ya existían, porque la fila se salteaba entera). Ahora
  cada registro reconocido se compara dato por dato (`modificar` en `planificar.ts`):
  proveedores (contacto, producto, CUIT, email, teléfono, CBU, alias), clientes (apellido y
  nombre, IVA, CUIT, teléfono, email, domicilio, precios), productos (código de barras, precio),
  compras (costo, lote, proveedor, comprobante, medio de pago, cáscara), órdenes (embotellado,
  botellas, responsable; los insumos no) y ventas (vendedor, canal, condición, precio). Los
  nombres no se cambian (identifican el registro). Textos sin distinguir mayúsculas, tildes ni
  signos; CUIT, CBU y teléfono por los dígitos; email sin mayúsculas.
  - Vacío en la app → **se completa solo**. Vacío en la planilla → no borra nada.
  - La app ya tenía otro dato → **no se pisa: se pregunta cuál dejar** (bloque "Datos que
    cambiaron en la planilla", arriba de errores y avisos: por cada dato "Dejar el de la app" /
    "Usar el de la planilla", y botones para elegir todos de una). Hasta que se elija, queda el de
    la app y el botón de importar está bloqueado. `OpcionesPlan.elecciones`
    (`claveEleccion(clave, campo)`), `conflictosSinElegir`, `hayCambios`.
  - Si la regla rechaza el dato nuevo (ej. teléfono inválido), ese no se cambia y queda un aviso.
  - Antes, una orden embotellada en la planilla y macerando en la app solo se avisaba; ahora se
    completa el embotellado.
  - Resumen con columnas "Sin cambios" / "Se actualizan" (marca ✎ azul), botón "Agregar N
    registros nuevos y actualizar M", resultado final y servidor (`importarPlanilla` recibe
    `elecciones`; "sin novedades" solo si no hay nuevos ni cambios). Historial: qué datos
    cambiaron en cada registro, cuáles se completaron, cuáles se cambiaron y cuáles se dejaron.
  - Probado contra la base actual (copia, con los datos de demo) y la planilla con volumen: 36
    registros con datos distintos, 35 datos que se completan solos (CBU, emails, teléfonos) y 121
    para elegir (los datos de demo no coinciden con la planilla de prueba).
- 307 tests.

**Prueba completa de la importación** (17/10/2026, build de producción en el puerto 3005 sobre una
base de prueba descartable en el scratchpad, con una cuenta de prueba creada ahí; `dev.db` no se
tocó). Archivos subidos (generados con SheetJS, datos ficticios): un archivo que no es Excel,
libro vacío, una planilla de otra cosa, la plantilla limpia sin filas, 3 CSV juntos (Windows-1252,
";", miles y dd/mm/aaaa), una planilla parcial, la misma planilla con datos cambiados, la planilla
Alquimia completa (11 MB) y re-subidas de cada una. Resultado: todo se detecta bien; la completa
se analiza en ~3 s y se importa en 1 s (720 registros); re-subir no duplica; los conflictos se
eligen y se respetan; el CBU/alias escrito a mano se completa solo en un proveedor que ya estaba;
el historial anota cada caso; los avisos al salir y al cerrar sesión funcionan.
Arreglado a partir de la prueba:
- Mensajes de lectura: "no es una planilla de Excel" (se mira la firma del archivo: ZIP u OLE),
  "la planilla está vacía", "se reconocieron las columnas de … pero no hay ninguna fila con
  datos" (`motivoSinTablas` en `detectar.ts`).
- La comparación muestra solo las secciones que trae la planilla (antes salía "Compras 0 / 0 – Ya
  está en la app" aunque no hubiera compras).
- Producto que no existe: el error dice cuál es ("«Licor de Mandarina 500 cc» no está entre los
  productos de la app…") y en el desplegable aparece marcado "(no está en la app)" y no elegible.
- Una subida sin nada nuevo ni datos distintos queda en el historial como "Ya estaba todo" (antes
  "No se importó", que parecía un problema).
- Textos: el encabezado ya no dice "lo que ya está se saltea"; sin "0 registros" / "se agregan
  0 nuevos"; "1 aviso", "1 fila con error", "se actualizaron N registros", "Hay 1 dato en el
  que…"; aviso de elección pendiente en ámbar (no rojo); si no hay nada nuevo pero hay filas con
  error, lo dice. Tabla del resultado final con encabezados (Agregados / Actualizados / Sin
  cambios / Con error).
- 311 tests.

**Pregunta (respondida el 17/10/2026: sí):** ¿se permite una orden sin cantidad mientras no esté
embotellada? → hecho en la Fase 6 (las órdenes macerando de la planilla ya no salen con error).


### Fase 6 — Inyección de datos falsos + testeo general ☑ (aprobada y commiteada, `c5b6c38`)
- Script que genera datos falsos pero coherentes y realistas (varios meses de operación:
  clientes y proveedores con nombres/CUIT/contactos verosímiles, compras con comprobantes,
  órdenes, lotes, ventas con estacionalidad), respetando la cadena de trazabilidad, FIFO
  y que los saldos cierren. Reemplaza los datos de demo actuales (que también son de
  prueba). Que se pueda volver a correr para regenerar una DB de prueba limpia. Todo lo
  generado tiene que pasar los validadores de la Fase 4.
- Testeo de punta a punta de todas las secciones, PDFs, estadísticas con comparaciones,
  rendimiento con volumen.

**Decisiones del usuario (17/10/2026):** orden sin cantidad mientras macera: **sí**; historial
**desde 01/01/2024 hasta hoy** (permite comparar 2025 vs 2024); **catálogo real** (los 7 productos y
las 27 materias primas no cambian, el resto se inventa); sin modo de volumen alto.

**Cómo quedó** (para retomar):
- **Cantidad opcional mientras macera**: `cantidadProducida: number | null` (migración
  `20261017120000_cantidad_opcional`, columna nullable). `validarOrden` la exige solo con fecha de
  embotellado ("Ingresá cuántas botellas salieron al embotellar…"). Formulario: asterisco y
  placeholder según haya embotellado ("Opcional mientras macera"); tabla y ficha muestran "—";
  Panel: "sin cantidad estimada". La importación ya no marca error en las órdenes macerando sin
  cantidad, y si después la planilla trae embotellado + cantidad se completan solos.
- **Generador** `app/(dashboard)/_dominio/generador.ts`: `generarDatos({ semilla = 1, desde =
  "2024-01-01", hasta = hoy })`, puro y determinístico (PRNG mulberry32). Arma todo con
  `aplicar()` día por día (mismas reglas y sincronizaciones). La producción arranca 45 días antes
  de la primera venta. Contenido:
  - 39 clientes (PARTICULAR, 32 comercios/distribuidoras de Mar del Plata y la Provincia con su
    frecuencia, descuento, Premium/bidón y período activo, 6 consumidores finales; 2 con nombre y
    domicilio largos para la Fase 7), 17 proveedores por rubro (CUIT válidos, la mitad con
    CBU/alias), 8 vendedores. Precios con inflación (lista cada 3 meses = `updateProducto` y
    `updateCliente`; la de hoy es la del catálogo).
  - Recetas por botella por línea y envase; una orden cada vez que un producto queda con < 42
    días de stock (máx. 4 macerando, 36–120 botellas); maceración 14–21 días; N° de lote y
    embotellado crecen juntos (el FIFO actual sigue el orden de embotellado); vencimiento = 2 años.
  - Compras: lo fresco (cítricos con cáscara, menta, jengibre) se compra para cada orden y lo que
    sobra de más de 7 días se descarta como merma (los lunes); lo demás por lotes típicos con
    punto de reposición. Misma factura por proveedor y día (mismo medio de pago), numeración
    creciente, lote del proveedor en alcohol/azúcar/envases.
  - Ventas: público (Poisson con estacionalidad mensual y por día de la semana) + mayoristas;
    crecimiento 15 % anual; solo se vende lo embotellado a esa fecha (si no alcanza, se vende lo
    que hay o se pierde la venta).
  - Movimientos manuales: roturas/degustaciones en lotes, consumo mensual de cajas y bolsas,
    recuento anual de tapas, mermas de frescos.
  - Volumen (semilla 1, hasta el 17/10/2026): 534 compras, 111 órdenes, 109 lotes, 1655 ventas;
    se genera en ~0,3 s.
- `_dominio/revisar.ts` (`revisarEstado`): todos los registros contra sus reglas + costo de cada
  orden, lote de cada orden embotellada, saldos ≥ 0, movimientos posteriores al embotellado y
  cada venta descontada entera de los lotes. Lo usan los tests y el seed (no carga si hay
  problemas).
- Seed (`prisma/seed.ts`): carga los datos generados; `--semilla=N`, `--hasta=AAAA-MM-DD`,
  `--demo` (el demo chico, que sigue siendo el fixture de los tests). Tarda ~2 s.
- Tests: `generador.test.ts` (reglas, determinismo, volumen, lotes embotellados antes de cada
  venta, N° de lote y embotellado crecientes, trazabilidad, frescos ≤ 7 días, misma factura =
  mismo medio de pago, macerando sin cantidad, estacionalidad, inflación) + casos nuevos de la
  orden sin cantidad. 326 tests.
- `dev.db` re-sembrada con los datos generados (usuarios intactos).

**Testeo general** (17/10/2026, build de producción en :3005 sobre una copia de la base):
- Ida y vuelta a la base idéntica en las 10 tablas. `cargarEstado` ~45 ms (estado de ~1 MB);
  una acción completa de `ejecutar` ~100 ms.
- Panel, Operaciones (aviso "Guardar igual" al superar el stock), Órdenes (alta macerando sin
  cantidad → embotellar sin cantidad pide el dato con foco → con cantidad crea el lote),
  Productos terminados, Trazabilidad (ficha del lote de punta a punta), Estadísticas ("Año
  anterior" vs. 2024: +14 % unidades, +63 % facturación).
- PDF: Estadísticas completo (19 páginas), Operaciones (1655 filas, 103 páginas), ficha de lote.
- Importar `planilla-claude.xlsx` sobre los datos generados: todo se reconoce (~3,7 s), 0 errores,
  36 datos para elegir. El estado resultante muestra el problema conocido del FIFO sin fechas
  (ventas de la planilla en lotes generados embotellados después) → Fase 8.
- Arreglado: "Por vendedor" en Estadísticas (Ventas) se superponían las etiquetas con 8
  vendedores → barras horizontales; los 3 gráficos de esa fila comparten el alto (antes usaba la
  cantidad de productos).
- Pendientes que van a la Fase 8 (ver ahí).

### Fase 7 — Pantallas horizontales y navegadores ☑ (aprobada por el usuario el 20/10/2026)
**Decisiones del usuario (18/10/2026):** Playwright con Chromium, Firefox y WebKit (dependencia de
desarrollo); en 2560 y ultrawide el contenido va con **ancho máximo centrado** (~1800 px); se
soporta **hasta ~900 px de ancho efectivo** (1366×768 al 150 %): debajo de ~1100 px la sidebar
pasa a solo íconos y se despliega con un botón, y los modales usan scroll interno.

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

**Cómo quedó** (para retomar):
- **Playwright** (`@playwright/test`; los motores quedan en `%LOCALAPPDATA%/ms-playwright`).
  `playwright.config.ts` levanta `next start -p 3005` con `DATABASE_URL=file:./e2e/.datos/e2e.db`
  (copia de `dev.db` que hace `e2e/preparar-base.mjs` con el backup de SQLite; `dev.db` no se toca) y
  `SESION_INACTIVIDAD_MIN=240`. `e2e/auth.setup.ts` entra con `claude_qa` (`e2e/credenciales.ts`:
  `.claude/qa-usuario.local` o `E2E_USUARIO` / `E2E_CLAVE`) y guarda la cookie en `e2e/.auth/`.
  Salidas en `test-results/` y `playwright-report/` (ignorados por git y por ESLint; Vitest ignora
  `e2e/`).
  - `npm run e2e` (build + humo en Chromium, Firefox y WebKit; con `E2E_MARCAS=1` y
    `npx playwright test --project=edge --project=chrome`, también Edge y Chrome instalados):
    recorrer las secciones por la sidebar sin errores de consola **ni pedidos fuera de localhost**,
    login incorrecto / correcto / cerrar sesión (cookie de sesión sin `Secure` en http://localhost),
    alta / edición / baja de un cliente, letras en un número y fecha imposible, venta con «Guardar
    igual», orden macerando sin cantidad, 3 PDF (tabla, Estadísticas completo, ficha de lote: se valida
    que empiecen con `%PDF-` y quedan en `test-results/pdf/<navegador>/`), canvas de ECharts pintado y,
    a 1093×485, la sidebar compacta y los botones de un modal a la vista. 11 pruebas por navegador.
  - `npm run e2e:tamanos`: `e2e/tamanos.spec.ts` recorre 26 vistas (cada sección, las 6 de
    Estadísticas, alta / edición de cliente, alta de venta, orden y compra, movimiento de lote, alta en
    inventario, ficha de lote) en 19 tamaños con su DPR en Chromium, y en 1366×640 / 1920×950 en
    Firefox y WebKit. Capturas en `test-results/tamanos[-motor]/<vista>/<ancho>x<alto>[-completa].png`
    y chequeos automáticos: sin scroll horizontal de la página, nada que se salga de su tarjeta /
    barra / modal, texto cortado con "…" sin tooltip, modal dentro de la pantalla con título y botones
    a la vista, sidebar sin tapar el contenido. Filtros: `E2E_TAMANOS=1366x640,911x380`,
    `E2E_VISTAS=estadisticas,panel`. Entero tarda ~30 min (~3 s por vista).
  - Los tamaños son px CSS efectivos (pantalla × escalado o zoom, menos las barras del navegador):
    911×380 (1366 al 150 %), 1024×470 y 1024×640, 1093×485 (1366 al 125 %), 1152×590, 1280×590 / 670,
    1366×640, 1440×770, 1470×866, 1512×892, 1536×735, 1600×770, 1728×1027, 1920×950, 2048×1020,
    2400×1190 (1920 con zoom 80 %), 2560×1310 y 3440×1310.
- **Sidebar compacta** debajo de 1100 px (`globals.css`, `sidebar.tsx`): 64 px con íconos (cada link
  con `title`) y un botón ☰ que la despliega encima del contenido (margen negativo: la página no se
  mueve) con fondo oscuro; se cierra con Esc, con un clic afuera o al elegir sección. "Cerrar sesión"
  pasa a ícono. Íconos nuevos `menu`, `close` y `logout`.
- **Modales**: título y fila de botones fijos (`position: sticky`); el contenido scrollea en el medio
  (`.rf-form`, `.tz-body`, `.cf-body`). `100dvh`, `-webkit-backdrop-filter` para Safari y
  `ModalShell` con `role="dialog"`, `aria-modal` y `aria-labelledby`.
- **Grillas**: `.es-grid` recién apila todo en 1 columna debajo de 900 px (antes 1100: con la sidebar
  compacta, de 1024 a 1099 entran las 3 columnas). Panel y Estadísticas con **máximo 1800 px
  centrado** y el título de la barra alineado con el contenido (`:has`); las tablas usan todo el ancho.
- **Gráficos** (`graficos.ts`): `ajustarAlAncho(option, ancho, alto)` adapta la opción al tamaño
  real (en pantalla al cambiar de tamaño, de a 24 px y sin animación; en el PDF, con el tamaño de la
  imagen): etiquetas de categorías con el ancho de su lugar (inclinadas solo si no entran), nombres
  de barras horizontales hasta 1/3 del ancho, y leyenda de donas abajo cuando no entra al lado (la
  dona se ubica arriba según los renglones que ocupa la leyenda). Eje de valores con `hideOverlap`
  (3 marcas en las horizontales) y montos sobre barras / puntos que se pisan se ocultan
  (`labelLayout.hideOverlap`). Tests en `graficos.test.ts`.
- **Otros**: filtros de las tablas con máximo 240 px (el de clientes medía lo que el nombre más
  largo y desordenaba la barra), tooltips en las listas del Panel, PDF de Estadísticas con las
  flechas ▲ / ▼ dibujadas (la fuente del PDF no las tiene: salía "%'") y "+" / "-" en sus tablas,
  y el lint de `nav-tree.tsx` resuelto (ajuste de estado durante el render en vez de un efecto).
- `docs/checklist-navegadores.md`: prueba manual de 10 min para Brave, Opera, Vivaldi y Safari en Mac.
- **Versiones mínimas** (para el README de la Fase 10): Chrome / Edge / Brave / Opera / Vivaldi
  basados en Chromium ≥ 111, Firefox ≥ 121 y Safari ≥ 16.4 (macOS 13.3). Las fijan Next 16 (111 /
  111 / 16.4) y `:has` (Firefox 121).

**Resultado** (18/10/2026, build de producción; ✓ = sin problemas, ✎ = corregido en esta fase):

| Vista | 911–1093 (150 / 125 %) | 1152–1366 | 1440–1728 (Mac) | 1920–2400 | 2560–3440 |
|---|---|---|---|---|---|
| Sidebar | ✎ íconos + ☰ | ✓ | ✓ | ✓ | ✓ |
| Panel | ✎ 3 columnas, tooltips | ✎ tooltips | ✓ | ✓ | ✎ 1800 px centrado |
| Catálogos (4) | ✓ | ✓ | ✓ | ✓ | ✓ (todo el ancho) |
| Operaciones | ✎ filtros | ✎ filtros | ✓ | ✓ | ✓ |
| Órdenes / Trazabilidad | ✓ | ✓ | ✓ | ✓ | ✓ |
| Productos terminados / Inventario | ✓ | ✓ | ✓ | ✓ | ✓ |
| Estadísticas (6) | ✎ grilla, ejes, donas | ✎ ejes, donas | ✓ | ✓ | ✎ 1800 px centrado |
| Importar | ✓ | ✓ | ✓ | ✓ | ✓ |
| Modales (8) | ✎ botones fijos | ✎ botones fijos | ✓ | ✓ | ✓ |

Motores: Chromium, Firefox 157 y WebKit 27 (Playwright) + Edge y Chrome instalados → 11 / 11
pruebas de humo en cada uno; tamaños 599 / 599. WebKit anota "access control checks" si un
`page.goto` corta las precargas de Next: es de la prueba (navegando por la sidebar no pasa). Falta el
checklist manual en Brave / Opera / Vivaldi y en Safari de una Mac real.

**Revisión a ojo en notebook y escritorio** (20/10/2026, pedida por el usuario: son las pantallas
que va a usar el cliente). Tamaños: 1093×485 (1366 al 125 %), 1280×590 (1920 al 150 % / 1280×720),
1280×670, 1366×640, 1440×770 (MacBook Air), 1536×735 (1920 al 125 %) y 1920×950; Firefox y WebKit en
1366 y 1920. Se sumaron al recorrido ~50 vistas: edición de proveedores, materia prima, productos,
ventas, órdenes (con insumos), compras, lotes e inventario; movimiento de inventario; rastreo de lote;
confirmar borrado; cerrar sesión; formularios con errores; el aviso de «Guardar igual»; inventario y
kardex abiertos; Importar con una planilla cargada (paso «Revisar», con `E2E_PLANILLA` o
`planilla-claude.xlsx` en Descargas); y las 6 pantallas de Estadísticas con «Este año», «Año
anterior», «Últimos 30 días», todo el historial (01/01/2024 a hoy) y sin comparar (76 vistas en total).
Chequeos automáticos 848 / 848 (y 51 / 51 de humo en los 5 navegadores) y se revisaron a ojo las
capturas de modales, Estadísticas, Panel, tablas, kardex e Importar. Lo que se encontró y se arregló:
- **Donas gigantes** (Compras «Medio de pago», Stock «Dónde está la plata inmovilizada»): cuando la
  tarjeta se estira por la de al lado, el radio se calculaba con el alto y la dona se salía de la
  tarjeta. Ahora lo limita el lado más corto.
- **Porcentajes cortados dentro de donas angostas**: si el anillo mide menos de 44 px se ocultan (la
  leyenda ya los muestra).
- **Ejes**: "Sáb" se partía en dos renglones; con productos inclinados, el nombre cortado a 110 px
  dejaba dos productos iguales (ahora 170 px y letra 10: se ve el envase); los montos sobre barras se
  ocultan solo si cada barra tiene menos de 44 px (el Panel en 1366 los conserva).
- **Tablas de Estadísticas**: alto máximo 460 px con scroll y encabezado fijo (todas las órdenes del
  historial alargaban la página a 4000 px), y los textos de la izquierda cortados a 240 px con
  tooltip (un cliente con nombre larguísimo empujaba la facturación fuera de la tarjeta).
- **Sidebar en pantallas bajas** (alto ≤ 720 px, típico de notebook con escalado): «Importar planilla»
  quedaba fuera de la vista. Ahora el logo va en una línea y los renglones son más finos; con la
  sidebar en íconos y poca altura se oculta el logo. Chequeo automático nuevo: todas las secciones a
  la vista sin scrollear la barra (desde 470 px de alto).
- **Tira de indicadores en 1536** (1920 al 125 %): 6 columnas apretadas (mini gráficos diminutos,
  etiquetas cortadas) → pasa a 3 + 3 hasta 1400 px de contenedor.
- **Modales**: línea sobre la fila de botones fija, para que se note que el contenido sigue debajo.
- Sin problemas: modales de alta / edición / errores / borrado / rastreo / ficha, tablas y kardex,
  Panel, Importar (revisión completa) y los 3 motores entre sí.
- Tests: 339 (Vitest), con los casos nuevos de `ajustarAlAncho` en `graficos.test.ts`.

**Fuente (decisión del usuario, 20/10/2026): Arial / Helvetica.** La app decía `'Inter', sans-serif`
pero Inter nunca se cargaba, así que ya se veía en Arial (Windows) / Helvetica (Mac). Ahora es
explícito en `--font`, en `--font-sans` de Tailwind y en los gráficos (`graficos.ts`), y se sacaron
Geist y Geist Mono de `app/layout.tsx` (no se usaban y `next/font/google` las bajaba de internet en el
build). Verificado: misma vista, humo 31 / 31 en los 3 motores y 1366 / 1920 sin cambios.
Queda pendiente solo el checklist manual (Brave / Opera / Vivaldi y Safari en una Mac real).

### Fase 8 — Correcciones menores y estética ☐
Lista conocida (ampliar durante las fases anteriores):
- ~~Error de lint preexistente en `app/(dashboard)/nav-tree.tsx` (setState en effect).~~ Resuelto
  en la Fase 7.
- ~~Renombrar cliente/producto no actualiza el texto guardado en Operaciones/Órdenes.~~
  Resuelto en la Fase 2 (los nombres salen del catálogo).
- Guardas de borrado (detectadas en la Fase 4): `deleteLote` borra un lote aunque tenga ventas
  o venga de una orden, y `deleteOrden` deja huérfano el lote si ya tiene movimientos.
- Las páginas de sección no tienen `<title>` propio (muestran solo "Licores Alquimia").
- Detectados en la Fase 5: el FIFO de ventas no mira fechas (una venta puede descontar de un
  lote embotellado después) → corregir acá (decisión del usuario); no hay pantalla para agregar
  o editar vendedores (pendiente de respuesta).
- Detectados en la Fase 6 (con datos de volumen):
  - **Rendimiento**: Operaciones dibuja todas las ventas juntas (1655 filas ≈ 0,8 s al entrar,
    crece con los años); Trazabilidad ≈ 0,26 s. Proponer paginación o "mostrar más" en
    `DataTable` (filtros, orden y PDF sobre todas las filas).
  - Alertas: "no alcanza para otra orden" sale siempre para cítricos y hierbas, que se compran
    frescos para cada orden → ruido. Decidir con el usuario si se excluyen (o se marcan como
    "se compra para cada orden").
  - Los PDF de las tablas (`exportPdf.ts`) no tienen número de página (Estadísticas sí).
  - El FIFO sin fechas se ve al importar una planilla sobre datos que ya tienen lotes (Fase 6).
- Detectados en la Fase 7:
  - PDF de Estadísticas: una tabla puede dejar una sola fila sola en la página siguiente (ej. la
    orden N° 101 en Producción); evitar filas huérfanas.
  - En 2560 / ultrawide las tablas de catálogos (Clientes, Proveedores) quedan muy aireadas a
    todo el ancho; ver si conviene un máximo también ahí.
  - En los formularios de edición los números con decimales aparecen con punto ("1129.81" en el
    costo unitario de una orden) en vez de coma, como en el resto de la app.
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
  **Propuesta (17/10/2026; el usuario decidió dejarla para esta fase, no hacerla antes):** copia automática con
  `VACUUM INTO` al entrar a la app (una por día, o al importar), con rotación (últimas 30 diarias +
  1 por mes), guardada en una carpeta que se elige una vez y que conviene que sea la de OneDrive /
  Google Drive / iCloud Drive de la PC, así el programa de sincronización la sube sola a la nube.
  Pantalla "Copias de seguridad": última copia (fecha y tamaño), "Hacer una copia ahora",
  "Guardar una copia en…" (pendrive), "Restaurar" (con confirmación y copia previa de lo actual) y
  verificación de cada copia (`PRAGMA integrity_check`). Aviso en el Panel si la última copia tiene
  más de 3 días o si la carpeta no está disponible.
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
