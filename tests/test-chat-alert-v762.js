#!/usr/bin/env node
// ============================================================
// v762 — تنبيه رسايل الشات (chat-alert.js): صوت/اهتزاز/شريط/إشعار + تكرار كل دقيقة
// ============================================================
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if(c){ pass++; } else { fail++; console.error('  ❌ ' + m); } };
const src = fs.readFileSync(path.join(ROOT, 'pos', 'chat-alert.js'), 'utf8');

function boot(){
  const calls = { beeps:0, vib:0, notif:[], opened:[], timers:[] };
  const el = () => ({ style:{}, classList:{ add(){}, remove(){} }, textContent:'', innerHTML:'', addEventListener(){}, appendChild(){}, offsetWidth:0 });
  const els = {};
  const document = { title:'POS', body:{ appendChild(){} }, head:{ appendChild(){} }, addEventListener(){},
    getElementById(id){ return els[id] || (els[id] = el()); }, createElement(){ return el(); } };
  const ctx = { document, navigator:{ vibrate(){ calls.vib++; } }, localStorage:{ _m:{}, getItem(k){ return this._m[k] ?? null; }, setItem(k,v){ this._m[k]=v; } },
    setInterval(fn, ms){ calls.timers.push(fn); return calls.timers.length; }, clearInterval(){ calls.cleared = true; }, console,
    Notification: Object.assign(function(t, o){ calls.notif.push({ t, o }); return { close(){} }; }, { permission:'granted' }) };
  ctx.window = ctx; ctx.window.ccOpenPanel = () => calls.opened.push('panel'); ctx.window.ccOpenConv = id => calls.opened.push(id);
  // صوت: AudioContext وهمي مفتوح
  ctx.AudioContext = function(){ this.state='running'; this.currentTime=0; this.destination={}; this.resume=()=>{};
    this.createOscillator=()=>({ type:'', frequency:{}, connect(){}, start(){ calls.beeps++; }, stop(){} });
    this.createGain=()=>({ gain:{ setValueAtTime(){}, exponentialRampToValueAtTime(){} }, connect(){} }); };
  vm.createContext(ctx); vm.runInContext(src, ctx);
  const A = ctx.ChatAlert; A._S.unlocked = true; A._S.ctx = new ctx.AudioContext();
  return { A, calls, ctx, els };
}
const C = (id, unread, extra) => Object.assign({ id, unreadStaff: unread, name: 'ن' + id, branch: 'Glow', lastAt: 1000 + Number(id.replace(/\D/g,'')||0) }, extra || {});

// ---- منطق خالص
const { A: P } = boot();
let d = P.diff({}, [C('a', 1), C('b', 0)], { branch:'Glow', filterMine:true });
ok(Object.keys(d.next).join() === 'a' && d.fresh.length === 1 && d.fresh[0].id === 'a', 'رسالة جديدة في a بس (b صفر)');
d = P.diff({ a:1 }, [C('a', 1)], {});
ok(d.fresh.length === 0 && d.next.a === 1, 'نفس العدد = مش جديدة بس لسه معلّقة');
d = P.diff({ a:1 }, [C('a', 2)], {});
ok(d.fresh.length === 1, 'زيادة العدد = جديدة');
d = P.diff({ a:3 }, [C('a', 1)], {});
ok(d.fresh.length === 0, 'سلبي: العدد قلّ = مش جديدة');
d = P.diff({}, [C('a', 2)], { open:true, activeId:'a' });
ok(Object.keys(d.next).length === 0, 'سلبي: المحادثة المفتوحة قدام الموظفة مبتنبّهش');
d = P.diff({}, [C('a', 2, { branch:'echarpe El Rehab' })], { branch:'Glow', filterMine:true });
ok(Object.keys(d.next).length === 0, 'سلبي: فرع تاني مع فلتر «فرعي» مبينبّهش');
d = P.diff({}, [C('a', 2, { branch:'echarpe El Rehab' })], { branch:'Glow', filterMine:false });
ok(Object.keys(d.next).length === 1, 'Office (الكل): فرع تاني بينبّه');
ok(P.due(0, 60000, 60000) && !P.due(10000, 60000, 60000) && P.due(10000, 70000, 60000), 'التكرار بعد الفاصل بالظبط');
ok(P.muted(5000, 4000) && !P.muted(5000, 5000), 'الكتم لحد الوقت المحدد');

