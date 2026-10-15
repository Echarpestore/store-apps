/* ============================================================
   🎛️ pos-remote.js — v767 — تحكم المالك في الكاشير عن بُعد من Office
   ------------------------------------------------------------
   ١) 🔒 قفل / 🔓 فتح الكاشير + 🚪 خروج الموظفة الحالية
      المستند: pos_test_settings/pos_remote_<الفرع> = { locked, lockMsg, kickSeq, kickAt, by, at }
      · locked = شاشة قفل فوق كل حاجة (مفيش بيع) لحد ما المالك يفتح.
      · kickSeq زاد (خلال دقيقتين) = الموظفة اللي داخلة بتخرج لشاشة اختيار الموظف.
   ٢) 📲 دخول الجهاز بحساب الفرع من Office (لو الجهاز بيطلب إيميل وباسورد)
      · الجهاز بيعمل مفتاح تشفير على الجهاز نفسه (RSA-OAEP) وبيعرض كود من 6 أرقام.
      · بيكتب طلب في pos_pair/<الكود> (المفتاح العام بس) — المالك بيشوف الطلب في Office ويختار حساب الفرع.
      · Office بيشفّر الإيميل والباسورد بالمفتاح العام → الجهاز بس اللي يقدر يفكّه → بيدخل ويحفظ الدخول.
      · الباسورد عمره ما بيتكتب مكشوف في Firestore.
   ============================================================ */
