const CACHE_NAME = 'echarpe-loyalty-v31';

// ============ استقبال إشعارات Push (حتى والتطبيق مقفول) ============
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}
  const n = data.notification || data || {};
  const title = n.title || 'echarpe 🌸';
  const body = n.body || 'فيه جديد مستنيكي في التطبيق';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      dir: 'rtl',
      lang: 'ar',
      data: { url: (data.data && data.data.url) || './' },
      tag: (data.data && data.data.tag) || 'echarpe-general'
    })
  );
});

// الضغط على الإشعار يفتح التطبيق (أو يركّز عليه لو مفتوح)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // مسار التطبيق المطلق (مبني على مكان الـ sw نفسه — مضمون سواء التطبيق مثبّت أو من المتصفح)
  const appUrl = new URL('./index.html', self.registration.scope).href;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      // لو فيه نافذة للتطبيق مفتوحة فعلاً — نركّز عليها
      for (const w of wins) {
        if (w.url && w.url.indexOf(self.registration.scope) === 0 && 'focus' in w) return w.focus();
      }
      // مفيش — نفتح التطبيق
      return clients.openWindow(appUrl);
    }).catch(() => clients.openWindow(appUrl))
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
