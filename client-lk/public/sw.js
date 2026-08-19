const CACHE_NAME = 'client-lk-shell-v1';
const MAX_CACHE_ENTRIES = 60;

function isGetRequest(event) {
  return event.request && event.request.method === 'GET';
}

// Keep caching conservative: only same-origin GET requests.
function shouldCache(requestUrl) {
  return requestUrl.origin === self.location.origin;
}

// Basic shell caching so the app is installable and fast.
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    self.skipWaiting();
    const cache = await caches.open(CACHE_NAME);
    // Pre-cache the entry + base assets when offline.
    await cache.addAll(['./', './index.html']).catch(() => {});
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    self.clients.claim();
    const keys = await caches.keys();
    await Promise.all(keys.map(async key => {
      if (key !== CACHE_NAME) await caches.delete(key);
    }));
  })());
});

self.addEventListener('fetch', event => {
  if (!isGetRequest(event)) return;
  const requestUrl = new URL(event.request.url);
  if (!shouldCache(requestUrl)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(event.request);
    if (cached) return cached;

    try {
      const response = await fetch(event.request);
      // Don’t cache non-OK responses.
      if (response && response.ok) {
        cache.put(event.request, response.clone()).catch(() => {});
      }

      // Rough cap to avoid unbounded storage growth.
      const keys = await cache.keys();
      if (keys.length > MAX_CACHE_ENTRIES) {
        await cache.delete(keys[0]).catch(() => {});
      }

      return response;
    } catch (err) {
      // Offline fallback to cached index.
      const fallback = await cache.match('./index.html');
      if (fallback) return fallback;
      throw err;
    }
  })());
});

