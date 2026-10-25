# Licores Alquimia — Spec de lo que falta

> Documento vivo para retomar el trabajo sin historial de chat. Leerlo completo
> antes de empezar cualquier tarea. Actualizar el estado (☐ / ◐ / ☑) al cerrar cada fase.
> Las fases 1 a 10 están resumidas (solo lo imprescindible para seguir). El detalle completo de
> las fases 1 a 7, con todo lo probado, está en el historial: `git show 0b1d2e7:spec.md`.
> **La app ya está entregada y publicada (v1.0.0, 25/10/2026):** lo que venga son versiones nuevas
> (ver «Cómo sacar una versión» en la sección 2).

## 1. Reglas de trabajo (obligatorias)
- **Una fase por vez.** Implementar → testear en el navegador → corregir → mostrarle el
  resultado al usuario → **esperar sus instrucciones** antes de pasar a la siguiente.
  Nunca encadenar fases por cuenta propia.
- **Nada de commits ni push** salvo pedido explícito. El usuario commitea y pushea a mano;
  cuando lo pida, darle el texto del commit (formato `git commit -m "tipo: ..."` sin tildes, con
  lista de cambios, terminando con la línea `Co-Authored-By`).
- Idioma: español rioplatense, en la UI y al hablar con el usuario.
- Next.js 16 (Turbopack) tiene cambios respecto de lo conocido: antes de usar una API de
  Next, leer la guía en `node_modules/next/dist/docs/` (ver `AGENTS.md`).
- **Todos los datos de la app son de prueba**, incluidos los que pasó el cliente (nombres
  de proveedores, lotes, comprobantes). Se pueden reemplazar o ampliar libremente con
  datos **falsos pero coherentes**: personas, empresas, CUIT con formato válido, ventas,
  compras y operaciones que parezcan reales y respeten la lógica del negocio (fechas en
  orden, trazabilidad compra → orden → lote → venta, FIFO, stock que cierra).
- Pendientes para confirmar con el cliente (no bloquean, pero preguntarlos cuando toque):
  qué significan los medios de pago **MPR** y **MPA**; si el proveedor debe ser obligatorio en el
  Libro de compras. Los datos del establecimiento para los PDF ya los carga él mismo en
  Configuración.

## 2. Estado actual (al 25/10/2026, rama `main`)
App de escritorio (Windows y Mac) para un elaborador artesanal de licores (Prov. de Buenos Aires,
registro PUPAA + REBA). Next.js 16.3 + React 19 + TypeScript, empaquetada con Electron. Secciones:
Panel principal, Clientes, Proveedores, Materia prima, Productos, Operaciones (ventas), Órdenes de
producción, Productos terminados (kardex por lote), Inventario de materia prima (kardex), Trazabilidad
(Libro de compras + rastreo de lotes + ficha PUPAA), Estadísticas (6 pantallas con ECharts + PDF),
Importar planilla y Configuración (copias de seguridad, datos del establecimiento, versión).

**Dónde estamos: las 10 fases están terminadas y la app está publicada y funcionando.**
- **v1.0.0 publicada** el 25/10/2026 en https://github.com/Freedom-ui/Licores-Alquimia/releases
  (instalador de Windows y `.dmg` de Mac Apple Silicon e Intel). Link para el cliente:
  `https://github.com/Freedom-ui/Licores-Alquimia/releases/latest`.
- El usuario la instaló desde la Release y probó el recorrido del cliente: instalar, conectar Google
  Drive, importar la planilla, cargar datos, copias en la PC y en Drive, restaurar. **Todo funciona.**
- **v1.0.1** publicada (sin cambios, para probar la actualización: la app instalada la bajó sola).
- **v1.0.2** (en preparación): la sesión dura 30 minutos sin uso y sobrevive a cerrar la app (antes:
  15 minutos y se cerraba al cerrar la app). Electron hace `cookies.flushStore()` al salir.
- Pendiente menor: si se consigue, instalar en una Mac real.

**Cómo sacar una versión** (las PCs del cliente se actualizan solas en Windows; en Mac avisa):
1. Cambios + `npm test`, `npx tsc --noEmit`, `npx eslint` (y `npm run e2e` si se tocó pantalla).
2. Subir `version` en `package.json` (`npm version X.Y.Z --no-git-tag-version`), commit y push.
3. `git tag vX.Y.Z` y `git push origin vX.Y.Z` → GitHub Actions arma los 3 instaladores en una
   Release en borrador (~5 min) → revisarla (12 archivos: `.exe`, 2 `.dmg`, 2 `.zip`, 5 `.blockmap`,
   `latest.yml`, `latest-mac.yml`) y **Publish release**. Recién ahí las apps instaladas la ven.
