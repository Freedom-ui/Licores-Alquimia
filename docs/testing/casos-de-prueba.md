# Casos de prueba

Cada caso tiene un **identificador** que aparece en el nombre de la prueba automática. Así se lo encuentra en el código y en los reportes (por ejemplo, buscar «IT-D10» en `pruebas/integracion/datos.test.ts`).

**Cómo leer las tablas**
- Las **precondiciones y los pasos comunes** de cada grupo están arriba de su tabla. Las filas solo dicen lo propio de cada caso.
- **Obtenido** es el resultado real de la última corrida (`npm run test:todo`). Si coincide con lo esperado, dice «Igual».
- **Estado:** ✅ aprobado · ❌ fallido.

| Prefijo | Grupo | Archivo |
| --- | --- | --- |
| IT-D | Integración: guardar datos | `pruebas/integracion/datos.test.ts` |
| IT-A | Integración: acceso y sesión | `pruebas/integracion/acceso.test.ts` |
| IT-R / IT-C | Integración: rutas HTTP y Configuración | `pruebas/integracion/configuracion-y-rutas.test.ts` |
| IT-I | Integración: importación de la planilla | `pruebas/integracion/importacion.test.ts` |
| API | API por HTTP | `e2e/api.spec.ts` |
| FUN | Funcionales en el navegador | `e2e/funcional.spec.ts` |
| DEF | Defectos abiertos | `e2e/defectos.spec.ts` |

Las 469 pruebas unitarias y las 19 de humo se resumen al final (sección 8). Son muchas y cada una prueba una regla puntual: su nombre ya describe el caso.

---

## 1. Integración: guardar datos (IT-D)

**Objetivo del grupo.** Que la server action `ejecutar` valide la sesión y los datos, y que lo que queda en la base sea correcto y consistente.

**Precondiciones.** Base temporal con las migraciones del proyecto y los datos de ejemplo (`cargarDemo`). Salvo que se indique otra cosa, con una sesión iniciada (`entrar()`).

**Pasos comunes.** 1) Leer el estado de la base. 2) Llamar a `ejecutar(acción)`. 3) Verificar la respuesta. 4) Volver a leer la base y comparar.

| Id | Caso | Tipo | Datos de entrada | Esperado | Obtenido | Estado |
| --- | --- | --- | --- | --- | --- | --- |
| IT-D01 | Sin cookie de sesión | Negativo | Alta de venta, sin cookie | `ok:false, sinSesion`; no se guarda | Igual | ✅ |
| IT-D02 | Cookie inventada | Negativo | Cookie `inventada123` | `sinSesion`; no se guarda | Igual | ✅ |
| IT-D03 | Sesión borrada de la base | Negativo | Sesión válida que después se borra | `sinSesion` | Igual | ✅ |
| IT-D04 | Lo que llega no es una acción (5 casos) | Negativo | `null`, texto, número, objeto sin tipo, tipo inexistente | «Acción desconocida.»; la base no cambia | Igual | ✅ |
| IT-D05 | Alta de cliente válida | Positivo | Razón social con espacios de más, CUIT con espacios | Guardado limpio: «Almacén La Esquina», `20-12345678-6` | Igual | ✅ |
| IT-D06 | CUIT con dígito verificador mal | Validación | `20-12345678-7` | Error en `cuit`; no se guarda | Igual | ✅ |
| IT-D07 | Campos de más en el pedido | Negativo | `id: 1`, `hackeo: "x"` | Se ignoran; no pisa el cliente 1 | Igual | ✅ |
| IT-D08 | Renombrar cliente | Integridad | Cliente 1 → «CONSUMIDOR FINAL» | Sus ventas muestran el nombre nuevo | Igual | ✅ |
| IT-D09 | Borrar cliente con ventas | Negativo | Cliente 1 | Rechazo «tiene operaciones cargadas»; sigue en la base | Igual | ✅ |
| IT-D10 | Alta de venta | Positivo / integridad | 3 botellas a $10 000 | Venta guardada (subtotal 30 000); stock −3; salidas del lote con `origenOperacionId` que suman 3 | Igual | ✅ |
| IT-D11 | Venta inválida (9 casos) | Validación / negativo | Cantidad −5 y 0; fecha «20/10» y 31/02; cliente 99999; sin producto; vendedor «NADIE»; canal «Online»; precio −1 | Error en el campo de cada caso; ventas y lotes sin cambios | Igual | ✅ |
| IT-D12 | Vender más de lo que hay | Borde | Stock + 5 | Se permite (regla del negocio) y el stock queda en −5 | Igual | ✅ |
| IT-D13 | Borrar una venta | Integridad | Venta de 4 | El stock vuelve +4; no quedan salidas de esa venta | Igual | ✅ |
| IT-D14 | Editar la cantidad | Integridad | De 2 a 5 | El stock baja 3 más | Igual | ✅ |
| IT-D15 | Editar o borrar una venta inexistente | Negativo | id 99999 | Rechazo | Igual | ✅ |
| IT-D16 | Borrado múltiple con una que no se puede | Positivo / negativo | Cliente nuevo + cliente 1 | Borra el nuevo; devuelve el motivo del 1 | Igual | ✅ |
| IT-D17 | Borrado múltiple inválido (3 casos) | Negativo | Lista vacía; no es lista; un alta mezclada | Rechazo sin cambios | Igual | ✅ |
| IT-D18 | Borrado múltiple sin sesión | Negativo | Sin cookie | `sinSesion` | Igual | ✅ |

