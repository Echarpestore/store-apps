// ============================================================
// 🖨️ test-save-chain — مفيش كتابة بلا مهلة بعد الطباعة
//
// الباج (بلاغ الفرع: \"بيعلّق بعد كل عملية فيزا، بيقف خالص\"):
// جوه `_doConfirmPayment` كانت فيه كتابة واحدة بس من غير `_waitWrite`:
//     await db.collection('sales_points').add({...})
// ووعد كتابة Firestore **مبيتحلّش** لما السيرفر مايبقاش واصل — الـoffline
// persistence بتقيّد محليًا وتفضل مستنية آك السيرفر. ومبيرميش خطأ، فالـ
// try/catch اللي حواليه مبيمسكش حاجة أصلًا.
//
// ولأنها **بعد** الطباعة، الصورة اللي بتوصل للكاشير:
//   الورقة طلعت ✔ · الفاتورة اتحفظت ✔ · المخزون اتخصم ✔
//   وبعدين كل اللي بعدها ما اشتغلش: نقط العميلة · المكافأة · ربط التقييم
//   · تصفير الكارت · `goToSale()`
//   → الشاشة قافلة على صفحة الدفع بسلة مليانة، و`_confirmSaving` فاضلة true
//     فأي محاولة تانية بترد \"الفاتورة بتتحفظ... استنى ثانية\" للأبد.
//
// الاختبار ده بيحرس **القاعدة** مش السطر: أي كتابة في سلسلة إتمام الفاتورة
// لازم يكون عليها مهلة. أي `await` جديد على كتابة من غير `_waitWrite`
// بيوقّع الاختبار — عشان الباج ده ميرجعش من باب تاني.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'pos', 'pos-sale.js'), 'utf8');

function extractFn(s, header){
  const i = s.indexOf(header);
  if(i < 0) return null;
  let d = 0, st = false;
  for(let j = s.indexOf('{', i); j < s.length; j++){
    if(s[j] === '{'){ d++; st = true; }
    else if(s[j] === '}'){ d--; if(st && d === 0) return s.slice(i, j + 1); }
  }
  return null;
}
function stripComments(s){
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

const fn = extractFn(src, 'async function _doConfirmPayment(');
assert(!!fn, 'اتلقت دالة حفظ الفاتورة');

const bare = stripComments(fn);

// ============================================================
// ١) 🛡️ المهلة نفسها موجودة وبقيمة معقولة
// ============================================================
(function(){
  const m = src.match(/const _WRITE_WAIT_MS = (\d+);/);
  assert(!!m, 'مهلة الكتابة متعرّفة');
  const ms = m ? Number(m[1]) : 0;
  assert(ms >= 1000 && ms <= 15000, 'المهلة بين ثانية و15 ثانية (لقينا ' + ms + ')');

  const w = extractFn(src, 'function _waitWrite(');
  assert(!!w, 'اتلقت _waitWrite');
  if(w){
    assert(/setTimeout/.test(w) && /res\(\{ queued:true \}\)/.test(w),
      '⭐ بترجع \"اتقيّدت أوفلاين\" لما المهلة تعدّي بدل ما تفضل معلّقة');
    assert(/_offlineQueued = true/.test(w), 'وبتعلّم إن فيه كتابة مؤجلة (الكاشير بتشوف رسالة)');
    assert(/\.catch\(/.test(w), 'والخطأ مبيرميش الدالة');
  }
})();

// ============================================================
// ٢) ⭐⭐ مفيش أي كتابة بلا مهلة في السلسلة كلها
//    (القراءة `.get()` مختلفة: بترد من الكاش المحلي وبتتحل عادي)
// ============================================================
(function(){
  const lines = bare.split('\n');
  const offenders = [];
  lines.forEach((ln, i)=>{
    if(ln.indexOf('await') < 0) return;
    if(/_waitWrite\(|_raceTimeout\(/.test(ln)) return;      // عليها مهلة ✔
    if(/await\s+[\w.$]*\.get\(|await\s+get\w*\(/.test(ln)) return;  // قراءة
    // كتابة؟ (بتبدأ في السطر ده أو اللي بعده مباشرة)
    const win = ln + ' ' + (lines[i+1] || '');
    if(/\.(add|set|update|delete|commit)\s*\(/.test(win)){
      offenders.push((i+1) + ': ' + ln.trim().slice(0, 80));
    }
  });
  assert(offenders.length === 0,
    '⭐⭐ مفيش كتابة من غير مهلة في سلسلة حفظ الفاتورة' +
    (offenders.length ? ' — لقينا: ' + offenders.join(' | ') : ''));
})();

// ============================================================
// ٣) 🖨️ الترتيب المقصود: الورقة قبل الانتظار، وقفل الشاشة في الآخر
// ============================================================
(function(){
  const iPrint = bare.indexOf('_printNow();');
  const iGo    = bare.lastIndexOf('goToSale();');
  const iPts   = bare.indexOf("collection('sales_points')");
  assert(iPrint > 0 && iGo > iPrint, 'الطباعة قبل الخروج من الشاشة');
  assert(iPts > iPrint,
    '⭐ كتابة نقط البياعة بعد الطباعة — عشان كده تعليقها كان بيوقف كل اللي بعدها');

  const tail = bare.slice(iPrint, iGo);
  assert(/_waitWrite\(db\.collection\('sales_points'\)/.test(tail),
    '⭐⭐ نقط البياعة عليها مهلة (دي كانت الكتابة العارية الوحيدة)');
  assert(/paymobReset\(\)/.test(tail),
    'وتصفير بيانات الكارت في نفس الذيل (لو وقف، الكارت بيلوّث الفاتورة اللي بعدها)');

  // كل الكتابات في الذيل — عدّهم وتأكد إن كلهم مربوطين
  const writes = (tail.match(/_waitWrite\(/g) || []).length;
  assert(writes >= 4, 'كل كتابات الذيل عليها مهلة (' + writes + ')');
})();

// ============================================================
// ٤) 🔓 قفل الحفظ بيتفك دايمًا
// ============================================================
(function(){
  const outer = extractFn(src, 'async function confirmPayment(');
  assert(!!outer, 'اتلقت confirmPayment');
  if(!outer) return;
  const ob = stripComments(outer);
  assert(/_confirmSaving = true/.test(ob) && /_confirmSaving = false/.test(ob), 'القفل بيتحط وبيتفك');
  const iFin = ob.indexOf('}finally{') >= 0 ? ob.indexOf('}finally{') : ob.indexOf('} finally {');
  const iUnlock = ob.indexOf('_confirmSaving = false');
  assert(iFin > 0 && iUnlock > iFin,
    '⭐⭐ فك القفل جوه finally — لو كان بره، أي استثناء كان هيقفل الكاشير برة الشغل');
  assert(/await _doConfirmPayment\(\)/.test(ob),
    '⚠️ الحفظ متنتظر — وعشان كده أي كتابة معلّقة جواه بتوقف finally نفسها');
})();

// ============================================================
// ٥) نسخة الكاش
// ============================================================
(function(){
  const sw = fs.readFileSync(path.join(ROOT, 'pos', 'sw.js'), 'utf8');
  const m = sw.match(/store-apps-shell-v(\d+)/);
  assert(!!m && Number(m[1]) >= 285, 'pos/sw.js: v285+ (لقينا ' + (m ? m[1] : '—') + ')');
})();
