// ============================================================================
// 💬 شات الفروع — v119
// معزول تمامًا عن مسار البيع: لو أي حاجة هنا وقعت، الكاشير شغال عادي.
// رسايل يوم-بيوم (بتتنضف تلقائي عبر TTL على expireAt) — مفيش أرشيف.
// ذكي: "عندكم كود 832؟" → كارت المنتج (اسم + كود + سعر) بيتبني لوحده.
// 🚫 من غير أي ذكر للمخزون/الكميات — سياسة المحل.
// ============================================================================
(function(){
'use strict';

// >>> CHAT_PURE_START
// مفتاح اليوم المحلي (بيطابق أسلوب سجل المبيعات)
function chatDayKey(now){ const d = now ? new Date(now) : new Date(); return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate(); }

// بيستخرج المنتجات من نص الرسالة: أي كود يطابق باركود صنف (تطابق كامل، أو نهاية مميزة لكود واحد بس)
function chatExtractProducts(text, inventory){
  const out = [], seen = {};
  const tokens = String(text||'').split(/[\s،,؛:.!؟?()\[\]]+/).filter(t=> /^[A-Za-z0-9\-]{3,}$/.test(t));
  for(const tok of tokens){
    let m = (inventory||[]).find(it=> it.barcode === tok);
    if(!m){
      const ends = (inventory||[]).filter(it=> it.barcode && String(it.barcode).endsWith(tok));
      if(ends.length === 1) m = ends[0];
    }
    if(m && !seen[m.barcode]){ seen[m.barcode] = 1; out.push({ code: String(m.barcode), name: m.name||'', price: (m.price!=null ? m.price : '') }); }
  }
  return out;
}

// عدد الرسايل الجاية ليّا واللي لسه ماتشافتش
function chatUnreadCount(msgs, myBranch, lastSeenTs){
  return (msgs||[]).filter(m=> m.to === myBranch && (m.ts||0) > (lastSeenTs||0)).length;
}
// <<< CHAT_PURE_END

let _msgs = [];            // رسايل اليوم (كل الفروع — بنفلتر منها محادثاتي)
let _unsub = null;
let _curDay = null;
let _bootTs = Date.now();  // عشان الصوت يشتغل للرسايل الجديدة بس مش القديمة
let _panelOpen = false;

const LS_SEEN = 'chat_seen_ts';
const LS_DEST = 'chat_default_dest';

function _my(){ return (typeof currentBranch !== 'undefined' && currentBranch) || null; }
function _mine(){ const me = _my(); return _msgs.filter(m=> m.from === me || m.to === me).sort((a,b)=> (a.ts||0)-(b.ts||0)); }
function _seen(){ return parseInt(localStorage.getItem(LS_SEEN)||'0') || 0; }
function _markSeen(){ localStorage.setItem(LS_SEEN, String(Date.now())); _refreshMini(); _refreshPanel(); }

// ---------- صوت التنبيه (مولّد — من غير ملفات) ----------
let _ac = null;
function _beep(freq, dur, when){
  try{
    _ac = _ac || new (window.AudioContext || window.webkitAudioContext)();
    const t = _ac.currentTime + (when||0);
    const o = _ac.createOscillator(), g = _ac.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(_ac.destination);
    o.start(t); o.stop(t + dur + 0.05);
  }catch(e){}
}
function _soundMsg(){ _beep(880, .12); _beep(1175, .16, .13); }
function _soundNudge(){ _beep(660, .18); _beep(880, .18, .2); _beep(1100, .3, .4); }

// ---------- Firestore ----------
function _subscribe(){
  if(typeof db === 'undefined' || !_my()) return;
  const day = chatDayKey();
  if(_unsub && _curDay === day) return;
  if(_unsub){ try{ _unsub(); }catch(e){} _unsub = null; }
  _curDay = day;
  _unsub = db.collection('pos_chat').where('dayKey','==',day).onSnapshot(snap=>{
    const before = _msgs.length ? Math.max.apply(null, _msgs.map(m=>m.ts||0)) : _bootTs;
    _msgs = snap.docs.map(d=> ({ _id:d.id, ...d.data() }));
    const me = _my();
    const fresh = _msgs.filter(m=> m.to === me && (m.ts||0) > before);
    if(fresh.length){
      if(fresh.some(m=> m.nudge)) { _soundNudge(); _flashMini(); }
      else _soundMsg();
      if(_panelOpen) _markSeen();
    }
    _refreshMini(); _refreshPanel();
  }, e=> console.warn('chat listen', e && e.code));
}

async function _send(text, opts){
  const me = _my(); if(!me) return;
  const dest = (document.getElementById('chDest')||{}).value || localStorage.getItem(LS_DEST) || '';
  const to = (opts && opts.to) || dest;
  if(!to){ _toast('اختار الفرع الأول', 'err'); return; }
  const body = String(text||'').trim();
  if(!body && !(opts && opts.nudge)) return;
  const inv = (typeof allInventory !== 'undefined') ? allInventory : [];
  const products = (opts && opts.nudge) ? [] : chatExtractProducts(body, inv);
  const now = Date.now();
  const msg = {
    dayKey: chatDayKey(), from: me, to,
    fromEmp: (typeof currentEmployee !== 'undefined' && currentEmployee && currentEmployee.name) || '',
    text: (opts && opts.nudge) ? '👋 نداء — بصّي على الشات' : body,
    products, ts: now, nudge: !!(opts && opts.nudge),
    expireAt: (typeof firebase !== 'undefined') ? firebase.firestore.Timestamp.fromMillis(now + 3*86400000) : null
  };
  try{
    await db.collection('pos_chat').add(msg);
    const inp = document.getElementById('chInput'); if(inp && !(opts && opts.nudge)) inp.value = '';
    _refreshSendPreview();
  }catch(e){ _toast('الرسالة ماتبعتتش: ' + e.message, 'err'); }
}

// ---------- ✅ متاح → تحويلة جاهزة ----------
window.chatAvailTransfer = function(ts){
  const msg = _msgs.find(m=> m.ts === ts);
  if(!msg || !(msg.products||[]).length) return;
  _send('✅ متاح — جاري تجهيز التحويلة 🚚', { to: msg.from });
  _closePanel();
  if(typeof goToTransfers === 'function') goToTransfers();
  // ننتظر الشاشة تترسم، نحوّل لتاب "جديد"، نظبط الوجهة = الفرع اللي سأل، ونضيف الأكواد
  let tries = 0;
  const t = setInterval(()=>{
    tries++;
    if(typeof _trTab !== 'undefined' && _trTab !== 'new' && typeof renderTransfersScreen === 'function'){ _trTab = 'new'; renderTransfersScreen(); return; }
    const sel = document.getElementById('trDestSel');
    if(sel){
      clearInterval(t);
      const setDest = ()=>{ if([...sel.options].some(o=> o.value === msg.from)) sel.value = msg.from; };
      setDest(); setTimeout(setDest, 700);   // بعد ما قايمة الفروع تتحمّل
      (msg.products||[]).forEach((p,i)=> setTimeout(()=>{ if(typeof _trRouteCode === 'function') _trRouteCode(p.code); }, 250*(i+1)));
    }
    if(tries > 20) clearInterval(t);
  }, 250);
};

// ---------- UI ----------
function _toast(m, k){ if(typeof showToast === 'function') showToast(m, k); }
function _esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }
function _fmtT(ts){ try{ return new Date(ts).toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'}); }catch(e){ return ''; } }

function _prodCardHTML(p, mini){
  return `<div style="display:inline-flex; align-items:center; gap:6px; background:rgba(129,140,248,.13); border:1px solid #818cf8; border-radius:9px; padding:${mini?'2px 7px':'5px 9px'}; margin:2px 2px 0 0; font-size:${mini?'10px':'11.5px'};">
    <span style="font-weight:800;">🛍️ ${_esc(p.name)}</span>
    <span style="direction:ltr; color:var(--muted);">${_esc(p.code)}</span>
    ${p.price!=='' ? `<b>${_esc(p.price)} ج.م</b>` : ''}
  </div>`;
}

function _refreshMini(){
  const box = document.getElementById('chatMini'); if(!box) return;
  const me = _my(); if(!me){ box.style.display = 'none'; return; }
  const mine = _mine();
  const unread = chatUnreadCount(mine, me, _seen());
  const last = mine.length ? mine[mine.length-1] : null;
  box.style.display = 'flex';
  box.innerHTML = `
    <div style="display:flex; align-items:center; gap:6px; min-width:0; flex:1;">
      <span style="font-size:15px;">💬</span>
      <div style="min-width:0; flex:1;">
        <div style="font-size:9.5px; color:var(--muted); display:flex; justify-content:space-between;"><span>شات الفروع</span>${last?`<span>${_fmtT(last.ts)}</span>`:''}</div>
        <div style="font-size:11px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
          ${last ? `${_esc(last.from===me?'انت':last.from)}: ${_esc(last.text)}` : 'مفيش رسايل النهارده'}
        </div>
      </div>
      ${unread ? `<span style="background:var(--minus); color:#fff; border-radius:99px; min-width:19px; height:19px; display:flex; align-items:center; justify-content:center; font-size:10.5px; font-weight:900; flex-shrink:0;">${unread}</span>` : ''}
    </div>`;
}
function _flashMini(){
  const box = document.getElementById('chatMini'); if(!box) return;
  let n = 0;
  const iv = setInterval(()=>{ box.style.outline = (n%2 ? '' : '3px solid var(--warn)'); if(++n > 7){ clearInterval(iv); box.style.outline=''; } }, 300);
}

async function _openPanel(){
  _panelOpen = true;
  let ov = document.getElementById('chatPanelOv');
  if(!ov){
    ov = document.createElement('div');
    ov.id = 'chatPanelOv';
    ov.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:9990; display:flex; justify-content:flex-start;';
    ov.onclick = (e)=>{ if(e.target === ov) _closePanel(); };
    ov.innerHTML = `
      <div style="width:min(94vw,430px); height:100%; background:var(--bg); border-left:1px solid var(--border); display:flex; flex-direction:column;">
        <div style="display:flex; align-items:center; gap:8px; padding:11px 13px; border-bottom:1px solid var(--border);">
          <span style="font-size:17px;">💬</span><b style="flex:1;">شات الفروع <span style="color:var(--muted); font-size:10.5px; font-weight:400;">(اليوم بس — بيتنضف تلقائي)</span></b>
          <button onclick="if(typeof chatNudge==='function')chatNudge()" title="نداء بصوت أعلى" style="border:1px solid var(--warn); background:rgba(245,158,11,.12); color:var(--warn); border-radius:9px; padding:7px 11px; font-weight:800; cursor:pointer;">👋 تنبيه</button>
          <button onclick="if(typeof chatClose==='function')chatClose()" style="border:1px solid var(--border); background:var(--panel2); color:var(--text); border-radius:9px; width:36px; height:36px; font-weight:900; cursor:pointer;">✖</button>
        </div>
        <div style="padding:9px 13px; border-bottom:1px solid var(--border); display:flex; gap:8px; align-items:center;">
          <span style="font-size:11.5px; color:var(--muted); flex-shrink:0;">بكلّم فرع:</span>
          <select id="chDest" onchange="localStorage.setItem('chat_default_dest', this.value)" style="flex:1; padding:9px; border-radius:9px; border:1px solid var(--border); background:var(--panel2); color:var(--text); font-weight:700;"></select>
        </div>
        <div id="chBody" style="flex:1; overflow-y:auto; padding:12px;"></div>
        <div style="padding:10px 13px; border-top:1px solid var(--border);">
          <div id="chPreview" style="margin-bottom:4px;"></div>
          <div style="display:flex; gap:8px;">
            <input id="chInput" placeholder="اكتب... (اكتب الكود والمنتج هيتعرف لوحده)" autocomplete="off" style="flex:1; padding:12px; border-radius:11px; border:1px solid var(--border); background:var(--panel2); color:var(--text); font-size:13.5px;">
            <button onclick="if(typeof chatSend==='function')chatSend()" style="border:none; background:var(--accent); color:#fff; border-radius:11px; padding:0 18px; font-weight:900; font-size:14px; cursor:pointer;">إرسال</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const inp = ov.querySelector('#chInput');
    inp.addEventListener('keydown', e=>{ if(e.key === 'Enter'){ e.preventDefault(); _send(inp.value); } });
    inp.addEventListener('input', _refreshSendPreview);
  }
  ov.style.display = 'flex';
  // قايمة الفروع (من نفس مصدر التحويلات) + الافتراضي المحفوظ
  try{
    const list = (typeof _trLoadBranchesFresh === 'function') ? (await _trLoadBranchesFresh() || []) : [];
    const sel = document.getElementById('chDest');
    const def = localStorage.getItem(LS_DEST) || '';
    sel.innerHTML = list.filter(b=> b !== _my()).map(b=> `<option ${b===def?'selected':''}>${_esc(b)}</option>`).join('') || '<option value="">—</option>';
  }catch(e){}
  _markSeen(); _refreshPanel();
  setTimeout(()=>{ const b = document.getElementById('chBody'); if(b) b.scrollTop = b.scrollHeight; }, 60);
}
function _closePanel(){ _panelOpen = false; const ov = document.getElementById('chatPanelOv'); if(ov) ov.style.display = 'none'; }

function _refreshPanel(){
  if(!_panelOpen) return;
  const body = document.getElementById('chBody'); if(!body) return;
  const me = _my();
  const mine = _mine();
  body.innerHTML = mine.length ? mine.map(m=>{
    const my = m.from === me;
    const avail = (!my && (m.products||[]).length) ? `<div style="margin-top:5px;"><button onclick="chatAvailTransfer(${m.ts})" style="border:none; background:var(--plus); color:#062; border-radius:9px; padding:7px 13px; font-weight:900; font-size:12px; cursor:pointer;">✅ متاح — حوّلها 🚚</button></div>` : '';
    return `<div style="display:flex; ${my?'justify-content:flex-start;':'justify-content:flex-end;'} margin-bottom:9px;">
      <div style="max-width:86%; background:${m.nudge?'rgba(245,158,11,.15)':(my?'var(--panel2)':'rgba(129,140,248,.12)')}; border:1px solid ${m.nudge?'var(--warn)':(my?'var(--border)':'#818cf8')}; border-radius:13px; padding:8px 11px;">
        <div style="font-size:9.5px; color:var(--muted); display:flex; gap:8px; justify-content:space-between;">
          <span>${my ? 'انت' : _esc(m.from)}${m.fromEmp?` · ${_esc(m.fromEmp)}`:''}</span><span>${_fmtT(m.ts)}</span>
        </div>
        <div style="font-size:13px; font-weight:600; margin-top:2px; white-space:pre-wrap;">${_esc(m.text)}</div>
        ${(m.products||[]).map(p=> _prodCardHTML(p)).join('')}
        ${avail}
      </div>
    </div>`;
  }).join('') : '<div style="text-align:center; color:var(--muted); padding:30px 0;">مفيش رسايل النهارده — ابدأ انت 👋</div>';
  body.scrollTop = body.scrollHeight;
}

function _refreshSendPreview(){
  const inp = document.getElementById('chInput'), pv = document.getElementById('chPreview');
  if(!inp || !pv) return;
  const inv = (typeof allInventory !== 'undefined') ? allInventory : [];
  const ps = chatExtractProducts(inp.value, inv);
  pv.innerHTML = ps.length ? ('<span style="font-size:10px; color:var(--muted);">هيتبعت معاها: </span>' + ps.map(p=> _prodCardHTML(p, true)).join('')) : '';
}

// ---------- API عامة ----------
window.chatOpen = _openPanel;
window.chatClose = _closePanel;
window.chatSend = function(){ const i = document.getElementById('chInput'); _send(i ? i.value : ''); };
window.chatNudge = function(){ _send('', { nudge:true }); };

// ---------- إقلاع: نستنى تسجيل الدخول ----------
const bootIv = setInterval(()=>{
  if(_my() && typeof db !== 'undefined'){ clearInterval(bootIv); _subscribe(); _refreshMini(); }
}, 1200);
setInterval(()=>{ if(_my() && chatDayKey() !== _curDay) _subscribe(); }, 60*1000);   // منتصف الليل → يوم جديد

})();
