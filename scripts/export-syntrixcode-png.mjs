import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '..', 'branding', 'png');
mkdirSync(outDir, { recursive: true });

function svg({ sColor, textColor, codeColor, bracketColor }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240">
  <text
    x="160"
    y="130"
    text-anchor="middle"
    font-family="'JetBrains Mono','Fira Code','Consolas',monospace"
    font-size="130"
    font-weight="700"
  >
    <tspan fill="${bracketColor}">{</tspan><tspan fill="${sColor}" dx="6">S</tspan><tspan fill="${bracketColor}" dx="6">}</tspan>
  </text>
  <text
    x="160"
    y="200"
    text-anchor="middle"
    font-family="'Inter','Segoe UI',Arial,sans-serif"
    font-size="44"
    font-weight="600"
    letter-spacing="2"
  >
    <tspan fill="${textColor}">syntrix</tspan><tspan fill="${codeColor}" font-family="'JetBrains Mono','Consolas',monospace" font-weight="700">Code</tspan>
  </text>
</svg>`;
}

const variants = [
  {
    name: 'syntrixcode-dark',
    desc: 'koyu metin — beyaz/açık zeminler için',
    svg: svg({ sColor: '#0f172a', textColor: '#0f172a', codeColor: '#06b6d4', bracketColor: '#06b6d4' }),
  },
  {
    name: 'syntrixcode-light',
    desc: 'açık metin — koyu zeminler için',
    svg: svg({ sColor: '#e2e8f0', textColor: '#e2e8f0', codeColor: '#06b6d4', bracketColor: '#06b6d4' }),
  },
];

const sizes = [512, 1024, 2048];

for (const v of variants) {
  for (const size of sizes) {
    const out = resolve(outDir, `${v.name}-${size}.png`);
    const buf = await sharp(Buffer.from(v.svg), { density: 600 })
      .resize(size, Math.round(size * 240 / 320), { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    writeFileSync(out, buf);
    console.log(`✓ ${out} (${size}×${Math.round(size * 240 / 320)})`);
  }
}

console.log('\nTamam.');