4. Si el workflow falla: borrar el tag (`git tag -d vX.Y.Z` + `git push origin --delete vX.Y.Z`) y el
   borrador, corregir y volver al paso 3.

**Soporte al cliente:**
- Datos en `%APPDATA%\Licores Alquimia` (Mac: `~/Library/Application Support/Licores Alquimia`): la
  base `alquimia.db`, `copias/`, `drive.json` (conexión con Drive) y `registro/app.log` (menú Ayuda →
  Ver el registro de la app).
- Restaurar una copia deja la cuenta (usuario, contraseña y código de recuperación) **que tenía esa
  copia**. Si el cliente restaura una copia de otra instalación o muy vieja y no puede entrar, que nos
  consulte: se entra con el usuario de esa copia y se restaura la «Antes de restaurar» (decisión del
  usuario: no se agregan protecciones para esto). En desarrollo pasa seguido porque `npm run dev` y la
  app instalada suben a la misma carpeta de Drive si se conecta la misma cuenta.
- Instaladores sin firma: SmartScreen la primera vez (Más información → Ejecutar de todos modos); en
  Mac, Ajustes → Privacidad y seguridad → Abrir igualmente. Guías del cliente: `docs/guia-instalacion.md`
  y `docs/manual-de-uso.md`.

Arquitectura clave:
- Datos en SQLite con Prisma 7 (`dev.db` en la raíz, `lib/prisma.ts`, config en
  `prisma7.config.ts`, que Prisma encuentra solo). Lógica pura en `app/(dashboard)/_dominio/`:
  `acciones.ts` (`aplicar(estado, accion)`: valida y aplica cada acción; tira
  `ErrorNegocio(mensaje, campo)`), `reglas.ts` (validaciones por formulario), `sync.ts`
  (automatizaciones: compra → inventario, orden → consumos y lote, venta → salida FIFO).
- Servidor en `app/(dashboard)/_datos/`: `repositorio.ts` (`cargarEstado` / `guardarCambios`, que
  escribe solo las diferencias), `acciones.ts` (server action `ejecutar`, en transacción),
  `importar.ts` (importación e historial). `store.tsx` (`useStore()`) recibe el estado del layout y
  manda cada cambio al servidor; sus funciones devuelven promesas (errores con mensaje y `campo`).
- Componentes genéricos: `app/components/data-table/*` (DataTable con columnas agrupadas y
  `rowActions`, `ModalShell`, `RecordFormModal` / `EditRecordModal` configurados por columnas,
  `LineItemsField`, `FormFields` con `CampoNumero` y `CampoFecha`, `validacion.ts`, `kardex.ts`,
  `exportPdf.ts`).
- Estadísticas: `app/(dashboard)/estadisticas/*` (cálculos puros en `calculos.ts`, pantallas como
  bloques en `secciones.ts`, gráficos en `graficos.ts` + `Grafico.tsx`, PDF en
  `exportEstadisticasPdf.ts`). Panel: `app/(dashboard)/_panel/`.
- Login: `lib/auth/`, `app/(acceso)/`, `proxy.ts`. Importación: `app/(dashboard)/_importar/` (puro) +
  `app/(dashboard)/importar/` (pantalla). Datos de prueba: `_dominio/generador.ts` + `revisar.ts`.
- Estilos: todo en `app/globals.css` con prefijos por sección (`.dt-*`, `.rf-*`, `.es-*`, `.pp-*`,
  `.pt-*`, `.tz-*`, `.im-*`). Fuente **Arial / Helvetica** (decisión del usuario; nada se baja de
  internet).

Comandos:
- `npm run dev` · `npm test` (Vitest, 412) · `npx tsc --noEmit` · `npx eslint` · `npx next build`.
- `npm run db:migrate` · `npx prisma generate` · `npm run db:seed -- --reemplazar` (datos
  generados hasta hoy; `--hasta=2026-10-17` reproduce la base del usuario; `--semilla=N`, `--demo`).
  Última migración: `20261024120000_empresa` (se aplican solas al arrancar el servidor).
- `npm run e2e` (build + humo en Chromium / Firefox / WebKit; `E2E_MARCAS=1` suma Edge y Chrome) ·
  `npm run e2e:tamanos` (recorrido de pantallas, ~40 min; filtros `E2E_TAMANOS`, `E2E_VISTAS`).
- App de escritorio: `npm run app:build` (instalador en `dist/`) · `npm run app:dev` (ventana contra
  `npm run dev`) · `npm run iconos` (regenera los íconos desde `build/icono.svg`). Release: subir
  `version` en `package.json` y pushear el tag `v<versión>` (ver README).
