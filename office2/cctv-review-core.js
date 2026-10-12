/* ============================================================
   📼 مراجعة اليوم — المنطق الخالص (من غير DOM ولا Firestore)
   ------------------------------------------------------------
   بياخد مستندات pos_cctv_invoice_timelines (سلة كل فاتورة بالوقت) وصفوف
   pos_activity_log، ويطلّع:
     · buildEvents  : قايمة أحداث اليوم مرتبة (إضافة/حذف صنف، خصم، فتح درج…)
     · basketAt     : شكل السلة بالظبط عند أي لحظة في الفيديو
     · nearestIndex : آخر حدث قبل لحظة معينة (للتظليل والتنقل)
   الوقت كله بساعة كمبيوتر الفرع (نفس ساعة التسجيل) فالتزامن مباشر.
   الملف ده بيتحمّل في المتصفح وبيتجرّب في node (tests/test-cctv-review-core.js).
   ============================================================ */
(function(root){
'use strict';

var KIND = {
  item_added:    { ar:'إضافة صنف',   tone:'add' },
  item_removed:  { ar:'حذف صنف',     tone:'del' },
  qty_increased: { ar:'زيادة كمية',  tone:'add' },
  qty_decreased: { ar:'تقليل كمية',  tone:'del' },
  cart_edited:   { ar:'تعديل السلة', tone:'edit' },
  invoice_cart:  { ar:'سلة الفاتورة', tone:'edit' },
  payment:       { ar:'بدء الدفع',   tone:'pay' },
  saving:        { ar:'بدء الحفظ',   tone:'pay' },
  sale_saved:    { ar:'حفظ الفاتورة', tone:'sale' }
};
/* أحداث الـPOS المهمة للمراجعة. أي نوع مش هنا بيتساب (ضوضاء تشغيلية). */
// Item removals: the POS writes every removal / quantity cut to pos_activity_log with these types
// (name, value, seconds the item sat in the cart). This is the primary source for removals - it
// exists even when the basket steps were not saved or the cart was abandoned without a sale.
var REMOVAL = {
  item_removed:      { ar:'حذف قطعة من السلة' },
  item_removed_late: { ar:'حذف قطعة بعد ما فضلت في السلة' },
  item_qty_reduced:  { ar:'تقليل كمية قطعة' }
};
var ACTIVITY = {
  cart_abandoned:        { ar:'سلة اتسابت من غير بيع', tone:'alert' },
  cart_item_edited:      { ar:'تعديل صنف في السلة',    tone:'edit' },
  manual_discount:       { ar:'خصم يدوي',              tone:'alert' },
  manual_redeem:         { ar:'استبدال نقط يدوي',      tone:'alert' },
  manual_drawer_open:    { ar:'فتح الدرج يدوي',        tone:'alert' },
  same_day_return:       { ar:'مرتجع نفس اليوم',       tone:'alert' },
  same_day_reversal:     { ar:'عكس فاتورة',            tone:'alert' },
  card_payments_cleared: { ar:'مسح مدفوعات الكارت',    tone:'alert' },
  paymob_cancelled:      { ar:'إلغاء دفع كارت',        tone:'edit' },
  customer_points_edit:  { ar:'تعديل نقط عميل',        tone:'alert' },
  gift_card_return_blocked: { ar:'محاولة مرتجع كارت هدية', tone:'alert' }
};

function num(v){ var n = Number(v); return isFinite(n) ? n : 0; }
/* صف السلة بيتخزن [key, qty, price, isReturn] أو {'0':..,'1':..} (Firestore بيرفض مصفوفة جوّه مصفوفة). */
function row(r){
  if(Array.isArray(r)) return { key:String(r[0]), qty:num(r[1]), price:num(r[2]), ret:!!r[3] };
  r = r || {}; return { key:String(r['0'] != null ? r['0'] : (r.key||'')), qty:num(r['1'] != null ? r['1'] : r.qty), price:num(r['2'] != null ? r['2'] : r.price), ret:!!(r['3'] != null ? r['3'] : r.isReturn) };
}
function cartRows(cart, catalog){
  catalog = catalog || {};
  return (Array.isArray(cart) ? cart : []).map(function(r){ var x = row(r); var c = catalog[x.key] || {}; x.name = String(c.name || c.barcode || x.key.replace(/#\d+$/, '') || 'صنف'); x.barcode = String(c.barcode||''); return x; });
}
function cartTotal(rows){ return +rows.reduce(function(n, r){ return n + r.price * r.qty; }, 0).toFixed(2); }

/* الفرق بين سلتين: مين اتضاف، مين اتشال، مين كميته اتغيرت. */
function diffCarts(prev, next){
  var p = {}, n = {}, out = { added:[], removed:[], qty:[] };
  prev.forEach(function(r){ p[r.key] = r; }); next.forEach(function(r){ n[r.key] = r; });
  next.forEach(function(r){ if(!p[r.key]) out.added.push(r); else if(p[r.key].qty !== r.qty) out.qty.push({ name:r.name, from:p[r.key].qty, to:r.qty, price:r.price }); });
  prev.forEach(function(r){ if(!n[r.key]) out.removed.push(r); });
  return out;
}
function describe(kind, d){
  var parts = [];
  d.added.forEach(function(r){ parts.push('+ ' + r.name + (r.qty !== 1 ? ' ×' + r.qty : '')); });
  d.removed.forEach(function(r){ parts.push('− ' + r.name + (r.qty !== 1 ? ' ×' + r.qty : '')); });
  d.qty.forEach(function(q){ parts.push(q.name + ' ' + q.from + '←' + q.to); });
  return parts.join(' · ');
}
/* قيمة اللي اتشال من السلة في الحدث ده (حذف صنف أو تقليل كمية) — ده اللي المالك عايز يراجعه. */
function removedValue(d){
  var v = 0;
  d.removed.forEach(function(r){ v += r.price * r.qty; });
  d.qty.forEach(function(q){ if(q.to < q.from) v += q.price * (q.from - q.to); });
  return +v.toFixed(2);
}

function sessionsOf(timelines){
  return (Array.isArray(timelines) ? timelines : []).filter(function(t){ return t && Array.isArray(t.events) && t.events.length; }).map(function(t){
    var ev = t.events.slice().sort(function(a, b){ return num(a.atMs) - num(b.atMs) || num(a.seq) - num(b.seq); });
    return { code:String(t.invoiceCode||''), no:String(t.invoiceNo||''), saleId:String(t.saleId||''), sid:String(t.sid||''), branch:String(t.branch||''), catalog:t.catalog||{},
             startMs: num(t.startedAtMs) || num(ev[0].atMs), endMs: num(t.endedAtMs) || num(ev[ev.length-1].atMs), events:ev };
  }).sort(function(a, b){ return a.startMs - b.startMs; });
}

function buildEvents(timelines, activity){
  var out = [];
  sessionsOf(timelines).forEach(function(s){
    var prev = [];
    s.events.forEach(function(e){
      var rows = cartRows(e.cart, s.catalog), kind = String(e.kind||'cart_edited'), k = KIND[kind] || { ar:kind, tone:'edit' };
      var d = diffCarts(prev, rows), detail = describe(kind, d), lost = removedValue(d);
      if(kind === 'sale_saved') detail = rows.length + ' صنف';
      out.push({ atMs:num(e.atMs), kind:kind, label:k.ar, tone: lost > 0 ? 'del' : k.tone, detail:detail, removedValue:lost,
                 total: e.total != null ? num(e.total) : cartTotal(rows), invoiceNo:s.no, invoiceCode:s.code, sid:s.sid, source:'cart' });
      prev = rows;
    });
  });
  (Array.isArray(activity) ? activity : []).forEach(function(a){
    var removal = REMOVAL[String(a && a.type)];
    if(removal){
      var at = num(a.ts), val = a.value != null ? Math.abs(num(a.value)) : Math.abs(num(a.price) * (num(a.qty) || 1)), late = String(a.type) === 'item_removed_late';
      var wait = num(a.inCartSec), waitTxt = wait >= 60 ? ' · بعد ' + Math.round(wait / 60) + ' د في السلة' : (wait > 0 ? ' · بعد ' + wait + ' ث في السلة' : '');
      // The same removal may also be in the basket steps - count it once, but keep its extra data.
      var twin = null;
      for(var i = 0; i < out.length; i++){ var c = out[i]; if(c.source === 'cart' && c.removedValue > 0 && Math.abs(c.atMs - at) <= 3000 && (!a.sid || !c.sid || String(a.sid) === c.sid)){ twin = c; break; } }
      if(twin){ if(late){ twin.label = removal.ar; twin.late = true; } if(waitTxt && twin.detail.indexOf('في السلة') < 0) twin.detail += waitTxt; return; }
      out.push({ atMs:at, kind:String(a.type), label:removal.ar, tone:'del', late:late,
                 detail:'− ' + String(a.name || a.barcode || 'صنف').slice(0, 80) + ((num(a.qty) || 1) !== 1 ? ' ×' + num(a.qty) : '') + waitTxt + (a.employeeName ? ' · ' + String(a.employeeName).slice(0, 40) : ''),
                 removedValue:+val.toFixed(2), total:null, invoiceNo:String(a.invoiceNo||''), invoiceCode:String(a.invoiceCode||''), sid:String(a.sid||''), source:'activity' });
      return;
    }
    var t = ACTIVITY[String(a && a.type)]; if(!t) return;
    var bits = [];
    if(a.amount != null) bits.push(num(a.amount) + ' ج'); if(a.discount != null) bits.push('خصم ' + num(a.discount));
    if(a.reason) bits.push(String(a.reason).slice(0, 80)); if(a.itemName || a.name) bits.push(String(a.itemName || a.name).slice(0, 80));
    if(a.employeeName) bits.push(String(a.employeeName).slice(0, 40));
    out.push({ atMs:num(a.ts), kind:String(a.type), label:t.ar, tone:t.tone, detail:bits.join(' · '), removedValue:0, total:null,
               invoiceNo:String(a.invoiceNo||''), invoiceCode:String(a.invoiceCode||''), sid:String(a.sid||''), source:'activity' });
  });
  // Activity rows are written while the cart is open, before the invoice has a number.
  // Their sid is the cart session, so the saved invoice of that session is theirs.
  var bySid = {};
  sessionsOf(timelines).forEach(function(x){ if(x.sid) bySid[x.sid] = x; });
  out.forEach(function(e){ if(e.source !== 'activity' || e.invoiceCode || !e.sid) return; var x = bySid[e.sid]; if(x){ e.invoiceCode = x.code; if(!e.invoiceNo) e.invoiceNo = x.no; } });
  return out.filter(function(e){ return e.atMs > 0; }).sort(function(a, b){ return a.atMs - b.atMs; });
}

/* السلة عند لحظة ms: آخر حدث في الجلسة اللي اللحظة جوّاها. برّه أي جلسة = مفيش سلة مفتوحة. */
function basketAt(timelines, ms){
  var ss = sessionsOf(timelines);
  for(var i = 0; i < ss.length; i++){
    var s = ss[i]; if(ms < s.startMs || ms > s.endMs) continue;
    var cur = null;
    for(var j = 0; j < s.events.length; j++){ if(num(s.events[j].atMs) <= ms) cur = s.events[j]; else break; }
    if(!cur) continue;
    var rows = cartRows(cur.cart, s.catalog);
    return { invoiceNo:s.no, invoiceCode:s.code, rows:rows, total: cur.total != null ? num(cur.total) : cartTotal(rows), kind:String(cur.kind||''), atMs:num(cur.atMs), saved: String(cur.kind) === 'sale_saved' };
  }
  return null;
}
/* فهرس آخر حدث وقته <= ms (‑1 لو مفيش). بحث ثنائي — القايمة مرتبة. */
function nearestIndex(events, ms){
  var lo = 0, hi = events.length - 1, ans = -1;
  while(lo <= hi){ var mid = (lo + hi) >> 1; if(events[mid].atMs <= ms){ ans = mid; lo = mid + 1; } else hi = mid - 1; }
  return ans;
}
/* حدود شريط الوقت: من قبل أول حدث لبعد آخر حدث، ومقفول على اليوم نفسه. */
function span(events, dayStartMs, dayEndMs, padMs){
  padMs = padMs == null ? 5 * 60000 : padMs;
  if(!events.length) return { start:dayStartMs, end:dayEndMs };
  return { start: Math.max(dayStartMs, events[0].atMs - padMs), end: Math.min(dayEndMs, events[events.length-1].atMs + padMs) };
}
function summary(events){
  var s = { total:events.length, removed:0, removedValue:0, alerts:0, sales:0 };
  events.forEach(function(e){ if(e.removedValue > 0){ s.removed++; s.removedValue += e.removedValue; } if(e.tone === 'alert') s.alerts++; if(e.kind === 'sale_saved') s.sales++; });
  s.removedValue = +s.removedValue.toFixed(2); return s;
}

/* فاتورة مالهاش تايملاين محفوظ: نبني واحد بسيط من أصناف الفاتورة نفسها.
   بيعرض السلة النهائية في وقت الفاتورة، من غير خطوات الإضافة والحذف (synthetic). */
function fromSale(sale, endMs){
  sale = sale || {}; endMs = num(endMs); if(!endMs) return null;
  var start = num(sale.firstItemAt) || Math.max(1, endMs - 30000), catalog = {}, seen = {}, packed = [];
  (Array.isArray(sale.items) ? sale.items : []).forEach(function(item){
    if(!item || item.isRedemption) return;
    var base = String(item.id || item.barcode || item.name || 'item'), n = (seen[base]||0) + 1, key = base + '#' + n; seen[base] = n;
    catalog[key] = { name:String(item.name || item.code || 'صنف'), barcode:String(item.barcode||'') };
    packed.push([key, num(item.qty), num(item.price), item.isReturn ? 1 : 0]);
  });
  if(!packed.length) return null;
  var total = sale.total != null ? num(sale.total) : null;
  return { synthetic:true, invoiceCode:String(sale.invoiceCode||sale.id||''), invoiceNo:String(sale.invoiceNo||''), saleId:String(sale.id||''), sid:String(sale.cartSid||sale.sid||''), branch:String(sale.branch||''),
           startedAtMs:start, endedAtMs:endMs, catalog:catalog,
           events:[ { seq:1, atMs:start, kind:'invoice_cart', cart:packed, total:total }, { seq:2, atMs:endMs, kind:'sale_saved', cart:packed, total:total } ] };
}

var api = { fromSale:fromSale, REMOVAL:REMOVAL, KIND:KIND, ACTIVITY:ACTIVITY, buildEvents:buildEvents, basketAt:basketAt, nearestIndex:nearestIndex, span:span, summary:summary, cartRows:cartRows, diffCarts:diffCarts };
if(typeof module !== 'undefined' && module.exports) module.exports = api;
if(root) root.O2CctvReview = api;
})(typeof window !== 'undefined' ? window : null);
