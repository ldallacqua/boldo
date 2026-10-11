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

/** A parte do endereço que escolhe a aba: "", "remedios" ou "ajustes". */
const tabOf = (path: string) => path.split('/')[1] ?? '';

// Trocar de aba anima a página inteira; abrir e fechar um remédio fica por conta do painel.
const aroundNav: AroundNavHandler = (navigate, to, options) => {
  const from = window.location.pathname.slice(APP_BASE.length);
  if (tabOf(from) === tabOf(String(to))) navigate(to, options);
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
