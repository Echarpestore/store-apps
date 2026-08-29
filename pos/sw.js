const CACHE_NAME = 'store-apps-shell-v378';

// ⚠️ مفيش skipWaiting تلقائي.
// النسخة الجديدة بتنزل في الخلفية وتستنى، والصفحة هي اللي بتقرر
// إمتى تفعّلها — عشان التحديث ميحصلش والكاشير في نص فاتورة.
const OFFLINE_SHELL = [
  './', './index.html', './jsbarcode.min.js',
  './blackbox.js', './pos-core.js', './pos-admin.js', './pos-reports.js',
  './pos-sale.js', './app.js', './products.js', './profiles.js',
  './discounts.js', './import.js', './local-search-cache.js', './search.js',
  './loyalty.js', './staff.js', './transfers.js', './ui-editor.js',
  './chat.js', './frames.js', './credit-core.js', './credit-ui.js',
  './opportunity-core.js', './requests-core.js', './requests-ui.js',
  './orders-core.js', './orders-ui.js', './shop-admin.js', './basket-core.js',
  './insights-core.js', './basket-ui.js', './wa-compose.js',
  './chat-core.js', './chat-staff-ui.js'
];

// v375: جهّز نسخة طوارئ كاملة من شاشة الـPOS قبل ما الـSW الجديد يبقى جاهز.
// Promise.allSettled مقصودة: ملف اختياري ناقص ما يمنعش تثبيت النسخة كلها.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(OFFLINE_SHELL.map((url) =>
        fetch(url, { cache: 'no-store' }).then((res) => {
          if(!res || !res.ok) throw new Error('offline shell ' + url);
          return cache.put(url, res.clone());
        })
      ))
    )
  );
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
  // ملفات التطبيق نفسها + مكتبات التشغيل الثابتة فقط.
  // Firestore/API requests تفضل خارج الـSW تمامًا؛ Firestore persistence هي المسؤولة عنها.
  const staticExternal = /^(www\.gstatic\.com|cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(url.hostname);
  if (url.origin !== self.location.origin && !staticExternal) return;

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
