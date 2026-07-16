/**
 * Service worker — app shell caching.
 *
 * This makes the app open and run without a network. Note that voice *input*
 * still needs a connection on both Android and iOS (the recognizer streams to
 * the platform's servers); text-to-speech and tap-to-check work fully offline.
 */

const CACHE = 'smart-checklist-v2';

const SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/profile-pmdg737.js',
  './js/data.js',
  './js/store.js',
  './js/match.js',
  './js/speech.js',
  './js/app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  // Network-first so edits to the checklist code show up on reload, with the
  // cache as the offline fallback.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
  );
});
