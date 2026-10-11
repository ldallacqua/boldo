/**
 * Onde o app está e onde a API está. No modo "um servidor só" os dois são a mesma origem;
 * na hospedagem gratuita o app fica no GitHub Pages (com um prefixo de caminho) e a API no
 * Supabase (outra origem, definida em VITE_API_BASE no build).
 */

/** Sem barra no fim. Vazio = mesma origem. */
export const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '');

/** Prefixo do app, sem barra no fim: '' ou '/boldo'. */
export const APP_BASE = import.meta.env.BASE_URL.replace(/\/+$/, '');

/** Caminho de um arquivo de public/ (ícones, mascote), respeitando o prefixo. */
export const asset = (path: string) => `${APP_BASE}/${path.replace(/^\/+/, '')}`;
