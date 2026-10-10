#!/usr/bin/env node
// ============================================================
// Office 2 — v7: ✅ التاسكات · 📦 النواقص · 🐞 بلاغات المشاكل — الصفحة الحقيقية في كروميوم مع Firestore وهمي
// الملف بيشغّل نفسه كطفل (O2_OPS_CHILD=1) عشان الجزء غير المتزامن، وبيرجّع JSON
// ============================================================
'use strict';
const path = require('path'); const { execFileSync } = require('child_process');
if(process.env.O2_OPS_CHILD){
  const { open, D } = require('./_helpers/office2-page');
  (async()=>{
    const out = {};
    try{
      const pg = await open({ data: {
        sales_employees: [ { id:'e1', name:'سارة', branch:'echarpe El Rehab' }, { id:'e2', name:'هاجر', branch:'echarpe El Rehab' }, { id:'e3', name:'دينا', branch:'Glow' }, { id:'e4', name:'منى', branch:'echarpe El Rehab', status:'terminated' } ],
        sales_task_weeks: [
          { id:'e1__w2026-10-10', employeeId:'e1', employeeName:'سارة', branch:'echarpe El Rehab', taskDescription:'سكشن A', weekKey:'w2026-10-10', assignedAt:D(2026,10,10,11,0), assignedBy:'office' },
          { id:'e3__w2026-10-10', employeeId:'e3', employeeName:'دينا', branch:'Glow', taskDescription:'ترتيب الفاترينة', weekKey:'w2026-10-10', assignedAt:D(2026,10,10,11,0), assignedBy:'sales' },
          { id:'e1__w2026-10-03', employeeId:'e1', employeeName:'سارة', branch:'echarpe El Rehab', taskDescription:'تاسك الأسبوع اللي فات', weekKey:'w2026-10-03', assignedAt:D(2026,10,3,11,0), assignedBy:'office' } ],
        sales_tasks: [ { id:'e2', employeeId:'e2', employeeName:'هاجر', branch:'echarpe El Rehab', taskDescription:'سكشن B من الحضور', assignedAt:D(2026,10,10,12,0), assignedBy:'sales' } ],
        sales_task_submissions: [
          { id:'sub1', employeeId:'e1', employeeName:'سارة', branch:'echarpe El Rehab', date:'2026-10-10', taskDescription:'سكشن A', photoURL:'data:image/png;base64,iVBORw0KGgo=', submittedAt:D(2026,10,10,15,0), confirmed:false, confirmedAt:null, rejected:false, rejectedAt:null },
          { id:'sub2', employeeId:'e2', employeeName:'هاجر', branch:'echarpe El Rehab', date:'2026-10-10', taskDescription:'سكشن B', photoURL:'', submittedAt:D(2026,10,10,13,0), confirmed:true, confirmedAt:D(2026,10,10,14,0), rejected:false, rejectedAt:null },
          { id:'subOld', employeeId:'e1', employeeName:'سارة', branch:'echarpe El Rehab', date:'2026-10-05', taskDescription:'قديم', photoURL:'', submittedAt:D(2026,10,5,15,0), confirmed:false, confirmedAt:null, rejected:false, rejectedAt:null } ],
        sales_shortages: [
          { id:'sh1', empId:'e1', empName:'سارة', branch:'echarpe El Rehab', barcode:'111', productName:'طرحة شيفون', detail:'لون أسود', qty:5, currentStock:2, status:'open', ts:D(2026,10,10,12,0) },
          { id:'sh2', empId:'e3', empName:'دينا', branch:'Glow', barcode:'444', productName:'سكارف', detail:'', qty:3, currentStock:0, status:'open', ts:D(2026,10,9,18,0) },
          { id:'sh3', empId:'e2', empName:'هاجر', branch:'echarpe El Rehab', barcode:'222', productName:'بيجامة قطن', qty:2, currentStock:1, status:'done', ts:D(2026,10,8,12,0), doneAt:D(2026,10,9,10,0) } ],
        pos_incidents: [
          { id:'in1', note:'الشاشة هنجت وقت الطباعة', branch:'echarpe El Rehab', employeeName:'سارة', ts:D(2026,10,10,14,30), seen:false, state:{ 'النافذة نشطة':'أيوه' }, events:[ { t:'14:29:50', kind:'ℹ️', msg:'بدأ الطباعة', hasFocus:true }, { t:'14:30:01', kind:'❌ خطأ', msg:'TypeError: print failed', hasFocus:true } ] },
          { id:'in2', note:'الكاشير اختفى', branch:'Glow', employeeName:'دينا', ts:D(2026,10,9,20,0), seen:true, state:{}, events:[ { t:'19:59:00', kind:'👁️', msg:'blur', hasFocus:false } ] },
          { id:'inOld', note:'بلاغ قديم جدًا', branch:'Glow', employeeName:'دينا', ts:D(2026,8,1,10,0), seen:false, state:{}, events:[] } ]
      } });
      // ---------- ✅ التاسكات ----------
      out.more = await pg.go('more');
      await pg.go('tasks', null, 300); await pg.call(()=> O2.tasks.branch('echarpe El Rehab'), 500); out.tasks = await pg.text(); out.tasksSub = await pg.p.evaluate(()=> document.getElementById('hSub').textContent);
      await pg.call(()=> O2.tasks.photo('sub1')); out.photo = await pg.sheetHtml(); await pg.call(()=> O2.closeSheet());
      await pg.call(()=> O2.tasks.decide('sub1','ok'), 200); out.tasksOk = await pg.text();
      await pg.call(()=> O2.tasks.decide('sub2','rej'), 200);
      await pg.call(()=> O2.tasks.decide('ghost','ok'), 100);
      await pg.call(()=> O2.tasks.assign('e2')); out.assignSheet = await pg.sheetHtml();
      await pg.call(()=>{ document.getElementById('tkDesc').value = 'سكشن C'; return O2.tasks.save('e2'); }, 200); out.tasksSaved = await pg.text();
      await pg.call(()=> O2.tasks.week(-1), 500); out.tasksPrev = await pg.text(); out.tasksPrevSub = await pg.p.evaluate(()=> document.getElementById('hSub').textContent);
      await pg.call(()=> O2.tasks.week(0), 300); await pg.call(()=> O2.tasks.branch('Glow'), 500); out.tasksGlow = await pg.text();
      // ---------- 📦 النواقص ----------
      out.short = await pg.go('short', null, 400);
      await pg.call(()=> O2.short.branch('Glow')); out.shortGlow = await pg.text();
      await pg.call(()=> O2.short.branch('')); await pg.call(()=> O2.short.done('sh1'), 200); out.shortAfter = await pg.text();
      await pg.call(()=> O2.short.done('sh3'), 100);
      await pg.call(()=> O2.short.view('done'), 300); out.shortDone = await pg.text();
      // ---------- 🐞 البلاغات ----------
      out.inc = await pg.go('incidents', null, 400);
      await pg.call(()=> O2.incidents.log('in1')); out.incLog = await pg.text();
      await pg.call(()=> O2.incidents.seen('in1'), 200); out.incAfter = await pg.text();
      await pg.call(()=> O2.incidents.seen('in2'), 100);
      await pg.call(()=> O2.incidents.view('all')); out.incAll = await pg.text();
      out.more2 = await pg.go('more');
      out.writes = await pg.writes(); out.errs = pg.errs;
      await pg.close();
    }catch(e){ out.fatal = String(e && e.stack || e); }
    process.stdout.write(JSON.stringify(out));
  })();
  return;
}
let out = null;
try{ out = JSON.parse(execFileSync(process.execPath, [__filename], { encoding:'utf8', timeout:120000, maxBuffer: 20*1024*1024, env: Object.assign({}, process.env, { O2_OPS_CHILD:'1' }) })); }catch(e){ out = { fatal: String(e && e.message) }; }
if(out.fatal && /playwright|Cannot find module/i.test(out.fatal)){ console.log('  ⏭ Office2 ops: كروميوم مش متاح —', out.fatal.slice(0,80)); }
else {
  assert(!out.fatal, 'الصفحة اشتغلت — ' + (out.fatal||''));
  assertEq((out.errs||[]).length, 0, 'مفيش أخطاء JS في الشاشات التلاتة — ' + JSON.stringify(out.errs||[]).slice(0,300));
  const W = out.writes || [];
  // ✅ التاسكات
  assert(/✅ التاسكات/.test(out.more||'') && /📦 النواقص/.test(out.more||'') && /🐞 بلاغات المشاكل/.test(out.more||''), 'الموديولات التلاتة ظاهرة في «المزيد»');
  const t = out.tasks || '';
  assert(/الأسبوع: 10\/10 → 16\/10 \(الحالي\)/.test(out.tasksSub||''), 'الأسبوع الحالي بيبدأ السبت 10/10 (نفس مفتاح sales/Office)');
  assert(/سارة[\s\S]*سكشن A/.test(t), 'تاسك سارة من sales_task_weeks');
  assert(/هاجر[\s\S]*سكشن B من الحضور[\s\S]*من تطبيق الحضور/.test(t), 'تاسك هاجر من sales_tasks (مصدر احتياطي من تطبيق الحضور)');
  assert(!/منى/.test(t), 'سلبي: الموظفة المنتهية خدمتها مش ظاهرة');
  assert(!/دينا|ترتيب الفاترينة/.test(t), 'سلبي: موظفة Glow مش ظاهرة في فرع El Rehab');
  assert(/⏳ 1/.test(t) && /⏳ مستني قرارك/.test(t) && /✅ اتقبل/.test(t), 'حالات التسليم: مستني · اتقبل');
  assert(!/⏳ 2/.test(t) && !/الإثنين 10-05/.test(t), 'سلبي: تسليم الأسبوع اللي فات (5/10) مش ظاهر في الأسبوع ده');
  assert(/<img src="data:image\/png;base64,iVBORw0KGgo="/.test(out.photo||''), 'الصورة بتتفتح في الشيت بـ<img>');
  const ok = W.find(w=> w.col==='sales_task_submissions' && w.id==='sub1');
  assert(ok && ok.op==='update' && ok.p.confirmed===true && typeof ok.p.confirmedAt==='number' && ok.p.rejected===false && ok.p.rejectedAt===null, '⭐ القبول بيكتب نفس حقول ofTaskPatch (confirmed · confirmedAt · rejected:false · rejectedAt:null)');
  assert(/سارة[\s\S]*✅ 1/.test(out.tasksOk||''), 'بعد القبول الشارة بقت ✅ 1');
  const rej = W.find(w=> w.col==='sales_task_submissions' && w.id==='sub2');
  assert(rej && rej.p.confirmed===false && rej.p.confirmedAt===null && rej.p.rejected===true && typeof rej.p.rejectedAt==='number', '⭐ الرفض بيلغي القبول القديم صراحة');
  assert(!W.some(w=> w.id==='ghost'), 'سلبي: تسليم مش موجود = مفيش كتابة');
  assert(/تاسك هاجر/.test(out.assignSheet||'') && /سكشن B من الحضور/.test(out.assignSheet||''), 'شيت التحديد بيجيب التاسك الحالي');
  const tk = W.find(w=> w.col==='sales_tasks' && w.id==='e2'); const tw = W.find(w=> w.col==='sales_task_weeks' && w.id==='e2__w2026-10-10');
  assert(tk && tk.op==='set' && tk.p.taskDescription==='سكشن C' && tk.p.weekKey==='w2026-10-10' && tk.p.employeeName==='هاجر' && tk.p.branch==='echarpe El Rehab' && typeof tk.p.assignedAt==='number', '⭐ الحفظ بيكتب sales_tasks/{empId} (اللي تطبيق الحضور بيقراه)');
  assert(tw && tw.p.taskDescription==='سكشن C' && tw.p.employeeId==='e2', '⭐ وبيكتب سجل الأسبوع sales_task_weeks/{empId__weekKey}');
  assert(/هاجر[\s\S]*سكشن C/.test(out.tasksSaved||''), 'الشاشة اتحدثت بالتاسك الجديد');
  assert(/الأسبوع: 3\/10 → 9\/10$/.test(out.tasksPrevSub||'') && /تاسك الأسبوع اللي فات/.test(out.tasksPrev||'') && /سارة\n⏳ 1[\s\S]*الإثنين 10-05 · 15:00/.test(out.tasksPrev||'') && !/سكشن C/.test(out.tasksPrev||''), 'الأسبوع اللي فات: تاسكه وتسليمه ظاهرين والحالي مش ظاهر');
  assert(/دينا[\s\S]*ترتيب الفاترينة/.test(out.tasksGlow||'') && !/سارة/.test(out.tasksGlow||''), 'فرع Glow: دينا بس');
  // 📦 النواقص
  const s = out.short || '';
  assert(/📦 مطلوب 2/.test(s), 'عدّاد المطلوب 2 (المنتهي مش محسوب)');
  assert(/El Rehab[\s\S]*طرحة شيفون[\s\S]*× 5[\s\S]*لون أسود · كود 111 · مخزون وقت الطلب: 2[\s\S]*طلبتها سارة · السبت 10-10 · 12:00/.test(s), 'طلب النقص: الاسم والكمية والتفصيل والكود والمخزون ومين وإمتى');
  assert(/Glow[\s\S]*سكارف[\s\S]*× 3[\s\S]*مخزون وقت الطلب: 0/.test(s), 'طلب Glow بمخزون 0');
  assert(!/بيجامة قطن/.test(s), 'سلبي: المنتهي (done) مش في المطلوب');
  assert(/سكارف/.test(out.shortGlow||'') && !/طرحة شيفون/.test(out.shortGlow||''), 'فلتر الفرع Glow');
  const dn = W.find(w=> w.col==='sales_shortages' && w.id==='sh1');
  assert(dn && dn.op==='update' && dn.p.status==='done' && typeof dn.p.doneAt==='number' && dn.p.doneFrom==='office2', '⭐ «اتجاب» بيكتب status:done + doneAt + doneFrom (نفس Office القديم)');
  assert(/📦 مطلوب 1/.test(out.shortAfter||'') && !/طرحة شيفون/.test(out.shortAfter||''), 'بعد «اتجاب» الطلب اختفى لايف والعدّاد 1');
  assert(W.filter(w=> w.col==='sales_shortages').length === 1, 'سلبي: المنتهي مش بيتكتب عليه تاني');
  assert(/بيجامة قطن/.test(out.shortDone||'') && /طرحة شيفون/.test(out.shortDone||'') && /اتجابت/.test(out.shortDone||''), 'تبويب «اتجاب»: اللي اتجاب في آخر 30 يوم');
  // 🐞 البلاغات
  const i = out.inc || '';
  assert(/🆕 جديد 1/.test(i) && /الكل 2/.test(i), 'عدّادات البلاغات: 1 جديد من 2 (القديم بره الـ30 يوم)');
  assert(/الشاشة هنجت وقت الطباعة[\s\S]*El Rehab · 👤 سارة · السبت 10-10 · 14:30/.test(i), 'البلاغ: الملاحظة والفرع والموظفة والوقت');
  assert(/❌ 1 خطأ برمجي — أولهم: TypeError: print failed/.test(i), 'التشخيص التلقائي: الخطأ البرمجي');
  assert(!/الكاشير اختفى/.test(i), 'سلبي: اللي اتشاف مش في «جديد»');
  assert(!/بلاغ قديم جدًا/.test(out.incAll||''), 'سلبي: البلاغ الأقدم من 30 يوم مش بيتحمّل');
  assert(/النافذة نشطة: أيوه[\s\S]*14:30:01 \[❌ خطأ\] TypeError: print failed/.test(out.incLog||''), 'السجل الكامل: الحالة والأحداث');
  const sn = W.find(w=> w.col==='pos_incidents' && w.id==='in1');
  assert(sn && sn.op==='update' && JSON.stringify(sn.p)==='{"seen":true}', '⭐ «اتشاف ✓» بيكتب seen:true بس (القواعد مش بتسمح بغيره)');
  assert(/مفيش بلاغات جديدة ✅/.test(out.incAfter||''), 'بعد «اتشاف» قايمة الجديد فاضية');
  assert(W.filter(w=> w.col==='pos_incidents').length === 1, 'سلبي: اللي اتشاف قبل كده مش بيتكتب تاني');
  assert(/الكاشير اختفى[\s\S]*🎯 تركيز النظام ضايع/.test(out.incAll||'') && /الشاشة هنجت/.test(out.incAll||''), 'تبويب «الكل» بالتشخيص (فقدان التركيز)');
  assert(/📦 النواقص[\s\S]*1\n/.test(out.more2||'') && !/🐞 بلاغات المشاكل[\s\S]*\n1\n/.test(out.more2||''), 'الشارات في «المزيد»: النواقص 1 · البلاغات بدون شارة بعد ما اتشافت');
}
