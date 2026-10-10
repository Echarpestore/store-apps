// Office 2 — بيفتح الصفحة الحقيقية في كروميوم مع Firebase وهمي (compat) وبيانات واقعية، ويدوس على كل الشاشات والإجراءات
const { open } = require('./office2-page'); const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
(async()=>{
  const pg = await open(); const { p, b, errs } = pg;
  const out = {}; const step = (n)=>{ if(process.env.O2_DEBUG) process.stderr.write(n + ' '); };
  const shots = process.argv[2] || '';
  out.today = await p.evaluate(()=> document.getElementById('screen').innerText);
  if(shots) await p.screenshot({ path: shots + '-today.png' });
  // صفحة الفرع: النهاردة ثم امبارح (تحميل عند الطلب) + فاتورة
  step('branch'); await p.evaluate(()=> O2.go('branch','echarpe El Rehab')); await p.waitForTimeout(150); out.branchToday = await p.evaluate(()=> document.getElementById('screen').innerText);
  if(shots) await p.screenshot({ path: shots + '-branch.png', fullPage:true });
  await p.evaluate(()=> O2.day(-1)); await p.waitForTimeout(300); out.branchYday = await p.evaluate(()=> document.getElementById('screen').innerText);
  await p.evaluate(()=> O2.invoice('2026-10-09','v3')); await p.waitForTimeout(80); out.invoice = await p.evaluate(()=> document.getElementById('sheetBody').innerText); await p.evaluate(()=> O2.closeSheet());
  step('activity'); await p.evaluate(()=> O2.go('activity')); await p.waitForTimeout(300); out.activity = await p.evaluate(()=> document.getElementById('screen').innerText);
  if(shots) await p.screenshot({ path: shots + '-activity.png', fullPage:true });
  await p.evaluate(()=> O2.shFilter('discount')); await p.waitForTimeout(80); out.activityDisc = await p.evaluate(()=> document.getElementById('screen').innerText);
  await p.evaluate(()=> O2.shFilter('all')); await p.evaluate(()=> O2.shDecide('drawer_l10','ok', window.__now)); await p.waitForTimeout(150); out.activityOk = await p.evaluate(()=> document.getElementById('screen').innerText);
  await p.evaluate(()=> O2.shVideo('echarpe El Rehab', window.__now - 3600000)); await p.waitForTimeout(80); out.video = await p.evaluate(()=> document.getElementById('sheetBody').innerHTML); await p.evaluate(()=> O2.closeSheet());
  step('staff'); await p.evaluate(()=> O2.go('staff')); await p.waitForTimeout(100); out.staff = await p.evaluate(()=> document.getElementById('screen').innerText);
  if(shots) await p.screenshot({ path: shots + '-staff.png' });
  await p.evaluate(()=> O2.go('emp','e1')); await p.waitForTimeout(100); out.emp = await p.evaluate(()=> document.getElementById('screen').innerText);
  if(shots) await p.screenshot({ path: shots + '-emp.png', fullPage:true });
  // إجراء: اعذر تأخير شيفت s2
  await p.evaluate(()=> O2.shift('s2')); await p.waitForTimeout(80); out.sheet = await p.evaluate(()=> document.getElementById('sheetBody').innerText);
  await p.evaluate(()=> O2.excuse('s2')); await p.waitForTimeout(150);
  await p.evaluate(()=> O2.go('inbox')); await p.waitForTimeout(100); out.inbox = await p.evaluate(()=> document.getElementById('screen').innerText);
  if(shots) await p.screenshot({ path: shots + '-inbox.png' });
  await p.evaluate(()=> O2.leave('l1', true)); await p.waitForTimeout(150); out.inboxAfter = await p.evaluate(()=> document.getElementById('screen').innerText);
  await p.evaluate(()=> O2.inboxTab('auto')); await p.waitForTimeout(80); out.auto = await p.evaluate(()=> document.getElementById('screen').innerText);
  step('money'); await p.evaluate(()=> O2.go('money')); await p.waitForTimeout(100); out.money = await p.evaluate(()=> document.getElementById('screen').innerText);
  await p.evaluate(()=> O2.moneyTab('pay')); await p.waitForTimeout(80); out.pay = await p.evaluate(()=> document.getElementById('screen').innerText);
  if(shots) await p.screenshot({ path: shots + '-pay.png' });
  step('paysheet'); await p.evaluate(()=> O2.paySheet('e1')); await p.waitForTimeout(80); out.paySheet = await p.evaluate(()=> document.getElementById('sheetBody').innerText);
  if(shots) await p.screenshot({ path: shots + '-paysheet.png' });
  // صرف المرتب مرتين = مرة واحدة بس
  step('pay1'); await p.evaluate(()=> O2.paySalary('e1', 3000)); await p.waitForTimeout(150);
  step('pay2'); await p.evaluate(()=> O2.paySalary('e1', 3000)); await p.waitForTimeout(150);
  await p.evaluate(()=> O2.payComm('e2', 2, 20, '2026-10')); await p.waitForTimeout(120);
  // سلفة + خصم + مصروف (prompt بيرجع '250' للرقم و'سبب اختبار' للنص عبر الـdialog handler)
  step('adv'); await p.evaluate(()=> O2.addAdvance('e2')); await p.waitForTimeout(120);
  await p.evaluate(()=> O2.addDeduction('e3')); await p.waitForTimeout(120);
  await p.evaluate(()=> O2.moneyTab('exp')); await p.waitForTimeout(80); out.exp = await p.evaluate(()=> document.getElementById('screen').innerText);
  step('exp'); await p.evaluate(()=> O2.addExpense()); await p.waitForTimeout(120);
  out.exp2 = await p.evaluate(()=> document.getElementById('screen').innerText);
  out.writes = await p.evaluate(()=> window.__writes); out.errs = errs;
  process.stdout.write(JSON.stringify(out)); await b.close();
})().catch(e=>{ process.stdout.write(JSON.stringify({ fatal: String(e && e.stack || e) })); process.exit(0); });
