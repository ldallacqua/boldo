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
| `npm run icons`              | Depois de mudar as artes em `art/mascote/`: regenera ícones e imagens das telas.                    |
| `npm run catalog`            | Atualizar o catálogo do código de barras com a lista atual da Anvisa.                               |
| `npm run deploy:api`         | Publicar a API no Supabase (acrescente `-- --project-ref <ref>`). Veja `docs/hospedagem.md`.        |

Requer Node 24. E2E precisa de `npx playwright install chromium webkit` uma vez.

## Mapa do código

```
shared/              Regras puras, sem I/O. Importadas pelo servidor E pelo app.
  types.ts           Medicine, Schedule, DoseToday, Settings, PushPayload, UNITS
  status.ts          Estoque (ok/low/out), validade (ok/expiring/expired), tarja, duração
  schedule.ts        Estado da dose (pending/late/taken/skipped), quando o lembrete vence
  time.ts            Data/hora em um fuso IANA, minutos, diferença de dias
  dosage.ts          Dosagem: medidas aceitas (mg, g, mL…), formatDosage / parseDosage
  tags.ts            Tags de "pra que serve": sugestões, limpeza, comparação sem acento
  catalog.ts         Código de barras: EAN, leitura da apresentação da Anvisa, classe → tags
  format.ts          Textos pt-BR: quantidades, validade, dias da semana, motivos de atenção
  validate.ts        parseMedicineInput / parseSettings (usados na API e no formulário)

server/
  boot.ts            O que as duas entradas têm em comum: banco, segredos, chaves, createApp()
  index.ts           Entrada Node ("um servidor só"): API + app estático + agendador
  app.ts             createApp(): rotas Hono, sessão por token, CORS, limite de tentativas
  store.ts           Store: todo o SQL (Postgres, esquema `boldo`). Esquema no topo do arquivo.
  db.ts              Interface Db; db-pglite.ts (Postgres embutido) e db-postgres.ts (externo)
  tokens.ts          Assinaturas HMAC: sessão e ação "Tomei" da notificação
  scheduler.ts       runTick(): decide quais notificações saem agora. Idempotente.
  push.ts            Web Push só com Web Crypto + fetch (RFC 8291/8292), sem dependências
  static.ts          Entrega dist/ no modo "um servidor só"

supabase/
  config.toml        Função `api` sem verificação de JWT (a API tem a própria senha)
  functions/api/main.ts   Entrada Edge Function (Deno): mesma API + instala o cron no banco
                          (index.js ao lado é gerado por `npm run build:edge`; fora do Git)

src/
  main.tsx           Monta o React, registra o service worker, define a base das rotas
  App.tsx            Sessão → Login ou Shell + rotas (wouter)
  sw.ts              Service worker: precache (Workbox), evento push, clique na notificação
  pages/             Today (Hoje), Medicines (Remédios), Settings (Ajustes), Login
  components/        Shell (navegação), Sheet (painel modal), MedicineForm, MedicineDetail,
                     MedicineRow, TagInput, BarcodeScanner, Badges, Toast, States, Icon, Mascote
  lib/               config.ts (API_BASE, APP_BASE, asset), session.ts (token), api.ts (fetch),
                     queries.ts (TanStack Query), push.ts (inscrição), notifications.ts
                     (lógica do SW, testável), catalog.ts (busca no catálogo), scanner.ts
                     (leitor de código, baixado só ao abrir a câmera), install.ts, dates.ts
  styles/            tokens.css (cores, tipos, espaços), base.css, app.css

art/mascote/         Artes originais do Boldinho (PNG 1024, geradas por IA). Fonte dos ícones.
public/              icons/ e mascote/ são GERADOS por `npm run icons`, e catalogo/ por
                     `npm run catalog`; não edite à mão.

tests/unit/          Vitest, ambiente Node. helpers.ts tem testApp() e memoryStore().
tests/e2e/           Playwright contra o build de produção. helpers.ts tem login() e createMedicine().
scripts/             generate-icons.mjs, build-edge.mjs, serve-pages.mjs (Pages de teste),
                     seed.mjs (dados de exemplo), screenshots.mjs (README)
```

## Como os dados fluem

- **Duas hospedagens, um código** (detalhes em `docs/hospedagem.md`):
  - gratuita, a que está no ar: app no GitHub Pages (`/boldo/`), API como Edge Function do
    Supabase, Postgres do Supabase, lembretes disparados pelo `pg_cron` (`POST /api/tick`);
  - "um servidor só": `server/index.ts` entrega app, API e agendador; banco PGlite em
    `DATA_DIR/pg` ou um Postgres externo via `DATABASE_URL`.
    As duas chamam `boot()` e `createApp()`; só muda quem abre o banco e quem marca o tempo.
