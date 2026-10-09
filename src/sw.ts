/// <reference lib="webworker" />
import { clientsClaim } from "workbox-core";
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { safeTargetUrl } from "./lib/pushSupport";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<string | { url: string; revision: string | null }>;
};

// What generateSW did for us before: take over right away, precache the build, SPA fallback.
// registerType "autoUpdate" relies on the worker activating itself.
self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
registerRoute(new NavigationRoute(createHandlerBoundToURL("/index.html"), { denylist: [/^\/api\//] }));

interface PushPayload {
  title?: string;
  body?: string;
  tag?: string;
  data?: { url?: string };
}

self.addEventListener("push", (event) => {
  let payload: PushPayload = {};
  try {
    payload = event.data ? (event.data.json() as PushPayload) : {};
  } catch {
    // fall through to the generic message below
  }
  // iOS requires every push to show a visible notification, so always show something.
  event.waitUntil(
    self.registration.showNotification(payload.title ?? "Pulse", {
      body: payload.body ?? "You have a new update.",
      tag: payload.tag,
      icon: "/pwa-192x192.png",
      badge: "/pwa-192x192.png",
      data: { url: payload.data?.url ?? "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = (event.notification.data as { url?: string } | undefined)?.url;
  const target = safeTargetUrl(raw, self.location.origin);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const win of windows) {
        if (new URL(win.url).origin === self.location.origin) {
          await win.focus();
          try {
            await win.navigate(target);
          } catch {
            await self.clients.openWindow(target);
          }
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
