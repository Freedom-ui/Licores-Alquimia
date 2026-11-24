# Pruebas de API

La app no tiene una API REST con muchas rutas. Tiene **tres clases de puntos de entrada** por HTTP, y los tres se prueban:

| Clase | Qué es | Dónde está el código |
| --- | --- | --- |
| **Rutas HTTP propias** | Dos rutas `GET` escritas a mano | `app/api/copias/[nombre]/route.ts`, `app/api/drive/callback/route.ts` |
| **Server actions** | Funciones del servidor que la pantalla llama con un `POST` especial. Es por donde pasa **todo** lo que se guarda | `app/(dashboard)/_datos/acciones.ts`, `app/(acceso)/acciones.ts`, `app/(dashboard)/configuracion/acciones.ts`, `app/(dashboard)/_datos/importar.ts` |
| **Proxy** | Filtro que corre antes de cada pedido: sin cookie de sesión, manda al login | `proxy.ts` |

Las pruebas están en dos niveles:

- **Por HTTP de verdad** (`e2e/api.spec.ts`, Playwright): contra el servidor de producción armado con `next build`, en el puerto 3005, sobre una **copia** de la base. Se ven los códigos HTTP reales, los encabezados y el proxy.
- **Llamando a la función del servidor** (`pruebas/integracion/*.test.ts`, Vitest): la misma función que atiende el pedido, con una base SQLite temporal. Sirve para revisar **qué quedó escrito en la base** después de cada pedido.

> **Por qué no Postman:** la colección de Postman de la entrega (`entrega/Evidencias/EV-API-coleccion.postman_collection.json`) sigue sirviendo para probar a mano. Para que las pruebas corran solas y queden en el proyecto se usó Playwright, que **ya estaba instalado** y tiene un cliente HTTP (`request`). No se agregó ninguna herramienta.

---

## 1. Cómo se llama una server action por HTTP

La pantalla no llama a una URL como `/api/ventas`. Next arma un `POST` a la página en la que está, con un encabezado que dice qué función del servidor ejecutar:

```http
POST /operaciones HTTP/1.1
Next-Action: 40a1b2c3…            ← id de la función (lo genera el build)
Content-Type: text/plain;charset=UTF-8
Accept: text/x-component
Cookie: alquimia_sesion=<token>

[{"tipo":"addOperacion","v":{"fecha":"2026-11-02","clienteId":1,"vendedor":"ALQUIMIA","productoId":2,"cantidad":3,"canal":"Menor","condicion":"Contado","pu":10000}}]
```

- El **cuerpo** es la lista de argumentos de la función, en JSON. `ejecutar` recibe uno: la acción.
- El **id** cambia en cada build. Las pruebas lo leen de `.next/server/server-reference-manifest.json`, buscando el nombre de la función y su archivo (`idDeAccion` en `e2e/api.spec.ts`).
- La **respuesta** viene en el formato de React (líneas `0:{…}`, `1:{…}`). Una de esas líneas es el resultado de la app: `{"ok":true,"estado":{…}}` o `{"ok":false,"error":"…","campo":"…"}`.
- **Un error de validación responde 200**, con `ok:false` en el cuerpo. Es como funcionan las server actions: el código HTTP dice que el pedido llegó y se procesó, y el resultado de negocio va en el cuerpo. Por eso las pruebas miran el cuerpo y no solo el código.

---

## 2. Inventario de puntos de entrada

### 2.1 `GET /api/copias/[nombre]` — descargar una copia de seguridad

| | |
| --- | --- |
| **Para qué** | Bajar una copia de la base desde Configuración (por ejemplo, para guardarla en un pendrive) |
| **Autenticación** | Cookie de sesión válida (proxy + `obtenerSesion`) |
| **Parámetro** | `nombre`: nombre exacto de una copia de la carpeta de copias (`alquimia-AAAA-MM-DD-hhmmss-motivo.db`) |
| **Respuestas** | `200` archivo adjunto · `307` al login sin cookie · `401` cookie que no es de una sesión válida · `404` copia que no está · `405` otro método |
| **Seguridad** | El nombre se busca en la **lista** de copias. No se arma una ruta con lo que llega, así que `../` no sirve para salir de la carpeta |

