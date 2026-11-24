# Defectos y comportamientos inesperados

Cada defecto tiene:
- una **prueba automática** que describe el comportamiento esperado (`e2e/defectos.spec.ts`). Falla mientras el defecto siga y pasa sola cuando se corrija;
- la **causa** en el código;
- una **propuesta de corrección**. No se aplicó ninguna: la consigna fue documentar, no cambiar el funcionamiento ni el diseño.

```bash
npm run test:defectos      # build + las pruebas de defectos (hoy: 6 fallan, a propósito)
```

**Cómo se clasifican.** La **severidad** dice cuánto daño hace si pasa. La **prioridad** dice qué se arregla primero y sale de juntar la probabilidad con el impacto. Por eso un defecto puede ser grave pero no urgente (DEF-04), o menos grave pero urgente (DEF-01).

| | Probabilidad baja | Probabilidad media | Probabilidad alta |
| --- | --- | --- | --- |
| **Impacto alto** | Media | Alta | Alta |
| **Impacto medio** | Baja | Media | Alta |
| **Impacto bajo** | Baja | Baja | Media |

## Resumen

| Id | Defecto | Severidad | Prioridad | Estado | Prueba |
| --- | --- | --- | --- | --- | --- |
| DEF-01 | Clic afuera o Esc cierran un formulario con datos, sin preguntar | Media | **Alta** | Abierto | DEF-01a, DEF-01b |
| DEF-05 | Seleccionar texto arrastrando y soltar el mouse afuera del formulario lo cierra | Media | Media | Abierto (nuevo) | DEF-05 |
| DEF-02 | El menú muestra el usuario con mayúscula y así no deja entrar | Alta | **Alta** | Abierto | DEF-02 |
| DEF-03 | La sesión se cierra por inactividad sin avisar antes | Media | Media | Abierto | DEF-03 |
| DEF-04 | El mismo pedido de alta enviado dos veces guarda dos ventas | Alta | Media | Abierto | DEF-04 |

DEF-01 a DEF-04 son los de la entrega del TP. DEF-05 apareció en esta revisión, al analizar el comportamiento de «clic fuera del formulario».

---

## DEF-01 · Clic afuera o Esc cierran un formulario con datos, sin preguntar

**Qué pasa.** Con un formulario a medio cargar (una venta, un cliente, una compra), un clic en el fondo oscuro o la tecla Esc lo cierran al instante. Al abrirlo de nuevo está vacío: lo cargado se perdió.

**Cómo reproducirlo**
1. Entrar a **Operaciones** → **+ Nuevo**.
2. Elegir cliente y producto, y escribir cantidad 3 y precio 10000.
3. Hacer clic en el fondo oscuro, fuera del formulario (o apretar Esc).
4. Volver a tocar **+ Nuevo**: el formulario está vacío.

**Esperado.** Antes de descartar algo, que pregunte «¿Descartar los datos cargados?». Ya lo hace al cerrar sesión. **Sin nada cargado** está bien que se cierre directamente: no hay nada que perder. Eso se verificó y **funciona** (FUN-04).

**Obtenido.** Se cierra sin preguntar y se pierde lo cargado.

**Causa.** `app/components/data-table/ModalShell.tsx`, el marco que comparten todos los formularios:
- el fondo (`.rf-overlay`) llama a `onClose` en cualquier clic;
- un `keydown` de Escape también llama a `onClose`.

Ninguno sabe si el formulario tiene cambios. Además, cada formulario se vacía al abrirse (por ejemplo, `setValues({})` en `RecordFormModal.openModal`), así que no hay forma de recuperar lo cargado.

**Alcance.** Todos los formularios que usan `ModalShell`: altas y ediciones de clientes, proveedores, productos, materia prima, ventas, órdenes, compras, lotes, inventario y vendedores.

**Propuesta.** Que `ModalShell` reciba una función `hayCambios()` (o una propiedad `sinGuardar`). Si hay cambios, en vez de cerrar muestra una confirmación, con el mismo diálogo que ya usa la app para eliminar.

**Clasificación.** Probabilidad **alta** (Esc o un clic de más pasan seguido) × impacto **medio** (se vuelve a cargar, pero se pierde tiempo y puede quedar mal) → prioridad **Alta**.

---

## DEF-05 · Seleccionar texto arrastrando y soltar afuera cierra el formulario

**Qué pasa.** Se aprieta el mouse dentro de un campo (por ejemplo, para seleccionar lo escrito y corregirlo), se arrastra y se suelta sobre el fondo oscuro. El formulario se cierra y se pierde todo, aunque la persona **nunca hizo clic afuera**.