## 2. Integración: acceso y sesión (IT-A)

**Objetivo del grupo.** Que el primer arranque, el login, el bloqueo, el vencimiento y la recuperación funcionen sobre la base real.

**Precondiciones.** Base temporal vacía. Donde dice «con usuario», existe `qa.tester` con una contraseña de prueba creada en la misma prueba.

**Pasos comunes.** Armar el formulario como lo manda el navegador (`FormData`), llamar a la acción, verificar la respuesta o la redirección, la cookie y la base.

| Id | Caso | Tipo | Datos de entrada | Esperado | Obtenido | Estado |
| --- | --- | --- | --- | --- | --- | --- |
| IT-A01 | Primer arranque válido | Positivo | `maria.lopez` / contraseña válida | Usuario creado; contraseña guardada con bcrypt (no en texto); código de 7 caracteres; cookie; va a `/codigo-recuperacion` | Igual | ✅ |
| IT-A02 | Primer arranque con 3 errores | Validación | Usuario `ab`, contraseña sin números, confirmación distinta | Un error por campo; nada creado | Igual | ✅ |
| IT-A03 | Cuenta inválida (5 casos) | Validación | Usuario con espacio o con tilde; contraseña de 7; igual al usuario (otras mayúsculas); confirmación distinta | Error en el campo de cada caso | Igual | ✅ |
| IT-A04 | Segunda cuenta inicial | Negativo | Ya existe una cuenta | Va a `/login`; sigue habiendo 1 usuario | Igual | ✅ |
| IT-A05 | Login correcto | Positivo / seguridad | Usuario y contraseña correctos | Cookie; en la base, el hash del token (no el token) | Igual | ✅ |
| IT-A06 | Usuario con espacios alrededor | Borde | `  qa.tester  ` | Entra | Igual | ✅ |
| IT-A07 | Contraseña incorrecta | Negativo | Otra contraseña | «Usuario o contraseña incorrectos.»; 1 intento registrado; sin cookie | Igual | ✅ |
| IT-A08 | Usuario inexistente | Negativo / seguridad | `nadie` | El **mismo** mensaje (no revela qué usuarios existen) | Igual | ✅ |
| IT-A09 | Otras mayúsculas | Borde | `Qa.Tester` | No entra (el usuario distingue mayúsculas). Ver DEF-02 | Igual | ✅ |
| IT-A10 | Campos vacíos | Validación | `""`, `""` | «Ingresá tu usuario y tu contraseña.»; no cuenta como intento | Igual | ✅ |
| IT-A11 | Bloqueo a los 5 fallos | Borde / seguridad | 5 contraseñas mal y después la correcta | Avisa en el 3.º («quedan 2») y el 4.º («queda 1»); bloquea en el 5.º; con la correcta sigue bloqueado 15 minutos | Igual | ✅ |
| IT-A12 | Un acierto borra los fallos | Positivo | 2 fallos + acierto | 0 intentos registrados | Igual | ✅ |
| IT-A13 | 29 minutos sin uso | Valor límite | Último uso hace 29 minutos | La sesión sigue | Igual | ✅ |
| IT-A14 | 31 minutos sin uso | Valor límite | Último uso hace 31 minutos | Vence y se borra de la base | Igual | ✅ |
| IT-A15 | Duración máxima | Valor límite | Creada hace 12 h 1 min, usada hace 1 min | Vence | Igual | ✅ |
| IT-A16 | Usar la app renueva la sesión | Positivo | Último uso hace 20 minutos + `mantenerSesion` | Último uso actualizado | Igual | ✅ |
| IT-A17 | Cerrar sesión | Positivo / seguridad | — | Se borra de la base y la cookie; la cookie vieja ya no sirve | Igual | ✅ |
| IT-A18 | Código de recuperación con formato inválido | Validación | `abc` | Error «7 caracteres»; no cuenta como intento | Igual | ✅ |
| IT-A19 | Código incorrecto | Negativo | Otro código válido en formato | «no es correcto»; 1 intento registrado | Igual | ✅ |
| IT-A20 | Código correcto con espacios | Borde | `Abc 1234` | Muestra el usuario de la cuenta | Igual | ✅ |
| IT-A21 | Recuperar: usuario y contraseña nuevos | Positivo / seguridad | Código + `maria.nueva` | Cambia el usuario; cierra las otras sesiones; se entra con los datos nuevos; el código viejo deja de servir | Igual | ✅ |
| IT-A22 | Recuperar con contraseña inválida | Validación | `corta` | Error en `contrasena`; nada cambia | Igual | ✅ |

