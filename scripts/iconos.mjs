// Genera los íconos de la app a partir de build/icono.svg:
// build/icon.png (1024, Mac y Linux), build/icon.ico (Windows) y app/favicon.ico.
// Uso: node scripts/iconos.mjs

import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const svg = readFileSync("build/icono.svg");
const png = (lado) => sharp(svg, { density: 300 }).resize(lado, lado).png().toBuffer();

writeFileSync("build/icon.png", await png(1024));
const tamanos = await Promise.all([16, 24, 32, 48, 64, 128, 256].map(png));
writeFileSync("build/icon.ico", await pngToIco(tamanos));
writeFileSync("app/favicon.ico", await pngToIco(await Promise.all([16, 32, 48].map(png))));
console.log("Íconos generados: build/icon.png, build/icon.ico, app/favicon.ico");
