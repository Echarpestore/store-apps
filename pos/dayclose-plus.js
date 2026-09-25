// ============================================================
// 🧾 dayclose-plus.js — v737: إيصال تسليم الدرج + استلام الأيام
// ------------------------------------------------------------
// طلب المالك 24-09:
//  • الكاشير بعد التقفيل يطلع **إيصال تسليم** مرتب: كل فئة وعددها، الكاش المعدود، العهدة،
//    المسلّم، المصروفات والسلف، الفيزا والانستاباي — **من غير أي رقم مبيعات أو أوفر/عجز**
//    (العد أعمى زي ما هو) — ومكان توقيع الكاشير والمستلم.
//  • المالك بيعلّم كل يوم «✅ تم الاستلام» عشان يعرف الأيام اللي اتحصّلت واللي لسه.
//  • المستند بيتسجل عليه مين كان واقف النهاردة (من الحضور) ومين قفل.
//
// 🔒 طبقة فوق التقفيل: مبتلمسش الحساب نفسه (`dcFinish` زي ما هي). بعد ما تخلص وتحفظ،
//    بنزوّد على **نفس** مستند اليوم بـmerge: الفئات · المسلّم · الحضور. ولو التقفيل وقف
//    (بيان ناقص / إلغاء) مبنكتبش حاجة.
// ============================================================

function _dcpEsc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function _dcpN(v){ return (+(v || 0)).toFixed(2); }
function _dcpDenomList(){ return (typeof DC_DENOMS !== 'undefined' && Array.isArray(DC_DENOMS)) ? DC_DENOMS : [200, 100, 50, 20, 10, 5, 1]; }
function _dcpVal(id){ const el = document.getElementById(id); return el ? (parseFloat(el.value) || 0) : 0; }
function _dcpDayId(){ return 'dayclose_' + currentBranch + '_' + todayISO(); }
function _dcpCanReceive(){ return (typeof hasPerm === 'function') ? !!hasPerm('canViewReports') : false; }

/* الفئات من الشاشة → { "200": 3, ... } */
function dcpReadDenoms(){
  const out = {};
  _dcpDenomList().forEach(d => { const n = Math.max(0, Math.round(_dcpVal('dc_den_' + d))); out[String(d)] = n; });
  return out;
}

/* 👥 مين كان واقف النهاردة — من الحضور (sales_shifts) للفرع: اللي حضر من بداية يوم الشغل أو لسه فاتح شيفت */
async function dcpStaffToday(branch, dayMs){
  try{
    const snap = await db.collection('sales_shifts').where('branch', '==', branch).get();
    const names = [];
    snap.docs.forEach(d => {
      const s = d.data() || {};
      const t = s.clockInTs || s.clockIn || s.inTs || s.ts || 0;
      const open = !s.clockOutTs && t >= dayMs - 24 * 3600000;
      if((t >= dayMs || open) && s.employeeName && names.indexOf(s.employeeName) < 0) names.push(s.employeeName);
    });
    return names;
  }catch(e){ return []; }
}

/* 🧾 الإيصال — **مفيش** مبيعات سيستم ولا أوفر/عجز هنا بالتصميم */
function dcpReceiptHTML(r){
  r = r || {};
  const den = r.denoms || {};
  const list = _dcpDenomList();
  const rows = list.map(d => {
    const n = Number(den[String(d)]) || 0;
    return '<tr><td style="padding:3px 4px;">' + d + ' ج</td><td style="text-align:center;">× ' + n + '</td><td style="text-align:left; font-weight:700;">' + (n * d).toFixed(0) + '</td></tr>';
  }).join('');
  const pieces = list.reduce((s, d) => s + (Number(den[String(d)]) || 0), 0);
  const line = (l, v, bold) => '<div style="display:flex; justify-content:space-between; padding:2.5px 0; font-size:13px;' + (bold ? 'font-weight:900; font-size:14.5px;' : '') + '"><span>' + l + '</span><b style="direction:ltr;">' + v + '</b></div>';
  const hr = '<div style="border-top:2px dashed #000; margin:6px 0;"></div>';
  const at = r.at ? new Date(r.at) : new Date();
  return '<div style="font-family:Cairo,Tahoma,Arial,sans-serif; direction:rtl; color:#000; width:100%; padding:4px 6px;">'
    + '<div style="text-align:center; font-weight:900; font-size:17px;">🧾 إيصال تسليم الدرج</div>'
    + '<div style="text-align:center; font-size:12.5px;">' + _dcpEsc(r.branch) + ' · ' + _dcpEsc(r.date || '') + ' · ' + at.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) + '</div>'
    + '<div style="font-size:12px; margin-top:4px;">👤 الكاشير: <b>' + _dcpEsc(r.closedBy || '—') + '</b></div>'
    + (r.staff && r.staff.length ? '<div style="font-size:12px;">👥 كانوا واقفين: ' + r.staff.map(_dcpEsc).join('، ') + '</div>' : '')
    + hr
    + '<div style="font-weight:900; font-size:13.5px; margin-bottom:3px;">💵 عدّ الكاش</div>'
    + '<table style="width:100%; border-collapse:collapse; font-size:13px;">' + rows + '</table>'
    + line('عدد الورق', pieces)
    + line('إجمالي الكاش المعدود', _dcpN(r.counted), true)
    + line('− العهدة (بتفضل في الدرج)', _dcpN(r.float))
    + line('= المسلّم كاش', _dcpN(r.handed), true)
    + hr
    + line('مصروفات طلعت من الدرج', _dcpN(r.expenses))
    + (r.expNote ? '<div style="font-size:11.5px;">📝 ' + _dcpEsc(r.expNote) + '</div>' : '')
    + line('سلف طلعت من الدرج', _dcpN(r.advances))
    + line('فيزا (من الماكينة)', _dcpN(r.visa))
    + line('انستاباي', _dcpN(r.instapay))
    + ((+(r.salary || 0)) > 0 ? line('📄 خصم راتب موظفين', _dcpN(r.salary)) : '')
    + hr
    + '<div style="display:flex; gap:12px; margin-top:26px; font-size:12px;">'
    + '<div style="flex:1; border-top:1px solid #000; text-align:center; padding-top:4px;">توقيع الكاشير</div>'
    + '<div style="flex:1; border-top:1px solid #000; text-align:center; padding-top:4px;">توقيع المستلم</div></div>'
    + '</div>';
}