## 3. Integración: rutas HTTP y Configuración (IT-R, IT-C)

**Precondiciones.** Base temporal y carpeta de copias temporal (`ALQUIMIA_DATOS`). Las rutas se llaman con un `Request` como el que arma Next.

| Id | Caso | Tipo | Datos de entrada | Esperado | Obtenido | Estado |
| --- | --- | --- | --- | --- | --- | --- |
| IT-R01 | Descargar copia sin sesión | Negativo | Copia existente | 401 | Igual | ✅ |
| IT-R02 | Descargar copia con sesión | Positivo | Copia existente | 200, adjunto, `no-store`, archivo SQLite completo | Igual | ✅ |
| IT-R03 | Nombre que no es una copia (4 casos) | Negativo / seguridad | Inexistente, `../alquimia.db`, `alquimia.db`, `C:\Windows\win.ini` | 404 | Igual | ✅ |
| IT-R04 | Cookie inventada | Negativo | `inventada123` | 401 | Igual | ✅ |
| IT-R05 | Google: permiso cancelado | Negativo | `?error=access_denied` | 400, «Cancelaste el permiso» | Igual | ✅ |
| IT-R06 | Google: sin código | Negativo | Sin parámetros | 400 | Igual | ✅ |
| IT-R07 | Google: `state` falso | Seguridad | `?code=abc&state=inventado` | 400; no se crea `drive.json` | Igual | ✅ |
| IT-C01 | Guardar establecimiento sin sesión | Negativo | Datos válidos | `sinSesion`; nada guardado | Igual | ✅ |
| IT-C02 | Guardar y actualizar | Positivo / integridad | Dos guardados seguidos | Una sola fila (id 1) con lo último | Igual | ✅ |
| IT-C03 | Establecimiento inválido (3 casos) | Validación | Sin nombre; CUIT mal; domicilio de 500 caracteres | Error en el campo; nada guardado | Igual | ✅ |
| IT-C04 | Copias sin sesión | Negativo | — | `sinSesion`; no se crea ninguna copia | Igual | ✅ |
| IT-C05 | «Hacer copia ahora» | Positivo | — | Copia `…-manual.db` en la carpeta | Igual | ✅ |
| IT-C06 | Restaurar copia local inválida | Negativo / seguridad | Inexistente; `../alquimia.db`; un número | «Esa copia ya no está en la PC.» | Igual | ✅ |
| IT-C07 | Restaurar de Drive con id raro | Seguridad | `../../etc` | «Copia desconocida.» sin salir a internet | Igual | ✅ |
| IT-C08 | Restaurar archivo vacío o basura | Negativo | Sin archivo; 8 bytes al azar | Rechazo; no queda restauración pendiente | Igual | ✅ |
| IT-C09 | Restaurar una copia válida | Positivo | Una copia recién hecha | Queda `restaurar-pendiente.db` y una copia «antes de restaurar» | Igual | ✅ |

