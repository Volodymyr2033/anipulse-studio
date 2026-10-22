const C = 'anipulse-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(r).then((x) => { const c = x.clone(); caches.open(C).then((k) => k.put(r, c)); return x; }).catch(() => caches.match(r).then((m) => m || caches.match('/'))));
});
