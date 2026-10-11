# Hospedagem gratuita: GitHub Pages + Supabase

O GitHub Pages só entrega arquivos estáticos: ele não tem banco de dados nem roda nada em
segundo plano. O Boldo precisa das duas coisas (um banco que qualquer navegador alcance e
alguém acordado para mandar os lembretes), então a hospedagem gratuita fica assim:

```
Navegador ── app (HTML/JS) ──────────▶ GitHub Pages   https://ldallacqua.github.io/boldo/
    │
    └─────── API (/api/...) ─────────▶ Supabase Edge Function "api"
                                            │
                                            ▼
                                       Postgres do Supabase (esquema `boldo`)
                                            │  pg_cron, a cada minuto
                                            └──▶ POST /api/tick ──▶ lembretes (Web Push)
```

Tudo dentro dos planos gratuitos dos dois serviços.

## O que existe hoje

| Peça                          | Onde                                                                         |
| ----------------------------- | ---------------------------------------------------------------------------- |
| App                           | https://ldallacqua.github.io/boldo/ (workflow `.github/workflows/pages.yml`) |
| Projeto Supabase              | `boldo`, ref `hdzfkemmogdatgaqugjf`, região São Paulo (`sa-east-1`)          |
| API                           | https://hdzfkemmogdatgaqugjf.supabase.co/functions/v1/api/health             |
| Endereço da API no build      | variável de repositório `BOLDO_API_BASE` (GitHub → Settings → Variables)     |
| Senha do app e senha do banco | arquivo local `.env.supabase.local` (fora do Git)                            |

## Tarefas comuns

### Republicar o app

Basta `git push` na `main`. O workflow compila com o prefixo `/boldo/` e publica no Pages.

### Republicar a API

```bash
npm run deploy:api -- --project-ref hdzfkemmogdatgaqugjf
```

Isso empacota `supabase/functions/api/main.ts` (e todo o `server/`) em um arquivo só e
publica. Precisa do Supabase CLI logado (`supabase login`) e do Docker ligado.

### Trocar a senha de acesso

```bash
supabase secrets set --project-ref hdzfkemmogdatgaqugjf ADMIN_PASSWORD='a nova senha'
```

Vale em cerca de um minuto, sem republicar. Todos os aparelhos precisam entrar de novo.

### Outros segredos da API

| Segredo           | Valor atual                                          | Para que serve                        |
| ----------------- | ---------------------------------------------------- | ------------------------------------- |
| `ADMIN_PASSWORD`  | (em `.env.supabase.local`)                           | Senha única de acesso.                |
| `ALLOWED_ORIGINS` | `https://ldallacqua.github.io,http://localhost:5173` | Quem pode chamar a API (CORS).        |
| `BOLDO_TZ`        | `America/Sao_Paulo`                                  | Fuso dos horários.                    |
| `VAPID_SUBJECT`   | `https://ldallacqua.github.io/boldo/`                | Contato enviado aos serviços de push. |

`SUPABASE_URL` e `SUPABASE_DB_URL` são fornecidos pelo próprio Supabase.

### Ver se os lembretes estão rodando

No painel do Supabase, em SQL Editor:

```sql
select status, start_time from cron.job_run_details order by start_time desc limit 5;
select status_code, content, created from net._http_response order by id desc limit 5;
```

O esperado é uma linha por minuto, com `succeeded` e `200 {"sent":0}` (ou o número de avisos
enviados naquele minuto).

## Limites do plano gratuito que importam

- **Pausa por inatividade**: o Supabase pausa projetos gratuitos sem uso por cerca de uma
  semana. O cron do Boldo chama a API a cada minuto, o que conta como uso, mas se o projeto
  for pausado mesmo assim o app mostra "Não deu para carregar": é só reativar no painel
  (Restore project). Os dados ficam guardados.
- **Chamadas**: o cron faz cerca de 43 mil chamadas por mês; o plano gratuito inclui 500 mil.
- **Primeira chamada lenta**: depois de alguns minutos parada, a função leva 1 a 2 segundos
  para acordar.
- **Atraso do lembrete**: até um minuto depois do horário marcado.

## Montar do zero em outra conta

1. `supabase projects create boldo --org-id <org> --region sa-east-1 --db-password <senha>`
2. `supabase secrets set --project-ref <ref> ADMIN_PASSWORD=... ALLOWED_ORIGINS=https://<usuário>.github.io BOLDO_TZ=America/Sao_Paulo VAPID_SUBJECT=https://<usuário>.github.io/boldo/`
3. `npm run deploy:api -- --project-ref <ref>`
4. Chame `https://<ref>.supabase.co/functions/v1/api/health` uma vez: na primeira chamada a
   função cria as tabelas, gera as chaves e agenda o cron sozinha.
5. No GitHub: `gh variable set BOLDO_API_BASE --body https://<ref>.supabase.co/functions/v1`
   e ative o Pages com origem "GitHub Actions".
6. `git push` e abra `https://<usuário>.github.io/boldo/`.

## Segurança, em uma página

- As tabelas ficam no esquema `boldo`, que a API REST automática do Supabase **não** expõe.
  O único caminho até os dados é a Edge Function, que exige a senha.
- A sessão é um token assinado (HMAC) guardado no aparelho e enviado em
  `Authorization: Bearer`. Não há cookies, porque app e API estão em endereços diferentes.
- Oito senhas erradas seguidas bloqueiam aquele endereço IP por 15 minutos.
- O botão "Tomei" da notificação usa um token que vale só para aquela dose naquele dia.
- O repositório é público, mas nenhum segredo está nele: senha, chaves de push e segredos de
  sessão ficam no Supabase.
