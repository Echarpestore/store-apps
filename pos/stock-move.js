// ============================================================
// 📦 stock-move.js — الطبقة الوحيدة اللي بتحرّك المخزون (مرحلة ١)
// ------------------------------------------------------------
// كل زيادة أو نقصان في أي مكان (فرع أو مخزن) بتعدّي من هنا، وبتسيب سطر
// في `pos_stock_moves`: الصنف · من فين · لفين · الكمية · السبب · المستند ·
// مين · إمتى. منه بيطلع «سجل حركة الصنف»، وعليه بيتبني التحويل والجرد.
//
// 🔒 الضغطة المكررة وانقطاع النت:
//    معرّف الحركة بيتولّد من **المستند نفسه** (نوع + رقم + مرحلة)، مش من
//    الوقت. والكتابة كلها في معاملة واحدة بتقرا المعرّف الأول:
//    موجود = الحركة اتعملت خلاص → مبنعملهاش تاني ومبنرجّعش خطأ.
//    يعني نفس النداء مليون مرة = نفس النتيجة بالظبط.
//
// ⚠️ المعاملات محتاجة نت. الحركة من غير نت بترفض برسالة واضحة بدل ما
//    تتكتب نص حركة — البيع نفسه بيفضل شغّال أوفلاين زي ما هو، ده للمخزون بس.
// ============================================================

const STOCK_MOVES = 'pos_stock_moves';
const WAREHOUSE = 'المخزن';          // 🏬 مكان زي الفرع في `qtyByBranch` — بس مبيبعش
const IN_TRANSIT = 'في الطريق';      // 🚚 مكان وسيط: خرج من مكان وماوصلش التاني

/* مفتاح الحركة: نفس المستند + نفس المرحلة = نفس المفتاح مهما اتكرر النداء.
   المرحلة مهمة: إذن التحويل بيخرج (out) وبيدخل (in) — حركتين مستقلتين. */
function stockMoveId(docType, docId, phase){
  return String(docType || 'doc') + '__' + String(docId || '') + '__' + String(phase || 'main');
}

/* الأماكن المسموح الكتابة فيها — غلطة في اسم المكان بتضيّع بضاعة في خانة
   مش موجودة من غير ما حد ياخد باله، فبنرفضها من الأول. */
function isStockPlace(p){
  if(!p) return false;
  if(p === WAREHOUSE || p === IN_TRANSIT) return true;
  if(typeof BRANCHES !== 'undefined' && Array.isArray(BRANCHES)) return BRANCHES.includes(p);
  return typeof p === 'string' && p.length > 0;
}

/* 📥 تطبيق حركة.
   lines: [{ itemId, name, barcode, qty, from, to }]  — qty موجبة دايمًا
   from أو to ممكن يكون null (دخول من بره / خروج لبره زي التالف).
   بيرجّع { ok, repeat, moveId, lines } */
