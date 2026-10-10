#!/usr/bin/env node
// ============================================================
// Office 2 — v7: 🔴 POS Live (m-live.js) — الصفحة الحقيقية في كروميوم مع Firestore وهمي
// الملف بيشغّل نفسه كطفل (O2_LIVE_CHILD=1) عشان الجزء غير المتزامن، وبيرجّع JSON
// ============================================================
'use strict';
const path = require('path'); const { execFileSync } = require('child_process');
if(process.env.O2_LIVE_CHILD){
  const { open, D, NOW } = require('./_helpers/office2-page');
  const MIN = 60000;
  (async()=>{
    const out = {};
    try{
      const pg = await open({ data: {
        office_pos_live: [
          { id:'echarpe El Rehab', branch:'echarpe El Rehab', employee:'سارة', online:true, updatedAtMs: NOW - 1*MIN, statsDayKey:'20261010',
            stats:{ netSales:3200, grossSales:3500, salesCount:5, returnTotal:300, returnCount:1, invoiceCount:6, paymentTotals:{ cash:2000, visa:1200 } }, countedSaleIds:{},
            lastSale:{ invoiceCode:'EL-5802', invoiceNo:'5802', total:800, itemCount:2, payments:{ visa:800 }, seller:'سارة', employee:'سارة', atMs: NOW - 25*MIN },
            cart:[ { name:'طرحة شيفون', barcode:'111', qty:2, price:400, isReturn:false }, { name:'شال صوف', barcode:'555', qty:1, price:300, isReturn:true } ], total:500,
            payments:[ { method:'visa', amount:500, status:'approved', seq:1 } ] },
          { id:'Glow', branch:'Glow', employee:'دينا', online:true, updatedAtMs: NOW - 30*MIN, statsDayKey:'20261009',
            stats:{ netSales:9999, grossSales:9999, salesCount:9, returnTotal:0, returnCount:0, invoiceCount:9, paymentTotals:{ cash:9999 } },
            lastSale:{ invoiceCode:'GL-7000', invoiceNo:'7000', total:450, payments:{ cash:450 }, employee:'دينا', atMs: D(2026,10,9,20,0) },
            cart:[], total:0, payments:[] },
          { id:'echarpe Madinaty', branch:'echarpe Madinaty', employee:'', online:true, updatedAtMs: NOW - 4*MIN, statsDayKey:'20261010',
            stats:{ netSales:-200, grossSales:0, salesCount:0, returnTotal:200, returnCount:1, invoiceCount:1, paymentTotals:{ cash:-200 } },
            lastSale:{ invoiceCode:'MD-100', invoiceNo:'100', total:-200, payments:{ cash:-200 }, employee:'منى', atMs: NOW - 5*MIN },
            cart:[], total:0, payments:[] } ]
      } });
      out.more = await pg.go('more', null, 300);
      out.live = await pg.go('live', null, 500); out.sub = await pg.p.evaluate(()=> document.getElementById('hSub').textContent);
      out.html = await pg.p.evaluate(()=> document.getElementById('screen').innerHTML);
      // 🔁 تحديث لايف: الكاشير بيكتب حالة جديدة → الشاشة بتتحدث من غير ما ندخل تاني
      await pg.call(()=> O2.u.db.collection('office_pos_live').doc('Glow').update({ updatedAtMs: Date.now(), cart:[ { name:'سكارف', barcode:'444', qty:1, price:600, isReturn:false } ], total:600, payments:[ { method:'cash', amount:600, status:'entered' } ] }), 300);
      out.live2 = await pg.text(); out.sub2 = await pg.p.evaluate(()=> document.getElementById('hSub').textContent);
      out.more2 = await pg.go('more', null, 300);
      out.writes = (await pg.writes()).filter(w=> w.col==='office_pos_live'); out.errs = pg.errs;
      await pg.close();
    }catch(e){ out.fatal = String(e && e.stack || e); }
    process.stdout.write(JSON.stringify(out));
  })();
  return;
}
let out = null;
try{ out = JSON.parse(execFileSync(process.execPath, [__filename], { encoding:'utf8', timeout:120000, maxBuffer: 20*1024*1024, env: Object.assign({}, process.env, { O2_LIVE_CHILD:'1' }) })); }catch(e){ out = { fatal: String(e && e.message) }; }
if(out.fatal && /playwright|Cannot find module/i.test(out.fatal)){ console.log('  ⏭ Office2 live: كروميوم مش متاح —', out.fatal.slice(0,80)); }
else {
  assert(!out.fatal, 'الصفحة اشتغلت — ' + (out.fatal||''));
  assertEq((out.errs||[]).length, 0, 'مفيش أخطاء JS في شاشة POS Live — ' + JSON.stringify(out.errs||[]).slice(0,300));
  assert(/🔴 POS Live/.test(out.more||''), 'الموديول ظاهر في «المزيد»');
  const t = out.live || '';
  assert(/2 فرع متصل من 3 · قراءة بس/.test(out.sub||''), 'العنوان: 2 متصل من 3 (Glow نبضته من 30 دقيقة = غير متصل)');
  assert(/كل الفروع النهاردة[\s\S]*2 LIVE[\s\S]*صافي المبيعات\s*3,000[\s\S]*فواتير البيع\s*5[\s\S]*متوسط الفاتورة\s*700/.test(t), 'الملخص: صافي 3,000 (3200 − 200) · 5 فواتير · متوسط 700 — إحصائيات Glow بتاعة امبارح مش محسوبة');
  assert(/↩️ آخر عملية مرتجع[\s\S]*echarpe Madinaty · 15:55 ·\s*-200 ج/.test(t) && !/آخر عملية بيع/.test(t), 'آخر عملية على مستوى الفروع: مرتجع مدينتي 15:55 (أحدث من بيع الرحاب 15:35) ومعلّم مرتجع');
  assert(/📍 echarpe El Rehab[\s\S]*سارة[\s\S]*● LIVE[\s\S]*صافي النهاردة\s*3,200[\s\S]*فواتير\s*5[\s\S]*متوسط الفاتورة\s*700/.test(t), 'كارت الرحاب: LIVE + صافي وفواتير ومتوسط النهاردة');
  assert(/طرق الدفع النهاردة[\s\S]*كاش\s*2,000 ج[\s\S]*فيزا\s*1,200 ج/.test(t), 'طرق الدفع النهاردة بالعربي');
  assert(/✅ آخر بيع · 800 ج[\s\S]*15:35 · #5802 · سارة[\s\S]*فيزا\s*800 ج/.test(t), 'آخر بيع في الفرع: الوقت ورقم الفاتورة والبياعة والدفع');
  assert(/🛒 السلة دلوقتي · 2 صنف[\s\S]*طرحة شيفون[\s\S]*111 · × 2[\s\S]*800 ج[\s\S]*شال صوف[\s\S]*مرتجع[\s\S]*300 ج[\s\S]*إجمالي السلة[\s\S]*500 ج[\s\S]*فيزا 1 ✅ · 500 ج/.test(t), 'السلة الحالية بأصنافها (مرتجع معلّم) والإجمالي والدفع الجاري (فيزا معتمدة)');
  assert(/↩️ مرتجعات النهاردة: 1 · 300 ج/.test(t), 'سطر مرتجعات النهاردة');
  assert(/📍 Glow[\s\S]*دينا[\s\S]*● غير متصل · آخر إشارة 15:30[\s\S]*صافي النهاردة\s*0[\s\S]*فواتير\s*0/.test(t), 'كارت Glow: غير متصل (رمادي) بآخر إشارة · إحصائيات امبارح مش ظاهرة كالنهاردة');
  assert(/<span class="pill p-gray">● غير متصل/.test(out.html||'') && /<span class="pill p-good">● LIVE/.test(out.html||''), 'الحالة بـpill رمادي للغير متصل وأخضر للمتصل');
  assert(!/9,999/.test(t), 'سلبي: أرقام Glow بتاعة امبارح مش ظاهرة في أي حتة');
  assert(/📍 Glow[\s\S]*✅ آخر بيع · 450 ج[\s\S]*الجمعة 10-09 20:00 · #7000/.test(t), 'آخر بيع من يوم تاني بيتكتب بتاريخه');
  assert(/📍 Glow[\s\S]*🛒 السلة دلوقتي — فاضية/.test(t), 'سلة فاضية');
  assert(/📍 echarpe Madinaty[\s\S]*بدون موظف[\s\S]*● LIVE[\s\S]*↩️ آخر مرتجع · -200 ج[\s\S]*منى/.test(t), 'مدينتي: بدون موظف · آخر عملية مرتجع');
  // 🔁 بعد تحديث الكاشير
  assert(/3 فرع متصل من 3/.test(out.sub2||''), 'لايف: Glow بعت نبضة → بقى متصل من غير إعادة دخول');
  assert(/📍 Glow[\s\S]*● LIVE[\s\S]*🛒 السلة دلوقتي · 1 صنف[\s\S]*سكارف[\s\S]*600 ج[\s\S]*كاش · 600 ج/.test(out.live2||''), 'لايف: سلة Glow الجديدة ظهرت');
  assert(!/● غير متصل/.test(out.live2||''), 'بعد النبضة مفيش فرع غير متصل');
  assert((out.writes||[]).length === 1 && out.writes[0].id==='Glow', 'سلبي: الشاشة قراءة بس — مفيش أي كتابة على office_pos_live غير اللي الاختبار عمله');
  assert(/🔴 POS Live/.test(out.more2||'') && !/🔴 POS Live[^\n]*\n[^\n]*\n\d+\n/.test(out.more2||''), 'مفيش شارة على POS Live في «المزيد»');
}
