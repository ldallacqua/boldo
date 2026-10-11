import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { doseStatus, isScheduledOn } from '../shared/schedule';
import { daysBetween, localNow } from '../shared/time';
import type { DoseToday, SettingsResponse, TodayResponse } from '../shared/types';
import { parseMedicineInput, parseSettings } from '../shared/validate';
import type { PushSender } from './push';
import { runTick } from './scheduler';
import type { Store } from './store';
import { sameText, type Tokens } from './tokens';

const SESSION_DAYS = 180;
const LOGIN_MAX_FAILURES = 8;
const LOGIN_WINDOW_MS = 15 * 60_000;

export interface AppOptions {
  store: Store;
  sender: PushSender;
  password: string;
  /** Assina sessões e ações de notificação. Derive de um segredo do banco + a senha. */
  tokens: Tokens;
  timezone: string;
  vapidPublicKey: string;
  /** Origens de onde o app pode chamar a API quando é servido de outro endereço (CORS). */
  allowedOrigins?: string[];
  /** Com ele, `POST /api/tick` roda o agendador (para um cron externo chamar). */
  cronSecret?: string;
  /** Confiar no X-Forwarded-For para o limite de tentativas de login. */
  trustProxy?: boolean;
  /** Endereço de quem chamou, quando o ambiente sabe dizer (o servidor Node sabe). */
  clientAddress?: (c: Context) => string | undefined;
  now?: () => Date;
}

function bearer(c: Context): string | undefined {
  return c.req.header('authorization')?.match(/^Bearer (.+)$/)?.[1];
}

