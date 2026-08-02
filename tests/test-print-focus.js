// ============================================================
// 🎯 test-print-focus — كل مسار طباعة لازم يرجّع التركيز
// الشكوى: «بيحصل بعد عملية البيع، مش دايمًا».
// السبب: النظام فيه 7 مسارات طباعة، كلهم بينادوا reclaimWindowFocus
// **ما عدا `printReceipt` نفسها** — إيصال البيع، أكتر طباعة بتحصل في اليوم.
// الاختبار بيمشي على كل نداء window.print()/posShell.printReceipt ويتأكد
// إن فيه استرجاع تركيز في نفس الدالة.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const POS = path.resolve(__dirname, '..', 'pos');

function extractFn(s, name){
  const st = s.indexOf('function ' + name + '(');
  if(st < 0) return '';
  const op = s.indexOf('{', st);
  let d = 0;
  for(let i = op; i < s.length; i++){
    if(s[i] === '{') d++;
    else if(s[i] === '}'){ d--; if(d === 0) return s.slice(st, i + 1); }
  }
  return '';
}

const app = fs.readFileSync(path.join(POS, 'app.js'), 'utf8');
const core = fs.readFileSync(path.join(POS, 'pos-core.js'), 'utf8');

assert(extractFn(core, 'reclaimWindowFocus').length > 100, 'دالة استرجاع التركيز موجودة');

// كل نداء طباعة صامتة (الـexe) لازم يتبعه استرجاع تركيز
{
  const lines = app.split('\n');
  let silent = 0;
  lines.forEach((ln, i)=>{
    if(ln.indexOf('posShell.printReceipt') < 0) return;
    silent++;
    const after = lines.slice(i, i + 24).join('\n');
    assert(after.indexOf('reclaimWindowFocus') >= 0,
      '🖨️ الطباعة الصامتة في السطر ' + (i + 1) + ' بيتبعها استرجاع تركيز');
  });
  assert(silent >= 2, 'لقينا مسارات الطباعة الصامتة (' + silent + ')');
}

// مافيش مسار طباعة اتنسي: أي window.print في app.js لازم تكون في دالة
// بترجّع التركيز
{
  const lines = app.split('\n');
  lines.forEach((ln, i)=>{
    if(ln.indexOf('window.print()') < 0) return;
    const around = lines.slice(Math.max(0, i - 30), i + 8).join('\n');
    assert(around.indexOf('reclaimWindowFocus') >= 0,
      '🔍 نداء window.print() في السطر ' + (i + 1) + ' حواليه استرجاع تركيز');
  });
}
