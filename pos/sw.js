const CACHE_NAME = 'store-apps-shell-v470';

// ⚠️ مفيش skipWaiting تلقائي.
// النسخة الجديدة بتنزل في الخلفية وتستنى، والصفحة هي اللي بتقرر
// إمتى تفعّلها — عشان التحديث ميحصلش والكاشير في نص فاتورة.
self.addEventListener('install', (event) => {
  // بنستنى إشارة من الصفحة
});

// الصفحة بتبعت 'SKIP_WAITING' لما الكاشير يوافق
self.addEventListener('message', (event) => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') { self.skipWaiting(); return; }
  // الصفحة تسأل الـSW الفعّال نفسه عن نسخته بدل التخمين من أسماء الكاش.
  if (event.data.type === 'GET_VERSION') {
    try {
      const target = event.source;
      if (target && target.postMessage) target.postMessage({
        type: 'POS_VERSION',
        version: CACHE_NAME.replace('store-apps-shell-', ''),
        cacheName: CACHE_NAME
      });
    } catch (_) {}
  }
});

// ⚠️ الباج اللي عمل شاشة سودا:
// كان بيمسح كل الكاشات القديمة **قبل** ما الجديد يتملّي، وبعدها الصفحة
// بتعمل reload فورًا. لو النت اتأخر لحظة → مفيش نت ومفيش كاش → صفحة فاضية.
// الحل: نمسك التحكم الأول، والكاش القديم يفضل شبكة أمان لحد ما الجديد يتملّي.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    self.clients.claim().then(() => {
      // تنضيف مؤجل — بعد دقيقة كاملة، والجديد يكون اتملّى
      setTimeout(() => {
        caches.keys().then((names) =>
          Promise.all(names
            .filter((n) => n !== CACHE_NAME && n.startsWith('store-apps-shell-'))
            .map((n) => caches.delete(n)))
        ).catch(() => {});
      }, 60000);
    })
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

  // v397 — import.js must never silently fall back to an older query/version.
  // This was masking deployments: the screen updated while an old importer kept running.
  if (url.pathname.endsWith('/pos/import.js')) {
    event.respondWith(
      fetch(req, { cache: 'no-store' }).then((res) => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, clone)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match(req, { ignoreSearch: false }).then((hit) => hit || new Response(
        "console.error('IMPORT v400 unavailable: reconnect and reload');",
        { status: 503, headers: { 'Content-Type': 'application/javascript; charset=utf-8' } }
      )))
    );
    return;
  }

  // 🔒 سلسلة احتياطية كاملة: النت ← الكاش الحالي ← أي كاش قديم ← رد واضح.
  // من غيرها، فشل الشبكة كان بيرجّع undefined والصفحة بتطلع سودا.
  event.respondWith(
    fetch(req, { cache: 'no-store' })
      .then((res) => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, clone)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true })          // أي كاش (قديم أو جديد)
          .then((hit) => hit || new Response(
            '<!doctype html><meta charset="utf-8">'
            + '<div style="font-family:sans-serif;padding:40px;text-align:center">'
            + '<h2>مفيش اتصال</h2><p>افتح النت وحدّث الصفحة</p>'
            + '<button onclick="location.reload()" style="padding:12px 24px;font-size:16px">إعادة المحاولة</button></div>',
            { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          ))
      )
  );
});
