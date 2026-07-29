const CACHE_NAME = 'store-apps-shell-v204';

// ⚠️ مفيش skipWaiting تلقائي.
// النسخة الجديدة بتنزل في الخلفية وتستنى، والصفحة هي اللي بتقرر
// إمتى تفعّلها — عشان التحديث ميحصلش والكاشير في نص فاتورة.
self.addEventListener('install', (event) => {
  // بنستنى إشارة من الصفحة
});

// الصفحة بتبعت 'SKIP_WAITING' لما الكاشير يوافق
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Only handle our own site's files (HTML, manifest, icons).
  // Everything else (Firebase/Firestore calls, Google Fonts, etc.)
  // is left completely alone.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req, { cache: 'no-store' })
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        return res;
      })
      .catch(() => caches.match(req))
  );
});
