import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/instrument-sans';
import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';

import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import { watchInstallPrompt } from './lib/install';
import { queryClient } from './lib/queryClient';

watchInstallPrompt();
registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
