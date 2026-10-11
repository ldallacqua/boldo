// Imita o GitHub Pages para os testes: serve uma pasta estática em /<prefixo>/ e, como o
// Pages, responde com 404.html (status 404) para caminhos que não são arquivos.
// Uso: node scripts/serve-pages.mjs <pasta> <prefixo> <porta>
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const [dir = 'dist', prefix = '/boldo/', port = '4174'] = process.argv.slice(2);
const root = resolve(dir);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

createServer((request, response) => {
  const { pathname } = new URL(request.url, 'http://localhost');
  const send = (status, file) => {
    response.writeHead(status, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'max-age=600',
    });
    createReadStream(file).pipe(response);
  };

  if (!pathname.startsWith(prefix)) {
    response.writeHead(404, { 'Content-Type': 'text/plain' }).end('Fora do site.');
    return;
  }
  const relative = normalize(decodeURIComponent(pathname.slice(prefix.length)));
  let file = join(root, relative);
  if (!file.startsWith(root)) {
    response.writeHead(403).end();
    return;
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (existsSync(file)) send(200, file);
  else send(404, join(root, '404.html'));
}).listen(Number(port), () => console.log(`Pages de teste em http://localhost:${port}${prefix}`));
