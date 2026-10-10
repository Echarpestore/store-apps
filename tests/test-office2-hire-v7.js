#!/usr/bin/env node
// ============================================================
// Office 2 — v7: 💼 التوظيف (m-hire.js) — الصفحة الحقيقية في كروميوم مع Firestore وهمي
// الملف بيشغّل نفسه كطفل (O2_HIRE_CHILD=1) عشان الجزء غير المتزامن، وبيرجّع JSON
// ============================================================
'use strict';
const path = require('path'); const { execFileSync } = require('child_process');
if(process.env.O2_HIRE_CHILD){
  const { open, D, NOW } = require('./_helpers/office2-page');
  const DAY = 86400000;
  (async()=>{
    const out = {};
    try{
      const pg = await open({ data: {
        sales_employees: [ { id:'e1', name:'سارة', branch:'echarpe El Rehab', shift:'evening', phone:'01011111111' }, { id:'e2', name:'هاجر', branch:'echarpe El Rehab', shift:'morning' }, { id:'e3', name:'دينا', branch:'Glow', shift:'evening' },
          { id:'e5', name:'ندى محمود', branch:'echarpe El Rehab', shift:'morning', phone:'01055555555', regId:'rg2', trialDays:30, trialFrom: NOW - 10*DAY, createdAt: NOW - 10*DAY } ],
        job_applications: [
          { id:'01012345678', phone:'01012345678', whatsapp:'01012345678', name:'مريم عادل', age:22, area:'الرحاب', commute:'أقل من ٢٠ دقيقة', roles:['sales_social'], branches:['echarpe El Rehab'], shift:'evening', startWhen:'فورًا', offDays:['الجمعة'], expRetail:true, expWhere:'زارا سنة', expCashier:'some', portfolio:'', notes:'', source:'إنستجرام', status:'new', ts: NOW - 2*DAY },
          { id:'01098765432', phone:'01098765432', name:'هنا سمير', age:25, area:'التجمع', commute:'٢٠–٤٥ دقيقة', roles:['cashier'], branches:['Glow'], shift:'any', startWhen:'خلال أسبوع', offDays:[], expRetail:false, expCashier:'no', source:'فيسبوك', status:'interview', statusAt: NOW - DAY, ts: NOW - 3*DAY },
          { id:'01155555555', phone:'01155555555', name:'سلمى فؤاد', age:20, area:'مدينتي', commute:'أقل من ٢٠ دقيقة', roles:['sales_social','cashier'], branches:['echarpe El Rehab','Glow'], shift:'morning', startWhen:'خلال شهر', offDays:[], expRetail:false, expCashier:'good', studying:true, college:'تجارة', source:'إنستجرام', status:'new', ts: NOW - 10*DAY },
          { id:'01000000000', phone:'01000000000', name:'متقدّمة قديمة جدًا', age:30, roles:['cashier'], branches:['echarpe El Rehab'], shift:'any', status:'new', ts: NOW - 100*DAY },
          { id:'01222222222', phone:'01222222222', name:'رنا مرفوضة', age:19, roles:['cashier'], branches:['echarpe El Rehab'], shift:'morning', status:'rejected', statusAt: NOW - DAY, ts: NOW - 4*DAY } ],
        sales_registrations: [
          { id:'rg1', name:'ياسمين خالد', gender:'female', shift:'evening', dayOff:5, scheduledStartTime:'14:00', scheduledEndTime:'22:00', pin:'4321', branch:'echarpe El Rehab', status:'pending', ts: NOW - DAY, source:'join', inviteCode:'ABC234', brand:'echarpe', role:'sales_social', trialDays:30, phone:'01033333333', whatsapp:'01033333333', nid:'30001010100123', birth:'2000-01-01', gov:'القاهرة', emergency:{ name:'خالد', relation:'والد', phone:'01044444444' }, address:'الرحاب', docKeys:['id_front','id_back'] },
          { id:'rg2', name:'ندى محمود', gender:'female', shift:'morning', dayOff:4, pin:'1111', branch:'echarpe El Rehab', status:'approved', approvedAt: NOW - 10*DAY, ts: NOW - 70*DAY, source:'join', inviteCode:'XYZ789', brand:'echarpe', role:'cashier', trialDays:30, phone:'01055555555', nid:'29901010100456' },
          { id:'rg3', name:'تابلت فرع', gender:'female', shift:'morning', dayOff:3, pin:'2222', branch:'Glow', status:'pending', ts: NOW - 2*DAY } ],
        staff_docs: [
          { id:'doc1', regId:'rg1', inviteCode:'ABC234', kind:'id_front', branch:'echarpe El Rehab', brand:'echarpe', name:'ياسمين خالد', photo:'data:image/png;base64,iVBORw0KGgo=', sizeKb:40, ts: NOW - DAY },
          { id:'doc2', regId:'rg1', inviteCode:'ABC234', kind:'id_back', branch:'echarpe El Rehab', brand:'echarpe', name:'ياسمين خالد', photo:'data:image/png;base64,AAAA', sizeKb:40, ts: NOW - DAY + 1000 },
          { id:'docOld', regId:'rg2', inviteCode:'XYZ789', kind:'bill', branch:'echarpe El Rehab', brand:'echarpe', name:'ندى محمود', photo:'data:image/png;base64,OLD=', sizeKb:30, ts: NOW - 70*DAY } ],
        staff_invites: [
          { id:'K7M2PQ', code:'K7M2PQ', brand:'echarpe', branch:'echarpe El Rehab', role:'cashier', createdAt: NOW - DAY, expiresAt: NOW + 2*DAY, usedAt:null, createdBy:'office' },
          { id:'USED11', code:'USED11', brand:'echarpe', branch:'echarpe El Rehab', role:'sales_social', createdAt: NOW - 2*DAY, expiresAt: NOW + DAY, usedAt: NOW - DAY, regId:'rg1', createdBy:'office' },
          { id:'EXPIR3', code:'EXPIR3', brand:'glow', branch:'Glow', role:'cashier', createdAt: NOW - 9*DAY, expiresAt: NOW - 2*DAY, usedAt:null, createdBy:'office' } ],
        pos_test_settings: [ { id:'office_gate', hash:null }, { id:'advances_cfg', closeDay:6, openDay:12 }, { id:'job_openings', list:[ { branch:'echarpe El Rehab', role:'cashier' } ], at: NOW - 5*DAY } ]
      } });
      out.more = await pg.go('more', null, 400);
      // ---------- 📋 مقدّمين ----------
      out.apps = await pg.go('hire', null, 500); out.sub = await pg.p.evaluate(()=> document.getElementById('hSub').textContent);
      await pg.call(()=> O2.hire.apBranch('Glow')); out.appsGlowNew = await pg.text();
      await pg.call(()=> O2.hire.apStatus('interview')); out.appsGlowInt = await pg.text();
      await pg.call(()=> O2.hire.apBranch('')); await pg.call(()=> O2.hire.apStatus('')); out.appsAll = await pg.text();
      await pg.call(()=> O2.hire.apShift('evening')); out.appsEvening = await pg.text();
      await pg.call(()=> O2.hire.apShift('')); await pg.call(()=> O2.hire.apStatus('new'));
      await pg.call(()=> O2.hire.apSet('01012345678','interview'), 200); out.afterInterview = await pg.text();
      await pg.call(()=> O2.hire.apInvite('01155555555'), 300); out.inviteSheet = await pg.sheet(); await pg.call(()=> O2.closeSheet());
      await pg.call(()=> O2.hire.apSet('ghost','rejected'), 100);
      // ---------- 📄 ورق ----------
      await pg.call(()=> O2.hire.view('docs'), 300); out.docs = await pg.text();
      await pg.call(()=> O2.hire.photo('doc1')); out.photo = await pg.sheetHtml(); await pg.call(()=> O2.closeSheet());
      await pg.call(()=> O2.hire.hv('brand','glow')); await pg.call(()=> O2.hire.makeInvite(), 300); out.afterMake = await pg.text();
      await pg.call(()=> O2.hire.killInvite('K7M2PQ'), 200); out.afterKill = await pg.text();
      await pg.call(()=> O2.hire.approve('rg1'), 300); out.afterApprove = await pg.text();
      await pg.call(()=> O2.hire.approve('rg2'), 100);
      await pg.call(()=> O2.hire.reject('rg1'), 100);
      await pg.call(()=> O2.hire.reject('rg3'), 100);
      // ---------- 📌 شواغر ----------
      await pg.call(()=> O2.hire.view('vac'), 400); out.vac = await pg.text();
      await pg.call(()=> O2.hire.opSave(), 100);
      await pg.call(()=> O2.hire.opToggle('Glow','setup')); out.vacDirty = await pg.text();
      await pg.call(()=> O2.hire.opSave(), 200); out.vacSaved = await pg.text();
      // ---------- 🗂️ ملفات ----------
      await pg.call(()=> O2.hire.view('files')); out.files0 = await pg.text();
      await pg.call(()=> O2.hire.efQ('ندى')); out.filesName = await pg.text();
      await pg.call(()=> O2.hire.efQ('0105')); out.filesPhone = await pg.text();
      await pg.call(()=> O2.hire.efOpen('rg2','e5','emp'), 300); out.filesOpen = await pg.text();
      await pg.call(()=> O2.hire.efQ('سار')); await pg.call(()=> O2.hire.efOpen('','e1','emp'), 200); out.filesTablet = await pg.text();
      out.more2 = await pg.go('more', null, 300);
      out.writes = await pg.writes(); out.errs = pg.errs;
      await pg.close();
    }catch(e){ out.fatal = String(e && e.stack || e); }
    process.stdout.write(JSON.stringify(out));
  })();
  return;
}
let out = null;
try{ out = JSON.parse(execFileSync(process.execPath, [__filename], { encoding:'utf8', timeout:120000, maxBuffer: 20*1024*1024, env: Object.assign({}, process.env, { O2_HIRE_CHILD:'1' }) })); }catch(e){ out = { fatal: String(e && e.message) }; }
if(out.fatal && /playwright|Cannot find module/i.test(out.fatal)){ console.log('  ⏭ Office2 hire: كروميوم مش متاح —', out.fatal.slice(0,80)); }
else {
  const NOW = Date.UTC(2026, 9, 10, 13, 0); const DAY = 86400000;
  assert(!out.fatal, 'الصفحة اشتغلت — ' + (out.fatal||''));
  assertEq((out.errs||[]).length, 0, 'مفيش أخطاء JS في شاشة التوظيف — ' + JSON.stringify(out.errs||[]).slice(0,300));
  const W = out.writes || [];
  assert(/💼 التوظيف[\s\S]*\n3\n/.test(out.more||''), 'الشارة في «المزيد» = 2 متقدّمين جداد + 1 طلب تسجيل مستني = 3');
  // 📋 مقدّمين
  const a = out.apps || '';
  assert(/2 متقدّم جديد · 1 طلب تسجيل مستني/.test(out.sub||''), 'العنوان الفرعي: متقدّمين جداد وطلبات مستنية');
  assert(/🆕 جديد 2/.test(a) && /📞 للمقابلة 1/.test(a) && /❌ مرفوض 1/.test(a) && /الكل 4/.test(a), 'عدّادات الحالات (القديمة أكتر من 90 يوم مش محسوبة)');
  assert(/مريم عادل[\s\S]*🎂 22 سنة · 📱 01012345678[\s\S]*📍 الرحاب · 🚌 أقل من ٢٠ دقيقة[\s\S]*💼 مبيعات وسوشيال[\s\S]*🏬 echarpe El Rehab · 🌆 مسائي[\s\S]*🕐 يبدأ فورًا · مش متاح الجمعة[\s\S]*🧰 زارا سنة · كاشير: شوية[\s\S]*📣 عرف عننا من: إنستجرام/.test(a), 'كارت المتقدّمة: كل البيانات من job_applications');
  assert(/سلمى فؤاد[\s\S]*🎓 تجارة[\s\S]*⏳ لسه من غير رد من 10 أيام — يستاهل قرار/.test(a) && /⏳ 1 من غير رد من فوق أسبوع/.test(a), 'تنبيه اللي بقالها فوق أسبوع من غير رد');
  assert(!/هنا سمير/.test(a) && !/رنا مرفوضة/.test(a) && !/متقدّمة قديمة جدًا/.test(a), 'سلبي: اللي للمقابلة والمرفوضة والأقدم من 90 يوم مش في «جديد»');
  assert(/مفيش متقدّمين بالفلتر ده/.test(out.appsGlowNew||'') || (/سلمى فؤاد/.test(out.appsGlowNew||'') && !/مريم عادل/.test(out.appsGlowNew||'')), 'فلتر الفرع Glow: مريم (الرحاب بس) مش ظاهرة');
  assert(/هنا سمير/.test(out.appsGlowInt||'') && !/مريم عادل/.test(out.appsGlowInt||''), 'فلتر Glow + للمقابلة: هنا بس');
  assert(/4 متقدّم/.test(out.appsAll||'') && /رنا مرفوضة/.test(out.appsAll||'') && !/متقدّمة قديمة جدًا/.test(out.appsAll||''), '«الكل» = 4 (نافذة 90 يوم)');
  assert(/مريم عادل/.test(out.appsEvening||'') && /هنا سمير/.test(out.appsEvening||'') && !/سلمى فؤاد/.test(out.appsEvening||''), 'فلتر الشيفت المسائي بيشمل «أي شيفت» وبيستبعد الصباحي');
  const iv = W.find(w=> w.col==='job_applications' && w.id==='01012345678');
  assert(iv && iv.op==='update' && iv.p.status==='interview' && typeof iv.p.statusAt==='number', '⭐ «مقابلة» بتكتب status:interview + statusAt (نفس apSet)');
  assert(!/مريم عادل/.test(out.afterInterview||'') && /🆕 جديد 1/.test(out.afterInterview||''), 'بعد المقابلة مريم خرجت من «جديد» لايف');
  const inv = W.find(w=> w.col==='staff_invites' && w.op==='set' && w.p.applicantPhone==='01155555555');
  assert(inv && /^[A-HJ-NP-Z2-9]{6}$/.test(inv.id) && inv.p.code===inv.id && inv.p.brand==='echarpe' && inv.p.branch==='echarpe El Rehab' && inv.p.role==='sales_social' && inv.p.usedAt===null && inv.p.expiresAt===NOW + 3*DAY && inv.p.applicantName==='سلمى فؤاد' && typeof inv.p.createdAt==='number', '⭐ «ادعُه للتسجيل» بيعمل staff_invites/{code} بنفس حقول Office (أول فرع · أول وظيفة · 3 أيام · بيانات المتقدّمة)');
  const hired = W.find(w=> w.col==='job_applications' && w.id==='01155555555');
  assert(inv && hired && hired.p.status==='hired' && hired.p.inviteCode===inv.id && typeof hired.p.statusAt==='number', '⭐ وبيعلّم الطلب hired + inviteCode');
  assert(inv && new RegExp('/join/\\?c=' + inv.id).test(out.inviteSheet||'') && /سلمى فؤاد/.test(out.inviteSheet||''), 'شيت الرابط: /join/?c={code}');
  assert(!W.some(w=> w.id==='ghost'), 'سلبي: متقدّم مش موجود = مفيش كتابة');
  // 📄 ورق
  const d = out.docs || '';
  assert(/دعوات مفتوحة[\s\S]*K7M2PQ[\s\S]*echarpe — echarpe El Rehab · كاشير ومبيعات[\s\S]*باقي 2 يوم/.test(d), 'الدعوة المفتوحة بكودها وفرعها ووظيفتها والباقي');
  assert(inv && new RegExp(inv.id).test(d), 'دعوة المتقدّمة اللي لسه اتعملت ظاهرة لايف');
  assert(!/USED11/.test(d) && !/EXPIR3/.test(d), 'سلبي: الدعوة المستخدمة والمنتهية مش في المفتوحة');
  assert(/ياسمين خالد[\s\S]*⏳ مستني قرارك[\s\S]*echarpe — echarpe El Rehab · مبيعات ومساعدة تسويق رقمي[\s\S]*📱 01033333333 · 🪪 30001010100123[\s\S]*🎂 2000-01-01 · القاهرة[\s\S]*🕐 مسائي · إجازة الجمعة[\s\S]*⏳ فترة اختبار 30 يوم[\s\S]*🆘 خالد \(والد\) 01044444444[\s\S]*🏠 الرحاب/.test(d), 'طلب التسجيل: كل بيانات sales_registrations');
  assert(/ندى محمود[\s\S]*✅ متعمد/.test(d), 'الطلب المعتمد ظاهر بحالته');
  assert(!/تابلت فرع/.test(d), 'سلبي: تسجيل التابلت (مش source:join) مش في «ورق»');
  assert(/⚠️ مفيش مستندات معروضة/.test(d) && /ندى محمود[\s\S]*مرفعش أي ملف/.test(d), 'تشخيص الطلب اللي مستنداته أقدم من 60 يوم: مفيش مستندات معروضة');
  assert(/<img src="data:image\/png;base64,iVBORw0KGgo="/.test(out.photo||'') && /وجه البطاقة/.test(out.photo||''), 'المستند بيتفتح في الشيت بـ<img> واسم نوعه');
  const mk = W.find(w=> w.col==='staff_invites' && w.op==='set' && w.p.brand==='glow');
  assert(mk && mk.p.branch==='Glow' && mk.p.role==='sales_social' && mk.p.expiresAt===NOW + 3*DAY && mk.p.usedAt===null && mk.p.code===mk.id && mk.p.applicantPhone===undefined, '⭐ «اعمل رابط دعوة» Glow: branch:Glow · 3 أيام · نفس حقول Office');
  assert(mk && new RegExp('الرابط جاهز[\\s\\S]*/join/\\?c=' + mk.id).test(out.afterMake||''), 'الرابط ظاهر في الشاشة بعد الإنشاء');
  const kl = W.find(w=> w.col==='staff_invites' && w.id==='K7M2PQ');
  assert(kl && kl.op==='update' && kl.p.expiresAt===NOW - 1 && typeof kl.p.cancelledAt==='number', '⭐ إلغاء الدعوة = expiresAt:now-1 + cancelledAt (الرابط يبطّل فورًا)');
  assert(!/K7M2PQ/.test(out.afterKill||''), 'بعد الإلغاء الدعوة اختفت لايف');
  const ap = W.find(w=> w.col==='sales_registrations' && w.id==='rg1');
  assert(ap && ap.op==='update' && ap.p.status==='approved' && typeof ap.p.approvedAt==='number' && ap.p.approvedBy, '⭐ الاعتماد بيحجز الطلب أولًا (status:approved + approvedAt)');
  const emp = W.find(w=> w.col==='sales_employees' && w.op==='add');
  assert(emp && emp.p.name==='ياسمين خالد' && emp.p.branch==='echarpe El Rehab' && emp.p.pin==='4321' && emp.p.shift==='evening' && emp.p.dayOff===5 && emp.p.scheduledStartTime==='14:00' && emp.p.scheduledEndTime==='22:00' && emp.p.active===true && emp.p.avatar==='girl' && emp.p.gender==='female' && emp.p.phone==='01033333333' && emp.p.role==='sales_social' && emp.p.trialDays===30 && typeof emp.p.trialFrom==='number' && emp.p.regId==='rg1' && typeof emp.p.createdAt==='number', '⭐ وبيفتح حساب sales_employees بنفس حقول Office (pin · shift · dayOff · مواعيد · trial · regId)');
  assert(W.indexOf(ap) < W.indexOf(emp), 'الحجز قبل إنشاء الموظفة (ضمانة عدم التكرار)');
  assert(/ياسمين خالد[\s\S]*✅ متعمد/.test(out.afterApprove||''), 'بعد الاعتماد الحالة بقت متعمد لايف');
  const rj = W.find(w=> w.col==='sales_registrations' && w.id==='rg3');
  assert(rj && rj.op==='update' && rj.p.status==='rejected' && typeof rj.p.rejectedAt==='number', '⭐ الرفض بيكتب status:rejected + rejectedAt');
  assert(W.filter(w=> w.col==='sales_employees').length === 1 && W.filter(w=> w.col==='sales_registrations').length === 2, 'سلبي: اعتماد المعتمد ورفض المعتمد = مفيش كتابة تانية');
  // 📌 شواغر
  assert(/1 شاغر مفتوح/.test(out.vac||'') && /echarpe El Rehab[\s\S]*✅ كاشير ومبيعات/.test(out.vac||'') && /Glow/.test(out.vac||''), 'الشواغر من pos_test_settings/job_openings: كاشير في الرحاب');
  assert(W.filter(w=> w.col==='pos_test_settings').length === 1, 'سلبي: الحفظ من غير تعديل = مفيش كتابة (كتابة واحدة بس بعد التعليم)');
  assert(/2 شاغر مفتوح/.test(out.vacDirty||'') && /فيه تعديل مش محفوظ/.test(out.vacDirty||''), 'التعليم بيزوّد العدّاد وبينبّه إن فيه تعديل مش محفوظ');
  const op = W.find(w=> w.col==='pos_test_settings' && w.id==='job_openings');
  assert(op && op.op==='set' && Array.isArray(op.p.list) && op.p.list.length===2 && op.p.list.some(o=> o.branch==='Glow' && o.role==='setup') && op.p.list.some(o=> o.branch==='echarpe El Rehab' && o.role==='cashier') && typeof op.p.at==='number', '⭐ الحفظ بيكتب job_openings {list,at} (اللي استمارة التقديم بتقراه)');
  assert(!/فيه تعديل مش محفوظ/.test(out.vacSaved||''), 'بعد الحفظ التنبيه اختفى');
  // 🗂️ ملفات
  assert(!/نتايج البحث/.test(out.files0||''), 'من غير بحث مفيش نتايج');
  assert(/نتايج البحث[\s\S]*ندى محمود[\s\S]*متعمد/.test(out.filesName||'') && !/ندى محمود[\s\S]*ندى محمود/.test(out.filesName||''), 'البحث بالاسم: طلب ندى مرة واحدة (الموظفة اللي ليها regId مش بتتكرر)');
  assert(/ندى محمود/.test(out.filesPhone||''), 'البحث برقم الموبايل');
  assert(/📎 1 مستند/.test(out.filesOpen||'') && /إثبات السكن/.test(out.filesOpen||'') && /⏳ فترة اختبار — فاضل\s*20 يوم\s*من 30/.test(out.filesOpen||'') && /🪪 29901010100456/.test(out.filesOpen||''), 'الملف: المستند الأقدم من 60 يوم بيتجاب بالطلب + فترة الاختبار');
  assert(/اتسجّلت من تابلت الفرع — مفيش مستندات مرفوعة/.test(out.filesTablet||'') && /سارة/.test(out.filesTablet||''), 'موظفة من التابلت: مفيش مستندات');
  assert(/💼 التوظيف/.test(out.more2||'') && !/💼 التوظيف[^\n]*\n[^\n]*\n\d+\n/.test(out.more2||''), 'الشارة اختفت بعد القرارات (مريم للمقابلة · سلمى اتدعت · ياسمين اتعمدت)');
}