**Cómo reproducirlo**
1. **Clientes** → **+ Nuevo**. Escribir «Almacén La Esquina» en Razón social.
2. Apretar el botón del mouse al final del texto y arrastrar hacia la izquierda para seleccionarlo, pasándose del borde del formulario.
3. Soltar el botón sobre el fondo oscuro.

**Esperado.** Que solo se seleccione el texto. El formulario sigue abierto.

**Obtenido.** El formulario se cierra.

**Causa.** El navegador manda el evento `click` al **elemento común** entre donde se apretó (el campo) y donde se soltó (el fondo). Ese elemento es el fondo, así que se ejecuta su `onClick={onClose}`. El `stopPropagation` del formulario no sirve, porque el clic no se origina en el formulario.

**Propuesta.** Cerrar solo si el mouse se apretó **y** se soltó sobre el fondo: guardar en `onMouseDown` si el objetivo era el fondo, y comprobarlo en `onClick`. Es un cambio en el mismo componente que DEF-01, y conviene corregir los dos juntos.

**Clasificación.** Probabilidad **media** × impacto **medio** → prioridad **Media**. Pasa sin que la persona haga nada «mal», y eso lo hace más confuso que DEF-01.

---

## DEF-02 · El menú muestra el usuario con mayúscula y así no deja entrar

**Qué pasa.** El usuario se guardó como `qa.tester`. El menú lateral lo muestra como **«Qa.Tester»**. Si alguien escribe el usuario como lo ve en pantalla, el login responde «Usuario o contraseña incorrectos.».

**Cómo reproducirlo**
1. Entrar con un usuario en minúsculas (por ejemplo `qa.tester`).
2. Mirar el nombre en el menú lateral: dice «Qa.Tester». En el saludo del Panel dice «qa.tester»: **en la misma pantalla aparece de dos formas**.
3. Cerrar sesión y entrar escribiendo «Qa.Tester»: falla.

**Análisis: ¿es un defecto?** Hay dos comportamientos que, solos, serían razonables:
- **El login distingue mayúsculas.** Es una regla válida: el usuario es único tal como se escribió. La prueba de integración IT-A09 la confirma.
- **El menú le pone mayúscula inicial** al nombre, por estilo.

Juntos generan el problema: la pantalla muestra un usuario **distinto** del que hay que escribir. El dato guardado está bien. Lo que está mal es **cómo se muestra**.

**Esperado.** El usuario se muestra tal como hay que escribirlo, igual en el menú y en el Panel.

**Obtenido.** «Qa.Tester» en el menú y «qa.tester» en el Panel.

**Causa.** `app/globals.css`, regla `.sidebar-user .su-nombre` con `text-transform: capitalize`. El HTML tiene el texto correcto (`<span class="su-nombre" title="qa.tester">qa.tester</span>`), pero el estilo lo cambia al dibujarlo. El login compara exacto: `prisma.usuario.findUnique({ where: { username } })` en `app/(acceso)/acciones.ts`.

**Propuesta.** Sacar `text-transform: capitalize` de esa regla: una línea de CSS. No se aplicó porque toca la presentación visual, que se trabaja aparte. La alternativa, que el login no distinga mayúsculas, cambia una regla de seguridad y pide migrar los usuarios existentes. No se recomienda.

**Clasificación.** Probabilidad **media** × impacto **alto** (el dueño se puede quedar sin entrar; puede usar el código de recuperación, pero no lo va a deducir solo) → prioridad **Alta**.

---

## DEF-03 · La sesión se cierra por inactividad sin avisar antes

**Qué pasa.** Por seguridad, a los 30 minutos sin uso la app cierra la sesión y vuelve al login. Eso está bien, y se verificó que funciona (FUN-07, IT-A13, IT-A14). Lo que falta es un **aviso previo**: si había un formulario a medio cargar, se pierde sin advertencia.

**Cómo reproducirlo**
1. Abrir **+ Nuevo** en Operaciones y cargar algunos datos.
2. No tocar la PC durante 30 minutos.
3. La app vuelve al login y la venta se perdió.

La prueba automática no espera 30 minutos: usa el **reloj simulado** de Playwright (`page.clock`) para adelantar el tiempo.

**Esperado.** Un aviso un par de minutos antes, del tipo «Tu sesión se va a cerrar por inactividad. ¿Seguís ahí?».

**Obtenido.** Ningún aviso. La sesión se cierra directamente.

