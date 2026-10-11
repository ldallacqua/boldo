// Empacota a API em um arquivo só para a Edge Function do Supabase (Deno).
// O Deno só aceita módulos nativos do Node com o prefixo "node:", então reescrevemos os imports.
import { builtinModules } from 'node:module';
import { build } from 'esbuild';

const builtins = new RegExp(`^(${builtinModules.join('|')})(/.*)?$`);

await build({
  entryPoints: ['supabase/functions/api/main.ts'],
  outfile: 'supabase/functions/api/index.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2022',
  logLevel: 'info',
  // No runtime do Supabase, os globais do Node não existem para o nosso código: o driver do
  // Postgres precisa que eles sejam importados explicitamente.
  banner: {
    js: [
      "import { Buffer } from 'node:buffer';",
      "import process from 'node:process';",
      "import { setImmediate, clearImmediate } from 'node:timers';",
    ].join('\n'),
  },
  plugins: [
    {
      name: 'node-prefix',
      setup(pipeline) {
        pipeline.onResolve({ filter: builtins }, (args) => ({
          path: `node:${args.path}`,
          external: true,
        }));
      },
    },
  ],
});
