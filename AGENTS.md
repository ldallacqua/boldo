# Guia para agentes (e pessoas) que vão mexer no Boldo

Boldo é um PWA de farmácia caseira para uma casa só: quais remédios há, quanto resta, para
que servem, anotações e lembretes por notificação. Interface e mensagens são em português
do Brasil; identificadores de código são em inglês; classes CSS são em português.

## Comandos

| Comando                      | Quando usar                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------------- |
| `npm run dev`                | Desenvolver. API em `:3210`, Vite em `:5173` (abra o 5173). Precisa de `.env` com `ADMIN_PASSWORD`. |
| `npm run check`              | Antes de qualquer commit: tipos, lint, formatação e testes unitários.                               |
| `npm run test:e2e`           | Depois de mudar tela, rota, API ou service worker. Faz o build sozinho e usa um banco novo.         |
| `npm run build && npm start` | Testar o que só existe em produção: service worker, instalação, offline, push.                      |
| `npm run format`             | Corrigir formatação (Prettier).                                                                     |
| `npm run icons`              | Depois de mudar o logotipo em `scripts/generate-icons.mjs`.                                         |

Requer Node 24 (usa `node:sqlite`). E2E precisa de `npx playwright install chromium` uma vez.

## Mapa do código

```
shared/              Regras puras, sem I/O. Importadas pelo servidor E pelo app.
  types.ts           Medicine, Schedule, DoseToday, Settings, PushPayload, UNITS
  status.ts          Estoque (ok/low/out), validade (ok/expiring/expired), tarja, duração
  schedule.ts        Estado da dose (pending/late/taken/skipped), quando o lembrete vence
  time.ts            Data/hora em um fuso IANA, minutos, diferença de dias
  format.ts          Textos pt-BR: quantidades, validade, dias da semana, motivos de atenção
  validate.ts        parseMedicineInput / parseSettings (usados na API e no formulário)

server/
  index.ts           Entrada: lê env, abre o banco, sobe app + agendador. Sem lógica.
  app.ts             createApp(): rotas Hono, sessão por cookie, limite de tentativas, estáticos
  store.ts           Store: todo o SQL (node:sqlite). Esquema no topo do arquivo.
  scheduler.ts       runTick(): decide quais notificações saem agora. Idempotente.
  push.ts            Chaves VAPID e envio Web Push (web-push)

src/
  main.tsx           Monta o React, registra o service worker
  App.tsx            Sessão → Login ou Shell + rotas (wouter)
  sw.ts              Service worker: precache (Workbox), evento push, clique na notificação
  pages/             Today (Hoje), Medicines (Remédios), Settings (Ajustes), Login
  components/        Shell (navegação), Sheet (painel modal), MedicineForm, MedicineDetail,
                     MedicineRow, Badges, Toast, States (carregando/erro/vazio), Icon
  lib/               api.ts (fetch), queries.ts (TanStack Query), push.ts (inscrição),
                     notifications.ts (lógica do SW, testável), install.ts, dates.ts
  styles/            tokens.css (cores, tipos, espaços), base.css, app.css

tests/unit/          Vitest, ambiente Node. helpers.ts tem testApp() e memoryStore().
tests/e2e/           Playwright contra o build de produção. helpers.ts tem login() e createMedicine().
scripts/             generate-icons.mjs, seed.mjs (dados de exemplo), screenshots.mjs (README)
```

## Como os dados fluem

- **Um processo, um arquivo**: o servidor Node entrega o app (`dist/`), a API (`/api/*`) e
  roda o agendador. O banco é `DATA_DIR/boldo.db`.
- **Sessão**: `POST /api/login` compara a senha com `ADMIN_PASSWORD` e grava o cookie
  assinado `boldo_session` (HttpOnly, SameSite=Strict, 180 dias). A chave da assinatura é
  `sessionSecret` (aleatório, no banco) + a senha, então trocar a senha derruba as sessões.
  Tudo em `/api/*` exige sessão, exceto `health`, `session`, `login`, `logout`.
- **Estado de um remédio** nunca é guardado: é calculado por `healthOf(medicine, hoje, antecedência)`
  em `shared/status.ts`, tanto no app quanto no agendador.
- **Validade** é `AAAA-MM` (como na caixa) e vale até o último dia do mês.
- **Doses**: um `Schedule` é "horário + dias da semana + dose". Registrar uma dose cria uma
  linha em `intakes` (única por horário e dia) e desconta do estoque; `amount` guarda o
  que saiu de fato para o "desfazer" devolver o valor certo.
