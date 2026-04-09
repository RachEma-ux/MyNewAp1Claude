// Bumped v1 → v2 to force the activate handler below to purge the old
// cache. The v1 cache was holding stale Vite-dev source modules
// (/src/**, /@vite/**, /node_modules/.vite/deps/**) with a cache-first
// strategy, so every HMR push was invisible to the browser — the SW
// was serving pre-edit bundles from Cache Storage indefinitely.
const CACHE_NAME = 'mynewapp-v2';
const PRECACHE_URLS = [
  '/',
  '/icon.svg',
  '/manifest.json'
];

/**
 * Paths that must NEVER hit the SW cache. In dev, these are all the
 * Vite-owned endpoints that serve on-the-fly transformed source. In
 * prod, Vite emits hashed bundles under /assets/ so its own filenames
 * provide cache-busting; everything below is a dev-only concern that's
 * also safe in prod (those paths don't exist in the prod bundle).
 */
function isBypassPath(pathname) {
  return (
    pathname.startsWith('/api/') ||        // tRPC + REST + SSE
    pathname.startsWith('/src/') ||        // Vite-transformed TS/TSX source
    pathname.startsWith('/@vite/') ||      // Vite HMR client runtime
    pathname.startsWith('/@react-refresh') || // React fast refresh
    pathname.startsWith('/@id/') ||        // Vite absolute module ids
    pathname.startsWith('/@fs/') ||        // Vite filesystem paths
    pathname.startsWith('/node_modules/')  // pre-bundled deps + sourcemaps
  );
}

// Install: precache shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: bypass for dev-mode live paths, network-first for navigation,
// cache-first for static assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Bypass entirely — let the browser talk to Vite/Express directly
  if (isBypassPath(url.pathname)) {
    return;
  }

  // For navigation requests, always go network-first
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match('/'))
    );
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
