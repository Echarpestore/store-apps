const CACHE_NAME = 'echarpe-tryon-v11';

/* ============================================================
   sw بسيط: شبكة الأول وفولباك للكاش — نفس فلسفة باقي التطبيقات.
   ⚠️ موديل MediaPipe والـwasm من دومينات تانية — مش بنكيّشهم هنا،
   المتصفح بيكيّشهم بنفسه (HTTP cache) وده كافي.
   ⚠️ أي تعديل في أي ملف = ارفع CACHE_NAME (القاعدة العامة).
   ============================================================ */
const SHELL = ['./', './index.html', './tryon-core.js', './tryon-app.js',
               './assets/catalog.js', './recolor.html', './recolor-core.js', './assets/template-01-head.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((n) => n !== CACHE_NAME && n.startsWith('echarpe-tryon-'))
             .map((n) => caches.delete(n))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if(url.origin !== self.location.origin) return;   // CDN → المتصفح يتصرف
  e.respondWith(
    fetch(e.request).then((res) => {
      const clone = res.clone();
      caches.open(CACHE_NAME).then((c) => c.put(e.request, clone)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request))
  );
});