## 4. Integración: importación de la planilla (IT-I)

**Precondiciones.** Base temporal vacía. Un Excel armado con la plantilla de la app: 1 producto, 2 materias primas, 1 proveedor, 1 cliente, 1 compra, 1 orden de 12 botellas y 1 venta de 6.

**Pasos comunes.** Leer el Excel y extraer los registros como en el navegador, llamar a `importarPlanilla`, contar lo que hay en la base.

| Id | Caso | Tipo | Datos de entrada | Esperado | Obtenido | Estado |
| --- | --- | --- | --- | --- | --- | --- |
| IT-I01 | Sin sesión | Negativo | Planilla válida | `sinSesion`; nada importado | Igual | ✅ |
| IT-I02 | Entrada malformada (4 casos) | Negativo | `null`; sin extracción; registros que no son lista; sección inventada | «Los datos de la planilla llegaron incompletos…» | Igual | ✅ |
| IT-I03 | Importar a una base vacía | Positivo / integración | Planilla completa | 1/1/2/1/1/1/1 registros; stock 12 − 6 = 6; venta de $48 000; sin copia previa | Igual | ✅ |
| IT-I04 | Importar dos veces lo mismo | Borde / integridad | La misma planilla | «No hay nada nuevo»; nada duplicado | Igual | ✅ |
| IT-I05 | Importar con datos previos | Positivo | La misma + 1 cliente | Copia «antes de importar»; solo se agrega el cliente nuevo | Igual | ✅ |

## 5. API por HTTP (API)

**Precondiciones.** Build de producción (`next build`) en el puerto 3005, sobre la copia de la base. Sesión iniciada por el proyecto `login` de Playwright. Una copia de seguridad de prueba en `e2e/.datos/copias`.

**Pasos comunes.** Armar el pedido HTTP (método, URL, encabezados, cuerpo), mandarlo sin seguir redirecciones, verificar código, encabezados y cuerpo.

El detalle de cada endpoint está en [api.md](api.md).

