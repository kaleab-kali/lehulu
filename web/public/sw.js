// Offline support for the Lehulu pages. Network first (always the newest version when online); when the
// network is gone, the last copy of each page, script, font and question flow is used instead.
// API calls (/v1, /oauth) are never cached: answers are kept on the phone by the component itself.
const CACHE = 'lehulu-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (/\/(v1|oauth|dev|docs|openapi\.json|healthz)(\/|$)/.test(url.pathname)) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          void caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then((hit) => hit ?? Response.error())),
  );
});
