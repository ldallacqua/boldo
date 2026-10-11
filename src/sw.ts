/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import type { PushPayload } from '../shared/types';
import { handleNotificationClick, toNotification } from './lib/notifications';

declare const self: ServiceWorkerGlobalScope;

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// O app é uma SPA: toda navegação recebe o index.html do cache. A API nunca é cacheada.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//] }),
);

self.addEventListener('push', (event) => {
  if (!event.data) return;
  const { title, options } = toNotification(event.data.json() as PushPayload);
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    handleNotificationClick(event.action, event.notification.data as PushPayload, {
      async takeDose(scheduleId, date) {
        const response = await fetch(`/api/doses/${scheduleId}/take`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date }),
        });
        return response.ok;
      },
      async refresh() {
        const clients = await self.clients.matchAll({ type: 'window' });
        for (const client of clients) client.postMessage({ type: 'refresh' });
      },
      async open(url) {
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
