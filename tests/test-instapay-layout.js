/* 🧪 شكل شاشة إنستاباي على التابلت بالعرض (طلب المالك 22-09)
   1) شاشة الانتظار: المبلغ يمين · QR شمال     2) شاشة المسح: الكاميرا أقصى الشمال
   ⚠️ الشاشة RTL: العمود الأول في الشبكة = اليمين، والتاني = الشمال.
   🔴 22-09: الاختبار ده بيشتغل على الـCSS والـHTML **بعد ما يتنفّذوا**، مش على نص الملف.
      السبب: علامة backtick في تعليق جوّه بلوك الـCSS قفلت النص في نصّه وكسرت الملف كله —
      التابلت وقف عن استقبال الطلبات، والفحص النصي عدّاه لأن الكلام كان مكتوب في الملف فعلًا.
      (`node --check` كمان عدّاه — مبيفحصش الملف كموديول.) */
'use strict';
const fs = require('fs'), path = require('path');
const FILE = path.join(__dirname, '..', 'feedback', 'instapay-tablet.js');
const src = fs.readFileSync(FILE, 'utf8');
let pass = 0, fail = 0;
function t(n, fn){ try{ fn(); pass++; console.log('  ✅ ' + n); }catch(e){ fail++; console.log('  ❌ ' + n + ' → ' + e.message); } }
const ok = (c, m) => { if(!c) throw Error(m || 'fail'); };

/* 🔴 الملف بيتفسّر أصلًا؟ (بنشيل سطور import/export بس — الباقي زي ما هو) */
function parseFile(){
  const body = src.replace(/^\s*import[\s\S]*?;\s*$/gm, '').replace(/^\s*export\s+/gm, '');
  new Function(body);   // بيرمي لو فيه أي خطأ لغوي — ده اللي مسك باج الـbacktick
}
/* النصوص بعد التنفيذ — مش قراية من الملف */
function evalTemplate(name){
  const i = src.indexOf('const ' + name + ' =');
  ok(i >= 0, name + ' مش موجود');
  const start = src.indexOf('`', i);
  const end = src.indexOf('`;', start + 1);
  ok(end > start, name + ' مش مقفول صح');
  const out = eval(src.slice(start, end + 1));
  ok(typeof out === 'string' && out.length > 500, name + ' طلع فاضي/مقصوص (' + (out || '').length + ' حرف)');
  return out;
}
let _c = null, _h = null;
const CSS = () => (_c || (_c = evalTemplate('CSS')));
const HTML = () => (_h || (_h = evalTemplate('HTML')));
/* بلوك الميديا كويري بالأقواس المتوازنة */
function landscapeBlock(){
  const css = CSS();
  const i = css.indexOf('@media (orientation:landscape)');
  ok(i > 0, 'مفيش قواعد لوضع العرض');
  const open = css.indexOf('{', i);
  let d = 0, j = open;
  for(; j < css.length; j++){ const c = css[j]; if(c === '{') d++; else if(c === '}'){ d--; if(!d) break; } }
  return css.slice(open, j + 1);
}
function paneIds(paneId){
  const h = HTML();
  const i = h.indexOf('id="' + paneId + '"'); ok(i > 0, paneId + ' مش موجودة');
  const next = h.indexOf('<!--', i);
  const chunk = h.slice(i, next > 0 ? next : i + 2500);
  return { chunk, cols: (chunk.match(/class="ipCol ip[A-Za-z]+"|class="ipCam"/g) || []) };
}

console.log('\n📐 إنستاباي — الشكل بالعرض');
let _L = null; const L = () => (_L || (_L = landscapeBlock()));

