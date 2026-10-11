import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import type { Hono } from 'hono';

/** Entrega o front-end compilado junto com a API (modo "um servidor só", ex.: Docker). */
export function mountStatic(app: Hono, staticDir: string): void {
  app.use(
    '/*',
    serveStatic({
      root: staticDir,
      onFound: (path, c) => {
        const immutable = path.includes('/assets/');
        c.header('Cache-Control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    }),
  );
  // Qualquer outra rota é do app (SPA): devolve o index.html.
  app.get('/*', async (c) => {
    c.header('Cache-Control', 'no-cache');
    return c.html(await readFile(join(staticDir, 'index.html'), 'utf8'));
  });
}
