#!/usr/bin/env node
// ============================================================
// Office 2 — v7: 📥 استلام الأيام — الصفحة الحقيقية في كروميوم مع Firestore وهمي
// الملف بيشغّل نفسه كطفل (O2_DAYS_CHILD=1) عشان الجزء غير المتزامن، وبيرجّع JSON
// ============================================================
'use strict';
const { execFileSync } = require('child_process');
if(process.env.O2_DAYS_CHILD){
  const { open, D } = require('./_helpers/office2-page');
  (async()=>{
    const out = {};
    try{
      const pg = await open({ data: {
        pos_test_settings: [
          { id:'office_gate', hash:null }, { id:'advances_cfg', closeDay:6, openDay:12 },
          { id:'day_cfg', startHour:6, ts:D(2026,10,9,10,0) },   // ⚠️ مستند في نفس المجموعة بـts بس مش تقفيلة
          { id:'dayclose_echarpe El Rehab_2026-10-09', type:'dayclose', branch:'echarpe El Rehab', date:'2026-10-09', countedCash:2500, float:500, handedCash:2000, expenses:100, advances:0, visa:800, instapay:0, systemTotal:3300, cashSales:2400, accounted:3300, overShort:0, overShortReal:0, closedBy:'هاجر', closedByName:'هاجر', closedById:'e2', staffOnShift:['هاجر','سارة'], ts:D(2026,10,9,22,10) },
          { id:'dayclose_echarpe El Rehab_2026-10-08', type:'dayclose', branch:'echarpe El Rehab', date:'2026-10-08', countedCash:1800, float:500, expenses:0, advances:0, visa:0, instapay:0, systemTotal:1280, accounted:1300, overShort:20, closedBy:'سارة', ts:D(2026,10,8,22,0) },
          { id:'dayclose_Glow_2026-10-09', type:'dayclose', branch:'Glow', date:'2026-10-09', countedCash:900, float:300, handedCash:600, expenses:0, advances:0, visa:0, instapay:200, systemTotal:850, accounted:800, overShort:-50, closedBy:'دينا', closedByName:'دينا', staffOnShift:['دينا'], ts:D(2026,10,9,21,30), received:true, receivedAt:D(2026,10,10,9,0), receivedById:'office', receivedByName:'المالك (Office)' },
          { id:'dayclose_Glow_2026-08-01', type:'dayclose', branch:'Glow', date:'2026-08-01', countedCash:500, float:0, systemTotal:500, accounted:500, overShort:0, closedBy:'دينا', ts:D(2026,8,1,22,0) }
        ]
      } });
      out.more = await pg.go('more');
      out.days = await pg.go('days', null, 400);
      out.sub = await pg.p.evaluate(()=> document.getElementById('hSub').textContent);
      await pg.call(()=> O2.days.view('done')); out.done = await pg.text();
      await pg.call(()=> O2.days.view('all')); out.all = await pg.text();
      await pg.call(()=> O2.days.branch('Glow')); out.glow = await pg.text();
      await pg.call(()=> O2.days.branch('')); await pg.call(()=> O2.days.view('pending'));
      await pg.call(()=> O2.days.receive('dayclose_echarpe El Rehab_2026-10-09'), 300); out.after = await pg.text();
      await pg.call(()=> O2.days.receive('dayclose_Glow_2026-10-09'), 100);      // اتستلم قبل كده
      await pg.call(()=> O2.days.receive('ghost'), 100);                          // مش موجود
      out.more2 = await pg.go('more');
      out.writes = await pg.writes(); out.errs = pg.errs;
      await pg.close();
    }catch(e){ out.fatal = String(e && e.stack || e); }
    process.stdout.write(JSON.stringify(out));
  })();
  return;
}
let out = null;
try{ out = JSON.parse(execFileSync(process.execPath, [__filename], { encoding:'utf8', timeout:120000, maxBuffer: 20*1024*1024, env: Object.assign({}, process.env, { O2_DAYS_CHILD:'1' }) })); }catch(e){ out = { fatal: String(e && e.message) }; }
if(out.fatal && /playwright|Cannot find module/i.test(out.fatal)){ console.log('  ⏭ Office2 days: كروميوم مش متاح —', out.fatal.slice(0,80)); }
else {
  assert(!out.fatal, 'الصفحة اشتغلت — ' + (out.fatal||''));
  assertEq((out.errs||[]).length, 0, 'مفيش أخطاء JS — ' + JSON.stringify(out.errs||[]).slice(0,300));
  const W = out.writes || []; const t = out.days || '';
  assert(/📥 استلام الأيام[\s\S]*\n2\n/.test(out.more||''), 'في «المزيد»: الشارة 2 = يومين لسه ماتحصّلوش');
  assert(/2 يوم لسه ماتحصّلش · 3,300 ج مستنية/.test(out.sub||''), 'العنوان: 2 يوم مستنيين وكاش 3,300 (2000 + 1800−500)');
  assert(/⏳ لسه 2/.test(t), 'تبويب «لسه» بعدّاد 2');
  assert(/El Rehab[\s\S]*الجمعة 10-09[\s\S]*قفل ومضى:\s*هاجر\s*· 👥 كانوا واقفين: هاجر، سارة/.test(t), 'التقفيلة: التاريخ واليوم ومين قفل ومضى ومين كان واقف');
  assert(/المسلّم كاش:\s*2,000 ج\s*· معدود 2,500 − عهدة 500 · مصاريف 100/.test(t), 'المسلّم كاش من handedCash + المعدود والعهدة والمصاريف');
  assert(/المحسوب 3,300 مقابل مبيعات السيستم 3,300/.test(t) && /✅ مظبوط/.test(t), 'المحسوب مقابل السيستم + «مظبوط» لما الفرق صفر');
  assert(/الخميس 10-08[\s\S]*المسلّم كاش:\s*1,300 ج/.test(t) && /🔺 أوفر 20/.test(t), 'يوم من غير handedCash: المسلّم = معدود − عهدة (1,300) + أوفر 20');
  assert(/✅ تم الاستلام/.test(t), 'زرار «تم الاستلام» للأيام اللي لسه');
  assert(!/دينا/.test(t) && !/📍 Glow/.test(t), 'سلبي: يوم Glow المستلم مش في «لسه»');
  assert(!/08-01/.test(out.all||''), 'سلبي: تقفيلة أقدم من النافذة (45 يوم) مش بتتحمّل');
  assert(!/day_cfg/.test(out.all||'') && /الكل · 45 يوم/.test(out.all||''), 'سلبي: مستندات pos_test_settings التانية (مش dayclose) مش ظاهرة');
  assert(/📍 Glow[\s\S]*الجمعة 10-09[\s\S]*دينا[\s\S]*المسلّم كاش:\s*600 ج/.test(out.done||'') && /⚠️ عجز 50/.test(out.done||'') && /استلم: المالك \(Office\) · 10-10 09:00/.test(out.done||'') && /اتحصّل/.test(out.done||''), 'تبويب «اتحصّلت»: Glow بالعجز ومين استلم وإمتى');
  assert(!/هاجر/.test(out.done||''), 'سلبي: اللي لسه مش في «اتحصّلت»');
  assert(/دينا/.test(out.glow||'') && !/هاجر/.test(out.glow||''), 'فلتر الفرع Glow');
  const rc = W.filter(w=> w.col==='pos_test_settings'); const mine = W.filter(w=> w.col!=='sales_shifts');   // النواة بتقفل شيفت منسي (s3) — مش بتاعنا
  assert(rc.length === 1 && rc[0].id==='dayclose_echarpe El Rehab_2026-10-09' && rc[0].op==='set' && rc[0].p.received===true && typeof rc[0].p.receivedAt==='number' && rc[0].p.receivedById==='office' && rc[0].p.receivedByName==='المالك (Office)', '⭐ «تم الاستلام» بيكتب set/merge على نفس مستند dayclose: received · receivedAt · receivedById · receivedByName (نفس POS وOffice القديم)');
  assert(Object.keys(rc[0]?rc[0].p:{}).sort().join(',')==='received,receivedAt,receivedById,receivedByName', 'سلبي: مفيش حقول زيادة بتتكتب على التقفيلة');
  assert(/⏳ لسه 1/.test(out.after||'') && !/هاجر/.test(out.after||''), 'بعد الاستلام: اليوم اختفى لايف والعدّاد 1');
  assert(mine.length === 1, 'سلبي: المستلم قبل كده والمش موجود = مفيش كتابة');
  assert(!W.some(w=> w.op==='delete'), 'سلبي: مفيش أي مسح');
  assert(/📥 استلام الأيام[\s\S]*\n1\n/.test(out.more2||''), 'الشارة في «المزيد» بقت 1');
}
