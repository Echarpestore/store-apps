/* ============================================================
   firebase-messaging-sw.js — في **جذر** الموقع (www.echarpe.store/firebase-messaging-sw.js)
   22-09: تطبيق Glow طلّع «Failed to register a ServiceWorker … /firebase-messaging-sw.js (404)» والإشعارات وقفت.
   SDK الإشعارات بيدوّر على الملف ده في الجذر — لو مش موجود getToken بيقع وتوكن العميلة مبيتحفظش.
   ============================================================ */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
firebase.initializeApp({
  "apiKey": "AIzaSyCa6Qho3IKoKE_jCNHYuFX6rtaV88jekQs",
  "authDomain": "customer-feedback-8ac1d.firebaseapp.com",
  "projectId": "customer-feedback-8ac1d",
  "storageBucket": "customer-feedback-8ac1d.firebasestorage.app",
  "messagingSenderId": "408860081491",
  "appId": "1:408860081491:web:c5fa8b8e757c13196375a6"
});
const messaging = firebase.messaging();
messaging.onBackgroundMessage(function(payload){
  const n = (payload && payload.notification) || {};
  const data = (payload && payload.data) || {};
  const url = data.url || (payload && payload.fcmOptions && payload.fcmOptions.link) || './';
  return self.registration.showNotification(n.title || 'echarpe', {
    body: n.body || '', dir: 'rtl', lang: 'ar', tag: data.tag || 'echarpe', data: { url: url },
    icon: '/loyalty/icon-192.png', badge: '/loyalty/icon-192.png'
  });
});
self.addEventListener('notificationclick', function(event){
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list){
    for (const c of list) { if ('focus' in c) { try { c.navigate(url); } catch (e) {} return c.focus(); } }
    return clients.openWindow(url);
  }));
});