function dcpPrint(r){
  const html = dcpReceiptHTML(r);
  const inShell = (typeof window.posShell !== 'undefined');
  const cfg = inShell && typeof getPrinterCfg === 'function' ? getPrinterCfg() : null;
  if(inShell && cfg && cfg.invoicePrinter){
    window.posShell.printReceipt({ printer: cfg.invoicePrinter, paperWidth: (window.receiptDesignConfig && receiptDesignConfig.paperWidth) || '80', html })
      .catch(e => showToast('تعذر الطباعة: ' + e.message, 'err'));
    return;
  }
  const w = window.open('', '_blank', 'width=420,height=680');
  if(!w){ showToast('نافذة الطباعة اتمنعت', 'err'); return; }
  w.document.write('<html dir="rtl"><head><meta charset="UTF-8"><style>@page{margin:4mm;}</style></head><body>' + html + '</body></html>');
  w.document.close();
  if(typeof reclaimWindowFocus === 'function') reclaimWindowFocus(700);
  setTimeout(() => { try{ w.print(); setTimeout(() => w.close(), 600); }catch(e){} }, 400);
}
let _dcpLast = null;
function dcpPrintLast(){ if(_dcpLast) dcpPrint(_dcpLast); }

/* بعد التقفيل: نجمع بيانات الإيصال من الشاشة ونحفظها على مستند اليوم */
async function dcpAfterFinish(){
  const counted = _dcpDenomList().reduce((s, d) => s + _dcpVal('dc_den_' + d) * d, 0);
  const flt = _dcpVal('dc_float');
  const dayMs = (typeof bizDayStartMs === 'function') ? bizDayStartMs() : new Date(new Date().setHours(0, 0, 0, 0)).getTime();
  const staff = await dcpStaffToday(currentBranch, dayMs);
  const who = (typeof currentEmployee !== 'undefined' && currentEmployee) || {};
  const r = {
    branch: currentBranch, date: todayISO(), at: Date.now(),
    closedBy: who.name || '', closedById: who.id || '',
    staff, denoms: dcpReadDenoms(),
    counted, float: flt, handed: +(counted - flt).toFixed(2),
    expenses: _dcpVal('dc_expenses'), advances: _dcpVal('dc_advances'),
    expNote: ((document.getElementById('dc_expNote') || {}).value || '').trim(),
    visa: _dcpVal('dc_visa'), instapay: _dcpVal('dc_insta'), salary: _dcpVal('dc_salary')
  };
  _dcpLast = r;
  try{
    await db.collection(TEST_SETTINGS).doc(_dcpDayId()).set({
      denoms: r.denoms, handedCash: r.handed, staffOnShift: staff,
      closedById: r.closedById, closedByName: r.closedBy, receiptAt: r.at
    }, { merge: true });
  }catch(e){ console.warn('dayclose receipt save', e); }
  return r;
}

