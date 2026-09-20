/* ============================================================
   🔀 credit-brand-migrate.js — ترحيل الأرصدة القديمة بعد فصل البراندين
   ------------------------------------------------------------
   أداة **للمالك بس**، من كونسول POS، مرة واحدة بعد نشر الفصل:

     await creditBrandMigrate()            ← معاينة بس (جدول) — مبيغيّرش حاجة
     await creditBrandMigrate({go:true})   ← تنفيذ

   قبل الفصل كل الأرصدة كانت على حقل `credit`. بعده: `credit` = echarpe
   و`credit_glow` = Glow. فأي رصيد اتولد في فرع Glow لازم يتنقل.

   الحساب لكل عميلة عندها `credit > 0`:
     صافي Glow = مجموع حركاتها **القديمة** (من غير `brand`) اللي فرعها Glow
     المنقول   = صافي Glow − اللي اتنقل قبل كده، محصور بين صفر ورصيدها
   ⚠️ حركات من غير فرع (المالك · كارت اتفعّل من التطبيق) بتفضل echarpe
      وبتظهر في عمود «من غير فرع» عشان تراجعها — وتنقلها يدوي بـ:
        await creditBrandMove('010…', 100, 'echarpe', 'glow')
   ⚠️ إعادة التشغيل آمنة: اللي اتنقل بيتطرح، والسيرفر عنده مفتاح تكرار.
   ⚠️ النقل نفسه على السيرفر (`creditAdjust` action:'brandMove') وللمالك بس —
      المجموع قبل = المجموع بعد، مفيش فلوس بتتخلق.
   ============================================================ */

function creditBrandMigratePlan(customers, ledgerByPhone, glowBranches){
  const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
  const isGlow = b => (glowBranches || ['Glow']).indexOf(String(b || '')) >= 0;
  const out = [];
  (customers || []).forEach(function(c){
    const credit = r2(c.credit);
    if(!(credit > 0)) return;
    const rows = (ledgerByPhone && ledgerByPhone[c.phone]) || [];
    let glowNet = 0, noBranch = 0, moved = 0;
    rows.forEach(function(r){
      if(r.type === 'brand_move'){ if(r.brand !== 'glow' && r.movedTo === 'glow') moved += Math.abs(Number(r.amount) || 0); return; }
      if(r.brand) return;                                  // حركة بعد الفصل — في مكانها الصح
      /* 🔴 `branch` في الدفتر القديم = فرع **الموظف المسجّل** مش الفرع اللي الحركة
         حصلت فيه — وحساب المالك مالوش فرع، فكل حركاته فاضية. أول معاينة طلّعت
         «هيتنقل: 0» لرصيد كله من فواتير Glow. الفاتورة هي الحقيقة: لو الحركة
         مربوطة بفاتورة بناخد فرع **الفاتورة** (`invBranch` — بيتجاب من pos_test_sales). */
      const br = r.invBranch || r.branch || '';
      if(isGlow(br)) glowNet += Number(r.amount) || 0;
      else if(!br) noBranch += Number(r.amount) || 0;
    });
    const move = Math.max(0, Math.min(credit, r2(glowNet - moved)));
    out.push({ phone: c.phone, name: c.name || '', credit: credit, glowNet: r2(glowNet),
               alreadyMoved: r2(moved), move: r2(move), noBranch: r2(noBranch) });
  });
  return out;
}

if(typeof module !== 'undefined' && module.exports){ module.exports = { creditBrandMigratePlan }; }

(function(){
  'use strict';
  if(typeof window === 'undefined') return;
  window.creditBrandMigratePlan = creditBrandMigratePlan;
  const call = (payload) => firebase.app().functions('us-central1').httpsCallable('creditAdjust')(payload).then(r => r.data || {});

  window.creditBrandMove = async function(phone, amount, from, to){
    const amt = Math.round(Number(amount) * 100) / 100;
    const r = await call({ action: 'brandMove', phone: String(phone), amount: amt, from: from, to: to,
      idem: 'manual:' + phone + ':' + from + ':' + to + ':' + amt.toFixed(2) + ':' + new Date().toISOString().slice(0, 10) });
    console.log('🔀', phone, amt, from, '→', to, r);
    return r;
  };

  window.creditBrandMigrate = async function(opts){
    opts = opts || {};
    const glow = (typeof GLOW_BRANCHES !== 'undefined') ? GLOW_BRANCHES : ['Glow'];
    const snap = await db.collection(TEST_CUSTOMERS).where('credit', '>', 0).get();
    const customers = snap.docs.map(d => Object.assign({ phone: d.id }, d.data(), { phone: d.id }));
    const ledger = {}, invCache = {};
    for(const c of customers){
      const l = await db.collection('credit_ledger').where('phone', '==', String(c.phone)).get();
      ledger[c.phone] = l.docs.map(d => d.data());
      // 🧾 فرع الفاتورة لكل حركة قديمة مربوطة بفاتورة (قراءة واحدة لكل فاتورة)
      for(const r of ledger[c.phone]){
        if(r.brand || !r.invoiceCode) continue;
        const code = String(r.invoiceCode);
        if(!(code in invCache)){
          try{
            const q = await db.collection(TEST_SALES).where('invoiceCode', '==', code).limit(1).get();
            invCache[code] = q.empty ? '' : (q.docs[0].data().branch || '');
          }catch(e){ invCache[code] = ''; }
        }
        r.invBranch = invCache[code];
      }
    }
    const plan = creditBrandMigratePlan(customers, ledger, glow);
    console.table(plan);
    const todo = plan.filter(p => p.move > 0);
    console.log('عميلات عندهم رصيد: ' + plan.length + ' · هيتنقل منهم لـGlow: ' + todo.length
      + ' · إجمالي المنقول: ' + todo.reduce((s, p) => s + p.move, 0).toFixed(2) + ' ج.م');
    if(!opts.go){ console.log('👀 معاينة بس. للتنفيذ: await creditBrandMigrate({go:true})'); return plan; }
    for(const p of todo){
      try{
        const r = await call({ action: 'brandMove', phone: p.phone, amount: p.move, from: 'echarpe', to: 'glow',
          reason: 'ترحيل رصيد Glow بعد فصل البراندين', idem: 'split1:' + p.phone });
        console.log('✅', p.phone, p.move, r.repeat ? '(اتعمل قبل كده)' : '');
      }catch(e){ console.error('❌', p.phone, (e && e.message) || e); }
    }
    console.log('خلص. شغّل المعاينة تاني — المفروض عمود move كله أصفار.');
    return plan;
  };
})();
