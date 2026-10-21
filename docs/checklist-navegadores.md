# Checklist de navegadores (prueba manual)

Las pruebas automáticas (`npm run e2e`) ya cubren Chromium, Firefox y WebKit, y con
`E2E_MARCAS=1` también Edge y Chrome instalados. Esta lista es para lo que no se puede
automatizar desde Windows: **Brave, Opera y Vivaldi** (Windows) y **Safari en una Mac real**.
Toma unos 10 minutos por navegador.

## Versiones mínimas

| Navegador | Versión mínima |
|---|---|
| Chrome, Edge, Brave, Opera, Vivaldi | basados en Chromium 111 o posterior (2023) |
| Firefox | 121 o posterior |
| Safari (Mac) | 16.4 o posterior (macOS Ventura 13.3 en adelante) |

Con versiones más viejas la app puede verse mal o no funcionar. Lo más simple es tener el
navegador actualizado (todos se actualizan solos).

## Antes de empezar

1. Abrir la app (`http://localhost:3000`) y entrar con el usuario.
2. Tener a mano una planilla de prueba (`Planilla-Muestra.xlsx` o `planilla-claude.xlsx`).

## Pasos

Marcar cada punto con ✓ o anotar qué pasó.

**Ingreso y sesión**
- [ ] Entrar con usuario y contraseña. Recargar la página (F5 / ⌘R): sigue adentro.
- [ ] "Cerrar sesión" → pide confirmar → vuelve al login. Atrás no vuelve a entrar.

**Navegación y pantalla**
- [ ] Recorrer todas las secciones de la sidebar: cada una carga sin quedarse en "Cargando…".
- [ ] Zoom del navegador al 80 %, 100 %, 125 % y 150 % (Ctrl + / Ctrl − o ⌘ + / ⌘ −) en el
      Panel, Operaciones y Estadísticas: nada se superpone, no aparece scroll horizontal en la
      página (solo dentro de las tablas).
- [ ] Con zoom 125 % o más (o ventana angosta) la sidebar queda en íconos: el botón ☰ la
      despliega encima, elegir una sección o tocar afuera la cierra.

**Formularios**
- [ ] Operaciones → "+ Nuevo": escribir la fecha a mano (las barras se ponen solas) y con el
      botón de calendario. En Safari: el calendario se abre y la fecha elegida queda en dd/mm/aaaa.
- [ ] En "Cantidad" intentar escribir letras: no entran.
- [ ] Con la ventana baja (o zoom 150 %), los botones Guardar / Cancelar del modal siempre se
      ven; el contenido del modal scrollea por dentro (con la rueda y con el trackpad).
- [ ] Guardar una venta de prueba y después eliminarla.

**PDF y archivos**
- [ ] "Descargar PDF" en Clientes, en Estadísticas ("PDF completo") y en Trazabilidad → "Ficha
      de lote": se descarga el archivo (en Safari puede preguntar si se permiten descargas del
      sitio: aceptar) y se abre bien.
- [ ] Importar planilla: arrastrar el Excel a la zona de carga; se analiza y muestra el resumen
      (no hace falta confirmar la importación).

**Gráficos**
- [ ] Estadísticas → cada pestaña: los gráficos se ven nítidos, con etiquetas legibles y el
      tooltip aparece al pasar el mouse.

## Resultado

| Navegador | Versión | Sistema | Resultado | Notas |
|---|---|---|---|---|
| Brave | | Windows | | |
| Opera | | Windows | | |
| Vivaldi | | Windows | | |
| Safari | | macOS | | |
