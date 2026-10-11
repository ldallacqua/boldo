// Gera as imagens usadas pelos testes do leitor de código de barras:
//   node tests/e2e/fixtures/make-barcode.mjs
// - caixa.png: a "foto" de um código EAN-13, para o caminho de enviar foto;
// - camera.mjpeg: o mesmo código como vídeo, que o Chromium usa no lugar da câmera.
import { writeFile } from 'node:fs/promises';
import sharp from 'sharp';

/** Alergaliv 10 mg com 15 comprimidos, que está na lista da Anvisa (public/catalogo). */
const EAN = '7896004712673';

const L = [
  '0001101',
  '0011001',
  '0010011',
  '0111101',
  '0100011',
  '0110001',
  '0101111',
  '0111011',
  '0110111',
  '0001011',
];
const G = [
  '0100111',
  '0110011',
  '0011011',
  '0100001',
  '0011101',
  '0111001',
  '0000101',
  '0010001',
  '0001001',
  '0010111',
];
const R = L.map((code) => [...code].map((bit) => (bit === '1' ? '0' : '1')).join(''));
const PARITY = [
  'LLLLLL',
  'LLGLGG',
  'LLGGLG',
  'LLGGGL',
  'LGLLGG',
  'LGGLLG',
  'LGGGLL',
  'LGLGLG',
  'LGLGGL',
  'LGGLGL',
];

function modules(ean) {
  const digits = [...ean].map(Number);
  const left = digits
    .slice(1, 7)
    .map((digit, i) => (PARITY[digits[0]][i] === 'L' ? L : G)[digit])
    .join('');
  const right = digits
    .slice(7)
    .map((digit) => R[digit])
    .join('');
  return `101${left}01010${right}101`;
}

function svg(width, height) {
  const bits = modules(EAN);
  const unit = Math.floor((width * 0.7) / bits.length);
  const x0 = Math.round((width - unit * bits.length) / 2);
  const barHeight = Math.round(height * 0.5);
  const y0 = Math.round((height - barHeight) / 2);
  const bars = [...bits]
    .map((bit, i) =>
      bit === '1'
        ? `<rect x="${x0 + i * unit}" y="${y0}" width="${unit}" height="${barHeight}"/>`
        : '',
    )
    .join('');
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${bars}</g></svg>`,
  );
}

const here = new URL('./', import.meta.url);
await sharp(svg(900, 500)).png().toFile(new URL('caixa.png', here).pathname);
const frame = await sharp(svg(640, 480)).jpeg({ quality: 90 }).toBuffer();
await writeFile(
  new URL('camera.mjpeg', here),
  Buffer.concat(Array.from({ length: 10 }, () => frame)),
);
console.log(`Código ${EAN}: caixa.png e camera.mjpeg gerados.`);
