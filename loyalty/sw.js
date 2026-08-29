const CACHE_NAME = 'echarpe-loyalty-v81';

// ============ استقبال إشعارات Push (حتى والتطبيق مقفول) ============
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}
  const n = data.notification || data || {};
  const title = n.title || 'echarpe 🌸';
  const body = n.body || 'فيه جديد مستنيكي في التطبيق';
  // 🖼️ الأيقونة كانت بتتطلب من فولدر فرعي مش موجود، والملف الحقيقي مكانه '/loyalty/icon-192.png'
  //    → الإشعار كان بيطلع بأيقونة المتصفح الافتراضية.
  const icon = new URL('icon-192.png', self.registration.scope).href;
  event.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      icon: icon,
      badge: icon,
      dir: 'rtl',
      lang: 'ar',
      data: { url: (data.data && data.data.url) || './' },
      tag: (data.data && data.data.tag) || 'echarpe-general'
    })
  );
});

/* ============================================================
   الضغط على الإشعار
   ------------------------------------------------------------
   ⚠️ الباج اللي خلّى قمع التقييم 0%: الـ push handler فوق بيخزّن
   `data.url` (اللي فيه `./?rate=<رقم الفاتورة>` جاي من دالة الإشعار)،
   والـ handler ده كان **بيرميه** ويبني `./index.html` من الصفر —
   وكمان بيعمل focus على النافذة المفتوحة من غير navigate. يعني
   `?rate=` كان بيتشال 100% من المرات، وشاشة التقييم في index.html
   بتعمل `return` صامت من غيره. 51 إشعار = 0 تقييم.

   القاعدة دلوقتي:
   - اللينك بييجي من `event.notification.data.url` (نسبي → بيتحلّ على scope).
   - فيه `?query` (زي rate) → **لازم navigate**، الفوكس لوحده بيضيّعه.
   - مفيش query (إشعار عام) → فوكس زي ما كان، من غير إعادة تحميل.
   ============================================================ */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const scope = self.registration.scope;
  const raw = (event.notification.data && event.notification.data.url) || './';
  let target, needsUrl;
  try {
    const u = new URL(raw, scope);
    target = u.href;
    needsUrl = !!u.search;          // ?rate=… لازم يوصل للصفحة نفسها
  } catch (e) {
    target = new URL('./index.html', scope).href;
    needsUrl = false;
  }

  event.waitUntil((async () => {
    let wins = [];
    try { wins = await clients.matchAll({ type: 'window', includeUncontrolled: true }); } catch (e) {}

    for (const w of wins) {
      if (!w.url || w.url.indexOf(scope) !== 0) continue;

      // نافذة واقفة على نفس اللينك بالظبط — فوكس وخلاص
      if (w.url === target && 'focus' in w) return w.focus();

      // إشعار عام من غير query — الفوكس كفاية (متعملش reload من غير داعي)
      if (!needsUrl && 'focus' in w) return w.focus();

      // فيه query لازم يوصل → ننقل النافذة نفسها عليه
      if ('navigate' in w) {
        try {
          const c = await w.navigate(target);
          if (c && 'focus' in c) return c.focus();
          if ('focus' in w) return w.focus();
          return;
        } catch (e) { /* بعض المتصفحات بترفض — نفتح نافذة جديدة تحت */ }
      }
      break;
    }

    return clients.openWindow(target);
  })());
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
