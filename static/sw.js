/* BudgetMind AI service worker — caches static assets so the shell and
   dashboard UI load offline. API calls fall back to the in-app localStorage
   cache handled in api.js, not here, since responses are per-user/dynamic. */

const CACHE_NAME = 'budgetmind-v1';
const PRECACHE_URLS = [
  '/app',
  '/static/css/tokens.css',
  '/static/css/app.css',
  '/static/js/utils.js',
  '/static/js/api.js',
  '/static/js/ai-engine-client.js',
  '/static/js/auth.js',
  '/static/js/dashboard.js',
  '/static/js/transactions.js',
  '/static/js/budgets.js',
  '/static/js/goals.js',
  '/static/js/reports.js',
  '/static/js/bills.js',
  '/static/js/notifications.js',
  '/static/js/tools.js',
  '/static/js/main.js',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache API calls here — dynamic, per-user, handled by api.js instead.
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (event.request.method === 'GET' && networkResponse.ok) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
