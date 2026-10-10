#!/usr/bin/env node
// ============================================================
// Office 2 — v7: 📹 الكاميرات — الصفحة الحقيقية في كروميوم مع Firestore وهمي
// الـgateway مش متاح من بيئة الاختبار → بنتأكد من الروابط/العناصر/التبويبات بس، ومن إن الشاشة مبتكتبش حاجة
// الملف بيشغّل نفسه كطفل (O2_CCTV_CHILD=1) عشان الجزء غير المتزامن، وبيرجّع JSON
// ============================================================
'use strict';
const path = require('path'); const { execFileSync } = require('child_process');
if(process.env.O2_CCTV_CHILD){
  const { open, D, NOW } = require('./_helpers/office2-page');
  (async()=>{
    const out = { NOW };
    try{
      const pg = await open({ data: {
        pos_test_sales: [
          { id:'v1', branch:'echarpe El Rehab', total:1200, invoiceNo:5801, invoiceCode:'RH-5801', employee:'هاجر', customerName:'منى', customerPhone:'01000000001', createdAtMs:D(2026,10,10,12,30), payments:{ cash:1200 }, items:[{ barcode:'111', name:'طرحة شيفون', qty:2, price:400 }, { barcode:'222', name:'بيجامة قطن', qty:1, price:400 }] },
          { id:'v2', branch:'echarpe El Rehab', total:800, invoiceNo:5802, employee:'سارة', createdAtMs:D(2026,10,10,13,0), payments:{ visa:800 }, items:[{ barcode:'111', name:'طرحة شيفون', qty:2, price:400 }] },
          { id:'v3', branch:'echarpe El Rehab', total:900, invoiceNo:5789, employee:'هاجر', createdAtMs:D(2026,10,9,11,0), payments:{ cash:900 }, items:[{ barcode:'111', name:'طرحة شيفون', qty:1, price:900 }] },
          { id:'v4', branch:'Glow', total:600, invoiceNo:7001, invoiceCode:'GL-7001', employee:'دينا', createdAtMs:D(2026,10,10,14,0), payments:{ instapay:600 }, items:[{ barcode:'444', name:'سكارف', qty:1, price:600 }] } ],
        office_pos_live: [
          { id:'echarpe El Rehab', branch:'echarpe El Rehab', employee:'هاجر', updatedAtMs: NOW - 30000, total:650, cart:[{ name:'إيشارب حرير', barcode:'333', qty:1, price:650 }], lastSale:{ invoiceNo:5802, total:800, atMs:D(2026,10,10,13,0), payments:{ visa:800 } } },
          { id:'Glow', branch:'Glow', employee:'دينا', updatedAtMs: NOW - 20*60000, total:0, cart:[], lastSale:null } ],
        pos_cctv_invoice_snapshots: [
          { id:'RH-5801', invoiceCode:'RH-5801', invoiceNo:5801, branch:'echarpe El Rehab', branchProfile:'rehab', camera:'CAM1', cameraId:'1', storage:'firestore_legacy', video:'pc_ring_recording', videoAtMs:D(2026,10,10,12,30), clockSource:'pos_pc', shots:{ first_item:{ jpegData:'data:image/jpeg;base64,/9j/AAAA', capturedAtMs:D(2026,10,10,12,29) }, after_save:{ jpegData:'data:image/jpeg;base64,/9j/BBBB', capturedAtMs:D(2026,10,10,12,30) }, payment:{ jpegData:'' } } },
          { id:'GL-7001', invoiceCode:'GL-7001', invoiceNo:7001, branch:'Glow', branchProfile:'glow', camera:'CAM1', cameraId:'1', storage:'branch_local', localSnapshots:true, video:'nvr_on_demand', videoAtMs:D(2026,10,10,14,0), clockSource:'nvr_isapi', nvrOffsetMs:1500, shots:{ first_item:{ available:true, capturedAtMs:D(2026,10,10,13,59) } } } ]
      } });
      // 🚫 الـgateway مش متاح من بيئة الاختبار — بنقطع أي طلب خارجي عشان ميعلّقش
      await pg.p.route(/echarpe\.store/, r=> r.abort());
      const html = ()=> pg.p.evaluate(()=> document.getElementById('screen').innerHTML);
      out.more = await pg.go('more');
      out.live0 = await pg.go('cctv', null, 500); out.sub0 = await pg.p.evaluate(()=> document.getElementById('hSub').textContent);
      // 📹 مباشر — الرحاب
      await pg.call(()=> O2.cctv.branch('rehab'), 300); out.rehab = await pg.text(); out.rehabHtml = await html();
      await pg.call(()=> O2.cctv.cam('1'), 300); out.rehabCam1 = await html();
      await pg.call(()=> O2.cctv.all(true), 300); out.rehabAll = await html();
      await pg.call(()=> O2.cctv.all(false), 200); out.rehabOff = await html();
      // 📹 مباشر — Glow (صور JPEG) ومدينتي (iframe MSE)
      await pg.call(()=> O2.cctv.branch('glow'), 300); await pg.call(()=> O2.cctv.cam('1'), 300); out.glowCam1 = await html(); out.glowTxt = await pg.text();
      await pg.call(()=> O2.cctv.branch('madinaty'), 300); await pg.call(()=> O2.cctv.cam('4'), 300); out.madCam4 = await html();
      // 🌐 كل الفروع
      await pg.call(()=> O2.cctv.view('all'), 300); out.all = await html(); out.allTxt = await pg.text();
      // 🎞 تسجيل — الرحاب 10/10 15:30 · 5 دقايق · 720p
      await pg.call(()=> O2.cctv.branch('rehab','playback'), 300); out.pbForm = await html(); out.pbTxt = await pg.text();
      await pg.call(()=>{ O2.cctv.f('date','2026-10-10'); O2.cctv.f('time','15:30'); O2.cctv.f('dur','5'); O2.cctv.f('q','720'); O2.cctv.play(); }, 400); out.pbSheet = await pg.sheetHtml();
      await pg.call(()=> O2.cctv.pbStep(1), 300); out.pbNext = await pg.sheetHtml();
      await pg.call(()=> O2.closeSheet());
      // 🕘 اليوم — الرحاب النهاردة
      await pg.call(()=> O2.cctv.view('day'), 800); out.day = await pg.text(); out.dayHtml = await html();
      await pg.call(()=> O2.cctv.saleVideo('v1', Date.UTC(2026,9,10,9,30)), 400); out.saleVideo = await pg.sheetHtml(); await pg.call(()=> O2.closeSheet());
      await pg.call(()=> O2.cctv.shots('RH-5801'), 400); out.shots = await pg.sheetHtml();
      await pg.call(()=> O2.cctv.shotVideo(), 400); out.shotVideo = await pg.sheetHtml(); await pg.call(()=> O2.closeSheet());
      await pg.call(()=> O2.cctv.shots('GL-7001'), 400); out.shotsGlow = await pg.sheetHtml(); await pg.call(()=> O2.closeSheet());
      await pg.call(()=> O2.cctv.shots('NOPE'), 300); out.shotsNone = await pg.sheet(); await pg.call(()=> O2.closeSheet());
      await pg.call(()=> O2.cctv.day(-1), 800); out.dayPrev = await pg.text();
      await pg.call(()=> O2.cctv.day(1), 300); await pg.call(()=> O2.cctv.day(1), 300); out.dayFuture = await pg.text();
      await pg.call(()=> O2.cctv.branch('glow','day'), 800); out.dayGlow = await pg.text();
      // 🚨 النشاط — الرحاب مش مفعّل · Glow الـgateway مش متاح
      await pg.call(()=> O2.cctv.branch('rehab','activity'), 300); out.actRehab = await pg.text();
      await pg.call(()=> O2.cctv.branch('glow','activity'), 1500); out.actGlow = await pg.text();
      out.warnTxt = await pg.text();
      out.more2 = await pg.go('more');
      out.writes = await pg.writes(); out.errs = pg.errs;
      await pg.close();
    }catch(e){ out.fatal = String(e && e.stack || e); }
    process.stdout.write(JSON.stringify(out));
  })();
  return;
}
let out = null;
try{ out = JSON.parse(execFileSync(process.execPath, [__filename], { encoding:'utf8', timeout:120000, maxBuffer: 20*1024*1024, env: Object.assign({}, process.env, { O2_CCTV_CHILD:'1' }) })); }catch(e){ out = { fatal: String(e && e.message) }; }
if(out.fatal && /playwright|Cannot find module/i.test(out.fatal)){ console.log('  ⏭ Office2 cctv: كروميوم مش متاح —', out.fatal.slice(0,80)); }
else {
  assert(!out.fatal, 'الصفحة اشتغلت — ' + (out.fatal||''));
  assertEq((out.errs||[]).length, 0, 'مفيش أخطاء JS في شاشة الكاميرات — ' + JSON.stringify(out.errs||[]).slice(0,300));
  const NOW = out.NOW; const D = (y,m,d,h,mi)=> Date.UTC(y, m-1, d, (h||0)-3, mi||0);
  assert(/📹 الكاميرات/.test(out.more||''), '«الكاميرات» ظاهرة في «المزيد»');
  const m = (out.more||'').indexOf('📹 الكاميرات'), s = (out.more||'').indexOf('📦 النواقص'); assert(m >= 0 && (s < 0 || m < s), 'ترتيبها 10 — قبل النواقص');
  // 📹 مباشر
  assert(/☁ REMOTE · مدينتي · 📹 مباشر/.test(out.sub0||''), 'وضع الاتصال REMOTE والفرع الافتراضي مدينتي');
  assert(/🛒 السلة LIVE[\s\S]*POS Live غير متصل/.test(out.live0||''), 'مدينتي: مفيش حالة Live → رسالة واضحة');
  assert(/🛒 السلة LIVE[\s\S]*هاجر[\s\S]*● LIVE[\s\S]*إيشارب حرير[\s\S]*× 1 · 333[\s\S]*إجمالي السلة[\s\S]*آخر فاتورة: #5802 · فيزا/.test(out.rehab||''), 'الرحاب: السلة LIVE من office_pos_live (الموظفة · الصنف · الإجمالي · آخر فاتورة)');
  assert(/CAM1[\s\S]*الكاشير · متوقفة[\s\S]*CAM8/.test(out.rehab||'') && !/<iframe/.test(out.rehabHtml||'') && !/data-live-frame/.test(out.rehabHtml||''), 'سلبي: 8 كاميرات كلها متوقفة عند الدخول — مفيش أي بث تلقائي');
  assert((out.rehabHtml||'').includes('src="https://cctv-rehab.echarpe.store/stream.html?src=rehab_cam1_h264&amp;mode=mse&amp;background=false"') === false, 'سلبي: رابط البث مش موجود قبل التشغيل');
  assert((out.rehabCam1||'').includes('<iframe title="CAM1" data-stream-src="https://cctv-rehab.echarpe.store/stream.html?src=rehab_cam1_h264&amp;mode=mse&amp;background=false" src="https://cctv-rehab.echarpe.store/stream.html?src=rehab_cam1_h264&amp;mode=mse&amp;background=false"'), '⭐ تشغيل CAM1 الرحاب = iframe بنفس رابط stream.html (mse) بتاع cctv.js');
  assert(((out.rehabCam1||'').match(/<iframe/g)||[]).length === 1 && /■ إيقاف/.test(out.rehabCam1||''), 'كاميرا واحدة بس شغالة وزرارها بقى «إيقاف»');
  assert(((out.rehabAll||'').match(/<iframe/g)||[]).length === 8 && /● 8 LIVE/.test(out.rehabAll||''), '«تشغيل الكل» = 8 iframes وعدّاد 8 LIVE');
  assert(((out.rehabOff||'').match(/<iframe/g)||[]).length === 0 && /● متوقف/.test(out.rehabOff||''), '«إيقاف الكل» بيوقف كل البث');
  assert((out.glowCam1||'').includes('<img title="CAM1" data-live-frame="https://cctv-glow.echarpe.store/api/frame.jpeg?src=glow_cam1_h264&amp;_=" data-live-branch="glow"') && !/<iframe/.test(out.glowCam1||''), '⭐ Glow = صور JPEG متتابعة (frame.jpeg) زي cctv.js مش iframe');
  assert((out.madCam4||'').includes('data-stream-src="https://cctv-madinaty.echarpe.store/stream.html?src=camera4_live&amp;mode=mse&amp;background=false"'), '⭐ مدينتي D04 = iframe على camera4_live (liveStream) بوضع mse');
  assert(!/<iframe[^>]*rehab_cam/.test(out.glowCam1||''), 'سلبي: تغيير الفرع بيوقف كاميرات الفرع القديم');
  // 🌐 كل الفروع
  assert((out.all||'').includes('src=camera4_live&amp;mode=mse') && (out.all||'').includes('https://cctv-glow.echarpe.store/api/frame.jpeg?src=glow_cam1_h264&amp;_=') && (out.all||'').includes('src=rehab_cam1_h264&amp;mode=mse'), '⭐ كل الفروع: كاميرا الكاشير من التلات فروع بنفس الروابط');
  assert(/مدينتي[\s\S]*Glow[\s\S]*الرحاب/.test(out.allTxt||'') && /كل الكاميرات/.test(out.allTxt||'') && /🎞 تسجيل/.test(out.allTxt||''), 'كل الفروع: زرار «كل الكاميرات» و«تسجيل» لكل فرع');
  // 🎞 تسجيل
  assert(/تسجيل الكاشير فقط على كمبيوتر الفرع/.test(out.pbTxt||'') && (out.pbForm||'').includes('<option value="1" selected="">CAM1 · الكاشير</option></select>') && !/CAM2/.test(out.pbTxt||'') && /480p سريع[\s\S]*720p/.test(out.pbTxt||''), 'الرحاب: كاميرا الكاشير بس في قايمة التسجيل + جودات 480/720 (نفس cctv.js)');
  const pbUrl = 'https://cctv-rehab.echarpe.store/echarpe-playback/video?camera=1&amp;atMs=' + D(2026,10,10,15,30) + '&amp;durationSec=300&amp;quality=720&amp;mode=fast';
  assert(/<video controls="" autoplay="" playsinline=""[^>]*src="/.test(out.pbSheet||'') && (out.pbSheet||'').includes('src="' + pbUrl + '&amp;retry=' + NOW + '"'), '⭐ شغّل التسجيل: <video src> بنفس رابط playbackUrl (camera · atMs بتوقيت القاهرة · durationSec · quality · mode=fast · retry)');
  assert((out.pbSheet||'').includes('href="' + pbUrl + '"'), 'رابط «فتح منفصل» = نفس الرابط من غير retry');
  assert((out.pbNext||'').includes('atMs=' + (D(2026,10,10,15,30) + 5*60000) + '&amp;'), '«التالي» بيقدّم بنفس المدة (5 دقايق)');
  // 🕘 اليوم
  assert(/السبت[\s\S]*2 فاتورة[\s\S]*13:00 · فاتورة #5802 · 800 ج[\s\S]*👤 بدون عميل · سارة[\s\S]*💳 فيزا 800 ج · 1 صنف[\s\S]*12:30 · فاتورة #5801 · 1,200 ج[\s\S]*👤 منى · 01000000001 · هاجر/.test(out.day||''), 'اليوم (الرحاب): فواتير النهاردة بالوقت والعميل والدفع والأصناف');
  assert(!/7001|سكارف/.test(out.day||''), 'سلبي: فاتورة Glow مش ظاهرة في يوم الرحاب');
  assert(!/5789/.test(out.day||''), 'سلبي: فاتورة امبارح مش في النهاردة');
  assert(/5801[\s\S]*📸 لقطات[\s\S]*🎥 فيديو[\s\S]*🧾 الفاتورة/.test(out.day||'') && (out.dayHtml||'').includes("O2.cctv.shots('RH-5801')") && (out.dayHtml||'').includes("O2.cctv.saleVideo('v1'," + D(2026,10,10,12,30) + ")"), 'كل فاتورة: لقطات (بالـinvoiceCode) · فيديو (بوقت الفاتورة) · الفاتورة');
  assert(/فاتورة #5802 · 800 ج\n👤 بدون عميل · سارة\n💳 فيزا 800 ج · 1 صنف\n🎥 فيديو\n🧾 الفاتورة/.test(out.day||''), 'سلبي: فاتورة من غير invoiceCode مفيهاش زرار لقطات');
  const svUrl = 'https://cctv-rehab.echarpe.store/echarpe-playback/video?camera=1&amp;atMs=' + (D(2026,10,10,12,30) - 30000) + '&amp;durationSec=120&amp;quality=480&amp;mode=fast';
  assert((out.saleVideo||'').includes('src="' + svUrl + '&amp;retry=' + NOW + '"'), '⭐ فيديو الفاتورة = نفس منطق cctv.js: 30 ثانية قبل الفاتورة · دقيقتين · كاميرا الكاشير · 480');
  assert((out.shots||'').includes('<img src="data:image/jpeg;base64,/9j/AAAA"') && (out.shots||'').includes('<img src="data:image/jpeg;base64,/9j/BBBB"') && /1️⃣ أول كود[\s\S]*12:29[\s\S]*4️⃣ بعد الحفظ[\s\S]*12:30/.test(out.shots||'') && /2 لقطة/.test(out.shots||'') && !/2️⃣ أثناء الدفع/.test(out.shots||''), 'لقطات الفاتورة من pos_cctv_invoice_snapshots (jpegData) — اللقطة الفاضية مش معروضة');
  const shUrl = 'https://cctv-rehab.echarpe.store/echarpe-playback/video?camera=1&amp;atMs=' + (D(2026,10,10,12,30) - 30000) + '&amp;durationSec=60&amp;quality=480&amp;mode=fast';
  assert(/🎥 30 ثانية قبل \+ 30 بعد/.test(out.shots||'') && (out.shotVideo||'').includes('src="' + shUrl + '&amp;retry=' + NOW + '"') && /كمبيوتر الفرع/.test(out.shotVideo||''), '⭐ زرار 30 قبل/30 بعد من اللقطات = videoUrl بتاع cctv.js (60 ثانية من videoAtMs-30s)');
  assert((out.shotsGlow||'').includes('<img src="https://cctv-glow.echarpe.store/echarpe-events/snapshot?invoice=GL-7001&amp;stage=first_item&amp;_=' + NOW + '"') && ((out.shotsGlow||'').match(/<img /g)||[]).length === 4 && /محفوظة محليًا في الفرع/.test(out.shotsGlow||''), '⭐ Glow (branch_local): الأربع لقطات من رابط echarpe-events/snapshot بتاع الـgateway');
  assert(/مفيش لقطات محفوظة/.test(out.shotsNone||''), 'فاتورة من غير لقطات → رسالة واضحة');
  assert(/الجمعة[\s\S]*1 فاتورة[\s\S]*11:00 · فاتورة #5789/.test(out.dayPrev||'') && !/5801/.test(out.dayPrev||''), 'اليوم السابق: فاتورة امبارح بس');
  assert(/السبت[\s\S]*2 فاتورة/.test(out.dayFuture||''), 'سلبي: مينفعش يروح لبكرة');
  assert(/Glow[\s\S]*1 فاتورة[\s\S]*14:00 · فاتورة #7001 · 600 ج/.test(out.dayGlow||'') && !/5801/.test(out.dayGlow||''), 'يوم Glow: فاتورة Glow بس');
  // 🚨 النشاط
  assert(/تتبّع الزوار والتنبيهات متاح لفرعي مدينتي وGlow بس/.test(out.actRehab||''), 'النشاط: الرحاب مش مفعّل (نفس trackingProfile)');
  assert(/⚠️ الـgateway مش متاح — الفرع Glow/.test(out.actGlow||''), 'النشاط Glow: الـgateway مش متاح → رسالة بدل ما تعلّق');
  assert(/⚠️ gateway مدينتي وGlow والرحاب مش متاح/.test(out.warnTxt||'') && /↻ افصح تاني|↻ افحص تاني/.test(out.warnTxt||''), 'شريط التحذير: التلات gateways مش متاحين من بيئة الاختبار');
  // الكتابة الوحيدة المسموحة: قفل الشيفت المنسي (s3 في البيانات الأساسية) — ده من نواة office2 مش من الشاشة دي
  assertEq((out.writes||[]).filter(w=> !(w.col==='sales_shifts' && w.p && w.p.bankAutoFrom==='office2')).length, 0, '⭐ سلبي: شاشة الكاميرات مبتكتبش أي حاجة في Firestore (قراءة بس)');
  assert(/📹 الكاميرات/.test(out.more2||''), 'الرجوع لـ«المزيد» شغال');
}