| Id | Qué se verifica | Esperado | Obtenido |
| --- | --- | --- | --- |
| API-09 | Con sesión, una copia que existe | 200, `Content-Disposition: attachment`, `Cache-Control: no-store`, el archivo empieza con `SQLite format 3` | Igual |
| API-10 | Sin cookie | 307 a `/login` | Igual |
| API-11 | Cookie inventada | 401 | Igual |
| API-12 | Copia inexistente, `..%2Fe2e.db`, un nombre cualquiera | 404 | Igual |
| API-13 | `POST` y `DELETE` | 405 | Igual |
| IT-R01 a IT-R04 | Lo mismo llamando a la función, más ruta absoluta (`C:\Windows\win.ini`) y la base misma (`alquimia.db`) | 401 / 200 / 404 | Igual |

### 2.2 `GET /api/drive/callback` — vuelta de Google al conectar Drive

| | |
| --- | --- |
| **Para qué** | Google vuelve acá después de que el usuario da (o niega) el permiso de Drive |
| **Autenticación** | Pública (la abre el navegador del sistema, sin la cookie). La protege el `state` de un solo uso que genera la app |
| **Parámetros** | `code`, `state`, `error` |
| **Respuestas** | `200` página «¡Listo!» · `400` página con el motivo (permiso cancelado, sin código, `state` falso o vencido) |

| Id | Qué se verifica | Esperado | Obtenido |
| --- | --- | --- | --- |
| API-14 / IT-R05 | `?error=access_denied` | 400, HTML, «Cancelaste el permiso…», sin pedir sesión | Igual |
| API-15 / IT-R06 | Sin `code` | 400 | Igual |
| API-16 / IT-R07 | `code` con un `state` que la app no generó | 400, «venció o no es de esta app», no se crea `drive.json` | Igual |

El caso de éxito (Google responde con un token) no se prueba automáticamente: necesitaría una cuenta de Google real y salir a internet. Lo cubren los tests unitarios de `lib/copias/drive.test.ts`, que simulan las respuestas de Google.

### 2.3 Server action `ejecutar(accion)` — todo lo que se guarda

`app/(dashboard)/_datos/acciones.ts`. Recibe **una acción** (`{ tipo, … }`) y la aplica en una transacción. Hay 31 tipos: alta, edición y baja de cada sección, más pagar una compra. La lista está en `Accion`, en `app/(dashboard)/_dominio/acciones.ts`.

| Respuesta | Cuándo |
| --- | --- |
| `{ ok: true, estado }` | Se guardó. `estado` trae todos los datos actualizados |
| `{ ok: false, error, campo? }` | Un dato inválido o una regla del negocio lo impide. `campo` dice en qué campo del formulario mostrar el error |
| `{ ok: false, error, sinSesion: true }` | No hay sesión válida |
| `{ ok: false, error: "Acción desconocida." }` | Lo que llegó no es una acción |
| `{ ok: false, error: "No se pudo guardar…" }` | Error inesperado de la base (se registra en el log del servidor) |

| Id | Qué se verifica | Esperado | Obtenido |
| --- | --- | --- | --- |
| API-01 | Alta de venta válida | 200, `ok:true`, la venta en el estado devuelto, en menos de 3 s | 200 en ~200 ms |
| API-02 | Pedido con `subTotal: 1` manipulado | El servidor calcula `cantidad × pu` = 30000 | Igual |
| API-03 | Cantidad -5, cantidad como texto, fecha «20/10», cliente inexistente, sin producto, precio negativo | 200 con `ok:false` y el `campo` de cada error | Igual (6 casos) |
| API-04 | Sin cookie | 307 al login (el proxy corta antes de la acción) | Igual |
| API-05 | Cookie inventada | 200 con `ok:false, sinSesion:true` | Igual |
| API-06 | Tipo inexistente, sin tipo, `null` | `Acción desconocida.` | Igual |
| API-07 | Cuerpo que no es JSON | Código de error (≥ 400) y nada guardado | 500 (lo responde Next antes de llegar al código de la app) |
| API-08 | Id de acción que no existe | 404 | Igual |
| DEF-04 | El mismo pedido de alta dos veces seguidas | Una sola venta | **Dos ventas** → defecto DEF-04 |

En integración (`pruebas/integracion/datos.test.ts`, IT-D01 a IT-D18) se suma lo que hay que mirar en la base:

- que una venta descuente el stock y deje la salida del lote apuntando a la venta (IT-D10);
- que un rechazo no deje nada a medias, porque la transacción se deshace (IT-D11);
- que editar o borrar una venta devuelva las botellas (IT-D13, IT-D14);
- que un renombre se vea en las ventas (IT-D08);
- que un `id` o un campo de más en el pedido se ignoren (IT-D07).

### 2.4 Server action `ejecutarVarios(acciones)` — borrado múltiple

Recibe una lista de bajas (o «pagar compra»), de hasta 2000 (`MAX_VARIOS`). Borra las que puede y devuelve en `fallos` las que una regla no deja borrar.

| Id | Qué se verifica | Esperado | Obtenido |
| --- | --- | --- | --- |
| IT-D16 | Un cliente sin ventas y uno con ventas | Borra el primero, devuelve el motivo del segundo | Igual |
| IT-D17 | Lista vacía, algo que no es lista, un alta mezclada | Rechazo sin cambios | Igual |
| IT-D18 | Sin sesión | `sinSesion` | Igual |

### 2.5 Server actions de acceso — `app/(acceso)/acciones.ts`

Son **públicas** por necesidad: se usan antes de iniciar sesión. Por eso cada una revalida todo lo que llega.

| Función | Para qué | Casos |
| --- | --- | --- |
| `crearCuentaInicial` | Primer arranque: crea la única cuenta | IT-A01 a IT-A04 |
| `iniciarSesion` | Login. Mensaje genérico si falla; bloqueo de 15 min a los 5 fallos | IT-A05 a IT-A12 |
| `recuperarAcceso` | Con el código de recuperación: paso 1 verifica, paso 2 cambia usuario y contraseña | IT-A18 a IT-A22 |
| `cerrarSesion`, `mantenerSesion` | Cerrar y mantener viva la sesión | IT-A16, IT-A17 |

La sesión también se prueba sola (`lib/auth/sesion.ts`): vence a los 30 minutos sin uso (IT-A13 con 29 minutos, IT-A14 con 31) y a las 12 horas aunque se use (IT-A15).

### 2.6 Server actions de Configuración — `app/(dashboard)/configuracion/acciones.ts`

| Función | Casos |
| --- | --- |
| `guardarEmpresa` | IT-C01 a IT-C03: sin sesión, guardar y actualizar sin duplicar, CUIT o nombre inválidos |
| `consultarCopias`, `copiarAhora` | IT-C04, IT-C05 |
| `restaurarLocal`, `restaurarDrive`, `restaurarArchivo` | IT-C06 a IT-C09: nombre manipulado, id con caracteres raros, archivo vacío o que no es una base, copia válida |
| `conectarDrive`, `desconectarDrive`, `subirAhora`, `listarDrive` | Necesitan Google Drive real. Los cubren los tests unitarios de `lib/copias/drive.test.ts`, con respuestas simuladas |

### 2.7 Server action `importarPlanilla` — `app/(dashboard)/_datos/importar.ts`

| Id | Qué se verifica | Esperado | Obtenido |
| --- | --- | --- | --- |
| IT-I01 | Sin sesión | No importa | Igual |
| IT-I02 | 4 entradas malformadas | «Los datos de la planilla llegaron incompletos…» | Igual |
| IT-I03 | Planilla completa a una base vacía | Se cargan todas las secciones; orden → lote → venta encadenados (stock 12 − 6 = 6) | Igual |
| IT-I04 | El mismo archivo dos veces | La segunda vez no agrega nada | Igual |
| IT-I05 | Con datos previos | Copia de seguridad antes, y solo se agrega lo nuevo | Igual |

### 2.8 Proxy y páginas

| Id | Qué se verifica | Esperado | Obtenido |
| --- | --- | --- | --- |
| API-17 | `/operaciones` sin cookie; `/login` | 307 al login; 200 | Igual |
| API-18 | Una ruta que no existe, con sesión | 404 | Igual |

---

## 3. Cómo correrlas

```bash
npm run test:api            # arma el build y corre e2e/api.spec.ts
npm run test:integracion    # las de integración (sin build, sin servidor)
```

El servidor de las pruebas usa `e2e/.datos/e2e.db`, una copia de `dev.db` hecha al arrancar (`e2e/preparar-base.mjs`). Las pruebas de integración usan una base nueva en la carpeta temporal del sistema. **`dev.db` no se toca nunca.**