t('🔴 الملف بيتفسّر من غير أخطاء لغوية', () => { parseFile(); });
t('🔴 كل ملفات التابلت بتتفسّر (نفس نوع الباج في أي ملف تاني)', () => {
  const dir = path.join(__dirname, '..', 'feedback');
  const bad = [];
  fs.readdirSync(dir).filter(f => f.endsWith('.js')).forEach(f => {
    const body = fs.readFileSync(path.join(dir, f), 'utf8')
      .replace(/^\s*import[\s\S]*?;\s*$/gm, '').replace(/^\s*export\s+/gm, '');
    try{ new Function(body); }catch(e){ bad.push(f + ': ' + e.message); }
  });
  ok(!bad.length, bad.join(' · '));
});
t('🔴 الـCSS والـHTML بيطلعوا كاملين بعد التنفيذ', () => {
  ok(CSS().includes('@media (orientation:landscape)'), 'قواعد العرض اتقصّت');
  ok(CSS().trim().endsWith('}'), 'بلوك الـCSS مقفول غلط');
  ok(HTML().includes('id="ipManBack"'), 'قالب الشاشات اتقصّ');
});
t('الوضع الطولي زي ما هو (الغلافين شفافين)', () => {
  ok(/\.ipCol\{display:contents\}/.test(CSS()), 'مفيش display:contents خارج الميديا كويري');
});
t('🔴 اللوحة المخفية تفضل مخفية بالعرض (display بيتحط على .on بس)', () => {
  const b = L();
  ok(/#ipWait\.on\{display:grid/.test(b), '#ipWait من غير .on هيفضل ظاهر فوق باقي الشاشات');
  ok(/#ipScan\.on\{display:grid/.test(b), '#ipScan من غير .on هيفضل ظاهر');
});

t('🔴 الانتظار: المبلغ في العمود اليمين والـQR في الشمال', () => {
  ok(/#ipWait\.on\{[^}]*display:grid/.test(L()), 'الانتظار مش شبكة');
  const m = L().match(/#ipWait\.on\{[^}]*grid-template-areas:\s*'([^']+)'\s*'([^']+)'/);
  ok(m, 'مفيش مناطق للشبكة');
  const r1 = m[1].trim().split(/\s+/), r2 = m[2].trim().split(/\s+/);
  ok(r1.length === 2 && r2.length === 2, 'الشبكة مش عمودين');
  ok(r1[0] === 'info' && r2[0] === 'act', 'العمود اليمين لازم يكون المبلغ والزراير: ' + m[1] + ' / ' + m[2]);
  ok(r1[1] === 'qr' && r2[1] === 'qr', 'العمود الشمال لازم يكون الـQR');
});

t('🔴 المسح: الكاميرا في العمود الشمال ولازقة في الحرف', () => {
  ok(/#ipScan\.on\{[^}]*grid-template-columns:\s*1fr auto/.test(L()), 'أعمدة شاشة المسح مش مظبوطة');
  const cam = L().match(/#ipScan \.ipCam\{([^}]+)\}/);
  ok(cam, 'مفيش قواعد للكاميرا بالعرض');
  ok(/justify-self:start/.test(cam[1]), 'الكاميرا مش ملزوقة في حرف الشاشة');
  ok(/height:100vh/.test(cam[1]), 'الكاميرا مش بطول الشاشة');
  ok(/border-radius:3vh 0 0 3vh/.test(cam[1]), 'التدوير لازم يكون من ناحية النص بس');
  ok(/#ipScan\.on\{[^}]*padding:0/.test(L()), 'فيه هامش هيبعد الكاميرا عن الحرف');
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
  const missing = need.filter(id => !HTML().includes('id="' + id + '"'));
  ok(!missing.length, 'ضاعوا: ' + missing.join(', '));
  // والجافاسكريبت بينده عليهم بالفعل
  const called = need.filter(id => src.includes("$('" + id + "')") || src.includes('$(\'' + id + '\')'));
  ok(called.length >= 8, 'الربط اتكسر');
});

t('الإصدارات اترفعت: الكشك بيحمّل v705 والكاش v706', () => {
  const idx = fs.readFileSync(path.join(__dirname, '..', 'feedback', 'index.html'), 'utf8');
  const m = idx.match(/instapay-tablet\.js\?v=(\d+)/); ok(m && Number(m[1]) >= 705, 'الكشك لسه بيحمّل نسخة قديمة');
  const sw = fs.readFileSync(path.join(__dirname, '..', 'feedback', 'sw.js'), 'utf8');
  const c = sw.match(/CACHE_NAME = '[a-z-]+v(\d+)'/); ok(c && Number(c[1]) >= 706, 'الكاش ماترفعش');
});

console.log('\n' + (fail ? '❌' : '✅') + ' test-instapay-layout: ' + pass + ' ناجح · ' + fail + ' فاشل');
if(typeof assert === 'function') assert(fail === 0, 'test-instapay-layout: ' + fail + ' فحص فشل');
else if(fail) process.exitCode = 1;
