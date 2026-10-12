import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/instrument-sans';
import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';
import './styles/motion.css';

import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { Router, type AroundNavHandler } from 'wouter';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import { APP_BASE } from './lib/config';
import { startTheme } from './lib/theme';
import { watchInstallPrompt } from './lib/install';
import { withViewTransition } from './lib/motion';
import { queryClient } from './lib/queryClient';

watchInstallPrompt();
registerSW({ immediate: true });

startTheme();

/**
 * A parte do endereço que escolhe a aba: "", "remedios" ou "ajustes". O roteador entrega o
 * destino já com o prefixo do app (`/boldo/remedios/3`), igual a `location.pathname`.
 */
const partsOf = (path: string) => path.slice(APP_BASE.length).split('/').filter(Boolean);

// Trocar de aba anima a página inteira. Abrir e fechar um remédio fica por conta do painel,
// que tem a própria animação: as duas juntas faziam o painel "pipocar" em vez de deslizar.
const aroundNav: AroundNavHandler = (navigate, to, options) => {
  const target = partsOf(String(to));
  const sameTab = (partsOf(window.location.pathname)[0] ?? '') === (target[0] ?? '');
  if (sameTab || target.length > 1) navigate(to, options);
  else withViewTransition(() => navigate(to, options));
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ErrorBoundary>
          <Router base={APP_BASE} aroundNav={aroundNav}>
            <App />
          </Router>
        </ErrorBoundary>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
