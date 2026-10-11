import type { Hono } from 'hono';
import { boot } from '../../../server/boot';
import type { Db } from '../../../server/db';
import { openPostgres } from '../../../server/db-postgres';
import { Store } from '../../../server/store';

/**
 * Entrada da hospedagem gratuita: a mesma API do servidor Node, rodando como Edge Function
 * do Supabase (Deno) em https://<projeto>.supabase.co/functions/v1/api/...
 * O app em si é servido pelo GitHub Pages. Como aqui não há processo sempre ligado, quem
 * dispara os lembretes é o cron do próprio banco (pg_cron), chamando POST /api/tick.
 */

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const CRON_JOB = 'boldo-tick';

/** Agenda (uma vez) a chamada por minuto. O segredo é lido do banco na hora, não fica no SQL. */
async function installCron(db: Db, store: Store, tickUrl: string): Promise<void> {
  if (!/^https:\/\/[\w.-]+\/functions\/v1\/api\/tick$/.test(tickUrl)) {
    throw new Error(`URL de cron inesperada: ${tickUrl}`);
  }
  const marker = `v2:${tickUrl}`;
  if ((await store.getSetting('cronInstalled')) === marker) return;

  await db.exec('CREATE EXTENSION IF NOT EXISTS pg_cron; CREATE EXTENSION IF NOT EXISTS pg_net;');
  const command = `SELECT net.http_post(
    url := '${tickUrl}',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (SELECT value FROM boldo.settings WHERE key = 'cronSecret')
    ),
    timeout_milliseconds := 25000
  )`;
  await db.query('SELECT cron.schedule($1, $2, $3)', [CRON_JOB, '* * * * *', command]);
  // O pg_cron guarda um registro por execução (1.440 por dia); sem faxina, o banco só cresce.
  await db.query('SELECT cron.schedule($1, $2, $3)', [
    `${CRON_JOB}-faxina`,
    '17 3 * * *',
    "DELETE FROM cron.job_run_details WHERE end_time < now() - interval '2 days'",
  ]);
  await store.setSetting('cronInstalled', marker);
}

async function start(): Promise<Hono> {
  const password = Deno.env.get('ADMIN_PASSWORD');
  const databaseUrl = Deno.env.get('SUPABASE_DB_URL');
  if (!password) throw new Error('Defina o segredo ADMIN_PASSWORD (supabase secrets set).');
  if (!databaseUrl) throw new Error('SUPABASE_DB_URL não está disponível.');

  const db = openPostgres(databaseUrl);
  const store = new Store(db);
  const { app } = await boot({
    store,
    password,
    timezone: Deno.env.get('BOLDO_TZ') ?? 'America/Sao_Paulo',
    vapidSubject: Deno.env.get('VAPID_SUBJECT') ?? 'https://github.com/ldallacqua/boldo',
    allowedOrigins: Deno.env
      .get('ALLOWED_ORIGINS')
      ?.split(',')
      .map((origin) => origin.trim()),
    // O gateway do Supabase informa o endereço de quem chamou.
    trustProxy: true,
    externalCron: true,
  });

  try {
    await installCron(db, store, `${Deno.env.get('SUPABASE_URL')}/functions/v1/api/tick`);
  } catch (error) {
    // Sem cron, o app funciona; só os lembretes não saem. Fica registrado para investigar.
    console.error('[cron] não foi possível agendar os lembretes:', error);
  }
  return app;
}

let ready: Promise<Hono> | undefined;

Deno.serve(async (request) => {
  ready ??= start().catch((error) => {
    ready = undefined;
    throw error;
  });
  try {
    return await (await ready).fetch(request);
  } catch (error) {
    console.error('[boot]', error);
    return Response.json(
      { error: 'O servidor não conseguiu iniciar. Tente de novo em instantes.' },
      { status: 503, headers: { 'Access-Control-Allow-Origin': '*' } },
    );
  }
});
