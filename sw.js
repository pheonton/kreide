// Offline cache for the app files. Student data is never cached here — it lives in localStorage.
// Bump VERSION when files are added or removed.
const VERSION = 'kreide-v32';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/store.js',
  './js/util.js',
  './js/classes.js',
  './js/importer.js',
  './js/ink.js',
  './js/xls.js',
  './js/widgets/index.js',
  './js/widgets/timer.js',
  './js/widgets/picker.js',
  './js/widgets/groups.js',
  './js/widgets/traffic.js',
  './js/widgets/clock.js',
  './js/widgets/noise.js',
  './backgrounds/waves.svg',
  './backgrounds/aurora.svg',
  './backgrounds/lowpoly.svg',
  './backgrounds/topo.svg',
  './backgrounds/dusk.svg',
  './backgrounds/beach.svg',
  './backgrounds/dunes.svg',
  './backgrounds/silk.svg',
  './backgrounds/petals.svg',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  // cache: 'reload' skips the browser's HTTP cache, so an update never stores stale files.
  const requests = ASSETS.map((url) => new Request(url, { cache: 'reload' }));
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(requests)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

// Serve from cache instantly, refresh the cache in the background (updates show on next launch).
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  event.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(request, { ignoreSearch: true });
      // Revalidate with the server (page navigations can't take fetch options, hence the URL).
      const network = fetch(request.url, { cache: 'no-cache' })
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached ?? network;
    }),
  );
});
