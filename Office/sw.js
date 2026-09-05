const CACHE_NAME = 'echarpe-office-v514';
self.addEventListener('install', (e)=> self.skipWaiting());
self.addEventListener('activate', (e)=>{
  e.waitUntil(
    caches.keys().then((names)=>
      Promise.all(names.filter((n)=> n !== CACHE_NAME).map((n)=> caches.delete(n)))
    ).then(()=> self.clients.claim())
  );
});
// network-first زي باقي التطبيقات
self.addEventListener('fetch', (e)=>{
  if(e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then((res)=>{
      const copy = res.clone();
      caches.open(CACHE_NAME).then((c)=> c.put(e.request, copy)).catch(()=>{});
      return res;
    }).catch(()=> caches.match(e.request))
  );
});
// ⚠️ كان فيه **مستمعين `notificationclick`** في الملف ده: القديم ده
//    (بيرمي `data.url` ويفتح './' دايمًا) والجديد تحت. المتصفح بينادي
//    **الاتنين**، والقديم كان بيسبق فبيبلع اللينك. اتشال — المستمع
//    الوحيد دلوقتي هو اللي تحت اللي بيحترم `data.url`.

// ============ 🔔 استقبال إشعارات Push (حتى والتطبيق مقفول) ============
// نفس نمط تطبيق العميلة بالظبط — الحدث 'push' الخام، مش firebase-messaging-sw.
// كده مش محتاجين ملف SW تاني ولا تحميل SDK جوه الـSW.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}
  const n = data.notification || data || {};
  const title = n.title || 'echarpe office';
  const body  = n.body  || 'فيه جديد محتاج منك';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      icon: 'icon.png',
      badge: 'icon.png',
      dir: 'rtl',
      lang: 'ar',
      vibrate: [200, 80, 200],
      requireInteraction: true,          // 🔔 يفضل ظاهر لحد ما المالك يشوفه
      data: { url: (data.data && data.data.url) || './' },
      tag: (data.data && data.data.tag) || 'office-general'
    })
  );
});

// الضغط على الإشعار بيفتح التطبيق (أو بيرجّعه لو مفتوح)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ('focus' in c) return c.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