- PC nueva: `npm ci` + `npm ci --prefix escritorio` → `.env` con `DATABASE_URL="file:./dev.db"` → `npx prisma generate` →
  `npm run db:migrate` → `npm run db:seed` → `npm run dev` → crear la cuenta en la pantalla de
  configuración inicial (los usuarios no están en el repo ni en el seed).

Particularidades del entorno de pruebas:
- Usuarios en la base de desarrollo: `tadeoqa` (el del usuario; la contraseña la tiene él) y, para
  los recorridos automáticos de Claude, `claude_qa`, con la contraseña en
  `.claude/qa-usuario.local` (ignorado por git).
- En el panel del navegador de Claude, entrar a una página por recarga directa a veces queda en
  "Cargando…" (el panel oculto no pinta y React no revela el Suspense): navegar a otra sección y
  volver con un clic. Las descargas aparecen en `C:\Users\patan\Downloads`. Para revisar PDFs: el
  pdf.js de Firefox vía Playwright (`firefoxUserPrefs: { "pdfjs.disabled": false }`).
- Si el dev server del usuario no toma un cambio, hacer `touch` del archivo y refrescar la caché
  del navegador. Hay que reiniciar `npm run dev` después de cambiar `.env` o `next.config.ts`.
- Las pruebas de Playwright corren sobre una copia (`e2e/.datos/e2e.db`): nunca tocan `dev.db`.

## 3. Fases completadas (1 a 10) — lo imprescindible

### Fase 1 — Panel principal ☑
- `_panel/calculos.ts` (`construirPanel`, puro) + `_panel/PanelView.tsx`: saludo y hora en vivo
  (`useSyncExternalStore`), tira de 6 indicadores clickeables, ventas de 12 semanas, alertas
  (`construirAlertas`), últimas ventas / compras / producción. Todo navega a su sección.
- `Kpis`, `Sparkline`, `MiniBarra`, `Alertas` viven en `estadisticas/Indicadores.tsx` (compartidos).
- Accesos "+ Nueva …" → `/operaciones?nuevo=1`, `/trazabilidad?nuevo=1`,
  `/ordenes-produccion?nuevo=1` (abren el alta y limpian el parámetro).
- `<title>`: template "%s · Licores Alquimia" en `app/layout.tsx`.

### Fase 2 — Base de datos real ☑
- `prisma/schema.prisma` espeja los tipos de cada `*/data.ts`: fechas como texto `YYYY-MM-DD`,
  cantidades Float, ids de negocio explícitos, movimientos de kardex con clave compuesta.
- El servidor ejecuta las **mismas funciones puras** de `_dominio/` dentro de una transacción; la
  interfaz `useStore()` no cambió para las vistas.
- Los nombres de cliente / producto en ventas, órdenes y lotes se derivan del catálogo al leer
  (renombrar actualiza todo).

### Fase 3 — Login ☑
- **Una sola cuenta en una sola PC**, sin registro, roles ni pantalla de usuarios. Primer arranque:
  `/configuracion-inicial` crea usuario + contraseña.
- Código de recuperación de 7 caracteres, se muestra una sola vez (Copiar + "Ya lo anoté"); sirve
  para recuperar usuario y/o contraseña en `/recuperar` y se regenera al usarlo.
- Sesión: token al azar en cookie httpOnly (en la base solo su SHA-256), `secure` solo por https;
  vence a los 30 min sin uso (desde la v1.0.2; antes 15), cuente o no con la app cerrada: la cookie dura
  12 h y la base decide (`SESION_INACTIVIDAD_MIN` en `.env`, solo para pruebas), o a las 12 h.
  `ControlInactividad.tsx` cierra y va al login. Bloqueo de 15 min tras 5 intentos fallidos.
- Reglas: usuario 3–30 caracteres (letras, números, `.` `_` `-`); contraseña ≥ 8 con letra y número
  (`lib/auth/reglas.ts`). `proxy.ts` solo mira la cookie; la sesión se valida en el layout, el login
  y cada server action. "Cerrar sesión" pide confirmación.
- `lib/prisma.ts` guarda en `globalThis` también la clase del cliente (tras `prisma generate` el dev
  server toma el cliente nuevo sin reiniciar).

