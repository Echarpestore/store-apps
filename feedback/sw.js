const CACHE_NAME = 'feedback-shell-v705';
// 🧹 v704: التابلت بيمسح كاشاته هو بس. قبل كده كان بيمسح **كل** الكاشات على الدومين
//    (POS والحضور والمكتب لو اتفتحوا على نفس الجهاز). الاسم القديم `store-apps-shell-v703`
//    بيتمسح بالاسم بالظبط — لأن تطبيق الحضور بيستخدم نفس البادئة.
const OWN_PREFIX = 'feedback-shell-';
const LEGACY_OWN = ['store-apps-shell-v703'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names
        .filter((n) => n !== CACHE_NAME && (n.startsWith(OWN_PREFIX) || LEGACY_OWN.includes(n)))
        .map((n) => caches.delete(n)))
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
