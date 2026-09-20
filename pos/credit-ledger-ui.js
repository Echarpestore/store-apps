/* ============================================================
   📒 credit-ledger-ui.js — كشف حساب رصيد العميلة جوّه POS
   ------------------------------------------------------------
   بيتحمّل من pos/index.html بعد profiles.js وcredit-ui.js:
     <script src="credit-ledger-ui.js?v=701"></script>

   المالك كان بيشوف رقم الرصيد بس — من غير ما يعرف **جه منين وراح
   فين**. الدفتر (`credit_ledger`) موجود ومكتوب صح من السيرفر، بس
   مفيش شاشة في POS بتقراه.

   ✅ كارت «💳 الرصيد» في بروفايل العميلة + كشف كامل: كل حركة بنوعها ·
      مبلغها · الرصيد بعدها · الفرع · الكاشير · الفاتورة (بتتفتح بدوسة).
   ✅ **فحص سلامة**: الدفتر هو الحقيقة والرقم اللي على العميلة نسخة
      سريعة. لو اختلفوا، أو لو السلسلة مكسورة (رصيد بعد حركة ≠ اللي
      قبلها + المبلغ)، بيظهر تحذير أحمر — ده معناه حد لمس الرصيد من
      بره السيرفر.

   ⚠️ قراءة بس. مفيش أي كتابة هنا — الرصيد بيتغيّر من الدوال فقط.
   ⚠️ طبقة فوق: بنغلّف `renderCustProfile` ونضيف الكارت بعدها.
   ============================================================ */

/* اسم الحركة — نفس تسميات تطبيق العميلة عشان المالك والعميلة يشوفوا
   نفس الكلام لو اتكلموا في حركة. */
function creditLedgerLabel(r){
  r = r || {};
  const t = r.type, inv = r.invoiceCode ? ' · ' + r.invoiceCode : '';
  const reason = String(r.reason || '');
  if(t === 'spend')       return '🛍️ صرف على فاتورة' + inv;
  if(t === 'gift_card')   return '🎁 كارت هدية';
  if(t === 'change_kept'){
    if(/عكس/.test(reason))    return '↩️ ' + reason;
    if(/مرتجع/.test(reason))  return '↩️ مرتجع لرصيد' + inv;
    return '💵 باقي محفوظ' + inv;
  }
  if(t === 'manual')      return '✏️ ' + (reason || 'تعديل يدوي');
  return 'حركة';
}

/* ملخص + فحص سلامة. rows بأي ترتيب؛ storedBalance = customer.credit.
   بيرجّع { totalIn, totalOut, ledgerBalance, mismatch, brokenAt[] } */
function creditLedgerSummary(rows, storedBalance){
  const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
  const asc = (rows || []).slice().sort((a, b) => (a.at || 0) - (b.at || 0));
  let totalIn = 0, totalOut = 0; const brokenAt = [];
  asc.forEach(function(r, i){
    const a = r2(r.amount);
    if(a >= 0) totalIn += a; else totalOut += -a;
    // السلسلة: رصيد بعد الحركة = رصيد بعد اللي قبلها + المبلغ
    if(i > 0 && typeof asc[i-1].balanceAfter === 'number' && typeof r.balanceAfter === 'number'){
      if(Math.abs(r2(asc[i-1].balanceAfter + a) - r2(r.balanceAfter)) > 0.005) brokenAt.push(r.at || 0);
    }
  });
  const last = asc.length ? asc[asc.length - 1] : null;
  const ledgerBalance = last && typeof last.balanceAfter === 'number' ? r2(last.balanceAfter) : r2(totalIn - totalOut);
  const stored = r2(storedBalance);
  return {
    totalIn: r2(totalIn), totalOut: r2(totalOut), ledgerBalance: ledgerBalance,
    // ⚠️ من غير حركات مفيش حاجة نقارن بيها غير الصفر
    mismatch: Math.abs(ledgerBalance - stored) > 0.005,
    brokenAt: brokenAt, count: asc.length
  };
}

if(typeof module !== 'undefined' && module.exports){
  module.exports = { creditLedgerLabel, creditLedgerSummary };
}