| Id | Caso | Tipo | Datos de entrada | Esperado | Obtenido | Estado |
| --- | --- | --- | --- | --- | --- | --- |
| API-01 | Alta de venta | Positivo | `POST /operaciones` + `Next-Action` de `ejecutar`, 3 × $10 000 | 200, `ok:true`, la venta en el estado, < 3 s | 200 en ~0,3 s | ✅ |
| API-02 | Subtotal manipulado | Seguridad / integridad | `subTotal: 1` | Guarda 30 000 | Igual | ✅ |
| API-03 | Datos inválidos (6 casos) | Validación / negativo | Cantidad −5 y «muchas»; fecha «20/10»; cliente 99999; sin producto; precio −100 | 200 con `ok:false` y el `campo` | Igual | ✅ |
| API-04 | Sin cookie | Seguridad | Sin `Cookie` | 307 a `/login` | Igual | ✅ |
| API-05 | Cookie inventada | Seguridad | `inventada123` | `ok:false, sinSesion` | Igual | ✅ |
| API-06 | Acción inválida (3 casos) | Negativo | Tipo inexistente; sin tipo; `null` | «Acción desconocida.» | Igual | ✅ |
| API-07 | Cuerpo que no es JSON | Negativo | `esto no es json` | Código de error, nada guardado | 500 | ✅ |
| API-08 | Server action inexistente | Negativo | `Next-Action` = 42 ceros | 404 | Igual | ✅ |
| API-09 | Descargar copia | Positivo | `GET /api/copias/<copia>` con sesión | 200, `application/octet-stream`, adjunto, `no-store`, SQLite | Igual | ✅ |
| API-10 | Copia sin cookie | Seguridad | — | 307 a `/login` | Igual | ✅ |
| API-11 | Copia con cookie inventada | Seguridad | — | 401 | Igual | ✅ |
| API-12 | Copia inexistente o manipulada (3 casos) | Negativo / seguridad | Inexistente; `..%2Fe2e.db`; `cualquiera.txt` | 404 | Igual | ✅ |
| API-13 | Método no permitido | Negativo | `POST` y `DELETE` | 405 | Igual | ✅ |
| API-14 | Drive: permiso cancelado | Negativo | `?error=access_denied` | 400 HTML, sin pedir sesión | Igual | ✅ |
| API-15 | Drive: sin código | Negativo | — | 400 | Igual | ✅ |
| API-16 | Drive: `state` falso | Seguridad | `?code=abc&state=falso` | 400 | Igual | ✅ |
| API-17 | Página sin cookie / login público | Seguridad | `GET /operaciones`, `GET /login` | 307 / 200 | Igual | ✅ |
| API-18 | Ruta inexistente | Negativo | `GET /no-existe` | 404 | Igual | ✅ |

## 6. Funcionales en el navegador (FUN)

**Precondiciones.** Mismo servidor que API. Chromium a 1366 × 768, con la sesión de las pruebas. FUN-07 usa una sesión propia y el reloj simulado.

| Id | Caso | Tipo | Pasos | Esperado | Obtenido | Estado |
| --- | --- | --- | --- | --- | --- | --- |
| FUN-01 | Cliente vacío | Validación | Clientes → + Nuevo → Guardar sin completar | Errores en los obligatorios; formulario abierto; no se guarda | Igual | ✅ |
| FUN-02 | CUIT mal | Validación | Razón social, R. Inscripto, CUIT `20-12345678-7` → Guardar | Mensaje «dígito verificador» debajo del campo | Igual | ✅ |
| FUN-03 | Venta con cantidad 0 | Validación | Venta completa con cantidad 0 → Guardar | Error en cantidad; no se guarda | Igual | ✅ |
| FUN-04 | Cerrar sin datos | Funcional | Abrir y cerrar con clic afuera, Esc y Cancelar | Se cierra las tres veces | Igual | ✅ |
| FUN-05 | Clic dentro del formulario | Funcional | Clic en el título y en un campo | No se cierra | Igual | ✅ |
| FUN-06 | Doble clic en Guardar | Borde | Venta válida + doble clic | Una sola venta más (también después de recargar) | Igual | ✅ |
| FUN-07 | Cierre por inactividad | Funcional / seguridad | Adelantar el reloj 241 minutos (el límite del servidor de pruebas es 240) | Vuelve a `/login?motivo=inactividad`; la sesión queda cerrada también en el servidor | Igual | ✅ |

## 7. Defectos abiertos (DEF)

Describen el comportamiento **esperado** y fallan mientras el defecto siga. El análisis completo está en [defectos.md](defectos.md).

