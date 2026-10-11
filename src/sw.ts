/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import type { PushPayload } from '../shared/types';
import { API_BASE } from './lib/config';
import { appUrl, handleNotificationClick, toNotification } from './lib/notifications';

declare const self: ServiceWorkerGlobalScope;

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// O app é uma SPA: toda navegação recebe o index.html do cache. A API nunca é cacheada.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/\/api\//] }),
);

self.addEventListener('push', (event) => {
  if (!event.data) return;
  const payload = event.data.json() as PushPayload;
  const { title, options } = toNotification(payload, self.registration.scope);
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    handleNotificationClick(event.action, event.notification.data as PushPayload, {
      async takeDose(dose) {
        const response = await fetch(`${API_BASE}/api/push-action/take`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dose),
        });
        return response.ok;
      },
      async refresh() {
        const clients = await self.clients.matchAll({ type: 'window' });
        for (const client of clients) client.postMessage({ type: 'refresh' });
      },
      async open(path) {
        const url = appUrl(path, self.registration.scope);
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const existing = clients[0];
        if (existing) {
          await existing.focus();
          await existing.navigate(url).catch(() => undefined);
          return;
        }
        await self.clients.openWindow(url);
      },
    }),
  );
});