(function(){
  'use strict';
  if(typeof window === 'undefined') return;
  window.creditLedgerLabel = creditLedgerLabel;
  window.creditLedgerSummary = creditLedgerSummary;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
  const money = n => (Number(n) || 0).toFixed(2);
  const LIMIT = 200;

  /* ⚠️ `where(phone) + orderBy(at)` محتاج index مركّب — وطلع **مش معمول**
     في المشروع (افترضت إنه موجود عشان تطبيق العميلة بيستخدم نفس الاستعلام،
     وهو كان بيفشل هناك بصمت). فلو الاستعلام المرتّب اترفض بنرجع لاستعلام
     بالرقم بس (index تلقائي) ونرتّب هنا — دفتر العميلة الواحدة صغير. */
  function sortDesc(rows){ return rows.sort((a, b) => (b.at || 0) - (a.at || 0)); }
  async function loadLedger(phone){
    const col = db.collection('credit_ledger'), ph = String(phone);
    try{
      const snap = await col.where('phone', '==', ph).orderBy('at', 'desc').limit(LIMIT).get();
      return snap.docs.map(d => d.data());
    }catch(e){
      if(!/index/i.test(String((e && e.message) || '')) && String((e && e.code) || '') !== 'failed-precondition') throw e;
      const snap = await col.where('phone', '==', ph).get();
      return sortDesc(snap.docs.map(d => d.data())).slice(0, LIMIT);
    }
  }

  // 🧾 فتح الفاتورة من رقمها (الدفتر شايل invoiceCode مش id المستند)
  window.creditLedgerOpenInvoice = async function(code){
    try{
      const s = await db.collection(TEST_SALES).where('invoiceCode', '==', String(code)).limit(1).get();
      if(s.empty){ if(typeof showToast === 'function') showToast('الفاتورة ' + code + ' مش موجودة', 'err'); return; }
      closeLedger();
      if(typeof openInvoice === 'function') openInvoice(s.docs[0].id);
    }catch(e){ if(typeof showToast === 'function') showToast('تعذر فتح الفاتورة', 'err'); }
  };

  function closeLedger(){ const o = document.getElementById('creditLedgerOverlay'); if(o) o.remove(); }
  window.creditLedgerClose = closeLedger;

  window.openCreditLedger = async function(phone, name, stored){
    closeLedger();
    const ov = document.createElement('div');
    ov.id = 'creditLedgerOverlay';
    ov.style.cssText = 'position:fixed; inset:0; z-index:9500; background:rgba(0,0,0,.72); display:flex; align-items:center; justify-content:center; padding:14px;';
    ov.innerHTML = '<div style="background:var(--panel); border:1px solid var(--border); border-radius:16px; width:100%; max-width:560px; max-height:88vh; display:flex; flex-direction:column;">'
      + '<div style="padding:14px 16px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">'
      +   '<b style="font-size:15px;">📒 كشف رصيد — ' + esc(name || phone) + '</b>'
      +   '<button onclick="creditLedgerClose()" style="border:none; background:var(--panel2); color:var(--text); border-radius:9px; padding:7px 12px; font-weight:800; cursor:pointer;">✕</button></div>'
      + '<div id="creditLedgerBody" style="padding:14px 16px; overflow:auto;"><div style="text-align:center; color:var(--muted); padding:24px;">بيتحمّل...</div></div></div>';
    ov.addEventListener('click', e => { if(e.target === ov) closeLedger(); });
    document.body.appendChild(ov);

    let rows;
    try{ rows = await loadLedger(phone); }
    catch(e){
      const b = document.getElementById('creditLedgerBody');
      if(b) b.innerHTML = '<div style="color:var(--minus); text-align:center; padding:20px;">تعذر تحميل الدفتر: ' + esc((e && e.message) || '') + '</div>';
      return;
    }
    const body = document.getElementById('creditLedgerBody'); if(!body) return;
    const sum = creditLedgerSummary(rows, stored);
    const chip = (l, v, c) => '<div style="flex:1; min-width:90px; background:var(--panel2); border-radius:10px; padding:9px 6px; text-align:center;">'
      + '<div style="color:var(--muted); font-size:10px;">' + l + '</div><div style="font-weight:900; font-size:15px; color:' + c + ';">' + v + '</div></div>';

    let warn = '';
    if(rows.length >= LIMIT)
      warn += '<div style="background:var(--panel2); border-radius:9px; padding:8px 10px; font-size:11px; color:var(--muted); margin-bottom:8px;">بيعرض آخر ' + LIMIT + ' حركة — فحص السلسلة على المعروض بس.</div>';
    if(sum.mismatch && rows.length < LIMIT)
      warn += '<div style="background:rgba(220,60,60,.14); border:1px solid var(--minus); border-radius:10px; padding:10px 12px; font-size:12px; font-weight:800; color:var(--minus); margin-bottom:8px;">'
        + '🚨 الرصيد المسجّل على العميلة (' + money(stored) + ') مختلف عن الدفتر (' + money(sum.ledgerBalance) + '). الدفتر هو الصح — حد عدّل الرصيد من بره السيستم.</div>';
    if(sum.brokenAt.length)
      warn += '<div style="background:rgba(220,60,60,.14); border:1px solid var(--minus); border-radius:10px; padding:10px 12px; font-size:12px; font-weight:800; color:var(--minus); margin-bottom:8px;">'
        + '🚨 السلسلة مكسورة في ' + sum.brokenAt.length + ' حركة (متعلّم عليها ⚠️) — الرصيد بعدها مش بيساوي اللي قبلها + المبلغ.</div>';

    const broken = {}; sum.brokenAt.forEach(t => broken[t] = 1);
    const list = rows.map(function(r){
      const a = Number(r.amount) || 0, neg = a < 0;
      const d = r.at ? new Date(r.at).toLocaleString('ar-EG', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
      const meta = [d, r.branch ? '📍 ' + esc(r.branch) : '', r.byName ? '👤 ' + esc(r.byName) : (r.by === 'app' ? '📱 من التطبيق' : '')].filter(Boolean).join(' · ');
      const inv = r.invoiceCode
        ? '<button onclick="creditLedgerOpenInvoice(\'' + esc(String(r.invoiceCode).replace(/[^\w\-]/g, '')) + '\')" style="margin-top:4px; border:1px solid var(--border); background:var(--panel2); color:var(--accent); border-radius:7px; padding:3px 9px; font-size:10.5px; font-weight:800; cursor:pointer;">🧾 افتح الفاتورة</button>' : '';
      return '<div style="display:flex; justify-content:space-between; gap:10px; padding:10px 0; border-bottom:1px solid var(--border);">'
        + '<div style="min-width:0;"><div style="font-weight:800; font-size:12.5px;">' + (broken[r.at] ? '⚠️ ' : '') + esc(creditLedgerLabel(r)) + '</div>'
        +   '<div style="color:var(--muted); font-size:10.5px; margin-top:2px;">' + meta + '</div>' + inv + '</div>'
        + '<div style="text-align:left; flex-shrink:0;"><div style="font-weight:900; font-size:15px; color:' + (neg ? 'var(--minus)' : 'var(--plus)') + ';">' + (neg ? '−' : '+') + money(Math.abs(a)) + '</div>'
        +   '<div style="color:var(--muted); font-size:10px;">الرصيد بعدها ' + (typeof r.balanceAfter === 'number' ? money(r.balanceAfter) : '—') + '</div></div></div>';
    }).join('') || '<div style="color:var(--muted); text-align:center; padding:18px; font-size:12px;">مفيش حركات رصيد للعميلة دي</div>';

    body.innerHTML = '<div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px;">'
      + chip('الرصيد دلوقتي', money(sum.ledgerBalance) + ' ج.م', 'var(--text)')
      + chip('دخل', '+' + money(sum.totalIn), 'var(--plus)')
      + chip('اتصرف', '−' + money(sum.totalOut), 'var(--minus)')
      + chip('حركات', sum.count, 'var(--accent)') + '</div>' + warn + list;
  };

  /* 💳 الكارت في بروفايل العميلة — بيتضاف بعد كل رسم */
  const _origRender = window.renderCustProfile;
  if(typeof _origRender !== 'function'){ console.warn('[credit-ledger] renderCustProfile مش موجودة'); return; }
  window.renderCustProfile = function(){
    const out = _origRender.apply(this, arguments);
    try{
      const wrap = document.getElementById('customerProfileWrap');
      const c = (typeof _cp !== 'undefined' && _cp && _cp.c) ? _cp.c : null;
      // ⚠️ الرقم من `_cp.phone` (مفتاح المستند) — مستندات قديمة مفيهاش حقل phone
      const phone = (typeof _cp !== 'undefined' && _cp && _cp.phone) || (c && c.phone) || '';
      if(!wrap || !c || !phone) return out;
      const old = document.getElementById('cpCreditCard'); if(old) old.remove();
      const bal = Number(c.credit) || 0;
      const card = document.createElement('div');
      card.id = 'cpCreditCard';
      card.style.cssText = 'background:var(--panel); border:1px solid ' + (bal > 0 ? 'var(--accent)' : 'var(--border)') + '; border-radius:12px; padding:11px 14px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; cursor:pointer;';
      card.innerHTML = '<div><div style="color:var(--muted); font-size:10.5px;">💳 رصيد العميلة</div>'
        + '<div style="font-weight:900; font-size:18px;">' + money(bal) + ' <span style="font-size:11px;">ج.م</span></div></div>'
        + '<div style="background:var(--panel2); border-radius:9px; padding:8px 12px; font-weight:800; font-size:12px;">📒 الكشف الكامل ◀</div>';
      card.onclick = function(){ window.openCreditLedger(phone, c.name, bal); };
      wrap.insertBefore(card, wrap.firstChild);
    }catch(e){ console.warn('[credit-ledger] card', e); }
    return out;
  };
})();