- **Hoje** (`GET /api/today`) usa a data e a hora do fuso do servidor (`TZ`), não as do navegador.

## Lembretes (a parte mais delicada)

`runTick()` em `server/scheduler.ts` roda a cada 30 s e pode rodar quantas vezes for sem
repetir aviso:

- **Dose**: sai se o horário já chegou há no máximo 60 min, não há registro da dose e a
  chave `dose:<scheduleId>:<data>` ainda não está em `notification_log`.
- **Estoque e validade**: cada remédio guarda o último estágio avisado (`stock_stage`,
  `expiry_stage`: 0 nada, 1 acabando/vencendo, 2 acabou/venceu). Só avisa quando o estágio
  **sobe**; quando desce (repôs, corrigiu a validade), rearma na hora. Só saem entre
  `alertTime` (Ajustes) e 21:00.
- O navegador recebe o push em `src/sw.ts`; o que a notificação mostra e o que o clique faz
  está em `src/lib/notifications.ts` (testado em `tests/unit/notifications.test.ts`).

Ao mudar regras de lembrete, escreva o teste em `tests/unit/scheduler.test.ts` primeiro: ele
usa relógio falso (`at('08:00')`) e um `sender` que só grava o que seria enviado.

## Convenções

- **Regra de negócio vai em `shared/`**, pura e com teste. Componentes e rotas só chamam.
- **SQL só em `server/store.ts`**. Mudou o esquema? Edite `SCHEMA` e, se já houver bancos em
  uso, acrescente a migração (`ALTER TABLE …`) logo depois do `exec(SCHEMA)`; não há
  ferramenta de migração.
- **Erros da API**: `{ "error": "frase em português para a pessoa" }` com o status HTTP certo.
  O app mostra essa frase como está.
- **Textos**: voz ativa, sem jargão. O botão diz o que faz ("Salvar remédio") e o aviso
  repete o verbo ("Remédio salvo"). Use `formatQuantity()` para qualquer quantidade com unidade.
- **Sem dependências novas** sem necessidade real: o servidor de produção tem só `hono`,
  `@hono/node-server` e `web-push`. O que é do app vai em `devDependencies` (o Vite empacota).
- **Formatação**: Prettier (aspas simples, 100 colunas). Comentários em português, só quando
  explicam um porquê.

## Design

Paleta creme e verde, definida em `src/styles/tokens.css`. Não use cores fora dos tokens.

- **A tarja** (faixa colorida, como nas caixas de remédio) é o único elemento que carrega
  cor de estado: verde em ordem, mostarda atenção, vermelha acabou/venceu. Aparece na
  lateral das linhas (`.caixa`), no topo do bloco de estoque e como marcador da navegação.
- Títulos e números em Bricolage Grotesque; texto em Instrument Sans (ambas empacotadas,
  sem CDN, para funcionar offline).
- Botões são cápsulas (`--capsula`); caixas têm `--canto-caixa`.
- Três layouts: barra embaixo (< 720px), trilho lateral (720–1099px), lateral completa (≥ 1100px).
- O painel de remédio (`Sheet`) é um `<dialog>` modal: sobe de baixo no celular, entra pela
  direita em telas largas. O `Toast` usa `popover` para ficar acima dele.
- Alvos de toque de pelo menos 44px, foco visível, `prefers-reduced-motion` respeitado.

Depois de mudar a aparência, rode `node scripts/screenshots.mjs` contra um servidor com
`scripts/seed.mjs` aplicado e olhe as imagens em `docs/screenshots/`.

## Armadilhas conhecidas

- **Service worker só no build**: em `npm run dev` não há SW, logo não há push nem offline.
- **Chromium sem janela nega notificações**: por isso o E2E de push troca `showNotification`
  por um espião, e a entrega real precisa ser conferida em um aparelho ("Enviar um teste").
- **iOS**: push só com o app instalado na Tela de Início (16.4+). `getPushState()` devolve
  `needs-install` nesse caso.
- **Callbacks de `mutate()` não rodam se o componente desmontar** antes de a mutação
  terminar. Onde a tela some junto com o dado (excluir remédio), use `mutateAsync`.
- **`client.clear()` do TanStack Query** solta os observadores; para sair, grave a sessão e
  remova as outras queries (veja `logout` em `pages/Settings.tsx`).
- **E2E compartilha um banco** entre testes e tamanhos de tela: use `unique()` para nomes e
  não conte linhas totais.
- **HTTPS**: instalar e receber push exigem HTTPS fora de `localhost`. O cookie só ganha
  `Secure` quando o pedido chega por HTTPS (direto ou via `X-Forwarded-Proto`).
