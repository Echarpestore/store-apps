const CACHE_NAME = 'glow-loyalty-v21';

// ============ استقبال إشعارات Push (حتى والتطبيق مقفول) ============
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}
  const n = data.notification || data || {};
  const title = n.title || 'Glow 🖤';
  const body = n.body || 'فيه جديد مستنيكي في التطبيق';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      dir: 'rtl',
      lang: 'ar',
      data: { url: (data.data && data.data.url) || './' },
      tag: (data.data && data.data.tag) || 'glow-general'
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) { if ('focus' in w) return w.focus(); }
      return clients.openWindow(event.notification.data && event.notification.data.url || './');
    })
  );
});

self.addEventListener('install', (event) => {
  self.skipWaiting();
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
  // نتعامل بس مع ملفات موقعنا (HTML, manifest, icons).
  // أي حاجة تانية (Firebase/Firestore, Google Fonts, JsBarcode) نسيبها تعدي عادي.
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