/* ✅ تم الاستلام — المالك/المدير */
async function dcpMarkReceived(docId){
  if(!_dcpCanReceive()){ showToast('الاستلام للمالك أو المدير بس', 'err'); return false; }
  const who = (typeof currentEmployee !== 'undefined' && currentEmployee) || {};
  const ref = db.collection(TEST_SETTINGS).doc(docId);
  const s = await ref.get();
  if(!s.exists){ showToast('اليوم ده مش مقفول', 'err'); return false; }
  const d = s.data() || {};
  if(d.received){ showToast('اليوم ده اتستلم قبل كده — ' + (d.receivedByName || ''), 'err'); return false; }
  await ref.set({ received: true, receivedAt: Date.now(), receivedById: who.id || '', receivedByName: who.name || '' }, { merge: true });
  return true;
}

/* 📥 شاشة استلام الأيام (من غير أي مبيعات) */
let _dcpFilter = 'pending';
async function openDaysReceive(){
  if(!_dcpCanReceive()){ showToast('للمالك أو المدير بس', 'err'); return; }
  let recs = [];
  try{
    const snap = await db.collection(TEST_SETTINGS)
      .where(firebase.firestore.FieldPath.documentId(), '>=', 'dayclose_' + currentBranch + '_')
      .where(firebase.firestore.FieldPath.documentId(), '<', 'dayclose_' + currentBranch + '_\uf8ff')
      .get();
    recs = snap.docs.map(x => Object.assign({ _id: x.id }, x.data() || {})).filter(r => r.type === 'dayclose')
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 90);
  }catch(e){ showToast('تعذر التحميل: ' + e.message, 'err'); return; }
  const old = document.getElementById('dcpOv'); if(old) old.remove();
  const ov = document.createElement('div');
  ov.id = 'dcpOv';
  ov.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,.55); z-index:950; display:flex; align-items:center; justify-content:center; padding:14px;';
  const pend = recs.filter(r => !r.received).length;
  const shown = recs.filter(r => _dcpFilter === 'all' ? true : (_dcpFilter === 'pending' ? !r.received : !!r.received));
  const rows = shown.map(r => {
    const handed = (r.handedCash != null) ? r.handedCash : ((+(r.countedCash || 0)) - (+(r.float || 0)));
    return '<div style="border:1px solid var(--border); border-radius:11px; padding:10px 12px; margin-bottom:8px; background:var(--panel);">'
      + '<div style="display:flex; justify-content:space-between; gap:8px; flex-wrap:wrap; align-items:center;">'
      + '<b>📅 ' + _dcpEsc(r.date) + '</b>'
      + (r.received ? '<span style="color:var(--plus); font-weight:900;">✅ اتحصّل · ' + _dcpEsc(r.receivedByName || '') + '</span>'
                    : '<span style="color:var(--warn); font-weight:900;">⏳ لسه ماتحصّلش</span>')
      + '</div>'
      + '<div style="font-size:12px; color:var(--muted); margin-top:4px; line-height:1.9;">قفل: <b style="color:var(--text);">' + _dcpEsc(r.closedByName || r.closedBy || '—') + '</b>'
      + (r.staffOnShift && r.staffOnShift.length ? ' · كانوا واقفين: ' + r.staffOnShift.map(_dcpEsc).join('، ') : '')
      + ' · المسلّم كاش: <b style="color:var(--text);">' + _dcpN(handed) + '</b></div>'
      + '<div style="display:flex; gap:6px; margin-top:7px;">'
      + '<button class="secondary" style="flex:1;" onclick="dcpPrintRec(\'' + _dcpEsc(r._id) + '\')">🖨️ الإيصال</button>'
      + (r.received ? '' : '<button style="flex:1; border:none; border-radius:9px; background:var(--plus); color:#062; font-weight:800; cursor:pointer;" onclick="dcpReceiveUI(\'' + _dcpEsc(r._id) + '\')">✅ تم الاستلام</button>')
      + '</div></div>';
  }).join('') || '<div style="text-align:center; color:var(--muted); padding:28px;">مفيش أيام هنا</div>';
  const tab = (k, l) => '<button onclick="_dcpFilter=\'' + k + '\'; openDaysReceive();" style="flex:1; padding:8px; border-radius:8px; border:1px solid var(--border); cursor:pointer; font-weight:800; '
    + (_dcpFilter === k ? 'background:var(--accent); color:#fff;' : 'background:var(--panel2); color:var(--text);') + '">' + l + '</button>';
  ov.innerHTML = '<div style="background:var(--bg); border-radius:16px; width:min(640px,96vw); max-height:88vh; display:flex; flex-direction:column; overflow:hidden;">'
    + '<div style="display:flex; justify-content:space-between; align-items:center; padding:13px 16px; border-bottom:1px solid var(--border);">'
    + '<b style="font-size:15px;">📥 استلام الأيام — ' + _dcpEsc(currentBranch) + '</b>'
    + '<button onclick="document.getElementById(\'dcpOv\').remove()" style="border:none; background:var(--panel2); color:var(--text); border-radius:8px; padding:6px 14px; font-weight:800; cursor:pointer;">إغلاق ✖</button></div>'
    + '<div style="display:flex; gap:6px; padding:10px 14px 0;">' + tab('pending', '⏳ لسه (' + pend + ')') + tab('done', '✅ اتحصّلت') + tab('all', 'الكل') + '</div>'
    + '<div style="padding:10px 14px; overflow-y:auto;">' + rows + '</div></div>';
  ov._recs = recs;
  document.body.appendChild(ov);
}
async function dcpReceiveUI(docId){
  const ov = document.getElementById('dcpOv');
  const r = ov && (ov._recs || []).find(x => x._id === docId);
  if(typeof askConfirm === 'function'){
    const ok = await askConfirm({ title: '✅ تم استلام يوم ' + ((r && r.date) || ''), okText: 'أيوه، استلمت',
      message: 'المسلّم كاش: ' + _dcpN(r ? (r.handedCash != null ? r.handedCash : (r.countedCash || 0) - (r.float || 0)) : 0) + ' ج.م' });
    if(!ok) return;
  }
  try{ if(await dcpMarkReceived(docId)) showToast('✅ اتسجل استلام اليوم'); }catch(e){ showToast(e.message, 'err'); }
  openDaysReceive();
}
function dcpPrintRec(docId){
  const ov = document.getElementById('dcpOv');
  const r = ov && (ov._recs || []).find(x => x._id === docId);
  if(!r) return;
  dcpPrint({ branch: r.branch, date: r.date, at: r.receiptAt || r.ts, closedBy: r.closedByName || r.closedBy, staff: r.staffOnShift || [],
    denoms: r.denoms || {}, counted: r.countedCash, float: r.float,
    handed: (r.handedCash != null ? r.handedCash : (+(r.countedCash || 0)) - (+(r.float || 0))),
    expenses: r.expenses, advances: r.advances, expNote: r.expNote, visa: r.visa, instapay: r.instapay, salary: r.salaryDeferred });
}