### Fase 4 — Validación de formularios ☑
- Validadores puros en `data-table/validacion.ts` (texto, número con coma o punto, fecha, CUIT con
  dígito verificador, email, teléfono, CBU, alias, CODE39; topes `MONTO_MAX` 100 M, `CANTIDAD_MAX`
  1 M, 2 decimales). Una regla por formulario en `_dominio/reglas.ts` (`validarCliente`,
  `validarOrden`, …) que usan **la pantalla y el servidor**; el servidor rechaza todo dato inválido.
- Pantalla: `useErroresFormulario` (error al salir del campo, foco en el primero al guardar),
  `ErrorCampo`, `CampoNumero` (texto que solo deja dígitos y una coma/punto, no `type=number`),
  `CampoFecha` (siempre dd/mm/aaaa, guarda `YYYY-MM-DD`). Formularios con `noValidate`.
- Decisiones del usuario: venta mayor al stock → aviso y "Guardar igual"; salida manual mayor al
  saldo → se bloquea; Proveedores: obligatorios razón social, contacto y producto; Clientes: CUIT
  obligatorio salvo Consumidor Final, se guarda como `30-71234567-8`; fechas reales entre el
  01/01/2020 y hoy (vencimiento posterior al embotellado y hasta el 31/12 del año actual + 15);
  compra usada en una orden ≤ su maceración; movimiento de un lote ≥ su embotellado. Duplicados
  rechazados: CUIT (clientes y proveedores), materia prima, producto + formato, código de barras.

### Fase 5 — Importación de la planilla de Excel ☑
- Se sube un Excel (.xlsx/.xls) o uno o más .csv; **se lee en el navegador** (SheetJS). Detección
  automática de cada tabla (planilla Alquimia o plantilla limpia descargable) por títulos,
  encabezados, sinónimos y tipo de dato; lo dudoso se elige de un desplegable.
- `planificar(ext, { base })` aplica cada registro con `aplicar()` (mismas reglas y
  sincronizaciones). **Incremental**: no duplica (catálogos por CUIT o nombre; compras por fecha +
  materia + cantidad; órdenes por producto + maceración; ventas por fecha + cliente + producto +
  cantidad, contando repeticiones). Lo que ya está se compara dato por dato: vacío en la app → se
  completa solo; distinto → el usuario elige (la importación queda bloqueada hasta elegir); vacío en
  la planilla → no borra.
- Errores por fila con corrección en pantalla, avisos, comparación con los totales de la planilla,
  copia de seguridad (`VACUUM INTO` en `respaldos/`) antes de guardar e historial de subidas (tabla
  `SubidaPlanilla`). Aviso al salir / cerrar sesión con una planilla en revisión.
- Vendedores: tabla `Vendedor`, salen de las ventas (sin pantalla de ABM). `addLote`: lote con stock
  previo al sistema. Cítricos: la cáscara de una compra suma al inventario y es lo que usan las
  órdenes (`stockDeCompra`). Cantidades con 2 decimales (se redondea con aviso).
- Port forwarding de VS Code: `ORIGENES_PERMITIDOS` en `.env` (ver `next.config.ts`).
- Planilla de prueba con volumen: `C:\Users\patan\Downloads\planilla-claude.xlsx`.
- Copias de seguridad automáticas: **postergadas por el usuario a la Fase 10**.

### Fase 6 — Datos falsos con volumen + testeo general ☑
- `generarDatos({ semilla = 1, desde = "2024-01-01", hasta = hoy })` (`_dominio/generador.ts`): puro y
  determinístico (PRNG mulberry32). Simula el negocio **día por día con `aplicar()`**: catálogo real
  (7 productos, 27 materias primas), clientes / proveedores / vendedores inventados, precios con
  inflación, órdenes cuando un producto baja de 42 días de stock, compras (frescos por orden, el
  resto con punto de reposición), ventas con estacionalidad y crecimiento, solo de lo ya embotellado.
  Con semilla 1 hasta el 17/10/2026: 534 compras, 111 órdenes, 109 lotes, 1655 ventas.
- `revisarEstado` (`_dominio/revisar.ts`) revisa todo el estado; el seed no carga si hay problemas.
- **Orden sin cantidad mientras macera** (decisión del usuario): `cantidadProducida` puede ser `null`;
  es obligatoria solo con fecha de embotellado.

### Fase 7 — Pantallas horizontales y navegadores ☑
- Decisiones del usuario: soporte **desde ~900 px de ancho efectivo** (1366 al 150 %); en 2560 y
  ultrawide, Panel y Estadísticas con **máximo 1800 px centrado** (las tablas usan todo el ancho);
  fuente Arial / Helvetica.
