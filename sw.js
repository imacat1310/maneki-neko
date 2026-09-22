/* Offline support: cache the app shell, and CDN assets (fonts, AI detector) once they've been used. */
const VERSION = 'maneki-v2';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/style.css',
  './js/neko.js', './js/store.js', './js/charts.js', './js/mit-real.js', './js/avatar.js', './js/petstudio.js', './js/app.js',
  './ava/favicon-real.png', './ava/apple-touch-icon.png', './ava/icon-192.png', './ava/icon-512.png',
  './ava/app-icon-real.png', './ava/favicon.svg', './ava/mit-sticker.jpg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin === location.origin) {
    // app files: network first (so updates arrive), cache as fallback when offline
    e.respondWith(
      fetch(e.request)
        .then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return res; })
        .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./index.html')))
    );
  } else {
    // fonts, TensorFlow.js & model weights: cache first
    e.respondWith(
      caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
        if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
        return res;
      }))
    );
  }
});