async function stockApply(o){
  o = o || {};
  const lines = (o.lines || []).filter(l => l && Number(l.qty) > 0);
  if(!lines.length) throw new Error('مفيش أصناف في الحركة');
  if(lines.length > 200) throw new Error('الحركة أكبر من 200 صنف — قسّمها');
  if(!o.docId) throw new Error('الحركة لازم يكون ليها مستند');
  for(const l of lines){
    if(!l.itemId) throw new Error('صنف من غير معرّف');
    if(!l.from && !l.to) throw new Error('الحركة لازم يكون ليها مصدر أو وجهة');
    if(l.from && !isStockPlace(l.from)) throw new Error('مكان مش معروف: ' + l.from);
    if(l.to && !isStockPlace(l.to)) throw new Error('مكان مش معروف: ' + l.to);
  }
  const moveId = stockMoveId(o.docType, o.docId, o.phase);
  const inc = (n) => firebase.firestore.FieldValue.increment(n);

  try{
    return await db.runTransaction(async (tx) => {
      const ref = db.collection(STOCK_MOVES).doc(moveId);
      const prev = await tx.get(ref);
      // ✅ اتعملت قبل كده — مبنكررش ومبنزعقش
      if(prev.exists) return { ok: true, repeat: true, moveId, lines: (prev.data() || {}).lines || [] };

      lines.forEach(l => {
        const iref = db.collection(TEST_INVENTORY).doc(l.itemId);
        const upd = {};
        if(l.from) upd['qtyByBranch.' + l.from] = inc(-Math.abs(Number(l.qty)));
        if(l.to)   upd['qtyByBranch.' + l.to]   = inc(Math.abs(Number(l.qty)));
        /* ⚠️ update مش set: لو معرّف الصنف مش موجود (صنف اتمسح أو اتدمج) المعاملة كلها
           بتقع وماتكتبش حاجة. الـset كان هيخلق مستند شبح فيه كمية من غير اسم ولا باركود. */
        tx.update(iref, upd);
      });

      tx.set(ref, {
        docType: o.docType || 'doc', docId: String(o.docId), phase: o.phase || 'main',
        reason: o.reason || '', note: o.note || '',
        byId: (typeof currentEmployee !== 'undefined' && currentEmployee && currentEmployee.id) || '',
        byName: o.byName || ((typeof currentEmployee !== 'undefined' && currentEmployee && currentEmployee.name) || ''),
        branch: (typeof currentBranch !== 'undefined' ? currentBranch : ''),
        at: Date.now(),
        lines: lines.map(l => ({
          itemId: l.itemId, name: l.name || '', barcode: l.barcode || '',
          qty: Math.abs(Number(l.qty)), from: l.from || null, to: l.to || null
        })),
        // 🔎 عشان «سجل حركة الصنف» يستعلم بصنف واحد
        itemIds: [...new Set(lines.map(l => l.itemId))]
      });
      return { ok: true, repeat: false, moveId, lines };
    });
  }catch(e){
    // معاملة من غير نت بترمي — الرسالة لازم تقول السبب الحقيقي للكاشير
    const msg = String((e && e.message) || e);
    if(/no document to update|not-found|NOT_FOUND/i.test(msg))
      throw new Error('صنف مش موجود في المخزون — الحركة **ماتمتش**');
    if(/offline|unavailable|network|failed to get document/i.test(msg))
      throw new Error('محتاج نت عشان تتحرك البضاعة — الحركة **ماتمتش**');
    throw e;
  }
}

/* 🚫 أماكن مش فروع: مبتظهرش في قوايم الفروع ومبتتحسبش كبضاعة متاحة للبيع.
   من غير ده كان «في الطريق» هيبان كأنه فرع جديد في الإعدادات والتقارير،
   وكميته هتتحسب ضمن المتاح أونلاين. */
function isVirtualPlace(p){ return p === WAREHOUSE || p === IN_TRANSIT; }
function realBranchesOf(map){ return Object.keys(map || {}).filter(b => b && !isVirtualPlace(b)); }
function sellableTotal(map){
  return realBranchesOf(map).reduce((a, b) => a + (Number((map || {})[b]) || 0), 0);
}

/* 📜 سجل حركة صنف واحد — الأحدث الأول */
async function stockHistory(itemId, max){
  const snap = await db.collection(STOCK_MOVES)
    .where('itemIds', 'array-contains', itemId).limit(Number(max) || 50).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.at || 0) - (a.at || 0));
}

/* القاعدة الذهبية: const جوّه <script> مبيوصلش لـwindow */
window.STOCK_MOVES = STOCK_MOVES;
window.WAREHOUSE = WAREHOUSE;
window.IN_TRANSIT = IN_TRANSIT;
window.stockMoveId = stockMoveId;
window.isStockPlace = isStockPlace;
window.isVirtualPlace = isVirtualPlace;
window.realBranchesOf = realBranchesOf;
window.sellableTotal = sellableTotal;
window.stockApply = stockApply;
window.stockHistory = stockHistory;
