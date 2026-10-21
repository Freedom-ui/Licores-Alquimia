// Copia dev.db a e2e/.datos/e2e.db antes de levantar el servidor de las
// pruebas: los recorridos de Playwright (altas, bajas, sesiones) trabajan
// sobre esa copia y la base de desarrollo no se toca.
import { mkdirSync, rmSync } from "node:fs";
import Database from "better-sqlite3";

const ORIGEN = "dev.db";
const DESTINO = "e2e/.datos/e2e.db";

mkdirSync("e2e/.datos", { recursive: true });
for (const sufijo of ["", "-wal", "-shm", "-journal"]) rmSync(DESTINO + sufijo, { force: true });

const db = new Database(ORIGEN, { readonly: true, fileMustExist: true });
await db.backup(DESTINO);
db.close();
console.log(`Base de prueba lista: ${DESTINO}`);
