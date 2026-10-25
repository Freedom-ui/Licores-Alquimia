// Proceso principal de la app de escritorio.
//
// La app es la misma aplicación web de siempre: este proceso levanta su
// servidor (el de Next en modo standalone, con el Node que viaja dentro de la
// app: la PC del cliente no necesita tener nada instalado) y la muestra en una
// ventana propia. Además:
// - una sola instancia (el segundo doble clic trae la ventana al frente);
// - los datos van a la carpeta del usuario (userData), nunca a la de la app;
// - al cerrar le pide al servidor una copia de seguridad si hubo cambios;
// - busca versiones nuevas en GitHub y las instala al cerrar (Windows).

import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync, renameSync, type WriteStream } from "node:fs";
import net from "node:net";
import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain, Menu, shell, type MenuItemConstructorOptions } from "electron";
import { autoUpdater } from "electron-updater";
import { CANALES, type EstadoActualizacion, type MensajeDelServidor } from "./tipos";

const NOMBRE = "Licores Alquimia";
const PUERTO_PREFERIDO = 47811;
const PAGINA_RELEASES = "https://github.com/Freedom-ui/Licores-Alquimia/releases/latest";
const ES_MAC = process.platform === "darwin";

// En desarrollo (`npm run app:dev`) se muestra el `npm run dev` que ya está corriendo.
const URL_DESARROLLO = process.argv.includes("--dev") ? "http://localhost:3000" : undefined;

app.setName(NOMBRE);
if (process.platform === "win32") app.setAppUserModelId("ar.alquimia.licores");

const datos = app.getPath("userData");
// La caché y el almacenamiento del navegador interno, en una subcarpeta: así en la
// carpeta de datos quedan solo la base, las copias y el registro.
app.setPath("sessionData", path.join(datos, "navegador"));
const recursos = app.isPackaged ? process.resourcesPath : path.join(__dirname, "..", "..", "build", "app");

let ventana: BrowserWindow | null = null;
let aviso: BrowserWindow | null = null;
let servidor: ChildProcess | null = null;
let origen = "";
let saliendo = false;
let reinicios = 0;
let log: WriteStream | null = null;

// ── Registro (para diagnosticar problemas en la PC del cliente) ──

function abrirLog() {
  const carpeta = path.join(datos, "registro");
  mkdirSync(carpeta, { recursive: true });
  const archivo = path.join(carpeta, "app.log");
  // Uno anterior y el actual, de hasta 5 MB.
  if (existsSync(archivo) && statSync(archivo).size > 5 * 1024 * 1024) renameSync(archivo, path.join(carpeta, "app-anterior.log"));
  log = createWriteStream(archivo, { flags: "a" });
  anotar(`── Inicio ${NOMBRE} ${app.getVersion()} (${process.platform} ${process.arch}) ──`);
}

function anotar(texto: string) {
  log?.write(`[${new Date().toISOString()}] ${texto.trimEnd()}\n`);
}

// ── Ventanas ─────────────────────────────────────────────────

