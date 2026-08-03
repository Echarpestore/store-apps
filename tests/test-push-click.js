// ============================================================
// 🔔 test-push-click — لينك الإشعار لازم يوصل للصفحة
//
// الباج اللي الاختبار ده اتكتب عشانه (قمع التقييم = 0%):
//   دالة الإشعار في functions/index.js بتبعت `data.url = "./?rate=<id>"`.
//   الـ push handler في sw.js كان بيخزّنه في `notification.data.url` صح،
//   لكن الـ notificationclick كان **بيرميه** ويبني `./index.html` من الصفر،
//   وكمان بيعمل focus على النافذة المفتوحة من غير navigate.
//   النتيجة: `?rate=` بيتشال 100% من المرات، وشاشة التقييم في index.html
//   أول سطرين فيها `if(!saleId) return;` → خروج صامت.
//   51 إشعار اتبعت · 0 تقييم.
//
// ⚠️ الاختبار ده **سلوكي**: بيشغّل الـ sw الحقيقي في VM وبيبعتله ضغطة
//    إشعار حقيقية ويشوف الـ clients اتنادت بإيه. مش بيدوّر على نصوص —
//    لو حد رجّع الباج، السيناريوهات دي بتقع فورًا.
//
// (بيتشغّل في عملية منفصلة لأن الـ handler async والـ harness متزامن.)
// ============================================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

// ---------- المشغّل الفرعي: بيحمّل الـ sw في VM ويبعت الضغطة ----------
const RUNNER = `
'use strict';
const fs = require('fs');
const vm = require('vm');
const [ , , swPath, scenarioJson ] = process.argv;
const sc = JSON.parse(scenarioJson);
const SCOPE = 'https://echarpe.store' + sc.scopePath;

const calls = { openWindow: [], navigate: [], focus: 0, showNotification: [] };
const listeners = {};

function mkWin(url, opts){
  const w = { url: url };
  if(!opts || opts.focus !== false) w.focus = function(){ calls.focus++; return Promise.resolve(w); };
  if(!opts || opts.navigate !== false){
    w.navigate = function(u){
      calls.navigate.push(u);
      if(opts && opts.navigateThrows) return Promise.reject(new Error('not allowed'));
      return Promise.resolve(w);
    };
  }
  return w;
}
const wins = (sc.windows || []).map(function(w){ return mkWin(w.url, w); });

const sandbox = {
  console: console,
  URL: URL,
  Promise: Promise,
  fetch: function(){ return Promise.resolve({ clone: function(){ return {}; } }); },
  caches: { keys: function(){ return Promise.resolve([]); }, open: function(){ return Promise.resolve({ put: function(){} }); }, match: function(){ return Promise.resolve(); }, delete: function(){ return Promise.resolve(); } },
  clients: {
    matchAll: function(){ return Promise.resolve(wins); },
    openWindow: function(u){ calls.openWindow.push(u); return Promise.resolve({}); },
    claim: function(){ return Promise.resolve(); }
  },
  self: {
    addEventListener: function(ev, fn){ (listeners[ev] = listeners[ev] || []).push(fn); },
    registration: { scope: SCOPE, showNotification: function(t, o){ calls.showNotification.push({ title: t, opts: o }); return Promise.resolve(); } },
    clients: { claim: function(){ return Promise.resolve(); } },
    skipWaiting: function(){},
    location: { origin: 'https://echarpe.store' }
  }
};
sandbox.self.clients = sandbox.clients;
sandbox.globalThis = sandbox;

vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(swPath, 'utf8'), sandbox, { filename: swPath });

(async function(){
  // 1) الـ push الأول (لو السيناريو طالب) — عشان نتأكد إن اللينك بيتخزّن
  if(sc.push){
    const waits = [];
    (listeners['push'] || []).forEach(function(fn){
      fn({ data: { json: function(){ return sc.push; } }, waitUntil: function(p){ waits.push(p); } });
    });
    await Promise.all(waits);
  }

  // 2) الضغطة
  const stored = calls.showNotification.length
    ? calls.showNotification[calls.showNotification.length - 1].opts.data
    : sc.clickData;
  let closed = false;
  const waits2 = [];
  (listeners['notificationclick'] || []).forEach(function(fn){
    fn({
      notification: { close: function(){ closed = true; }, data: stored },
      waitUntil: function(p){ waits2.push(p); }
    });
  });
  await Promise.all(waits2);

  process.stdout.write(JSON.stringify({ calls: calls, closed: closed, stored: stored }));
})().catch(function(e){ process.stdout.write(JSON.stringify({ error: e.message })); });
`;

const runnerPath = path.join(os.tmpdir(), 'sw-click-runner-' + process.pid + '.js');
fs.writeFileSync(runnerPath, RUNNER);

function run(swPath, scenario){
  const out = execFileSync(process.execPath, [runnerPath, swPath, JSON.stringify(scenario)], {
    encoding: 'utf8', timeout: 15000
  });
  return JSON.parse(out);
}

// ============================================================
// التطبيقين — نفس الباج كان في الاتنين، فنفس السيناريوهات على الاتنين
// ============================================================
const APPS = [
  { name: 'loyalty (echarpe)', dir: 'loyalty', scopePath: '/loyalty/', prefix: 'echarpe-loyalty-v', minVer: 40 },
  { name: 'glow',              dir: 'glow',    scopePath: '/glow/',    prefix: 'glow-loyalty-v',    minVer: 33 }
];

