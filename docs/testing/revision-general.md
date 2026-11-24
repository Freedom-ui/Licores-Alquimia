# Revisión general del sistema

Cómo se revisó, qué funciona, qué no y qué tener en cuenta antes de mostrar la app en vivo. Los números de cada corrida están en [reportes.md](reportes.md). Los defectos, con su evidencia, están en [defectos.md](defectos.md).

## 1. Cómo se revisó

- **Recorriendo cada sección en el navegador** con las pruebas de humo (Chromium y WebKit). Cada sección tiene que cargar sin errores en la consola y sin pedidos a internet.
- **Probando los formularios** con datos válidos, inválidos y en los bordes: en pantalla (FUN), contra el servidor directamente (API) y sobre la base real (IT).
- **Mirando el código** donde una prueba mostró algo raro, para encontrar la causa antes de llamarlo defecto.

## 2. Secciones

Las 13 secciones del menú cargan sin errores en Chromium y en WebKit (prueba de humo «cada sección carga sin errores ni pedidos a internet»).

| Sección | Qué se verificó | Resultado |
| --- | --- | --- |
| Panel principal | Indicadores del mes, alertas, últimas ventas y gráfico; gráfico sin datos | Funciona |
| Trazabilidad | Rastreo de un lote de proveedor hasta los clientes; ficha de lote; PDF de retiro | Funciona |
| Operaciones (ventas) | Alta con aviso de stock, precio sugerido al mayorista, validaciones, doble clic y remito en PDF en pantalla; edición y baja con su efecto en el stock, en la base (IT-D13, IT-D14) | Funciona. Ver DEF-01, DEF-04 y DEF-05 |
| Productos terminados | Lotes, stock por lote, ficha en PDF | Funciona |
| Órdenes de producción | Alta de una orden macerando, sin cantidad todavía, en pantalla; embotellado y stock que genera, en las unitarias (`fifo.test.ts`, `acciones.test.ts`) | Funciona |
| Inventario de materia prima | Compra sin lote (aviso), pendiente de pago y marcada como pagada | Funciona |
| Materia prima, Productos, Proveedores, Clientes | Altas, ediciones, bajas, CUIT, borrado bloqueado si tiene operaciones, selección y borrado múltiple | Funciona. Ver DEF-01 y DEF-05 |
| Estadísticas | Períodos, comparaciones, ranking, margen, gráficos, PDF | Funciona |
| Importar planilla | Carga sin errores en pantalla; lectura, importación, reimportación sin duplicar y copia previa, en la base (IT-I) | Funciona |
| Configuración | Datos del establecimiento en los PDF y copia manual en pantalla; restauración, en la base (IT-C06 a IT-C09) | Funciona |
| Acceso (login, primer arranque, recuperación) | Validaciones, bloqueo, vencimiento, código de recuperación | Funciona. Ver DEF-02 y DEF-03 |

## 3. Los dos puntos que pidió analizar la consigna

### Clic fuera de un formulario

No se asumió que fuera un defecto. Se separaron los casos:

| Situación | Qué hace | ¿Está bien? | Prueba |
| --- | --- | --- | --- |
| Formulario **sin datos**, clic afuera, Esc o Cancelar | Se cierra | **Sí**: no hay nada que perder y es lo que la persona espera | FUN-04 ✅ |
| Clic **dentro** del formulario (título, campos) | No se cierra | **Sí** | FUN-05 ✅ |
| Formulario **con datos**, clic afuera o Esc | Se cierra y se pierde lo cargado | **No** | DEF-01 ❌ |
| Seleccionar texto arrastrando y **soltar afuera** | Se cierra | **No**: la persona no hizo clic afuera | DEF-05 ❌ (nuevo) |

Conclusión: cerrar con un clic afuera no es el problema. El problema es **cerrar sin preguntar cuando hay datos**, y que el arrastre cuente como clic afuera. Los dos se resuelven en un solo componente (`ModalShell.tsx`).

### Cómo se muestra la información del usuario

Tampoco se asumió que fuera un defecto. El dato guardado está bien, y que el login distinga mayúsculas es una regla válida (IT-A09). El problema aparece cuando se juntan las dos cosas: el menú muestra el usuario con mayúscula inicial (por un estilo CSS) y ese texto **no sirve para entrar**. Además, en la misma pantalla aparece de dos formas: «Qa.Tester» en el menú y «qa.tester» en el Panel. Detalle en DEF-02.

## 4. Flujos completos

Verificados de punta a punta, en pantalla y en la base:

- **Venta:** formulario → validación → server action → transacción → descuento del stock por lote (FIFO) → el lote queda vinculado a la venta → remito en PDF (IT-D10, humo).
- **Producción:** orden macerando → embotellado → lote → stock disponible para vender (humo para el alta; unitarias para el resto).
- **Compra de materia prima:** compra pendiente de pago → marcada como pagada (humo); lote de proveedor → producto → cliente en Trazabilidad (unitarias de `rastreo.test.ts`).
- **Importación:** Excel → vista previa → copia de seguridad previa → importación sin duplicar (IT-I03 a IT-I05).
- **Copias:** copia manual verificada → descarga protegida por sesión → restauración (IT-C05, IT-C09, API-09).
- **Acceso:** primer arranque → login → bloqueo → vencimiento por inactividad → recuperación con código (IT-A, FUN-07).

## 5. Estabilidad

- **Transacciones.** Si una operación falla a mitad de camino, no queda nada a medias. En los 9 casos inválidos de IT-D11, ni las ventas ni los lotes cambian.
- **Repetibilidad.** Las pruebas de la app dieron el mismo resultado en todas las corridas. Las fallas que no se repetían eran **de las pruebas**, no de la app, y se corrigieron sin cambiar lo que verifican (OBS-03, OBS-04, OBS-05).
- **Sin errores en la consola** al recorrer las secciones, y **sin pedidos a internet**: la app funciona sin conexión, salvo Google Drive.
- **Datos de desarrollo intactos.** `dev.db` mantuvo su fecha de modificación después de todas las corridas. Las pruebas usan una base temporal o una copia (ver [estrategia.md](estrategia.md#5-entornos-y-datos-de-prueba-separados-de-los-reales)).

## 6. Riesgos para una demo en vivo

| Riesgo | Cuándo pasa | Qué hacer |
| --- | --- | --- |
| **La sesión se cierra a los 30 minutos sin uso**, sin aviso (DEF-03) | Si la app queda quieta mientras se explica otra cosa | Mover el mouse o tocar la app cada tanto. Tener a mano el usuario y la contraseña. No dejar un formulario a medio cargar mientras se habla |
| **Bloqueo por 5 intentos fallidos durante 15 minutos** | Si se escribe mal la contraseña varias veces (nervios, teclado ajeno, Bloq Mayús). Los intentos fallidos del código de recuperación también cuentan | Escribir con calma. La app avisa cuando quedan 2 intentos. Tener el código de recuperación a mano, aunque los fallos con el código también suman |
| **Escribir el usuario como se ve en el menú** (DEF-02) | Si se copia «Qa.Tester» del menú en vez del usuario real | Escribirlo siempre en minúsculas, como se creó |
| **Perder un formulario a medio cargar** (DEF-01, DEF-05) | Un Esc, un clic de más o un arrastre que se pasa del borde | Cargar con el teclado (Tab) y no seleccionar arrastrando hasta afuera |
| **Google Drive** | Necesita internet y que la versión tenga la conexión configurada. Si no, Configuración muestra «Esta versión de la app no trae la conexión con Google Drive.» | Mostrar la copia local, que funciona sin conexión. Mostrar Drive solo si se probó antes en esa PC y con esa red |
| **Demo sobre la base de desarrollo** | Lo que se cargue en la demo queda guardado | Hacer una copia manual (Configuración) antes de empezar, para poder volver atrás |
| **Primera carga de cada sección en modo desarrollo** | Con `npm run dev`, Next compila cada página la primera vez que se abre | Usar la versión compilada (`npm run build` y `npm start`) o la app de escritorio, o abrir cada sección una vez antes de la demo |
| **Navegador** | Firefox no abre en esta PC (OBS-01). Solo afecta a las pruebas, no a la app | Hacer la demo en Chrome, Edge o la app de escritorio, que es donde más se probó |

## 7. Recomendaciones, en orden

1. **DEF-02:** sacar `text-transform: capitalize` del nombre en el menú. Es una línea de CSS y evita quedarse afuera.
2. **DEF-01 y DEF-05:** en `ModalShell.tsx`, preguntar antes de cerrar un formulario con cambios, y cerrar solo si el mouse se apretó y se soltó sobre el fondo.
3. **DEF-03:** un aviso 2 minutos antes del cierre por inactividad, con un botón «Seguir».
4. **DEF-04:** un id único por envío de formulario, para que el servidor ignore pedidos repetidos.
5. **Cobertura:** sumar pruebas a los módulos con poca cobertura que tienen lógica propia (`estadisticas/secciones.ts`, `lib/copias/programador.ts`). Ver [reportes.md](reportes.md#módulos-con-poca-cobertura).

Ninguna se aplicó: la consigna era revisar y documentar sin cambiar el funcionamiento ni el diseño. Cada defecto ya tiene su prueba, que va a pasar sola cuando se corrija.
