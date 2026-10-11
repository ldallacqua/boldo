// Gera, a partir das artes do Boldinho em art/mascote/, os ícones do PWA (public/icons) e as
// versões leves usadas nas telas (public/mascote). Rode com `npm run icons` ao trocar a arte.
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';

const ART = new URL('../art/mascote/', import.meta.url).pathname;
const ICONS = new URL('../public/icons/', import.meta.url).pathname;
const MASCOT = new URL('../public/mascote/', import.meta.url).pathname;
const CREME = '#f3ecd9';

await mkdir(ICONS, { recursive: true });
await mkdir(MASCOT, { recursive: true });

/** O mascote sem as margens transparentes, pronto para ser reposicionado. */
const trimmed = (pose) => sharp(`${ART}${pose}.png`).trim().toBuffer();

/** Mascote centralizado em um quadrado creme. `fill` é quanto do quadrado ele ocupa. */
async function icon(name, size, fill, radius = 0) {
  const inner = Math.round(size * fill);
  const mascot = await sharp(await trimmed('ola'))
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  const background = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
       <rect width="${size}" height="${size}" rx="${radius * size}" fill="${CREME}"/>
     </svg>`,
  );
  await sharp(background)
    .composite([{ input: mascot, gravity: 'centre' }])
    .png()
    .toFile(`${ICONS}${name}`);
  console.log(`public/icons/${name}`);
}

// Ícone comum: cantos arredondados. Maskable/Apple: fundo até a borda, mascote na área segura.
await icon('icon-192.png', 192, 0.84, 0.22);
await icon('icon-512.png', 512, 0.84, 0.22);
await icon('icon-maskable-512.png', 512, 0.62);
await icon('apple-touch-icon.png', 180, 0.74);

// Selo monocromático da barra de status do Android: só a silhueta (o canal alfa) é usada.
const silhouette = await sharp(await trimmed('ola'))
  .resize(88, 88, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .extend({ top: 4, bottom: 4, left: 4, right: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .extractChannel('alpha')
  .toBuffer();
await sharp({ create: { width: 96, height: 96, channels: 3, background: '#ffffff' } })
  .joinChannel(silhouette)
  .png()
  .toFile(`${ICONS}badge-96.png`);
console.log('public/icons/badge-96.png');

// Poses para as telas: WebP pequeno, com folga para telas de alta densidade.
for (const pose of ['ola', 'vazio', 'tudo-certo', 'lembrete', 'ops']) {
  await sharp(await trimmed(pose))
    .resize(640, 640, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 88, alphaQuality: 90 })
    .toFile(`${MASCOT}${pose}.webp`);
  console.log(`public/mascote/${pose}.webp`);
}