for(const app of APPS){
  const swPath = path.join(ROOT, app.dir, 'sw.js');
  const src = fs.readFileSync(swPath, 'utf8');
  const L = app.name + ': ';

  // ---------- الإصدار اتزوّد (وإلا الجهاز يفضل على الـ sw القديم) ----------
  (function(){
    const m = src.match(new RegExp("CACHE_NAME\\s*=\\s*'" + app.prefix + "(\\d+)'"));
    assert(!!m, L + 'CACHE_NAME موجود بالصيغة المتوقعة');
    if(m) assert(Number(m[1]) >= app.minVer,
      L + `CACHE_NAME اتزوّد (${app.prefix}${app.minVer}+) — من غير كده الإصلاح مش هيوصل للأجهزة`);
  })();

  // ---------- 1) مفيش نافذة مفتوحة → لازم يفتح اللينك بالـ rate ----------
  (function(){
    const r = run(swPath, {
      scopePath: app.scopePath,
      push: { notification: { title: 't', body: 'b' }, data: { url: './?rate=INV123', tag: 'rate' } },
      windows: []
    });
    assert(!r.error, L + 'الضغطة اشتغلت من غير استثناء — ' + (r.error || ''));
    assert(r.stored && r.stored.url === './?rate=INV123',
      L + 'الـ push بيخزّن لينك التقييم في notification.data');
    assertEq(r.calls.openWindow, ['https://echarpe.store' + app.scopePath + '?rate=INV123'],
      L + '⭐ التطبيق بيتفتح على ?rate= — ده اللي كان بيتشال وخلّى التقييم 0%');
    assert(r.closed, L + 'الإشعار بيتقفل بعد الضغط');
  })();

  // ---------- 2) نافذة مفتوحة → navigate مش مجرد focus ----------
  (function(){
    const r = run(swPath, {
      scopePath: app.scopePath,
      push: { notification: { title: 't' }, data: { url: './?rate=INV777' } },
      windows: [{ url: 'https://echarpe.store' + app.scopePath }]
    });
    const target = 'https://echarpe.store' + app.scopePath + '?rate=INV777';
    assertEq(r.calls.navigate, [target],
      L + '⭐ التطبيق مفتوح → النافذة بتتنقل على اللينك (الفوكس لوحده كان بيضيّع ?rate=)');
    assertEq(r.calls.openWindow, [], L + 'ومفيش نافذة تانية بتتفتح فوقها');
    assert(r.calls.focus >= 1, L + 'والنافذة بتتركّز');
  })();

  // ---------- 3) إشعار عام (من غير query) → فوكس زي ما كان، من غير reload ----------
  (function(){
    const r = run(swPath, {
      scopePath: app.scopePath,
      push: { notification: { title: 'مكافأة' }, data: { url: './' } },
      windows: [{ url: 'https://echarpe.store' + app.scopePath + 'index.html' }]
    });
    assertEq(r.calls.navigate, [], L + 'الإشعار العام مبيعملش navigate (متعملش reload من غير داعي)');
    assertEq(r.calls.openWindow, [], L + 'ولا بيفتح نافذة جديدة');
    assert(r.calls.focus === 1, L + 'بيركّز على المفتوحة بس');
  })();

  // ---------- 4) navigate اترفضت → فولباك يفتح نافذة على اللينك الصح ----------
  (function(){
    const r = run(swPath, {
      scopePath: app.scopePath,
      push: { notification: { title: 't' }, data: { url: './?rate=INV9' } },
      windows: [{ url: 'https://echarpe.store' + app.scopePath, navigateThrows: true }]
    });
    assertEq(r.calls.openWindow, ['https://echarpe.store' + app.scopePath + '?rate=INV9'],
      L + 'لو المتصفح رفض navigate → بيفتح نافذة على اللينك (مش بيسقط التقييم)');
  })();

  // ---------- 5) متصفح قديم من غير navigate → برضه اللينك بيوصل ----------
  (function(){
    const r = run(swPath, {
      scopePath: app.scopePath,
      push: { notification: { title: 't' }, data: { url: './?rate=INV5' } },
      windows: [{ url: 'https://echarpe.store' + app.scopePath, navigate: false }]
    });
    assertEq(r.calls.openWindow, ['https://echarpe.store' + app.scopePath + '?rate=INV5'],
      L + 'مفيش navigate في الـ client → openWindow باللينك كامل');
  })();

  // ---------- 6) إشعار قديم من غير data → ميقعش ----------
  (function(){
    const r = run(swPath, { scopePath: app.scopePath, clickData: null, windows: [] });
    assert(!r.error, L + 'إشعار من غير data مبيرميش استثناء');
    assert(r.calls.openWindow.length === 1, L + 'وبيفتح التطبيق عادي');
  })();

  // ---------- 7) الأيقونة: المسار الغلط كان بيخلي الإشعار بأيقونة المتصفح ----------
  (function(){
    assert(!/icons\/icon-192\.png/.test(src),
      L + "مسار الأيقونة 'icons/icon-192.png' مش موجود (الملف مكانه في جذر التطبيق)");
    const r = run(swPath, {
      scopePath: app.scopePath,
      push: { notification: { title: 't' }, data: { url: './' } },
      windows: []
    });
    const opts = r.calls.showNotification[0] && r.calls.showNotification[0].opts;
    assert(!!opts && /icon-192\.png$/.test(String(opts.icon)),
      L + 'الإشعار بيتعرض بأيقونة التطبيق');
  })();
}

try { fs.unlinkSync(runnerPath); } catch(e){}