- **App e API podem estar em origens diferentes.** O app nunca usa caminho absoluto: API por
  `API_BASE`, arquivos por `asset()`, rotas pelo `<Router base>`. Por isso não há cookies.
- **Sessão**: `POST /api/login` compara a senha com `ADMIN_PASSWORD` e devolve um token
  assinado (validade de 180 dias) que o app guarda em `localStorage` e envia em
  `Authorization: Bearer`. A chave da assinatura é `sessionSecret` (aleatório, no banco) + a
  senha, então trocar a senha derruba as sessões. Tudo em `/api/*` exige sessão, exceto
  `health`, `session`, `login`, `push-action/take` (token da dose) e `tick` (segredo do cron).
- **Estado de um remédio** nunca é guardado: é calculado por `healthOf(medicine, hoje, antecedência)`
  em `shared/status.ts`, tanto no app quanto no agendador.
- **Validade** é `AAAA-MM` (como na caixa) e vale até o último dia do mês.
- **Dosagem** é um texto, mas sempre no formato de `formatDosage` ("500 mg", "0,9%"): a API
  recusa o que `parseDosage` não entende, e o formulário edita número e medida separados.
- **Pra que serve** são tags (`tags: string[]`, coluna `jsonb`), limpas por `normalizeTags`:
  sem repetição, comparadas sem acento nem maiúsculas, com a grafia das sugestões quando
  coincidem. As tags em uso viram sugestão no formulário e filtro na lista.
- **Código de barras**: `public/catalogo/NN.json` (NN = dois últimos dígitos do código) traz
  as linhas da lista aberta de preços da Anvisa, cruas. O app baixa só o arquivo do código
  lido e `toCatalogMatch()` transforma a linha em campos do formulário, então mudar a leitura
  (`parsePresentation`, `CLASS_TAGS`) não exige regenerar o catálogo. Nada disso passa pela
  API. O que vem do catálogo só preenche o formulário: quem salva é a pessoa.
- **Doses**: um `Schedule` é "horário + dias da semana + dose". Registrar uma dose cria uma
  linha em `intakes` (única por horário e dia) e desconta do estoque; `amount` guarda o
  que saiu de fato para o "desfazer" devolver o valor certo.
- **Hoje** (`GET /api/today`) usa a data e a hora do fuso do servidor (`TZ`), não as do navegador.

## Lembretes (a parte mais delicada)

`runTick()` em `server/scheduler.ts` roda a cada 30 s (Node) ou a cada minuto (cron do
Supabase) e pode rodar quantas vezes for, até em paralelo, sem repetir aviso:

- **Dose**: sai se o horário já chegou há no máximo 60 min, não há registro da dose e a
  chave `dose:<scheduleId>:<data>` ainda não está em `notification_log`.
- **Estoque e validade**: cada remédio guarda o último estágio avisado (`stock_stage`,
  `expiry_stage`: 0 nada, 1 acabando/vencendo, 2 acabou/venceu). Só avisa quando o estágio
  **sobe**; quando desce (repôs, corrigiu a validade), rearma na hora. Só saem entre
  `alertTime` (Ajustes) e 21:00. A troca de estágio é um compare-and-swap
  (`advanceAlertStages`): só quem grava envia.
- **Por aparelho**: cada inscrição de push guarda os remédios que silenciou
  (`muted_medicines`). O agendador entrega o id do remédio junto com o aviso
  (`sender.send(payload, medicineId)`) e o envio pula os aparelhos que o silenciaram; vale
  para dose, estoque e validade. O estágio de estoque/validade é da casa, não do aparelho.
- O navegador recebe o push em `src/sw.ts`; o que a notificação mostra e o que o clique faz
  está em `src/lib/notifications.ts` (testado em `tests/unit/notifications.test.ts`).

Ao mudar regras de lembrete, escreva o teste em `tests/unit/scheduler.test.ts` primeiro: ele
usa relógio falso (`at('08:00')`) e um `sender` que só grava o que seria enviado.

## Convenções

- **Regra de negócio vai em `shared/`**, pura e com teste. Componentes e rotas só chamam.
- **SQL só em `server/store.ts`**, em dialeto Postgres, sempre com o prefixo `boldo.` (no
  Supabase, o esquema `public` é exposto pela API REST automática; o `boldo` não). Mudou o
  esquema? Edite `SCHEMA` e acrescente a migração (`ALTER TABLE …`) em `Store.init()`: o
  banco de produção já existe e `init()` só cria o que falta; não há ferramenta de migração.
- **Nada de API só-Node no `server/`** fora de `index.ts`, `static.ts` e `db-pglite.ts`: o
  resto também roda no Deno. `node:crypto` pode; `fs`, `process.env` e afins não.