/* ---------------- 🔌 الربط ---------------- */
(function(){
  if(typeof window === 'undefined') return;
  const origFinish = window.dcFinish;
  if(typeof origFinish === 'function' && !origFinish._dcpGuard){
    const g = async function(){
      const res = document.getElementById('dc_result');
      if(res) res.innerHTML = '';
      const out = await origFinish.apply(this, arguments);
      // التقفيل بيرسم النتيجة **بس** لو كمّل للحفظ — لو وقف (بيان ناقص/إلغاء) مبنكتبش حاجة
      if(!res || !res.innerHTML.trim()) return out;
      const r = await dcpAfterFinish();
      res.insertAdjacentHTML('beforeend', '<button onclick="dcpPrintLast()" style="margin-top:10px; width:100%; padding:13px; border-radius:11px; border:none; background:var(--accent); color:#fff; font-weight:800; font-size:14px; cursor:pointer;">🖨️ طباعة إيصال تسليم الدرج</button>');
      // الكاشير: الإيصال بيتطبع لوحده. المدير بيدوس «احسب» كذا مرة فمبنطبعش كل مرة — الزرار موجود
      if(r && !_dcpCanReceive()) dcpPrint(r);
      return out;
    };
    g._dcpGuard = true;
    window.dcFinish = g;
  }
  const origEod = window.goToEndOfDay;
  if(typeof origEod === 'function' && !origEod._dcpGuard){
    const g2 = async function(){
      const out = await origEod.apply(this, arguments);
      try{
        const sm = document.querySelector('.dc-summary');
        if(sm && _dcpCanReceive() && !document.getElementById('dcpBtn')){
          sm.insertAdjacentHTML('beforeend', '<button id="dcpBtn" onclick="openDaysReceive()" style="margin-top:8px; margin-inline-start:6px; padding:8px 16px; border-radius:9px; border:none; background:var(--plus); color:#062; font-weight:800; font-size:12.5px; cursor:pointer;">📥 استلام الأيام</button>');
        }
      }catch(e){}
      return out;
    };
    g2._dcpGuard = true;
    window.goToEndOfDay = g2;
  }
})();

window.dcpReceiptHTML = dcpReceiptHTML;
window.dcpPrint = dcpPrint;
window.dcpPrintLast = dcpPrintLast;
window.dcpAfterFinish = dcpAfterFinish;
window.dcpMarkReceived = dcpMarkReceived;
window.openDaysReceive = openDaysReceive;
window.dcpReceiveUI = dcpReceiveUI;
window.dcpPrintRec = dcpPrintRec;
window.dcpStaffToday = dcpStaffToday;