- Playwright (`playwright.config.ts`, `e2e/`): levanta `next start -p 3005` sobre una copia de la base
  (`e2e/preparar-base.mjs`), entra con `claude_qa` (`e2e/credenciales.ts` o `E2E_USUARIO` /
  `E2E_CLAVE`). `e2e/humo.spec.ts`: 18 pruebas de funcionamiento por navegador (Fase 9 incluida).
  `e2e/tamanos.spec.ts`: 84 vistas (secciones, modales, Estadísticas con 5 períodos, Importar con
  planilla cargada vía `E2E_PLANILLA`) en 19 tamaños; capturas en `test-results/tamanos*/` y chequeos
  automáticos (sin scroll horizontal, nada fuera de su tarjeta, texto cortado con tooltip, modal y
  sus botones a la vista, sidebar sin scroll desde 470 px de alto). **Los gráficos no se pueden
  chequear solos: revisar las capturas a ojo.**
- Sidebar en íconos debajo de 1100 px (botón ☰ la despliega encima; Esc / clic afuera / elegir
  sección la cierran) y compacta con alto ≤ 720 px. Modales con título y botones fijos (`sticky`) y
  scroll interno; `ModalShell` con `role="dialog"`.
- `.es-grid` apila en 1 columna recién debajo de 900 px. Tira de indicadores: 6 columnas desde
  1400 px de contenedor. Tablas de Estadísticas con alto máximo 460 px y textos largos cortados con
  tooltip.
- Gráficos: `ajustarAlAncho(option, ancho, alto)` (`graficos.ts`, con tests) adapta cada gráfico a su
  tamaño real, en pantalla y en el PDF: ancho de etiquetas de categorías (inclinadas si no entran),
  nombres de barras horizontales ≤ 1/3, montos ocultos si la barra tiene < 44 px, leyenda de donas
  abajo si no entra al lado y radio limitado por el lado más corto, porcentajes dentro del anillo
  solo si mide ≥ 44 px.
- PDF de Estadísticas: las flechas ▲ / ▼ se dibujan (la fuente del PDF no las tiene).
- Versiones mínimas (para el README de la Fase 10): Chromium ≥ 111 (Chrome, Edge, Brave, Opera,
  Vivaldi), Firefox ≥ 121, Safari ≥ 16.4 (macOS 13.3).
- **Pendiente:** el usuario corre `docs/checklist-navegadores.md` en Brave / Opera / Vivaldi y en
  Safari de una Mac real.

### Fase 8 — Correcciones menores y estética ☑
Decisiones del usuario (20/10/2026): paginación clásica de a 50 filas; materias primas "Para cada
orden" sin alerta; pantalla chica de vendedores; faltante de una venta → negativo en el último lote
disponible a su fecha; tablas de catálogos con máximo 1800 px en pantallas anchas.
- **FIFO por fechas** (`_dominio/sync.ts`: `asignarFifo`, `recalcularFifo`, `faltanteDeProducto`):
  una venta solo descuenta de lotes embotellados hasta su fecha (los lotes previos al sistema, desde
  siempre). Se recalculan juntas todas las ventas del producto (`conFifo` en `aplicar`) al cargar,
  editar o borrar una venta, cambiar una orden o un lote: el resultado no depende del orden de carga
  (importación incluida). Faltante → negativo en el último lote disponible; sin lote a esa fecha → la
  venta queda sin lote. El aviso de la venta (`faltanteDeVenta` en `reglas.ts`) mira la fecha.
- **Guardas**: `deleteLote` rechaza el lote de una orden y uno con ventas; `deleteOrden` rechaza si
  su lote tiene movimientos; `validarOrden` no deja quitar el embotellado ni cambiar el producto si
  el lote tiene movimientos, ni poner un embotellado posterior a un movimiento manual. Las listas de
  OP en los mensajes se cortan en 10 ("y N más").
- **Materia prima**: columna "Compra" (`reposicion`: "Con stock" / "Para cada orden"; en la base
  `compraPorOrden`, migración `20261020120000_compra_por_orden` que marca Limón, Naranja, Pomelo,
  Menta y Jengibre). Esas no dan alerta (estado `por-orden` en `stockMaterias`).
- **Vendedores**: botón "Vendedores" en Operaciones (`operaciones/VendedoresModal.tsx`): alta,
  renombrar (actualiza sus ventas) y eliminar solo sin ventas (`updateVendedor`, `deleteVendedor`).
