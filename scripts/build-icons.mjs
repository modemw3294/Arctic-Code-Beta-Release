// Build platform icons from src/assets/arctic-code-logo.svg.
// Produces: build/icon.png (1024x1024, padded square, transparent bg).
// electron-builder will derive icns/ico automatically from this.
import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svgPath = path.join(root, 'src/assets/arctic-code-logo.svg');
const outDir = path.join(root, 'build');
mkdirSync(outDir, { recursive: true });

const SIZE = 1024;
// Render SVG large, then composite onto transparent square canvas with padding.
const svg = readFileSync(svgPath);

// Render SVG at a generous size then we'll place it centered with padding.
const innerSize = Math.round(SIZE * 0.78); // 78% inset, leaves padding around
const rendered = await sharp(svg, { density: 600 })
  .resize(innerSize, innerSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();

await sharp({
  create: {
    width: SIZE,
    height: SIZE,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite([{ input: rendered, gravity: 'center' }])
  .png()
  .toFile(path.join(outDir, 'icon.png'));

console.log('Wrote build/icon.png (1024x1024)');