| Id | Caso | Pasos | Esperado | Obtenido | Estado |
| --- | --- | --- | --- | --- | --- |
| DEF-01a | Clic afuera con datos | Venta a medio cargar → clic en el fondo | El formulario sigue abierto (o pide confirmar) | Se cierra y se pierde lo cargado | ❌ |
| DEF-01b | Esc con datos | Venta a medio cargar → Esc | Igual que DEF-01a | Se cierra y se pierde lo cargado | ❌ |
| DEF-05 | Arrastrar hasta afuera | Escribir en Razón social, seleccionar arrastrando y soltar en el fondo | Solo se selecciona el texto | El formulario se cierra | ❌ |
| DEF-02 | Usuario en el menú | Mirar el nombre en el menú lateral | `qa.tester` | `Qa.Tester` | ❌ |
| DEF-03 | Aviso antes de cerrar la sesión | Venta a medio cargar; adelantar el reloj 238 minutos | Un aviso de cierre de sesión | Ningún aviso | ❌ |
| DEF-04 | Pedido repetido | Mismo `POST` de alta dos veces | Una venta | Dos ventas | ❌ |

## 8. Pruebas unitarias y de humo (resumen)

### Unitarias (Vitest): 469 aprobadas, 1 omitida

La omitida («planilla real del cliente…») solo corre si se indica la planilla real del cliente con `PLANILLA_REAL=<ruta>`. Esa planilla no está en el repositorio porque tiene datos del cliente.

| Archivo | Qué prueba |
| --- | --- |
| `app/(dashboard)/_dominio/acciones.test.ts` | Cada acción con datos válidos e inválidos: rechazo con el campo y sin cambiar el estado |
| `app/(dashboard)/_dominio/fifo.test.ts` | Reparto de las ventas entre lotes (FIFO), ventas antes del embotellado, stock negativo |
| `app/(dashboard)/_dominio/generador.test.ts` | Los datos de prueba generados cumplen todas las reglas y son realistas |
| `app/(dashboard)/_dominio/demo.test.ts` | Los datos de ejemplo pasan la revisión completa |
| `app/(dashboard)/_dominio/entrega.test.ts` | Las 10 pruebas de la entrega del TP: aviso de stock (11/12 botellas), CUIT, largo del usuario |
| `app/(dashboard)/_importar/importar.test.ts` | Lectura de Excel y CSV, detección de tablas, extracción, plan de importación, mensajes |
| `app/(dashboard)/estadisticas/calculos.test.ts` | Períodos (enero, bisiesto, rangos al revés), cortes de gráficos, facturación, costo, margen, ranking, stock, producción |
| `app/(dashboard)/estadisticas/graficos.test.ts` | Ajuste de los gráficos al ancho disponible |
| `app/(dashboard)/_panel/calculos.test.ts` | Indicadores del Panel, alertas, últimas ventas, gráfico sin datos |
| `app/(dashboard)/operaciones/precio.test.ts` | Precio sugerido según canal y cliente |
| `app/(dashboard)/trazabilidad/rastreo.test.ts` | Rastreo de un lote de proveedor hasta los clientes, y ficha de lote |
| `app/components/data-table/validacion.test.ts` | Validadores de texto, números, fechas, CUIT, CBU, email y teléfono |
| `app/components/data-table/format.test.ts` | Formato de fechas (sin correrse de día), montos y valores vacíos |
| `app/components/data-table/paginacion.test.ts` | Páginas de las tablas |
| `lib/copias/*.test.ts` | Nombres y rotación de copias, copia y restauración, estado, Google Drive con respuestas simuladas |
| `lib/datos/migrar.test.ts` | Migraciones: base nueva, al día, pendientes, base de una versión más nueva, migración que falla |

### Humo en el navegador (`e2e/humo.spec.ts`): 19 pruebas por motor

Chromium **19/19** · WebKit **19/19** · Firefox: **no se pudo ejecutar** en esta PC (el navegador no abre; ver OBS-01 en [defectos.md](defectos.md)).

Cubren:
- que cada una de las 13 secciones cargue sin errores ni pedidos a internet;
- login, cierre de sesión y alta, edición y baja de clientes;
- la venta con aviso de stock, la orden macerando y la compra pendiente de pago;
- la selección en las tablas, el borrado múltiple y los vendedores;
- la ficha que lleva a una venta y los textos largos;
- los PDF (tabla, estadísticas, ficha de lote, remito, retiro de lote), los gráficos y la configuración;
- la pantalla angosta (1366 al 125 %).