- **DataTable** (`data-table/DataTable.tsx`, `paginacion.ts`): páginas de 50 (búsqueda, filtros, orden,
  PDF y Ctrl+A sobre todas las filas); fila activa (clic, ↑ ↓ cambian de página, Esc); selección
  (Shift + clic rango, Ctrl/⌘ + clic suelta, Ctrl/⌘ + A, Supr, Esc), barra "N seleccionadas · Eliminar
  · Quitar selección" y "Descargar PDF (N)" con solo las seleccionadas; borrado múltiple en una
  transacción (`aplicarVarios` + `ejecutarVarios` + `eliminarFilas` del store), todo o nada por
  registro, con el resultado de los que no se pudieron borrar (`EliminarVariosDialog`). Teclado solo
  con el foco en la tabla y sin modales abiertos. "Atajos" en el pie (tooltip).
- **Textos largos**: las columnas de texto/email se cortan con "…" (`Column.maxWidth`; con ancho en %
  la columna ocupa su parte y la tabla entra sin scroll horizontal en 1366; `maxWidth: null` para
  CUIT, teléfono, CBU, alias, comprobante) y el texto completo va en el tooltip.
- **Ficha de solo lectura** (doble clic o Enter): `FichaRegistroModal` + `FichaBloques` en Clientes
  (ventas), Proveedores (compras), Operaciones (lote de origen), Órdenes (insumos con su compra y lote
  generado) y Trazabilidad (comprobante, disponible y órdenes que la usaron). Sin ficha (Materia
  prima, Productos), el doble clic abre la edición. Datos como lista "Etiqueta: valor" en columnas
  (no tarjetas, pedido del usuario). Las tablas de la ficha muestran **todas** las filas con scroll
  propio y cada fila lleva a ese registro en su sección (`?foco=<id>`: `DataTable.enfocar` va a su
  página, la marca como activa y la centra): venta → Operaciones, compra → Trazabilidad, orden →
  Órdenes, lote → Productos terminados.
- `<title>` propio en cada sección; números con coma en los formularios de edición (`numeroATexto`);
  "Página i de N" en todos los PDF (`data-table/pdfComun.ts`); PDF de Estadísticas sin filas sueltas
  al cortar una tabla (mide las filas con `__createTable`).
- Revisión final (20/10/2026): en Productos terminados el botón de eliminar queda atenuado
  (`aria-disabled`) con el motivo en el tooltip si el lote es de una orden o tiene ventas; vendedores
  se guardan en mayúsculas; en Estadísticas una orden macerando sin cantidad muestra "—" (no 0); el
  Panel y la alerta de maceración larga llevan a su registro con `?foco=`. E2E nuevos: borrado
  múltiple parcial, vendedores y salto ficha → Operaciones; `tamanos.spec.ts` suma las fichas, la
  selección, el borrado múltiple y vendedores.
- Simplificación conocida del FIFO: los movimientos cargados a mano en un lote cuentan para el saldo
  sin importar su fecha (alcanza para el uso real; revisar si el cliente carga muchos ajustes).
- Pendiente de respuesta del cliente (sin cambios): MPR / MPA, datos del establecimiento, proveedor
  obligatorio.

### Fase 9 — Features nuevas ☑
Elegidas por el usuario (22/10/2026) de una lista propuesta tras revisar el código. **Quedaron afuera**
(para más adelante, si el cliente las pide): cuentas corrientes de clientes, búsqueda global, exportar
todo a Excel, libros PUPAA de ventas y producción, lote elegido a mano en la venta (hoy es FIFO y se
recalcula) y columna de lotes por cliente.
- **Precio sugerido en la venta**: `Producto.linea` (`Tradicional | Premium | Lista`; migración
  `20261022120000_producto_linea`, que la deduce del formato; `lineaPorFormato` para importación y
  altas sin dato). `operaciones/precio.ts` (`precioSugerido`): Menor o línea Lista → precio de lista;
  Mayor → precio Tradicional / Premium del cliente (si no tiene, el de lista). En el formulario se
  recalcula al cambiar producto, cliente o canal hasta que el usuario escribe un P.U. (al editar se
  respeta el guardado); debajo dice de dónde sale y "Usar sugerido ($X)". El generador no se tocó.
- **Remito PDF** (`operaciones/remito.ts` + `exportRemitoPdf.ts`, A4 vertical): datos del cliente,
  fecha, OP, vendedor, condición, cantidad / producto / lote(s) con vencimiento / P.U. / subtotal,
  total, firma-aclaración-DNI-fecha y "Documento no válido como factura". Desde el ícono de cada
  venta, la ficha de la venta o "Remito" con varias seleccionadas (solo mismo cliente y fecha; si no,
  atenuado con el motivo). `DataTable` tiene `accionesSeleccion(filas, quitarSeleccion)` para botones
  extra en la barra de selección. Helpers de PDF de reportes en `data-table/pdfReporte.ts`.
