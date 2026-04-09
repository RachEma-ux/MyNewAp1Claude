/**
 * Service Worker — KILL SWITCH (v3)
 *
 * WHY THIS FILE IS A KILL SWITCH, NOT A REAL SW
 *
 * Previous versions of this file were a cache-first PWA shell that
 * precached `/`, `/icon.svg`, `/manifest.json` and cached arbitrary
 * static assets. In dev mode that caused a persistent problem:
 *
 *   1. Android Chrome "Clear cache" does NOT unregister service
 *      workers. Users would hard-refresh and STILL see an old
 *      index.html from the SW's precache, which referenced a
 *      stale main.tsx module graph.
 *   2. Even v2 (which bypassed /src/ /@vite/ etc.) still precached
 *      `/` on install, so any navigation that fell back to
 *      caches.match('/') resurrected the stale bundle.
 *   3. In dev mode there is zero benefit to running a SW — Vite
 *      serves everything fresh on demand and HMR is already
 *      incremental.
 *
 * This version:
 *   1. On install: skipWaiting() immediately so the new SW activates
 *   2. On activate: delete EVERY cache in caches.keys() (not just
 *      old ones — all of them, including mynewapp-v2 if it exists)
 *   3. Claim all clients
 *   4. Call self.registration.unregister() so after this one cycle
 *      there is no SW at all
 *   5. Fetch handler is empty — every request bypasses the SW
 *
 * Combined with removing the SW registration from client/index.html,
 * the next full reload after this file is deployed will:
 *   a. Browser fetches /sw.js (detects changed content) and
 *      installs this v3 kill switch
 *   b. v3 activates, deletes every Cache Storage entry, unregisters
 *      itself, and hands control back to the network
 *   c. index.html no longer registers a new SW
 *   d. From that point forward the user talks to Vite directly
 *
 * If you ever want PWA/offline behavior back, do it properly:
 *   - Only register the SW in production builds (not in dev)
 *   - Use hashed asset URLs (Vite's /assets/*.hash.js)
 *   - Use a workbox or similar tool that handles cache invalidation
 *   - Do NOT precache the entry HTML at a stable URL
 */

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // 1. Delete every Cache Storage entry, no matter the name
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch {
        /* best-effort */
      }
      // 2. Take over any open tabs so the cleanup is immediate
      try {
        await self.clients.claim();
      } catch {
        /* best-effort */
      }
      // 3. Unregister self so future navigations never hit a SW
      try {
        await self.registration.unregister();
      } catch {
        /* best-effort */
      }
      // 4. Ask any open clients to reload so they pick up the
      //    SW-free future (the current page they're looking at is
      //    still held by the old SW; a reload bypasses it)
      try {
        const clients = await self.clients.matchAll({ type: 'window' });
        for (const client of clients) {
          // navigate() forces a fresh navigation to the same URL,
          // which goes through the network (no SW in flight).
          try {
            client.navigate(client.url);
          } catch {
            /* older browsers: fall back to postMessage */
            try {
              client.postMessage({ type: 'SW_KILLED_RELOAD' });
            } catch {
              /* ignore */
            }
          }
        }
      } catch {
        /* best-effort */
      }
    })()
  );
});

// Fetch handler is intentionally empty — do not intercept anything.
// (We don't even call event.respondWith, so the browser falls
// through to the network for every request.)
self.addEventListener('fetch', () => {
  // no-op
});
