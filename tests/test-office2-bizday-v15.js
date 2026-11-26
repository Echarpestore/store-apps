#!/usr/bin/env node
// Office 2 v15 — المبيعات مطابقة للكاشير: يوم الشغل (6ص) · وقت الفاتورة = وقت الجهاز · الفاتورة متتعدش في يومين · رسم مجمّع
'use strict';
const fs = require('fs'), path = require('path'); const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0; const ok = (c, m)=>{ if(c){ pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } };
const RUN = `
const { open, NOW } = require(${JSON.stringify(path.join(ROOT,'tests','_helpers','office2-page.js'))});
const H = 3600000, DAY = 24*H;
// NOW = السبت 10-10-2026 16:00 القاهرة → منتصف الليل = NOW - 16h
const MID = NOW - 16*H;
const sale = (id, ms, total, extra)=> Object.assign({ id, branch:'echarpe El Rehab', invoiceNo:id, createdAtMs:ms, total, payments:{ cash: total }, items:[{ name:'طرحة', barcode:'1', qty:1, price: total }], employee:'سارة' }, extra||{});
(async()=>{ const out = {};
  const pg = await open({ data:{ pos_test_sales:[
    sale('A', MID + 1.5*H, 700),                 // 01:30 بعد نص الليل = لسه يوم شغل امبارح (9-10)
    sale('B', MID + 10*H, 500),                  // 10:00 النهاردة
    sale('C', MID + 12*H, 300),                  // 12:00 النهاردة
    sale('Y', MID - 6*H, 900),                   // امبارح 18:00
    sale('R', MID + 11*H, 200, { reversed:true }),
    sale('P', MID + 13*H, 400, { payments:{ cash:350, points:50 } })   // فاتورة قديمة: 50 نقط اتسجلت كدفع = خصم
  ], pos_test_settings:[ { id:'office_gate', hash:null }, { id:'day_cfg', startHour:6 } ] } });
  out.today = await pg.go('today', null, 500);
  out.branchToday = await pg.go('branch', 'echarpe El Rehab', 500);
  await pg.call(()=> O2.day(-1), 900); out.branchY = await pg.text();
  out.unit = await pg.p.evaluate((MID)=>{ const u = O2.u, H = 3600000; const ts = (ms)=>({ toMillis:()=> ms });
    return {
      offline: u.saleMs({ createdAtMs: MID + 20*H, createdAt: ts(MID + 30*H) }) === MID + 20*H,      // اتباعت 8م واترفعت تاني يوم 6ص → وقت البيع
      badClock: u.saleMs({ createdAtMs: MID - 400*24*H, createdAt: ts(MID + 10*H) }) === MID + 10*H,  // ساعة الجهاز بايظة → وقت السيرفر
      serverOnly: u.saleMs({ createdAt: ts(MID + 9*H) }) === MID + 9*H,
      keyAfterMidnight: u.bizKey(MID + 1.5*H), keyMorning: u.bizKey(MID + 10*H),
      start: u.bizDayStart(MID + 16*H) === MID + 6*H, startNight: u.bizDayStart(MID + 2*H) === MID - 18*H,
      net: u.saleNet({ total:400, payments:{ cash:350, points:50 } }), hour: u.bizHour()
    }; }, MID);
  // فاتورة وقتها الفعلي برّه اليوم بس الاستعلام رجّعها (وقت السيرفر في اليوم ده) → متتعدش
  out.loadDay = await pg.p.evaluate(async (MID)=>{ const u = O2.u; const rows = await u.loadDay('2026-10-08'); return rows.map(r=> r.id); }, MID);
  // الرسم المجمّع
  out.coalesce = await pg.p.evaluate(async ()=>{ const el = document.getElementById('screen'); let n = 0; const mo = new MutationObserver(()=>{ n++; }); mo.observe(el, { childList:true });
    for(let i = 0; i < 30; i++) O2.u.render(); await new Promise(r=> setTimeout(r, 400)); mo.disconnect(); return n; });
  out.errs = pg.errs; await pg.close(); console.log(JSON.stringify(out));
})().catch(e=>{ console.error(e); process.exit(1); });`;
const tmp = path.join(require('os').tmpdir(), 'o2-biz-' + Date.now() + '.js'); fs.writeFileSync(tmp, RUN);
let out; try{ out = JSON.parse(execFileSync(process.execPath, [tmp], { cwd: ROOT, encoding:'utf8', timeout: 120000 }).trim().split('\n').pop()); } finally { try{ fs.unlinkSync(tmp); }catch(e){} }
ok(/مبيعات النهاردة ·\s*1,150/.test(out.today), 'النهاردة = 500 + 300 + 350 = 1,150 (فاتورة 01:30 مش من النهاردة · الملغية لأ · النقط خصم)');
ok(!/1,850|1,900|2,100/.test(out.today.split('مين موجود')[0]), 'سلبي: فاتورة بعد نص الليل (700) مش محسوبة على النهاردة');
ok(/يوم الشغل من 06:00 لـ 06:00/.test(out.today), 'الشاشة بتقول يوم الشغل من 6ص (نفس التقفيل)');
ok(/المبيعات\n1,150/.test(out.branchToday), 'صفحة الفرع النهاردة = نفس الرقم 1,150');
ok(/المبيعات\n1,600/.test(out.branchY) && /#A/.test(out.branchY) && /#Y/.test(out.branchY), 'امبارح = 900 + 700 (فاتورة 01:30 اتحسبت على يوم امبارح زي الكاشير)');
ok(out.unit.offline, 'فاتورة أوفلاين اترفعت تاني يوم → بتتحسب بوقت البيع الفعلي');
ok(out.unit.badClock, 'سلبي: ساعة الجهاز بايظة (فرق > 48 س) → وقت السيرفر');
ok(out.unit.serverOnly, 'فاتورة من غير وقت جهاز → وقت السيرفر');
ok(out.unit.keyAfterMidnight === '2026-10-09' && out.unit.keyMorning === '2026-10-10', 'مفتاح اليوم: 01:30 = يوم 9 · 10:00 = يوم 10');
ok(out.unit.start && out.unit.startNight, 'بداية يوم الشغل 6ص (والساعة 2ص تابعة لليوم اللي قبله)');
ok(out.unit.net === 350 && out.unit.hour === 6, 'نقط اتسجلت كدفع = خصم (400 → 350) · الساعة الفاصلة من day_cfg');
ok(Array.isArray(out.loadDay) && out.loadDay.length === 0, 'سلبي: يوم مفيهوش فواتير فعلية = فاضي (مفيش فاتورة بتتعد في يومين)');
ok(out.coalesce <= 2, '30 طلب رسم ورا بعض = رسمة واحدة (كانت 30) — ' + out.coalesce);
ok(!(out.errs||[]).length, 'مفيش أخطاء JS: ' + (out.errs||[]).join(' | ').slice(0,200));
const html = fs.readFileSync(path.join(ROOT,'Office','index.html'),'utf8');
ok(/office2\.js\?v=(1[5-9]|[2-9]\d)/.test(html) && /m-reports\.js\?v=([2-9]|\d\d)/.test(html), 'Office بيحمّل النسخ الجديدة');
console.log(`\n${fail ? '❌' : '✅'} office2 bizday v15: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