- **Pagos a proveedores** (un pago por compra): `Compra.fechaPago` (null = pendiente; migración
  `20261022130000_compra_pago` deja todo lo anterior pagado en su fecha). Formulario: "Pagada" (fecha
  que sigue a la de la compra hasta tocarla) / "Pendiente de pago". Sin el dato (importación) una compra
  nueva queda pagada en su fecha y una existente conserva el suyo. Libro de compras: columna "Pago"
  (filtrable) y "Marcar pagadas" con la selección (acción `pagarCompra` por `aplicarVarios`, todo o
  nada por compra, con el motivo de las que no). Proveedores: columna "Deuda" y en la ficha deuda,
  compras impagas y desde cuándo (`deudaPorProveedor`). Alerta en el Panel si hay compras impagas de más
  de 30 días (`DIAS_PAGO_ATRASADO`), lleva a Proveedores. El generador usa un azar aparte para los pagos
  (la base de cada semilla no cambió): efectivo en el día, el resto hasta 30 días, parte del último mes
  y medio pendiente.
- **Retiro de lote**: `rastreo.ts` agrupa clientes por id (antes por nombre), `contactosDeRetiro`,
  `retiroDeLote` / `retiroDeLoteProveedor`. "Rastrear" en cada lote de Productos terminados abre la
  ficha de lote con ese lote. La ficha y el rastreo de un lote de proveedor muestran "Clientes a avisar"
  (contacto, teléfono, email, unidades) y el botón "PDF de retiro": qué se retira, pasos a seguir
  (casillas), lotes afectados con stock a inmovilizar, clientes con CUIT / teléfono / email / domicilio
  y detalle de entregas.
- **Aviso sin lote del proveedor** al guardar una compra nueva (o si se borra el lote): "Guardar igual",
  como el aviso de stock de las ventas. No bloquea en el servidor ni en la importación.
- De paso: los modales fijan su color de texto (en Windows / Mac con modo oscuro el texto heredado se
  veía casi blanco, ej. en el resultado del borrado múltiple).
- La base de desarrollo se recargó con `--hasta=2026-10-17` (copia previa en
  `respaldos/dev-antes-fase9-2026-10-22.db`); los usuarios no se tocan.

### Fase 10 — Entrega al cliente ☑ (publicada como v1.0.0 el 25/10/2026)
Decisiones del usuario (24/10/2026): el cliente usa **Windows** (Mac se genera igual); **app de
escritorio con Electron**; **copias a Google Drive por conexión directa** (OAuth, sin Google Drive para
escritorio); **actualizaciones automáticas** desde las Releases de `Freedom-ui/Licores-Alquimia`
(público); **datos del establecimiento editables**; **ícono provisorio** (`build/icono.svg` →
`npm run iconos`; el cliente no tiene logo).

- **Empaquetado** (`scripts/empaquetar.mjs`, `npm run app:build` → `dist/`): `next build` standalone
  (`output: "standalone"` solo con `ALQUIMIA_BUILD_ESCRITORIO=1`) sobre una base vacía propia
  (`build/cache/build.db`) + **Node 22.20.0 propio** dentro de la app (bajado de nodejs.org y verificado
  con SHA-256; no el Node de Electron porque better-sqlite3 no tiene binarios para las Electron
  vigentes). Saca del paquete `.env`, `*.db`, `respaldos/` y fuentes; reemplaza los enlaces de
  `.next/node_modules/<paquete>-<hash>` por la copia recortada; poda los compiladores de Prisma de otras
  bases; para otro sistema / arquitectura baja better-sqlite3 con `prebuild-install`; verifica que el
  servidor empaquetado tenga `next` y `.next`. electron-builder copia `build/app` entero porque siempre
  descarta el `node_modules` de la raíz de cada carpeta de `extraResources`.
- **Trampas del build** (resueltas, no repetirlas): un `fs.*` con ruta dinámica hace que Turbopack meta
  todo el proyecto en el standalone (el build avisa "Dynamic filesystem access…"; marcar con
  `/*turbopackIgnore: true*/`); `lib/datos/rutas.ts` oculta `process.cwd()` con `new Function`; las
  páginas que consultan la base antes de leer cookies llaman a `connection()` (si no, Next las
  pre-renderiza y en GitHub Actions, sin base, el build falla).
