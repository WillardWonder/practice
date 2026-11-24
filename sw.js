// Network-first service worker: always tries the live site (so coaches get
// updates right away) and falls back to the last cached copy if the gym
// Wi-Fi drops. Firebase traffic is never cached here; Firestore has its own
// offline cache.
const CACHE = 'practice-shell-v3';
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const sameOrigin = url.origin === location.origin;
  const sdk = url.host === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/');
  if (!sameOrigin && !sdk) return;
  // no-cache: always revalidate with the server so every file comes from the same deploy
  // (GitHub Pages lets browsers reuse files for 10 minutes, which can mix old and new code).
  e.respondWith((sameOrigin && e.request.mode !== 'navigate' ? fetch(e.request, { cache: 'no-cache' }) : fetch(e.request)).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: sameOrigin && url.pathname.endsWith('/') })));
});
