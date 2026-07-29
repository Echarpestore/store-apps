const CACHE_NAME = 'echarpe-office-v5';
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
// فتح التطبيق من الإشعار
self.addEventListener('notificationclick', (e)=>{
  e.notification.close();
  e.waitUntil(clients.matchAll({ type:'window', includeUncontrolled:true }).then((list)=>{
    for(const c of list){ if('focus' in c) return c.focus(); }
    return clients.openWindow('./');
  }));
});