- **Electron** (`escritorio/`, proyecto aparte que solo depende de `electron-updater`; Electron 44.7.0 y
  electron-builder 26.17.0 en la raíz): levanta `server.js` con ese Node en `127.0.0.1:47811` (o uno
  libre), una sola instancia, ventana "Abriendo…", caché de Chromium en `navegador/`, enlaces externos al
  navegador del sistema, menú y clic derecho en español; al cerrar pide la copia al servidor (hasta
  60 s). `preload.ts` expone `window.alquimia` (contrato en `lib/puente.ts` = `escritorio/src/tipos.ts`).
  Instalador NSIS de un clic por usuario (sin administrador) que conserva los datos al desinstalar; Mac
  `dmg` + `zip` sin firma. `npm run app:dev` = la ventana contra `npm run dev`.
- **Arranque del servidor** (`instrumentation.ts` → `lib/arranque.ts`): aplica una restauración
  pendiente, las **migraciones con `lib/datos/migrar.ts`** (sin Prisma CLI, compatible con
  `_prisma_migrations`; copia "antes de actualizar"; rechaza bases de una versión más nueva) y arranca
  las copias automáticas (en escritorio o con `ALQUIMIA_COPIAS=1`).
- **Copias** (`lib/copias/`): `VACUUM INTO` + `integrity_check`; automática al arrancar (si no hay del
  día) y cada hora, al cerrar si hubo cambios, antes de importar / restaurar / actualizar, y manual.
  Rotación: todo 2 días, la última de cada día 30 días, la última de cada mes 24 meses, el resto 60 días.
  En desarrollo van a `respaldos/`; en las e2e a `e2e/.datos/copias`.
- **Google Drive** (`lib/copias/drive.ts`, `fetch` a la API v3): PKCE + `/api/drive/callback` (ruta
  pública, `state` de un solo uso), scope `drive.file`, carpeta "Licores Alquimia - Copias de
  seguridad", copias `.db.gz`; sube las de la última semana que falten y aplica la misma rotación.
- **Restaurar**: copia local, de Drive o archivo (.db / .gz) → verificación → copia "antes de restaurar"
  → `restaurar-pendiente.db` → reinicio del servidor → login con `?motivo=restaurada`.
- **Configuración** (`app/(dashboard)/configuracion/`): copias, **datos del establecimiento** (tabla
  `Empresa`; `validarEmpresa` / `empresaActual()` en `app/empresa.ts`, los usan todos los PDF) y Acerca
  de. Panel: cartel "Protegé tus datos" si Drive no está conectado y alertas de copias atrasadas o de
  Drive caído.
- **Release** (`.github/workflows/release.yml`): un trabajo crea la Release en borrador y después Windows
  x64 y Mac arm64 / x64 suben ahí (si cada uno la crea, los que corren a la vez hacen dos). El
  `latest-mac.yml` queda el del último: alcanza, en Mac solo se usa la versión para avisar.
- **Google Cloud** (proyecto `licores-alquimia`, cuenta del usuario): app "En producción" **sin logo**
  (con logo exige verificación), permisos no sensibles (`drive.file`, `openid`, `userinfo.email`),
  página principal y política de privacidad en GitHub Pages (`docs/index.html`, `docs/privacidad.html`;
  rama main, carpeta /docs → `https://freedom-ui.github.io/Licores-Alquimia/`), dominio autorizado
  `freedom-ui.github.io`, cliente "App de escritorio". Credenciales en `.env` (desarrollo) y en los
  secretos del repo `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (instaladores). `drive.json` está en
  `.gitignore`. En el panel del navegador de Claude el `window.open` de "Conectar" se bloquea: abrir la
  URL de Google a mano en otra pestaña.
- De paso: el CUIT de ejemplo de los mensajes era inválido (`30-71234567-8`); ahora `30-71234567-1`.
- Docs: `README.md` (desarrollo, release, Google Cloud), `docs/guia-instalacion.md`,
  `docs/manual-de-uso.md`.
- Probado: 412 tests, e2e en Chromium / Firefox / WebKit (58), app empaquetada en esta PC (CDP en el
  puerto 9333; usuario de prueba en `.claude/qa-usuario.local`) e instalación real desde la Release por
  el usuario, con Drive y copias. Planillas de prueba en `C:\Users\patan\Downloads\Pruebas Licores
  Alquimia\` (la 1, con volumen y sin errores; la 2, la original del cliente con 5 errores para corregir).
- El checklist de navegadores de la Fase 7 ya no aplica al cliente (la app trae su propio Chromium).

## 4. Verificación estándar de cada fase
`npx tsc --noEmit`, `npx eslint`, `npx next build`, prueba en el navegador (golden path
+ casos borde + responsive), PDFs abiertos y revisados, y mostrarle el resultado al
usuario antes de seguir. Desde la Fase 7, probar también en Firefox y al menos en
1366×768 y 1920×1080.