(function(){
'use strict';
if(typeof firebase === 'undefined' || !firebase.auth) return;
var REMOTE_PREFIX = 'pos_remote_';
function branchNow(){ try{ return (typeof currentBranch !== 'undefined' && currentBranch) || localStorage.getItem('pos_branch') || ''; }catch(e){ return ''; } }
function safeId(b){ return REMOTE_PREFIX + String(b || '').replace(/\//g, '_'); }
function isStaff(){ var u = firebase.auth().currentUser; return !!(u && !u.isAnonymous); }

/* ---------- ١) القفل والخروج ---------- */
var unsub = null, watching = '', lastKick = null;
function lockOverlay(on, msg){
  var el = document.getElementById('posRemoteLock');
  if(!on){ if(el) el.remove(); return; }
  if(!el){
    el = document.createElement('div'); el.id = 'posRemoteLock';
    el.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(10,12,16,.96);color:#fff;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px;text-align:center;padding:24px;font-family:Cairo,sans-serif';
    ['keydown','keyup','keypress','mousedown','click','touchstart'].forEach(function(t){ el.addEventListener(t, function(e){ e.stopPropagation(); }, true); });
    document.body.appendChild(el);
  }
  el.innerHTML = '<div style="font-size:64px">🔒</div><div style="font-size:26px;font-weight:900">الكاشير مقفول من الإدارة</div><div style="font-size:15px;color:#cbd5e1;max-width:520px;line-height:1.8"></div>';
  el.lastChild.textContent = msg || 'استني لحد ما الإدارة تفتحه';
}
/* ✅ v768: الجهاز بيرد إنه استلم — Office بيعرض «الجهاز استلم» بدل ما يقول «تم» والجهاز أصلًا مش سامع */
function ack(d){
  try{
    var b = branchNow(); if(!b || !isStaff()) return;
    var want = { ackLocked: !!d.locked, ackKickSeq: Number(d.kickSeq) || 0 };
    if(d.ackLocked === want.ackLocked && Number(d.ackKickSeq || 0) === want.ackKickSeq && Number(d.ackAt || 0) >= Number(d.at || 0)) return;
    want.ackAt = Date.now(); want.ackDevice = String(navigator.userAgent || '').slice(0, 60);
    firebase.firestore().collection('pos_test_settings').doc(safeId(b)).set(want, { merge:true }).catch(function(){});
  }catch(e){}
}
function onRemote(d){
  d = d || {};
  lockOverlay(!!d.locked, d.lockMsg);
  var k = Number(d.kickSeq) || 0;
  ack(d);
  if(lastKick === null){ lastKick = k; return; }               // أول قراية = الحالة الحالية، مش أمر جديد
  if(k > lastKick){
    lastKick = k;
    if(Date.now() - (Number(d.kickAt) || 0) < 120000 && typeof currentEmployee !== 'undefined' && currentEmployee && typeof logout === 'function'){
      try{ logout(); }catch(e){}
      try{ if(typeof showToast === 'function') showToast('🚪 الإدارة خرّجت الحساب من الكاشير', 'warn'); }catch(e){}
    }
  }
}
function watch(){
  var b = branchNow();
  if(!isStaff() || !b){ if(unsub){ try{ unsub(); }catch(e){} unsub = null; watching = ''; } return; }
  if(watching === b && unsub) return;
  if(unsub){ try{ unsub(); }catch(e){} }
  watching = b; lastKick = null;
  unsub = firebase.firestore().collection('pos_test_settings').doc(safeId(b)).onSnapshot(function(s){ onRemote(s.exists ? s.data() : null); }, function(e){ console.warn('pos remote', e && e.code); });
}
firebase.auth().onAuthStateChanged(function(){ setTimeout(watch, 300); });
setInterval(watch, 30000);   // لو الفرع اتغيّر (أدمن دخل فرع تاني ورجع)

/* ---------- ٢) دخول الجهاز من Office ---------- */
var pair = { code:'', keys:null, unsub:null, busy:false };
function b64(buf){ return btoa(String.fromCharCode.apply(null, new Uint8Array(buf))); }
function unb64(s){ var bin = atob(s), out = new Uint8Array(bin.length); for(var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out.buffer; }
function pairBox(){
  var box = document.querySelector('#branchSetupScreen .pin-box'); if(!box) return null;
  var el = document.getElementById('posPairBox');
  if(!el){
    el = document.createElement('div'); el.id = 'posPairBox';
    el.style.cssText = 'margin-top:14px;padding-top:12px;border-top:1px dashed var(--border,#333);text-align:center';
    el.innerHTML = '<button type="button" id="posPairBtn" style="width:100%;padding:12px;border-radius:12px;border:1px solid var(--border,#333);background:var(--panel2,#222);color:var(--text,#fff);font-size:14px;font-weight:800;cursor:pointer">📲 الإدارة تدخّل الجهاز من Office</button><div id="posPairMsg" style="font-size:12.5px;margin-top:8px;line-height:1.8;color:var(--muted,#aaa)"></div>';
    box.appendChild(el);
    el.querySelector('#posPairBtn').onclick = startPair;
  }
  return el;
}
function pairMsg(html){ var m = document.getElementById('posPairMsg'); if(m) m.innerHTML = html; }
async function startPair(){
  if(pair.busy) return; pair.busy = true; window.__posPairing = true;
  try{
    if(!(window.crypto && crypto.subtle)) throw new Error('الجهاز مش بيدعم التشفير');
    pairMsg('⏳ بيجهّز…');
    pair.keys = await crypto.subtle.generateKey({ name:'RSA-OAEP', modulusLength:2048, publicExponent:new Uint8Array([1,0,1]), hash:'SHA-256' }, false, ['encrypt','decrypt']);
    var pub = await crypto.subtle.exportKey('jwk', pair.keys.publicKey);
    if(!firebase.auth().currentUser) await firebase.auth().signInAnonymously();
    pair.code = String(Math.floor(100000 + Math.random() * 900000));
    await firebase.firestore().collection('pos_pair').doc(pair.code).set({ code:pair.code, status:'waiting', pub:JSON.stringify(pub), branchHint:branchNow(), createdAt:Date.now(), ua:String(navigator.userAgent || '').slice(0, 120) });
    pairMsg('قول للإدارة الكود ده:<div style="font-size:34px;font-weight:900;letter-spacing:6px;color:var(--plus,#7ee2ad);direction:ltr">' + pair.code + '</div>المالك بيفتح Office ← POS Live ← «أجهزة مستنية دخول» ويدوس دخّل. سيب الشاشة مفتوحة.');
    if(pair.unsub){ try{ pair.unsub(); }catch(e){} }
    pair.unsub = firebase.firestore().collection('pos_pair').doc(pair.code).onSnapshot(function(s){ var d = s.exists ? s.data() : null; if(d && d.status === 'sent' && d.enc) finishPair(d); }, function(e){ pairMsg('تعذر: ' + ((e && e.code) || '')); });
  }catch(e){ pairMsg('<span style="color:#ff9a9d">تعذر: ' + String((e && (e.code || e.message)) || '') + '</span>'); }
  pair.busy = false;
}
async function finishPair(d){
  if(pair.finishing) return; pair.finishing = true;
  try{
    pairMsg('⏳ وصل الدخول من الإدارة — بيدخل…');
    var plain = await crypto.subtle.decrypt({ name:'RSA-OAEP' }, pair.keys.privateKey, unb64(d.enc));
    var o = JSON.parse(new TextDecoder().decode(plain));
    if(pair.unsub){ try{ pair.unsub(); }catch(e){} pair.unsub = null; }
    // نملا نفس فورم إعداد الجهاز وننادي نفس الحفظ — نفس المسار بالظبط (staff_uids + حفظ الدخول + اختيار الموظف)
    var sel = document.getElementById('branchSetupSelect'), inp = document.getElementById('branchSetupInput');
    if(sel){ if(![].some.call(sel.options, function(x){ return x.value === o.b; })){ var op = document.createElement('option'); op.value = o.b; op.textContent = o.b; sel.appendChild(op); } sel.value = o.b; }
    else if(inp){ inp.value = o.b; }
    document.getElementById('branchSetupEmail').value = o.e; document.getElementById('branchSetupPass').value = o.p;
    o = null;
    if(typeof saveBranchSetup === 'function') await saveBranchSetup();
    try{ document.getElementById('branchSetupPass').value = ''; }catch(e){}
    try{ if(isStaff()) await firebase.firestore().collection('pos_pair').doc(pair.code).update({ status:'done', doneAt:Date.now(), enc:firebase.firestore.FieldValue.delete() }); }catch(e){}
    pairMsg(isStaff() ? '✅ اتدخل' : '<span style="color:#ff9a9d">الدخول اترفض — الإدارة تتأكد من الحساب</span>');
  }catch(e){ pairMsg('<span style="color:#ff9a9d">تعذر فك الدخول: ' + String((e && e.message) || '') + '</span>'); }
  pair.finishing = false;
}
// زرار «الإدارة تدخّل الجهاز» بيظهر بس لما فورم إعداد الجهاز ظاهر فعلًا (مش في وضع «بيدخّل الفرع…»)
setInterval(function(){
  var bs = document.getElementById('branchSetupScreen'); if(!bs) return;
  var show = bs.classList.contains('active') && !bs.classList.contains('pos-auto') && !isStaff();
  var el = document.getElementById('posPairBox');
  if(show){ el = pairBox(); if(el) el.style.display = ''; } else if(el) el.style.display = 'none';
}, 1000);
window.posRemote = { onRemote:onRemote, lockOverlay:lockOverlay, safeId:safeId, startPair:startPair, _pair:pair };
})();
