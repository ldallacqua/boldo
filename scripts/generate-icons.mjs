// Gera os ícones do PWA em public/icons a partir do desenho da folha de boldo.
// Rode com `npm run icons` depois de mudar o logotipo.
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';

const OUT = new URL('../public/icons/', import.meta.url);

const LEAF = `
  <path d="M12 36c0-15 9-24 24-24 0 15-9 24-24 24Z" fill="#f3ecd9"/>
  <path d="M12 36 27 21M19.5 28.5V21M19.5 28.5H27" fill="none" stroke="#2c6a45"
        stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;

/** Ícone comum: quadrado arredondado. */
const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
  <rect width="48" height="48" rx="11" fill="#1c3829"/>${LEAF}</svg>`;

/** Maskable/Apple: fundo até a borda e folha dentro da área segura (80% central). */
const fullBleed = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
  <rect width="48" height="48" fill="#1c3829"/>
  <g transform="translate(24 24) scale(0.74) translate(-24 -24)">${LEAF}</g></svg>`;

/** Selo monocromático da barra de status do Android (só o canal alfa é usado). */
const badge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
  <path d="M6 42C6 19.5 19.5 6 42 6c0 22.5-13.5 36-36 36Z" fill="#fff"/></svg>`;

const files = [
  ['icon-192.png', rounded, 192],
  ['icon-512.png', rounded, 512],
  ['icon-maskable-512.png', fullBleed, 512],
  ['apple-touch-icon.png', fullBleed, 180],
  ['badge-96.png', badge, 96],
];

await mkdir(OUT, { recursive: true });
for (const [name, svg, size] of files) {
  await sharp(Buffer.from(svg), { density: 600 })
    .resize(size, size)
    .png()
    .toFile(new URL(name, OUT).pathname);
  console.log(`public/icons/${name}`);
}
