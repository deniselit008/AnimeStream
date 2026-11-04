/**
 * AnimeStream - Service Worker for PWA & Offline Shell Caching
 */
const CACHE_NAME = 'animestream-v4.0.0';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/style.css',
  '/js/app.js',
  '/js/api.js',
  '/js/utils.js',
  '/js/storage.js',
  '/js/adblock.js',
  '/js/tvNavigation.js',
  '/js/components/navbar.js',
  '/js/components/homeView.js',
  '/js/components/directoryView.js',
  '/js/components/animeView.js',
  '/js/components/watchView.js',
  '/js/components/libraryView.js',
  '/js/components/favoritesView.js',
  '/js/components/historyView.js',
  '/js/components/searchView.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Fallback al añadir recursos estáticos:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache API calls, streams, or media proxy calls
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/watch')) {
    return event.respondWith(fetch(event.request));
  }

  // Network first, cache fallback for assets
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
      })
  );
});
