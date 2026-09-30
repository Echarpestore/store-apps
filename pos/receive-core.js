/* ============================================================
   📥 receive-core.js — منطق «استلام/إخراج المنتجات» الخالص (v753)
   ------------------------------------------------------------
   مشترك بين POS (سجل آخر الاستلامات) وتطبيق Sales (شاشة الاستلام على
   الموبايل). من غير DOM ولا Firestore — عشان يتختبر بأرقام.
   ⚠️ نفس شكل حركة POS بالظبط (`pos_test_stock_log`): الاستلام `receipt`،
      والإخراج `adjustment` — فأي تقرير شغال على حركات POS بيشوف حركات
      Sales من غير أي تغيير. الفرق الوحيد: `source:'sales'`.
   ============================================================ */
(function(){
  'use strict';

  // نفس نطاق POS: صنف مدموج أو مخصّص لفروع تانية = مش ظاهر
  function recvVisible(it, branch){
    if(!it || it.status === 'merged') return false;
    var br = it.branches;
    if(Array.isArray(br) && br.length && br.indexOf(branch) < 0) return false;
    return true;
  }
  function recvBranchQty(it, branch){
    if(it && it.qtyByBranch && typeof it.qtyByBranch === 'object') return Number(it.qtyByBranch[branch]) || 0;
    return 0;
  }
  // نفس ترتيب أفضلية POS (receiveCanonicalItems): مربوط بالفرع ← مش مخفي ← الرصيد ← الأحدث
  function recvScore(x, branch){
    var explicit = Array.isArray(x.branches) && x.branches.indexOf(branch) >= 0 ? 1000 : 0;
    var active = (x.status !== 'hidden' && x.status !== 'import_excluded') ? 100 : 0;
    var qty = recvBranchQty(x, branch);
    var updated = Number(x.updatedAtMs || x.importedAtMs || 0) / 1e13;
    return explicit + active + Math.min(Math.max(qty, -9999), 9999) / 10000 + updated;
  }
  /* 🔎 من نتيجة استعلام الباركود (ممكن أكتر من مستند لنفس الكود) → مستند واحد */
  function recvPickProduct(docs, branch, code){
    var c = String(code == null ? '' : code).trim();
    if(!c) return null;
    var best = null;
    (docs || []).forEach(function(it){
      if(!it || String(it.barcode || '').trim() !== c) return;
      if(!recvVisible(it, branch)) return;
      if(!best || recvScore(it, branch) > recvScore(best, branch)) best = it;
    });
    return best;
  }

  /* 🏷️ حالة الصنف بعد الحركة — نفس POS: صفر/سالب = نافد، ورجع موجب من نافد = active */
  function recvStatusAfter(curQty, delta, curStatus){
    var n = (Number(curQty) || 0) + (Number(delta) || 0);
    if(n <= 0) return 'outofstock';
    if(curStatus === 'outofstock') return 'active';
    return null;   // مفيش تغيير
  }

  /* ✅ فحص قبل التأكيد: سطور صفر بتتشال، ورصيد سالب مرفوض لو الإعداد مقفول
     (نفس inventory_cfg.allowNegativeStock بتاع POS). بيرجّع { ok, rows, error, negatives } */
  function recvValidate(cart, allowNegative){
    var rows = (cart || []).filter(function(r){ return r && r.id && Math.round(Number(r.qty) || 0) !== 0; })
      .map(function(r){ return Object.assign({}, r, { qty: Math.round(Number(r.qty)) }); });
    if(!rows.length) return { ok:false, rows:[], error:'القايمة فاضية أو كل الكميات صفر', negatives:[] };
    // نفس الصنف ممكن يتكرر في أكتر من سطر — نجمع قبل ما نقارن بالرصيد
    var sum = {}, cur = {}, name = {};
    rows.forEach(function(r){ sum[r.id] = (sum[r.id] || 0) + r.qty; cur[r.id] = Number(r.currentQty) || 0; name[r.id] = r.name || 'صنف'; });
    var negatives = [];
    for(var id in sum){
      var after = cur[id] + sum[id];
      if(after < 0){
        if(!allowNegative) return { ok:false, rows:rows, error:'«' + name[id] + '» مينفعش تخرج الكمية دي (الرصيد ' + cur[id] + ')', negatives:[] };
        negatives.push({ id:id, name:name[id], after:after });
      }
    }
    return { ok:true, rows:rows, error:'', negatives:negatives };
  }

  /* 📒 سطر سجل الحركة — نفس حقول logStockMovement في POS + source */
  function recvLogRow(r, branch, employeeName, after){
    var inbound = Number(r.qty) > 0;
    var reason = inbound ? 'استلام بضاعة (توريد)' : 'خصم بضاعة (تالف/مرتجع للمورد)';
    if(after != null && after < 0) reason += ' — ⚠️ الرصيد نزل سالب (' + after + ') · الجرد لسه ماتعملش';
    var row = {
      productId: String(r.id), productName: String(r.name || ''), delta: Number(r.qty),
      type: inbound ? 'receipt' : 'adjustment', reason: reason + ' · من تطبيق Sales',
      branch: String(branch || ''), employeeName: String(employeeName || ''),
      source: 'sales'
    };
    if(r.barcode) row.productBarcode = String(r.barcode);
    if(Number(r.receivedAtMs) > 0) row.receivedAtMs = Number(r.receivedAtMs);
    if(r.entryId) row.receiveEntryId = String(r.entryId);
    return row;
  }

  /* 📜 مستندات السجل → صفوف العرض (POS وSales نفس الشكل)
     الاستلام كله + الإخراج اللي اتعمل من شاشة استلام (عليه receiveEntryId) */
  function recvLogRowsFromDocs(docs, branch, limitN){
    var out = [], seen = {};
    (docs || []).forEach(function(x){
      if(!x || x.branch !== branch) return;
      var isRecv = x.type === 'receipt';
      var isOut = x.type === 'adjustment' && !!x.receiveEntryId;
      if(!isRecv && !isOut) return;
      var ts = Number(x.receivedAtMs) || Number(x.createdAtMs) || 0;
      var id = String(x.receiveEntryId || x._id || (x.productId + '_' + ts));
      if(seen[id]) return; seen[id] = 1;
      out.push({ id:id, barcode:x.productBarcode || '', name:x.productName || 'صنف',
        qtyChange:Number(x.delta) || 0, ts:ts, employeeName:x.employeeName || '',
        source:x.source === 'sales' ? 'sales' : 'pos' });
    });
    out.sort(function(a, b){ return (b.ts || 0) - (a.ts || 0); });
    return out.slice(0, limitN || 20);
  }

  function recvNewEntry(product, branch, qty, nowMs){
    var now = Number(nowMs) || Date.now();
    return { entryId:'recv_' + now + '_' + Math.random().toString(36).slice(2, 8),
      id:product.id, name:product.name || 'صنف', barcode:product.barcode || '',
      currentQty:recvBranchQty(product, branch), status:product.status || '',
      qty:(Number(qty) || 1), receivedAtMs:now };
  }

  var api = { recvVisible:recvVisible, recvBranchQty:recvBranchQty, recvPickProduct:recvPickProduct,
    recvStatusAfter:recvStatusAfter, recvValidate:recvValidate, recvLogRow:recvLogRow,
    recvLogRowsFromDocs:recvLogRowsFromDocs, recvNewEntry:recvNewEntry };
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
  if(typeof window !== 'undefined') window.RecvCore = api;
})();