/** Ventanita sin bordes con un mensaje ("Abriendo…", "Guardando la copia…"). */
function mostrarAviso(texto: string) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;height:100%;font-family:Arial,Helvetica,sans-serif;background:#141414;color:#EDEAE4}
    body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;border-top:3px solid #D4772A;box-sizing:border-box}
    .marca{font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#D4772A}
    .nombre{font-size:26px;font-weight:bold}
    .texto{font-size:14px;color:#bdb6ad}
    .barra{width:160px;height:3px;background:#333;overflow:hidden;border-radius:2px}
    .barra i{display:block;width:40%;height:100%;background:#D4772A;animation:a 1.2s ease-in-out infinite}
    @keyframes a{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}
  </style></head><body><div class="marca">Licores</div><div class="nombre">Alquimia</div>
  <div class="texto">${texto}</div><div class="barra"><i></i></div></body></html>`;
  if (!aviso || aviso.isDestroyed()) {
    aviso = new BrowserWindow({
      width: 380,
      height: 230,
      frame: false,
      resizable: false,
      movable: true,
      show: false,
      alwaysOnTop: true,
      skipTaskbar: false,
      backgroundColor: "#141414",
      title: NOMBRE,
      webPreferences: { sandbox: true, contextIsolation: true },
    });
    aviso.once("ready-to-show", () => aviso?.show());
  }
  void aviso.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

function cerrarAviso() {
  if (aviso && !aviso.isDestroyed()) aviso.destroy();
  aviso = null;
}

function crearVentana() {
  ventana = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 900,
    minHeight: 560,
    show: false,
    title: NOMBRE,
    backgroundColor: "#EDEAE4",
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  const wc = ventana.webContents;
  // Todo lo que no sea la propia app se abre en el navegador del sistema.
  wc.setWindowOpenHandler(({ url }) => {
    abrirAfuera(url);
    return { action: "deny" };
  });
  wc.on("will-navigate", (e, url) => {
    if (!url.startsWith(origen)) {
      e.preventDefault();
      abrirAfuera(url);
    }
  });
  wc.on("context-menu", (_e, p) => {
    const items: MenuItemConstructorOptions[] = [];
    if (p.isEditable) items.push({ label: "Cortar", role: "cut" }, { label: "Copiar", role: "copy" }, { label: "Pegar", role: "paste" }, { type: "separator" }, { label: "Seleccionar todo", role: "selectAll" });
    else if (p.selectionText.trim()) items.push({ label: "Copiar", role: "copy" });
    if (items.length) Menu.buildFromTemplate(items).popup();
  });
  wc.on("render-process-gone", (_e, d) => {
    anotar(`La página se cerró sola (${d.reason}); se recarga.`);
    if (!saliendo) ventana?.reload();
  });

  ventana.once("ready-to-show", () => {
    cerrarAviso();
    ventana?.maximize();
    ventana?.show();
  });
  ventana.on("close", (e) => {
    if (saliendo) return;
    e.preventDefault();
    void salir();
  });
}

function abrirAfuera(url: string) {
  try {
    const u = new URL(url);
    if (u.protocol === "https:" || u.protocol === "http:" || u.protocol === "mailto:") void shell.openExternal(u.toString());
  } catch {
    // Dirección inválida: no se abre nada.
  }
}

// ── Servidor de la app ───────────────────────────────────────

function puertoLibre(puerto: number): Promise<boolean> {
  return new Promise((resolver) => {
    const s = net.createServer();
    s.once("error", () => resolver(false));
    s.once("listening", () => s.close(() => resolver(true)));
    s.listen(puerto, "127.0.0.1");
  });
}

async function elegirPuerto(): Promise<number> {
  if (await puertoLibre(PUERTO_PREFERIDO)) return PUERTO_PREFERIDO;
  return new Promise((resolver, rechazar) => {
    const s = net.createServer();
    s.once("error", rechazar);
    s.listen(0, "127.0.0.1", () => {
      const puerto = (s.address() as net.AddressInfo).port;
      s.close(() => resolver(puerto));
    });
  });
}

/** Credenciales de Google Drive que se agregan al empaquetar (build/app/config.json). */
function configuracion(): { googleClientId?: string; googleClientSecret?: string } {
  try {
    return JSON.parse(readFileSync(path.join(recursos, "config.json"), "utf8"));
  } catch {
    return {};
  }
}

function levantarServidor(puerto: number): ChildProcess {
  const carpeta = path.join(recursos, "servidor");
  const node = path.join(recursos, "node", process.platform === "win32" ? "node.exe" : "node");
  const cfg = configuracion();
  const hijo = spawn(node, [path.join(carpeta, "server.js")], {
    cwd: carpeta,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    env: {
      // Solo lo necesario: nada del entorno de la PC (ni un DATABASE_URL suelto).
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      TEMP: process.env.TEMP,
      TMP: process.env.TMP,
      TMPDIR: process.env.TMPDIR,
      HOME: process.env.HOME,
      USERPROFILE: process.env.USERPROFILE,
      TZ: process.env.TZ,
      LANG: process.env.LANG,
      NODE_ENV: "production",
      PORT: String(puerto),
      HOSTNAME: "127.0.0.1",
      NEXT_TELEMETRY_DISABLED: "1",
      DATABASE_URL: `file:${path.join(datos, "alquimia.db")}`,
      ALQUIMIA_DATOS: datos,
      ALQUIMIA_MIGRACIONES: path.join(carpeta, "migraciones"),
      ALQUIMIA_ESCRITORIO: "1",
      ALQUIMIA_VERSION: app.getVersion(),
      GOOGLE_CLIENT_ID: cfg.googleClientId ?? "",
      GOOGLE_CLIENT_SECRET: cfg.googleClientSecret ?? "",
    },
  });
  hijo.stdout?.on("data", (d: Buffer) => anotar(`[servidor] ${d}`));
  hijo.stderr?.on("data", (d: Buffer) => anotar(`[servidor] ${d}`));
  hijo.on("message", (m: MensajeDelServidor) => void alMensaje(m));
  hijo.on("exit", (codigo, senal) => {
    anotar(`El servidor terminó (código ${codigo}, señal ${senal}).`);
    const estabaEnMarcha = servidor === hijo && enMarcha;
    if (servidor === hijo) {
      servidor = null;
      enMarcha = false;
    }
    // Si se cae al arrancar, lo maneja arrancarServidor (no se reintenta acá).
    if (estabaEnMarcha && !saliendo && !reiniciando) void servidorCaido();
  });
  return hijo;
}

/** Espera a que el servidor conteste (hasta 90 s: la primera vez en una PC lenta tarda). */
async function esperarServidor(url: string, hijo: ChildProcess): Promise<void> {
  const limite = Date.now() + 90_000;
  while (Date.now() < limite) {
    if (hijo.exitCode !== null) throw new Error("El servidor se cerró al arrancar.");
    try {
      const r = await fetch(`${url}/login`, { redirect: "manual" });
      if (r.status < 500) return;
    } catch {
      // Todavía no escucha.
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("El servidor no respondió a tiempo.");
}

let errorDeArranque: string | null = null;
let reiniciando = false;
/** El servidor actual ya contestó (una caída después de eso se reintenta sola). */
let enMarcha = false;

async function arrancarServidor(): Promise<void> {
  errorDeArranque = null;
  const puerto = await elegirPuerto();
  origen = `http://127.0.0.1:${puerto}`;
  const hijo = levantarServidor(puerto);
  servidor = hijo;
  enMarcha = false;
  try {
    await esperarServidor(origen, hijo);
    enMarcha = true;
  } catch (e) {
    throw new Error(errorDeArranque ?? (e instanceof Error ? e.message : String(e)));
  }
}

async function detenerServidor(): Promise<void> {
  const hijo = servidor;
  if (!hijo || hijo.exitCode !== null) return;
  await new Promise<void>((resolver) => {
    const t = setTimeout(() => {
      hijo.kill("SIGKILL");
      resolver();
    }, 5000);
    hijo.once("exit", () => {
      clearTimeout(t);
      resolver();
    });
    hijo.kill();
  });
}

async function alMensaje(m: MensajeDelServidor) {
  if (m.tipo === "error-arranque") {
    errorDeArranque = m.mensaje;
  } else if (m.tipo === "reiniciar") {
    // Se eligió una copia para restaurar: se aplica al volver a arrancar.
    anotar("Reinicio pedido por el servidor (restauración).");
    reiniciando = true;
    mostrarAviso("Restaurando la copia de seguridad…");
    ventana?.hide();
    try {
      await detenerServidor();
      await arrancarServidor();
      await ventana?.loadURL(`${origen}/login?motivo=restaurada`);
      cerrarAviso();
      ventana?.show();
    } catch (e) {
      fallaFatal(e);
    } finally {
      reiniciando = false;
    }
  }
}

async function servidorCaido() {
  if (reinicios >= 3) return fallaFatal(new Error("El servidor de la app se cerró varias veces seguidas."));
  reinicios++;
  anotar("Se vuelve a levantar el servidor.");
  try {
    await arrancarServidor();
    await ventana?.loadURL(origen);
  } catch (e) {
    fallaFatal(e);
  }
}

function fallaFatal(e: unknown) {
  const mensaje = e instanceof Error ? e.message : String(e);
  anotar(`Error: ${mensaje}`);
  cerrarAviso();
  dialog.showErrorBox(
    `${NOMBRE} no pudo abrir`,
    `${mensaje}\n\nCerrá la app y volvé a abrirla. Si sigue pasando, mandá el archivo de registro que está en:\n${path.join(datos, "registro")}`
  );
  saliendo = true;
  servidor?.kill();
  app.exit(1);
}

// ── Cerrar: copia de seguridad y apagado ─────────────────────

let instalarAlSalir = false;

/** Pide la copia al cerrar (si hubo cambios) y espera hasta 60 s. */
function copiaAlCerrar(): Promise<void> {
  const hijo = servidor;
  if (!hijo || hijo.exitCode !== null || !hijo.connected) return Promise.resolve();
  return new Promise((resolver) => {
    const fin = () => {
      clearTimeout(t);
      hijo.off("message", alResponder);
      resolver();
    };
    const alResponder = (m: MensajeDelServidor) => m.tipo === "copia-al-cerrar-lista" && fin();
    const t = setTimeout(fin, 60_000);
    hijo.on("message", alResponder);
    hijo.send({ tipo: "copia-al-cerrar" });
  });
}

async function salir() {
  if (saliendo) return;
  saliendo = true;
  ventana?.hide();
  if (!URL_DESARROLLO) {
    mostrarAviso("Guardando la copia de seguridad…");
    await copiaAlCerrar();
  }
  await detenerServidor();
  cerrarAviso();
  if (instalarAlSalir) {
    autoUpdater.quitAndInstall(true, true);
    return;
  }
  app.exit(0);
}

// ── Actualizaciones ──────────────────────────────────────────

let actualizacion: EstadoActualizacion = { estado: "inactivo" };

function avisarActualizacion(e: EstadoActualizacion) {
  actualizacion = e;
  ventana?.webContents.send(CANALES.cambio, e);
}

function configurarActualizaciones() {
  if (!app.isPackaged) return;
  autoUpdater.logger = { info: (m: unknown) => anotar(`[actualización] ${m}`), warn: (m: unknown) => anotar(`[actualización] ${m}`), error: (m: unknown) => anotar(`[actualización] ${m}`), debug: () => undefined };
  // En Mac sin firma de Apple no se puede instalar sola: solo se avisa.
  autoUpdater.autoDownload = !ES_MAC;
  autoUpdater.autoInstallOnAppQuit = false; // se instala en salir(), después de la copia.
  autoUpdater.on("checking-for-update", () => avisarActualizacion({ estado: "buscando" }));
  autoUpdater.on("update-not-available", () => avisarActualizacion({ estado: "al-dia", revisado: new Date().toISOString() }));
  autoUpdater.on("update-available", (i) => {
    if (ES_MAC) avisarActualizacion({ estado: "manual", version: i.version, url: PAGINA_RELEASES });
    else avisarActualizacion({ estado: "descargando", version: i.version, progreso: 0 });
  });
  autoUpdater.on("download-progress", (p) => {
    if (actualizacion.estado === "descargando") avisarActualizacion({ ...actualizacion, progreso: p.percent });
  });
  autoUpdater.on("update-downloaded", (i) => {
    instalarAlSalir = true;
    avisarActualizacion({ estado: "lista", version: i.version });
  });
  autoUpdater.on("error", (e) => {
    anotar(`[actualización] ${e?.message ?? e}`);
    // Todavía no hay ninguna versión publicada: no es un problema.
    if (String(e?.message ?? e).includes("No published versions")) {
      avisarActualizacion({ estado: "al-dia", revisado: new Date().toISOString() });
      return;
    }
    // Sin internet no es un problema para el usuario: queda como estaba.
    avisarActualizacion({ estado: "error", mensaje: "No se pudo buscar una versión nueva (¿hay internet?). Se vuelve a intentar más tarde." });
  });
  const buscar = () => void autoUpdater.checkForUpdates().catch(() => undefined);
  setTimeout(buscar, 10_000);
  setInterval(buscar, 6 * 3_600_000);
}

// ── Comunicación con la página ───────────────────────────────

function configurarIpc() {
  ipcMain.on(CANALES.info, (e) => {
    e.returnValue = { version: app.getVersion(), plataforma: process.platform };
  });
  ipcMain.handle(CANALES.estado, () => actualizacion);
  ipcMain.handle(CANALES.buscar, async () => {
    if (!app.isPackaged) return actualizacion;
    try {
      await autoUpdater.checkForUpdates();
    } catch {
      // El evento "error" ya actualizó el estado.
    }
    return actualizacion;
  });
  ipcMain.on(CANALES.instalar, () => {
    if (instalarAlSalir) void salir();
  });
  ipcMain.on(CANALES.carpeta, () => void shell.openPath(datos));
  ipcMain.on(CANALES.externo, (_e, url: unknown) => typeof url === "string" && abrirAfuera(url));
}

function configurarMenu() {
  const plantilla: MenuItemConstructorOptions[] = [
    ...(ES_MAC ? [{ label: NOMBRE, submenu: [{ role: "about", label: `Acerca de ${NOMBRE}` }, { type: "separator" }, { role: "hide", label: "Ocultar" }, { role: "quit", label: "Salir" }] } as MenuItemConstructorOptions] : []),
    {
      label: "Archivo",
      submenu: [
        { label: "Abrir la carpeta de datos", click: () => void shell.openPath(datos) },
        { type: "separator" },
        { label: "Salir", accelerator: ES_MAC ? "Cmd+Q" : "Alt+F4", click: () => void salir() },
      ],
    },
    {
      label: "Edición",
      submenu: [
        { role: "undo", label: "Deshacer" },
        { role: "redo", label: "Rehacer" },
        { type: "separator" },
        { role: "cut", label: "Cortar" },
        { role: "copy", label: "Copiar" },
        { role: "paste", label: "Pegar" },
        { role: "selectAll", label: "Seleccionar todo" },
      ],
    },
    {
      label: "Ver",
      submenu: [
        { role: "reload", label: "Recargar" },
        { type: "separator" },
        { role: "zoomIn", label: "Agrandar" },
        { role: "zoomOut", label: "Achicar" },
        { role: "resetZoom", label: "Tamaño normal" },
        { type: "separator" },
        { role: "togglefullscreen", label: "Pantalla completa" },
      ],
    },
    {
      label: "Ayuda",
      submenu: [
        {
          label: `Acerca de ${NOMBRE}`,
          click: () =>
            void dialog.showMessageBox({
              type: "info",
              title: NOMBRE,
              message: `${NOMBRE} ${app.getVersion()}`,
              detail: `Datos y copias de seguridad en:\n${datos}`,
            }),
        },
        { label: "Ver el registro de la app", click: () => void shell.openPath(path.join(datos, "registro")) },
        ...(app.isPackaged ? [] : [{ role: "toggleDevTools", label: "Herramientas de desarrollo" } as MenuItemConstructorOptions]),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(plantilla));
}

// ── Arranque ─────────────────────────────────────────────────

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!ventana) return;
    if (ventana.isMinimized()) ventana.restore();
    ventana.show();
    ventana.focus();
  });

  app.on("window-all-closed", () => {
    // La salida la maneja salir() (también en Mac: cerrar la ventana cierra la app).
  });
  app.on("before-quit", (e) => {
    if (saliendo) return;
    e.preventDefault();
    void salir();
  });

  void app.whenReady().then(async () => {
    abrirLog();
    configurarMenu();
    configurarIpc();
    mostrarAviso("Abriendo…");
    crearVentana();
    try {
      if (URL_DESARROLLO) origen = new URL(URL_DESARROLLO).origin;
      else await arrancarServidor();
      await ventana!.loadURL(origen);
    } catch (e) {
      return fallaFatal(e);
    }
    configurarActualizaciones();
  });
}