export function createApp(options: AppOptions): Hono {
  const { store, sender, timezone, tokens } = options;
  const now = options.now ?? (() => new Date());

  const clientKey = (c: Context): string => {
    if (options.trustProxy) {
      const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
      if (forwarded) return forwarded;
    }
    return options.clientAddress?.(c) ?? 'local';
  };

  const isAuthenticated = (c: Context): boolean =>
    tokens.isValidSession(bearer(c), now().getTime());

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

  /** A notificação pode ser respondida depois da meia-noite; aceita hoje ou ontem. */
  const doseDate = (requested: unknown): string | null => {
    const today = localNow(timezone, now()).date;
    if (requested === undefined || requested === null) return today;
    if (typeof requested !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(requested)) return null;
    const age = daysBetween(requested, today);
    return age === 0 || age === 1 ? requested : null;
  };

  const app = new Hono();

  app.onError((error, c) => {
    console.error('[api]', error);
    return c.json({ error: 'Algo deu errado no servidor. Tente de novo.' }, 500);
  });

  if (options.allowedOrigins?.length) {
    app.use(
      '/api/*',
      cors({
        origin: options.allowedOrigins,
        allowHeaders: ['Authorization', 'Content-Type'],
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
        maxAge: 86_400,
      }),
    );
  }

  // ── Sem sessão ─────────────────────────────────────────────────────────

  app.get('/api/health', async (c) => {
    await store.ping();
    return c.json({ ok: true });
  });

  app.get('/api/session', (c) => c.json({ authenticated: isAuthenticated(c) }));

  app.post('/api/login', async (c) => {
    const key = clientKey(c);
    const current = now().getTime();
    if ((await store.loginFailures(key, current)) >= LOGIN_MAX_FAILURES) {
      return c.json({ error: 'Muitas tentativas. Espere 15 minutos e tente de novo.' }, 429);
    }

    const body = (await readJson(c)) as { password?: unknown } | null;
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!sameText(password, options.password)) {
      await store.recordLoginFailure(key, current, LOGIN_WINDOW_MS);
      return c.json({ error: 'Senha incorreta.' }, 401);
    }

    await store.clearLoginFailures(key);
    const token = tokens.session(current + SESSION_DAYS * 86_400_000);
    return c.json({ authenticated: true, token });
  });

  // Botão "Tomei" da notificação: quem autoriza é o token que foi dentro do lembrete.
  app.post('/api/push-action/take', async (c) => {
    const body = (await readJson(c)) as {
      scheduleId?: unknown;
      date?: unknown;
      token?: unknown;
    } | null;
    const scheduleId = Number(body?.scheduleId);
    const date = doseDate(body?.date);
    if (!Number.isInteger(scheduleId) || !date || typeof body?.date !== 'string') {
      return c.json({ error: 'Dose inválida.' }, 400);
    }
    if (!tokens.isValidDose(scheduleId, date, body?.token)) {
      return c.json({ error: 'Este lembrete não vale mais. Abra o app para registrar.' }, 401);
    }
    if (!(await store.recordIntake(scheduleId, date, 'taken', now().toISOString()))) {
      return c.json({ error: 'Esse horário não existe mais.' }, 404);
    }
    return c.json({ ok: true });
  });

  // Chamado a cada minuto pelo cron do banco quando não há um processo sempre ligado.
  app.post('/api/tick', async (c) => {
    const secret = options.cronSecret;
    if (!secret || !sameText(bearer(c) ?? '', secret)) {
      return c.json({ error: 'Não autorizado.' }, 401);
    }
    const sent = await runTick({ store, sender, timezone, tokens }, now());
    return c.json({ sent: sent.length });
  });

  // Daqui para baixo, tudo em /api exige sessão.
  app.use('/api/*', async (c, next) => {
    if (!isAuthenticated(c)) return c.json({ error: 'Entre com a senha.' }, 401);
    await next();
  });

  // ── Remédios ───────────────────────────────────────────────────────────

  app.get('/api/medicines', async (c) => c.json(await store.listMedicines()));

  app.post('/api/medicines', async (c) => {
    const parsed = parseMedicineInput(await readJson(c));
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);
    return c.json(await store.createMedicine(parsed.value, now().toISOString()), 201);
  });

  app.put('/api/medicines/:id', async (c) => {
    const id = idParam(c);
    const parsed = parseMedicineInput(await readJson(c));
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);
    const medicine = id && (await store.updateMedicine(id, parsed.value, now().toISOString()));
    if (!medicine) return c.json({ error: 'Remédio não encontrado.' }, 404);
    return c.json(medicine);
  });

  app.delete('/api/medicines/:id', async (c) => {
    const id = idParam(c);
    if (!id || !(await store.deleteMedicine(id))) {
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
    const medicine = id && (await store.adjustQuantity(id, delta, now().toISOString()));
    if (!medicine) return c.json({ error: 'Remédio não encontrado.' }, 404);
    return c.json(medicine);
  });

  // ── Doses do dia ───────────────────────────────────────────────────────

  app.get('/api/today', async (c) => {
    const local = localNow(timezone, now());
    const recorded = await store.listIntakes(local.date);
    const intakes = new Map(recorded.map((i) => [i.schedule_id, i]));
    const doses: DoseToday[] = [];
    for (const medicine of await store.listMedicines()) {
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

  app.post('/api/doses/:scheduleId/:action{take|skip|undo}', async (c) => {
    const scheduleId = idParam(c, 'scheduleId');
    const body = (await readJson(c)) as { date?: unknown } | null;
    const date = doseDate(body?.date);
    if (!scheduleId || !date) return c.json({ error: 'Dose inválida.' }, 400);

    const action = c.req.param('action');
    if (action === 'undo') {
      await store.undoIntake(scheduleId, date);
      return c.json({ ok: true });
    }
    const status = action === 'take' ? 'taken' : 'skipped';
    if (!(await store.recordIntake(scheduleId, date, status, now().toISOString()))) {
      return c.json({ error: 'Esse horário não existe mais.' }, 404);
    }
    return c.json({ ok: true });
  });

  // ── Ajustes e notificações ─────────────────────────────────────────────

  const settingsResponse = async (): Promise<SettingsResponse> => ({
    ...(await store.getSettings()),
    timezone,
    vapidPublicKey: options.vapidPublicKey,
    devices: await store.countSubscriptions(),
  });

  app.get('/api/settings', async (c) => c.json(await settingsResponse()));

  app.put('/api/settings', async (c) => {
    const parsed = parseSettings(await readJson(c));
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);
    await store.saveSettings(parsed.value);
    return c.json(await settingsResponse());
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
    await store.saveSubscription({ endpoint, p256dh, auth }, now().toISOString());
    return c.json({ devices: await store.countSubscriptions() }, 201);
  });

  app.post('/api/push/unsubscribe', async (c) => {
    const body = (await readJson(c)) as { endpoint?: unknown } | null;
    if (typeof body?.endpoint === 'string') await store.deleteSubscription(body.endpoint);
    return c.json({ devices: await store.countSubscriptions() });
  });

  // O "aparelho" é a inscrição de push dele: o endereço (endpoint) é a identidade.
  app.post('/api/push/device', async (c) => {
    const body = (await readJson(c)) as { endpoint?: unknown } | null;
    const muted =
      typeof body?.endpoint === 'string' ? await store.getMutedMedicines(body.endpoint) : null;
    if (!muted) return c.json({ error: 'Este aparelho não está recebendo lembretes.' }, 404);
    return c.json({ mutedMedicines: muted });
  });

  app.put('/api/push/device', async (c) => {
    const body = (await readJson(c)) as { endpoint?: unknown; mutedMedicines?: unknown } | null;
    const ids = body?.mutedMedicines;
    if (
      typeof body?.endpoint !== 'string' ||
      !Array.isArray(ids) ||
      ids.length > 1000 ||
      !ids.every((id) => Number.isInteger(id) && id > 0)
    ) {
      return c.json({ error: 'Lista de remédios inválida.' }, 400);
    }
    const mutedMedicines = [...new Set(ids as number[])].sort((x, y) => x - y);
    if (!(await store.setMutedMedicines(body.endpoint, mutedMedicines))) {
      return c.json({ error: 'Este aparelho não está recebendo lembretes.' }, 404);
    }
    return c.json({ mutedMedicines });
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

  app.get('/api/export', async (c) => {
    const local = localNow(timezone, now());
    c.header('Content-Disposition', `attachment; filename="boldo-${local.date}.json"`);
    return c.json({
      exportedAt: now().toISOString(),
      settings: await store.getSettings(),
      medicines: await store.listMedicines(),
      intakes: await store.listAllIntakes(),
    });
  });

  app.all('/api/*', (c) => c.json({ error: 'Rota não encontrada.' }, 404));

  return app;
}
