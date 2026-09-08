/*
 * Kill-switch service worker.
 * Offline support was removed — this unregisters any previously installed
 * worker and clears its caches on the client's next visit.
 * Safe to delete this file once returning visitors have cycled through
 * (a few weeks after deploy).
 */
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch {
        /* ignore */
      }
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: "window" });
      clients.forEach((c) => c.navigate(c.url));
    })(),
  );
});
