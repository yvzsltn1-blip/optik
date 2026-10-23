// Offline application cache; network first.
const CACHE = 'optik-v26';
const FILES = ['./', 'index.html', 'css/style.css', 'css/insights.css', 'css/topics.css', 'css/papers.css', 'js/layout.js', 'js/omr.js', 'js/omr-worker.js', 'js/store.js', 'js/pdf.js', 'js/report.js', 'js/scanner.js', 'js/analytics.js', 'js/topic-seeds.js', 'js/topics.js', 'js/papers.js', 'js/app.js', 'js/update.js', 'js/cloud.js', 'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.pathname.endsWith('/release.json')) return;
  if (url.origin !== location.origin && url.hostname !== 'www.gstatic.com') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});

