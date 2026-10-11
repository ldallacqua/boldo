import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getConnInfo } from '@hono/node-server/conninfo';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono, type Context } from 'hono';
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie';
import { doseStatus, isScheduledOn } from '../shared/schedule';
import { daysBetween, localNow } from '../shared/time';
import type { DoseToday, SettingsResponse, TodayResponse } from '../shared/types';
import { parseMedicineInput, parseSettings } from '../shared/validate';
import type { PushSender } from './push';
import type { Store } from './store';

const SESSION_COOKIE = 'boldo_session';
const SESSION_DAYS = 180;
const LOGIN_MAX_FAILURES = 8;
const LOGIN_WINDOW_MS = 15 * 60_000;

export interface AppOptions {
  store: Store;
  sender: PushSender;
  password: string;
  /** Segredo aleatório guardado no banco; junto com a senha, assina o cookie de sessão. */
  sessionSecret: string;
  timezone: string;
  vapidPublicKey: string;
  /** Pasta com o front-end já compilado. Sem ela, só a API é servida. */
  staticDir?: string;
  /** Confiar no X-Forwarded-For para o limite de tentativas de login. */
  trustProxy?: boolean;
  now?: () => Date;
}

function sameText(a: string, b: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(a), digest(b));
}

export function createApp(options: AppOptions): Hono {
  const { store, sender, timezone } = options;
  const now = options.now ?? (() => new Date());
  // Trocar a senha muda a assinatura e derruba todas as sessões abertas.
  const cookieSecret = `${options.sessionSecret}:${options.password}`;
  const failures = new Map<string, { count: number; resetAt: number }>();

  const clientKey = (c: Context): string => {
    if (options.trustProxy) {
      const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
      if (forwarded) return forwarded;
    }
    try {
      return getConnInfo(c).remote.address ?? 'local';
    } catch {
      return 'local';
    }
  };

  const isAuthenticated = async (c: Context): Promise<boolean> => {
    const value = await getSignedCookie(c, cookieSecret, SESSION_COOKIE);
    return typeof value === 'string' && Number(value) > now().getTime();
  };

  const idParam = (c: Context, name = 'id'): number | null => {
    const id = Number(c.req.param(name));
    return Number.isInteger(id) && id > 0 ? id : null;
  };

  const readJson = async (c: Context): Promise<unknown> => {
    try {
      return await c.req.json();
    } catch {
      return null;
    }
  };

  const app = new Hono();

  app.onError((error, c) => {
    console.error('[api]', error);
    return c.json({ error: 'Algo deu errado no servidor. Tente de novo.' }, 500);
  });

  app.get('/api/health', (c) => c.json({ ok: true }));

  app.get('/api/session', async (c) => c.json({ authenticated: await isAuthenticated(c) }));

  app.post('/api/login', async (c) => {
    const key = clientKey(c);
    const current = now().getTime();
    const entry = failures.get(key);
    if (entry && entry.resetAt <= current) failures.delete(key);
    if ((failures.get(key)?.count ?? 0) >= LOGIN_MAX_FAILURES) {
      return c.json({ error: 'Muitas tentativas. Espere 15 minutos e tente de novo.' }, 429);
    }

    const body = (await readJson(c)) as { password?: unknown } | null;
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!sameText(password, options.password)) {
      const failed = failures.get(key) ?? { count: 0, resetAt: current + LOGIN_WINDOW_MS };
      failed.count += 1;
      failures.set(key, failed);
      return c.json({ error: 'Senha incorreta.' }, 401);
    }

    failures.delete(key);
    const maxAge = SESSION_DAYS * 86_400;
    const https =
      c.req.header('x-forwarded-proto') === 'https' || new URL(c.req.url).protocol === 'https:';
    await setSignedCookie(c, SESSION_COOKIE, String(current + maxAge * 1000), cookieSecret, {
      httpOnly: true,
      sameSite: 'Strict',
      secure: https,
      path: '/',
      maxAge,
    });
    return c.json({ authenticated: true });
  });

  app.post('/api/logout', (c) => {
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ authenticated: false });
  });

  // Daqui para baixo, tudo em /api exige sessão.
  app.use('/api/*', async (c, next) => {
    if (!(await isAuthenticated(c))) return c.json({ error: 'Entre com a senha.' }, 401);
    await next();
  });

  // ── Remédios ───────────────────────────────────────────────────────────

  app.get('/api/medicines', (c) => c.json(store.listMedicines()));

  app.post('/api/medicines', async (c) => {
    const parsed = parseMedicineInput(await readJson(c));
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);
    return c.json(store.createMedicine(parsed.value, now().toISOString()), 201);
  });

  app.put('/api/medicines/:id', async (c) => {
    const id = idParam(c);
    const parsed = parseMedicineInput(await readJson(c));
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);
    const medicine = id && store.updateMedicine(id, parsed.value, now().toISOString());
    if (!medicine) return c.json({ error: 'Remédio não encontrado.' }, 404);
    return c.json(medicine);
  });

  app.delete('/api/medicines/:id', (c) => {
    const id = idParam(c);
    if (!id || !store.deleteMedicine(id)) {
      return c.json({ error: 'Remédio não encontrado.' }, 404);
    }
    return c.json({ ok: true });
  });

  app.post('/api/medicines/:id/adjust', async (c) => {
    const id = idParam(c);
    const body = (await readJson(c)) as { delta?: unknown } | null;
    const delta = body?.delta;
    if (typeof delta !== 'number' || !Number.isFinite(delta) || Math.abs(delta) > 100_000) {
      return c.json({ error: 'Ajuste inválido.' }, 400);
    }
    const medicine = id && store.adjustQuantity(id, delta, now().toISOString());
    if (!medicine) return c.json({ error: 'Remédio não encontrado.' }, 404);
    return c.json(medicine);
  });

  // ── Doses do dia ───────────────────────────────────────────────────────

  app.get('/api/today', (c) => {
    const local = localNow(timezone, now());
    const intakes = new Map(store.listIntakes(local.date).map((i) => [i.schedule_id, i]));
    const doses: DoseToday[] = [];
    for (const medicine of store.listMedicines()) {
      for (const schedule of medicine.schedules) {
        if (!isScheduledOn(schedule, local.weekday)) continue;
        const intake = intakes.get(schedule.id);
        doses.push({
          scheduleId: schedule.id,
          medicineId: medicine.id,
          medicineName: medicine.name,
          dosage: medicine.dosage,
          unit: medicine.unit,
          time: schedule.time,
          dose: schedule.dose,
          status: doseStatus(schedule.time, local.time, intake?.status ?? null),
          recordedAt: intake?.recorded_at ?? null,
        });
      }
    }
    doses.sort(
      (a, b) => a.time.localeCompare(b.time) || a.medicineName.localeCompare(b.medicineName),
    );
    return c.json({ date: local.date, time: local.time, doses } satisfies TodayResponse);
  });

  /** A notificação pode ser respondida depois da meia-noite; aceita hoje ou ontem. */
  const doseDate = (requested: unknown): string | null => {
    const today = localNow(timezone, now()).date;
    if (requested === undefined || requested === null) return today;
    if (typeof requested !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(requested)) return null;
    const age = daysBetween(requested, today);
    return age === 0 || age === 1 ? requested : null;
  };

  app.post('/api/doses/:scheduleId/:action{take|skip|undo}', async (c) => {
    const scheduleId = idParam(c, 'scheduleId');
    const body = (await readJson(c)) as { date?: unknown } | null;
    const date = doseDate(body?.date);
    if (!scheduleId || !date) return c.json({ error: 'Dose inválida.' }, 400);

    const action = c.req.param('action');
    if (action === 'undo') {
      store.undoIntake(scheduleId, date);
      return c.json({ ok: true });
    }
    const status = action === 'take' ? 'taken' : 'skipped';
    if (!store.recordIntake(scheduleId, date, status, now().toISOString())) {
      return c.json({ error: 'Esse horário não existe mais.' }, 404);
    }
    return c.json({ ok: true });
  });

  // ── Ajustes e notificações ─────────────────────────────────────────────

  const settingsResponse = (): SettingsResponse => ({
    ...store.getSettings(),
    timezone,
    vapidPublicKey: options.vapidPublicKey,
    devices: store.countSubscriptions(),
  });

  app.get('/api/settings', (c) => c.json(settingsResponse()));

  app.put('/api/settings', async (c) => {
    const parsed = parseSettings(await readJson(c));
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);
    store.saveSettings(parsed.value);
    return c.json(settingsResponse());
  });

  app.post('/api/push/subscribe', async (c) => {
    const body = (await readJson(c)) as {
      endpoint?: unknown;
      keys?: { p256dh?: unknown; auth?: unknown };
    } | null;
    const endpoint = body?.endpoint;
    const p256dh = body?.keys?.p256dh;
    const auth = body?.keys?.auth;
    if (
      typeof endpoint !== 'string' ||
      !endpoint.startsWith('https://') ||
      typeof p256dh !== 'string' ||
      typeof auth !== 'string'
    ) {
      return c.json({ error: 'Inscrição inválida.' }, 400);
    }
    store.saveSubscription({ endpoint, p256dh, auth }, now().toISOString());
    return c.json({ devices: store.countSubscriptions() }, 201);
  });

  app.post('/api/push/unsubscribe', async (c) => {
    const body = (await readJson(c)) as { endpoint?: unknown } | null;
    if (typeof body?.endpoint === 'string') store.deleteSubscription(body.endpoint);
    return c.json({ devices: store.countSubscriptions() });
  });

  app.post('/api/push/test', async (c) => {
    const delivered = await sender.send({
      title: 'Lembretes funcionando',
      body: 'É assim que o Boldo vai avisar você.',
      tag: 'test',
      url: '/ajustes',
    });
    return c.json({ delivered });
  });

  app.get('/api/export', (c) => {
    const local = localNow(timezone, now());
    c.header('Content-Disposition', `attachment; filename="boldo-${local.date}.json"`);
    return c.json({
      exportedAt: now().toISOString(),
      settings: store.getSettings(),
      medicines: store.listMedicines(),
      intakes: store.listAllIntakes(),
    });
  });

  app.all('/api/*', (c) => c.json({ error: 'Rota não encontrada.' }, 404));

  // ── Front-end ──────────────────────────────────────────────────────────

  const staticDir = options.staticDir;
  if (staticDir) {
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

  return app;
}