- **Erros da API**: `{ "error": "frase em português para a pessoa" }` com o status HTTP certo.
  O app mostra essa frase como está.
- **Textos**: voz ativa, sem jargão. O botão diz o que faz ("Salvar remédio") e o aviso
  repete o verbo ("Remédio salvo"). Use `formatQuantity()` para qualquer quantidade com unidade.
- **Sem dependências novas** sem necessidade real: o servidor tem só `hono`,
  `@hono/node-server`, `postgres` e `@electric-sql/pglite`. O que é do app vai em
  `devDependencies` (o Vite empacota). `web-push` é só referência nos testes.
- **Formatação**: Prettier (aspas simples, 100 colunas). Comentários em português, só quando
  explicam um porquê.

## Design

Paleta creme e verde, definida em `src/styles/tokens.css`. Não use cores fora dos tokens.
O tema escuro redefine os mesmos tokens em `:root[data-theme='dark']`; quem põe o atributo é
`src/lib/theme.ts` (escolha guardada no aparelho, ou a preferência do sistema). `--boldo` é
"a tinta de destaque" e `--creme` "o fundo da página", então trocam de papel no escuro; a
lateral usa `--nav-*`, que fica escura nos dois temas. O E2E mede o contraste no escuro.

- **A tarja** (faixa colorida, como nas caixas de remédio) é o único elemento que carrega
  cor de estado: verde em ordem, mostarda atenção, vermelha acabou/venceu. Aparece na
  lateral das linhas (`.caixa`), no topo do bloco de estoque e como marcador da navegação.
- **Boldinho**, o mascote, aparece onde a tela precisa de calor e não de dado: entrada,
  estados vazios, erros e o bloco de lembretes. Use `<Mascote pose=… />`; não o coloque em
  listas nem ao lado de números. O ícone do app é ele sobre creme.
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

- **Câmera nos testes**: nenhum navegador de teste tem câmera. Nos projetos comuns o leitor
  cai no estado "a câmera não abriu" e os testes usam foto e números; o projeto `camera` do
  E2E faz o Chromium ler `tests/e2e/fixtures/camera.mjpeg` no lugar dela. O simulador do
  iOS também não tem câmera: a leitura ao vivo no iPhone só se confere no aparelho.
- **Catálogo e leitor ficam fora do cache offline**: o precache do service worker só pega
  js/css/html/imagens/fontes; `catalogo/*.json` e o `.wasm` do leitor (1 MB) são baixados na
  hora, e só por quem abre o leitor.
- **Service worker só no build**: em `npm run dev` não há SW, logo não há push nem offline.
- **Chromium sem janela nega notificações**: por isso o E2E de push troca `showNotification`
  por um espião, e a entrega real precisa ser conferida em um aparelho ("Enviar um teste").
- **WebKit do Playwright não é o Safari do iPhone**: os projetos `iphone`, `ipad` e `safari`
  do E2E usam o motor do Safari, mas os campos de formulário do iOS (hora, data, seletores)
  só existem no iOS. O campo de hora invadindo o vizinho passava no WebKit e quebrava no
  aparelho. Para mexer em formulário, confira no simulador do Xcode:
  `xcrun simctl boot "iPhone 17 Pro Max"`, `xcrun simctl openurl booted http://localhost:3210/`
  e `xcrun simctl io booted screenshot tela.png`.
- **iOS**: push só com o app instalado na Tela de Início (16.4+). `getPushState()` devolve
  `needs-install` nesse caso.
- **Callbacks de `mutate()` não rodam se o componente desmontar** antes de a mutação
  terminar. Onde a tela some junto com o dado (excluir remédio), use `mutateAsync`.
- **`client.clear()` do TanStack Query** solta os observadores; para sair, grave a sessão e
  remova as outras queries (veja `logout` em `pages/Settings.tsx`).
- **E2E compartilha um banco** entre testes e tamanhos de tela: use `unique()` para nomes e
  não conte linhas totais.
- **HTTPS**: instalar e receber push exigem HTTPS fora de `localhost`.
- **Runtime do Supabase não tem os globais do Node** (`Buffer`, `process`): o
  `scripts/build-edge.mjs` os importa no topo do pacote e reescreve `net` → `node:net`. Para
  ver um erro de inicialização da função, rode o pacote na imagem
  `public.ecr.aws/supabase/edge-runtime` local; a resposta HTTP só diz "WORKER_ERROR".
- **Caminho absoluto quebra no Pages**: `/icons/x.png` aponta para a raiz do domínio, não
  para `/boldo/`. O projeto `pages` do E2E existe para pegar isso.
- **PGlite leva quase 1 s para subir**: os testes unitários usam um banco por arquivo e
  `store.reset()` entre testes (veja `memoryStore()`).
