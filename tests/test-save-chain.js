// ============================================================
// 🖨️ test-save-chain — مفيش كتابة بلا مهلة بعد الطباعة
//
// الباج التاريخي (بلاغ الفرع: \"بيعلّق بعد كل عملية فيزا، بيقف خالص\" —
// وباج تاني مكتشف بعده: نقط بياعة بتضيع بصمت من غير أي علامة):
// جوه `_doConfirmPayment` كانت فيه كتابة واحدة بس من غير `_waitWrite`:
//     await db.collection('sales_points').add({...})
// وكانت **بعد** الطباعة، كنداء منفصل. النتيجة كانت حالتين:
//   ١) لو الوعد اتعلّق (نت بطيء): كل اللي بعدها ما اشتغلش — نقط العميلة
//      والمكافأة وربط التقييم وتصفير الكارت و`goToSale()`. الشاشة قافلة
//      على صفحة الدفع بسلة مليانة، و`_confirmSaving` فاضلة true للأبد.
//   ٢) لو حصلت مقاطعة (قفل تاب، طفي جهاز، تحديث) في اللحظة بين الطباعة
//      ونداء النقطة: الفاتورة والمخزون يتسجلوا سليمين (كانوا في batch
//      منفصل بيتقيّد أوفلاين فورًا)، لكن النقطة تضيع بصمت من غير أي خطأ
//      يتمسك — الكاشير مش بتاخد أي تنبيه، والبياعة بتخسر نقطة حقيقية.
//
// الإصلاح: نقطة البياعة بقت **جوه نفس batch المخزون** (commit واحد قبل
// الطباعة)، مش نداء منفصل بعدها — نفس مستوى الحماية الأوفلاين بالظبط.
//
// الاختبار ده بيحرس **القاعدة** مش السطر: أي كتابة في سلسلة إتمام الفاتورة
// لازم يكون عليها مهلة، ونقطة البياعة تحديدًا لازم تفضل جوه batch المخزون.
// أي رجوع لنداء منفصل بعد الطباعة بيوقّع الاختبار — عشان الباج ده ميرجعش.
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
// ٣) 🖨️🔴🔴🔴 نقطة الموظف بقت جوه batch المخزون (قبل الطباعة) —
//    مش نداء منفصل بعد الطباعة زي ما كانت. أي مقاطعة (قفل تاب،
//    طفي جهاز) بعد الطباعة كانت بتضيّع النقطة بصمت والفاتورة/المخزون
//    يفضلوا سليمين — عشان المخزون كان في batch منفصل بيتقيّد أوفلاين
//    فورًا واللي بعده لأ. دلوقتي النقطة **في نفس الـbatch بالظبط**.
// ============================================================
(function(){
  const iPrint = bare.indexOf('_printNow();');
  const iGo    = bare.lastIndexOf('goToSale();');
  const iPts   = bare.indexOf("collection('sales_points')");
  assert(iPrint > 0 && iGo > iPrint, 'الطباعة قبل الخروج من الشاشة');
  assert(iPts > 0 && iPts < iPrint,
    '🔴🔴🔴 نقطة البياعة بقت **قبل** الطباعة (جوه batch المخزون) — مش بعدها');

  const head = bare.slice(0, iPrint);
  assert(/batch\.set\(pointsRef,/.test(head),
    '🔴🔴 نقطة البياعة بتتكتب بـ batch.set (جوه نفس batch المخزون) مش .add() منفصل');
  assert(/const _stockP = batch\.commit\(\);/.test(head) && head.indexOf('const _stockP = batch.commit();') > head.indexOf('batch.set(pointsRef,'),
    'والـ batch بتاعها بيتقفل (commit) واحد بس يشمل المخزون والنقطة مع بعض');

  const tail = bare.slice(iPrint, iGo);
  assert(tail.indexOf("collection('sales_points')") === -1,
    '🔴 مفيش أي أثر لكتابة sales_points منفصلة في الذيل بعد الطباعة تاني');
  assert(/paymobReset\(\)/.test(tail),
    'وتصفير بيانات الكارت في نفس الذيل (لو وقف، الكارت بيلوّث الفاتورة اللي بعدها)');

  // كل الكتابات المتبقية في الذيل (نقط العميلة، ربط التقييم، إلخ) — لسه كلهم مربوطين بمهلة
  const writes = (tail.match(/_waitWrite\(/g) || []).length;
  assert(writes >= 3, 'باقي كتابات الذيل لسه عليها مهلة (' + writes + ')');

  // 🛡️ وbatch المخزون+النقطة نفسه (اللي فيه النقطة دلوقتي) لسه عليه مهلة —
  //    الانتظار نفسه بعد الطباعة عمدًا (زي ما كان)، بس التقييد (commit)
  //    قبلها، وده اللي بيضمن التقيّد الأوفلاين الفوري للنقطة زي المخزون.
  assert(/const _stockP = batch\.commit\(\);/.test(head), 'الـ batch (مخزون + نقطة) بيتقفل قبل الطباعة');
  assert(/const _stockW = await _waitWrite\(_stockP\);/.test(bare),
    'وبعده بننتظر تأكيده بمهلة (بعد الطباعة عمدًا، زي التصميم الأصلي)');
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
