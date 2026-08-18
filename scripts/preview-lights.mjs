/**
 * scripts/preview-lights.mjs
 *
 * Ferramenta de calibração das luzes das cidades.
 *
 * Em vez de gerar, publicar, olhar no navegador e adivinhar o próximo ajuste,
 * este script renderiza lado a lado, no mesmo tamanho:
 *
 *   1. a imagem noturna de origem (o alvo);
 *   2. os pontos de `city-lights.json` desenhados com a MESMA curva de brilho
 *      que o shader usa em tempo real.
 *
 * Assim dá para comparar as duas e decidir os parâmetros olhando o resultado,
 * não a intuição. Também imprime a contagem por região, que é o que revela
 * se um continente está sub-representado.
 *
 *   node scripts/preview-lights.mjs [saida.png]
 *
 * Quando a calibração estiver boa, a imagem de origem pode sair do projeto:
 * o `city-lights.json` já é autossuficiente.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const SOURCE = path.resolve(rootDir, 'img', 'noite.jpg');
const LIGHTS = path.resolve(rootDir, 'public', 'data', 'city-lights.bin');

/** Precisa espelhar o shader de CityLights.tsx. */
const SHADER_EXPONENT = 1.35;
const SHADER_GAIN = 1.7;

const W = 1600;
const H = 800;

/** Caixas lon/lat para o relatório por região. */
const REGIONS = {
  'América do Sul': [-82, -56, -34, 13],
  Brasil: [-74, -34, -34, 5],
  África: [-18, -35, 52, 37],
  Europa: [-10, 36, 40, 70],
  'EUA/Canadá': [-140, 25, -60, 60],
  Rússia: [30, 42, 180, 78],
  China: [75, 20, 135, 50],
  Índia: [68, 7, 90, 35],
  'Coreia/Japão': [124, 30, 146, 46],
  Oceania: [110, -45, 180, -10],
  '— Amazônia (deve ser ~0)': [-70, -10, -52, 0],
  '— Saara (deve ser ~0)': [0, 18, 25, 30],
};

function drawPoint(buf, x, y, value) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const o = (y * W + x) * 3;
  const v = Math.round(Math.min(1, value) * 255);
  if (buf[o] < v) {
    buf[o] = v;
    buf[o + 1] = Math.round(v * 0.85);
    buf[o + 2] = Math.round(v * 0.6);
  }
}

async function main() {
  const outPath = path.resolve(
    rootDir,
    process.argv[2] ?? 'lights-preview.png',
  );

  const raw = await fs.readFile(LIGHTS);
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const count = view.getUint32(0, true);
  const points = [];
  for (let i = 0; i < count; i++) {
    points.push(
      view.getInt16(4 + i * 2, true) / 100,
      view.getInt16(4 + count * 2 + i * 2, true) / 100,
      view.getUint8(4 + count * 4 + i) / 255,
    );
  }

  const rendered = Buffer.alloc(W * H * 3, 0);
  const perRegion = {};

  for (let i = 0; i < points.length; i += 3) {
    const lon = points[i];
    const lat = points[i + 1];
    const intensity = points[i + 2];

    const x = Math.round(((lon + 180) / 360) * W);
    const y = Math.round(((90 - lat) / 180) * H);
    drawPoint(rendered, x, y, Math.pow(intensity, SHADER_EXPONENT) * SHADER_GAIN);

    for (const [name, [x0, y0, x1, y1]] of Object.entries(REGIONS)) {
      if (lon >= x0 && lon <= x1 && lat >= y0 && lat <= y1) {
        perRegion[name] = (perRegion[name] ?? 0) + 1;
      }
    }
  }

  const source = await sharp(SOURCE).resize(W, H, { fit: 'fill' }).toBuffer();
  const mine = await sharp(rendered, {
    raw: { width: W, height: H, channels: 3 },
  })
    .png()
    .toBuffer();

  // Empilhado: origem em cima, resultado embaixo, para comparar coluna a coluna.
  await sharp({
    create: {
      width: W,
      height: H * 2 + 4,
      channels: 3,
      background: { r: 40, g: 40, b: 40 },
    },
  })
    .composite([
      { input: source, top: 0, left: 0 },
      { input: mine, top: H + 4, left: 0 },
    ])
    .png()
    .toFile(outPath);

  console.log(`Luzes: ${count}`);
  console.log('Por região:');
  for (const [name, n] of Object.entries(perRegion)) {
    console.log(`  ${name.padEnd(28)} ${String(n).padStart(6)}`);
  }
  console.log(`\nComparação salva em: ${outPath}`);
  console.log('(topo = imagem de origem, base = os pontos do projeto)');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
