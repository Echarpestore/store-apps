const CACHE_NAME = 'echarpe-tryon-v52';

/* ============================================================
   sw بسيط: شبكة الأول وفولباك للكاش — نفس فلسفة باقي التطبيقات.
   ⚠️ موديل MediaPipe والـwasm من دومينات تانية — مش بنكيّشهم هنا،
   المتصفح بيكيّشهم بنفسه (HTTP cache) وده كافي.
   ⚠️ أي تعديل في أي ملف = ارفع CACHE_NAME (القاعدة العامة).
   ============================================================ */
const SHELL = ['./', './index.html', './tryon-core.js', './tryon-app.js', './photo.html', './photo-core.js',
               './assets/catalog.js', './recolor.html', './recolor-core.js', './prep.html', './prep-core.js', './assets/template-01-head.png', './assets/bandana-breathe-head.png', './assets/bandana-farah-head.png', './tryon-3d-core.js', './tryon-3d.js', './tryon-mesh-core.js', './tryon-mesh.js', './bandana-tint.js', './grid-split.js'];

self.addEventListener('install', (e) => {
  // 🔴 v31: `addAll` العادي بياخد من كاش المتصفح (GitHub Pages بيحط
  //    max-age) — يعني ممكن نكيّش **النسخة القديمة** في كاش جديد
  //    ونفضل عليها. `cache:'reload'` بيجبر النزول من السيرفر.
  e.waitUntil(
    caches.open(CACHE_NAME).then((c) => Promise.all(
      SHELL.map((u) => fetch(new Request(u, { cache: 'reload' }))
        .then((r) => (r.ok ? c.put(u, r) : null)).catch(() => null))
    )).then(() => self.skipWaiting())
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
  // 🔴 v31: من غير `no-cache` المتصفح بيرد من كاش الـHTTP بتاعه
  //    (max-age بتاع GitHub Pages) والسيرفس ووركر يفتكر إنه جاب
  //    جديد — ده اللي بيخلي رفعات كتير ورا بعض مالهاش أي أثر.
  //    no-cache = طلب مشروط للسيرفر (سريع، مش تحميل كامل كل مرة).
  const fresh = (e.request.mode === 'navigate' || /\.(js|html|css|json)$/.test(url.pathname))
    ? new Request(e.request, { cache: 'no-cache' })
    : e.request;
  e.respondWith(
    fetch(fresh).then((res) => {
      const clone = res.clone();
      caches.open(CACHE_NAME).then((c) => c.put(e.request, clone)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request))
  );
});