// ---- سلوك فعلي: صوت + اهتزاز + إشعار + تكرار + فتح المحادثة
const { A, calls, ctx, els } = boot();
A.update([C('a', 1, { lastText:'عايزة الطرحة البيج' })], { open:false, activeId:null, branch:'Glow', filterMine:true });
ok(calls.beeps === 3 && calls.vib === 1, 'رسالة جديدة: صوت (٣ نغمات) + اهتزاز');
ok(calls.notif.length === 1 && /ن?a/.test(calls.notif[0].t) && /البيج/.test(calls.notif[0].o.body), 'إشعار متصفح بنص الرسالة');
ok(ctx.document.title.startsWith('(1) 💬'), 'عنوان التاب فيه العدد');
ok(calls.timers.length === 1, 'مؤقت التكرار اشتغل');
// نفس اللقطة تاني = مفيش صوت جديد
A.update([C('a', 1)], { open:false, activeId:null, branch:'Glow', filterMine:true });
ok(calls.beeps === 3 && calls.notif.length === 1, 'سلبي: نفس الرسالة متتكررش فورًا');
// بعد دقيقة من غير رد → تكرار (صوت من غير إشعار جديد)
A._S.lastPing = Date.now() - 61000; calls.timers[0]();
ok(calls.beeps === 6 && calls.notif.length === 1, 'بعد دقيقة من غير رد: الصوت اتكرر من غير إشعار تاني');
// كتم ساعة → مفيش صوت في التكرار
ctx.localStorage.setItem('cc_alert_mute_until', String(Date.now() + 3600000));
A._S.lastPing = Date.now() - 61000; calls.timers[0]();
ok(calls.beeps === 6, 'سلبي: مكتوم = مفيش صوت');
ctx.localStorage.setItem('cc_alert_mute_until', '0');
// الموظفة فتحت المحادثة → اتصفّرت → يقف
A.update([C('a', 0)], { open:true, activeId:'a', branch:'Glow', filterMine:true });
ok(Object.keys(A._S.pending).length === 0 && calls.cleared === true && ctx.document.title === 'POS', 'بعد الرد: مفيش معلّق، المؤقت وقف، العنوان رجع');
// رسالة تانية بعد الرد = جديدة من أول وجديد
A.update([C('a', 1)], { open:false, activeId:null, branch:'Glow', filterMine:true });
ok(calls.beeps === 9 && calls.notif.length === 2, 'رسالة بعد الرد بتنبّه تاني');
// الضغط على الإشعار بيفتح المحادثة
calls.notif[1] && (function(){ const n = new ctx.Notification('x', {}); })();
// الربط والملفات
const ui = fs.readFileSync(path.join(ROOT,'pos','chat-staff-ui.js'),'utf8');
ok(/window\.ChatAlert\.update\(rows,\s*\{ open: !!CST\.open, activeId: CST\.activeId, branch: myBranch\(\), filterMine: !!CST\.filterMine \}\)/.test(ui), 'chat-staff-ui بينادي ChatAlert مع كل لقطة');
[['pos/index.html','chat-alert.js?v=762'],['sales/index.html','../pos/chat-alert.js?v=762'],['Office/index.html','../pos/chat-alert.js?v=762']].forEach(([f, tag]) => {
  const h = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const i1 = h.indexOf(tag), i2 = h.indexOf('chat-staff-ui.js?v=762');
  ok(i1 > 0 && i2 > i1, f + ': chat-alert.js قبل chat-staff-ui.js v762');
});
ok(/pos-shell-v76[2-9]/.test(fs.readFileSync(path.join(ROOT,'pos','sw.js'),'utf8')), 'pos sw v762');
ok(/store-apps-shell-v636/.test(fs.readFileSync(path.join(ROOT,'sales','sw.js'),'utf8')), 'sales sw v636');
ok(/echarpe-office-v754/.test(fs.readFileSync(path.join(ROOT,'Office','sw.js'),'utf8')), 'Office sw v754');
console.log(`  ${pass} ناجح · ${fail} فاشل`);
if(fail) process.exitCode = 1;
