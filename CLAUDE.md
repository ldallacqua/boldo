# Boldo

Leia o guia do projeto antes de mexer: @AGENTS.md

Resumo do que não pode faltar:

- Rode `npm run check` antes de dar um trabalho por concluído, e `npm run test:e2e` se mexeu
  em tela, rota, API ou service worker.
- Regra de negócio fica em `shared/` (pura, com teste); SQL fica só em `server/store.ts`.
- Interface em português do Brasil; cores só pelos tokens de `src/styles/tokens.css`.