**Causa.** `app/(dashboard)/ControlInactividad.tsx` revisa cada 15 segundos y, al pasar el límite, llama a `salir("inactividad")`. No hay ningún paso intermedio de aviso.

**Propuesta.** Cuando falten 2 minutos, mostrar un diálogo con «Seguir» (que cuenta como actividad) y la cuenta regresiva.

**Clasificación.** Probabilidad **media** × impacto **medio** → prioridad **Media**.

---

## DEF-04 · El mismo pedido de alta enviado dos veces guarda dos ventas

**Qué pasa.** Si al servidor le llega **dos veces exactamente el mismo pedido** de alta de venta, guarda dos ventas iguales y descuenta el stock dos veces.

**Cómo reproducirlo.** Prueba DEF-04, o la colección de Postman de la entrega (caso A04): mandar dos veces seguidas el `POST` de `ejecutar` con el mismo cuerpo.

**Análisis.** En esta revisión se comprobó que **la pantalla sí protege del doble clic**: el botón Guardar se desactiva mientras guarda, y un doble clic guarda una sola venta (FUN-06, pasa). El defecto queda limitado a pedidos repetidos **fuera de la pantalla**: un reintento de la red, o alguien que llama a la API directamente. El servidor no tiene forma de distinguir un pedido repetido de dos ventas iguales legítimas, porque el pedido no lleva un identificador propio.

**Esperado.** El segundo pedido idéntico se reconoce como repetido y no suma otra venta.

**Obtenido.** Se guardan dos ventas.

**Causa.** `ejecutar` en `app/(dashboard)/_datos/acciones.ts` no tiene **idempotencia**: no recuerda qué pedidos ya procesó.

**Propuesta.** Que la pantalla genere un id único por envío de formulario (`crypto.randomUUID()`) y que el servidor guarde los ids ya procesados por un rato. Si llega uno repetido, devuelve el resultado anterior sin volver a guardar.

**Clasificación.** Probabilidad **baja** (la pantalla ya evita el caso común) × impacto **alto** (venta duplicada y stock mal) → prioridad **Media**.

---

## Otros comportamientos observados (no son defectos de la app)

| Id | Observación | Impacto | Qué hacer |
| --- | --- | --- | --- |
| OBS-01 | **Firefox no abre en esta PC.** Windows responde «la configuración en paralelo no es correcta» al lanzar el Firefox de Playwright. Falla antes de llegar a la app: las 19 pruebas de humo en Firefox no se pudieron ejecutar. Chromium y WebKit sí corren | Solo para las pruebas en Firefox | En otra PC, o reinstalar con `npx playwright install firefox` y el «Microsoft Visual C++ Redistributable» |
| OBS-02 | Un `POST` de server action con un cuerpo que no es JSON responde **500**, y el servidor escribe el error en el log. Es comportamiento de Next, antes de llegar al código de la app. No guarda nada (API-07) | Bajo: solo con pedidos armados a mano | Ninguna acción necesaria |
| OBS-03 | El test `generador.test.ts` («quedan órdenes macerando…»), que genera años de datos, pasaba de los **5 segundos** por defecto cuando la cobertura estaba encendida, y fallaba por tiempo, no por resultado | Ninguno en la app | Se subió el tiempo máximo de las unitarias a 15 s (`vitest.config.mts`). La verificación del test no se tocó |
| OBS-04 | Las pruebas del navegador que **cierran la sesión** (por inactividad) cerraban también la sesión compartida de las demás pruebas, que corren en paralelo, y las hacían fallar | Ninguno en la app | Esas pruebas usan una sesión propia (`e2e/sesion-propia.ts`) |
| OBS-05 | En la corrida completa falló una prueba de humo en **WebKit**: «configuración: datos del establecimiento…». Al repetirla, falló 2 de cada 4 veces. **Causa:** la prueba escribía en el CUIT antes de que React terminara de hidratar la página (en WebKit tarda unos 300 ms). El campo mostraba el texto, pero el formulario no se enteraba: la vista previa seguía igual y «Guardar» quedaba deshabilitado. Volver a escribir lo mismo tampoco servía, porque al hidratarse React toma como último valor lo que ya está en el campo | Muy bajo. Una persona tendría que escribir en el primer cuarto de segundo y, con la próxima tecla, el formulario se pone al día | Se corrigió **la prueba**, no la app. Ahora escribe primero la razón social, vaciando el campo antes, y repite hasta que la vista previa lo muestre. Se agregó la hora a la razón social para que siempre haya un cambio que guardar. Lo que verifica la prueba no cambió. Después pasó 12 de 12 veces en Chromium y WebKit |
