/* 🧪 شكل شاشة إنستاباي على التابلت بالعرض (طلب المالك 22-09)
   1) شاشة الانتظار: المبلغ يمين · QR شمال     2) شاشة المسح: الكاميرا أقصى الشمال
   ⚠️ الشاشة RTL: العمود الأول في الشبكة = اليمين، والتاني = الشمال. */
'use strict';
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'feedback', 'instapay-tablet.js'), 'utf8');
let pass = 0, fail = 0;
function t(n, fn){ try{ fn(); pass++; console.log('  ✅ ' + n); }catch(e){ fail++; console.log('  ❌ ' + n + ' → ' + e.message); } }
const ok = (c, m) => { if(!c) throw Error(m || 'fail'); };

/* بلوك الميديا كويري بالأقواس المتوازنة — مش بحث في الملف كله */
function landscapeBlock(){
  const i = src.indexOf('@media (orientation:landscape)');
  ok(i > 0, 'مفيش قواعد لوضع العرض');
  const open = src.indexOf('{', i);
  let d = 0, j = open;
  for(; j < src.length; j++){ const c = src[j]; if(c === '{') d++; else if(c === '}'){ d--; if(!d) break; } }
  return src.slice(open, j + 1);
}
/* ترتيب العناصر جوّه لوحة معيّنة في قالب الـHTML */
function paneIds(paneId){
  const i = src.indexOf('id="' + paneId + '"'); ok(i > 0, paneId + ' مش موجودة');
  const next = src.indexOf('<!--', i);
  const chunk = src.slice(i, next > 0 ? next : i + 2500);
  return { chunk, ids: (chunk.match(/id="[a-zA-Z0-9_]+"/g) || []).map(x => x.slice(4, -1)),
           cols: (chunk.match(/class="ipCol ip[A-Za-z]+"|class="ipCam"/g) || []) };
}

console.log('\n📐 إنستاباي — الشكل بالعرض');
let _L = null; const L = () => (_L || (_L = landscapeBlock()));

t('الوضع الطولي زي ما هو (الغلافين شفافين)', () => {
  ok(/\.ipCol\{display:contents\}/.test(src), 'مفيش display:contents خارج الميديا كويري');
});

t('🔴 الانتظار: المبلغ في العمود اليمين والـQR في الشمال', () => {
  ok(/#ipWait\{[^}]*display:grid/.test(L()), 'الانتظار مش شبكة');
  const m = L().match(/#ipWait\{[^}]*grid-template-areas:\s*'([^']+)'\s*'([^']+)'/);
  ok(m, 'مفيش مناطق للشبكة');
  const r1 = m[1].trim().split(/\s+/), r2 = m[2].trim().split(/\s+/);
  ok(r1.length === 2 && r2.length === 2, 'الشبكة مش عمودين');
  ok(r1[0] === 'info' && r2[0] === 'act', 'العمود اليمين لازم يكون المبلغ والزراير: ' + m[1] + ' / ' + m[2]);
  ok(r1[1] === 'qr' && r2[1] === 'qr', 'العمود الشمال لازم يكون الـQR');
});

t('🔴 المسح: الكاميرا في العمود الشمال ولازقة في الحرف', () => {
  ok(/#ipScan\{[^}]*grid-template-columns:\s*1fr auto/.test(L()), 'أعمدة شاشة المسح مش مظبوطة');
  const cam = L().match(/#ipScan \.ipCam\{([^}]+)\}/);
  ok(cam, 'مفيش قواعد للكاميرا بالعرض');
  ok(/justify-self:start/.test(cam[1]), 'الكاميرا مش ملزوقة في حرف الشاشة');
  ok(/height:100vh/.test(cam[1]), 'الكاميرا مش بطول الشاشة');
  ok(/border-radius:3vh 0 0 3vh/.test(cam[1]), 'التدوير لازم يكون من ناحية النص بس');
  ok(/#ipScan\{[^}]*padding:0/.test(L()), 'فيه هامش هيبعد الكاميرا عن الحرف');
});

t('🔴 الكاميرا آخر عنصر في لوحة المسح (= العمود الشمال في RTL)', () => {
  const p = paneIds('ipScan');
  ok(p.cols.length === 2, 'المفروض غلافين: النص والكاميرا — لقيت ' + p.cols.length);
  ok(/class="ipCam"/.test(p.cols[1]), 'الكاميرا مش آخر عنصر — هتطلع يمين');
});

t('🔴 ترتيب لوحة الانتظار: معلومات ← QR ← زراير', () => {
  const p = paneIds('ipWait');
  ok(p.cols.length === 3, 'المفروض 3 أغلفة — لقيت ' + p.cols.length);
  ok(/ipColInfo/.test(p.cols[0]) && /ipColQr/.test(p.cols[1]) && /ipColAct/.test(p.cols[2]), p.cols.join(' | '));
});

t('كل العناصر اللي الكود بينده عليها لسه مكانها', () => {
  const need = ['ipAmt','ipQrImg','ipWho','ipDone','ipWaitBack','ipVid','ipC1','ipC2','ipC3','ipC4','ipHint','ipBack','ipHelp'];
  const missing = need.filter(id => !src.includes('id="' + id + '"'));
  ok(!missing.length, 'ضاعوا: ' + missing.join(', '));
  // والجافاسكريبت بينده عليهم بالفعل
  const called = need.filter(id => src.includes("$('" + id + "')") || src.includes('$(\'' + id + '\')'));
  ok(called.length >= 8, 'الربط اتكسر');
});

t('الإصدارات اترفعت: الكشك بيحمّل v704 والكاش v705', () => {
  const idx = fs.readFileSync(path.join(__dirname, '..', 'feedback', 'index.html'), 'utf8');
  const m = idx.match(/instapay-tablet\.js\?v=(\d+)/); ok(m && Number(m[1]) >= 704, 'الكشك لسه بيحمّل نسخة قديمة');
  const sw = fs.readFileSync(path.join(__dirname, '..', 'feedback', 'sw.js'), 'utf8');
  const c = sw.match(/CACHE_NAME = '[a-z-]+v(\d+)'/); ok(c && Number(c[1]) >= 705, 'الكاش ماترفعش');
});

console.log('\n' + (fail ? '❌' : '✅') + ' test-instapay-layout: ' + pass + ' ناجح · ' + fail + ' فاشل');
if(typeof assert === 'function') assert(fail === 0, 'test-instapay-layout: ' + fail + ' فحص فشل');
else if(fail) process.exitCode = 1;
