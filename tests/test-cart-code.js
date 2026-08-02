// ============================================================
// 🔢 test-cart-code — كود القطعة تحت اسم المنتج في السلة
// الشكوى (المالك، صورة من الفرع): السطر المحدّد خلفيته زرقا والكود
// رمادي باهت جواها — مش مقروء.
//
// ⚠️ الاختبار ده **سلوكي** بمعنى الكلمة: بيبني **محرّك cascade مصغّر**
//    (تخصيصية + !important + ترتيب) ويحسب اللون **الفعلي** اللي هيطلع
//    على الشاشة، مش بيدوّر على نص في المصدر.
//    السبب: الباج الأصلي مكانش «اللون غلط» — كان قاعدة `.cart-code`
//    فوق عليها `!important` بتاكل أي قاعدة تحتها. اختبار نصّي كان
//    هينجح وهو شايف قاعدة موجودة ومش شغالة.
//
// وفي الآخر **اختبار سلبي على الاختبار نفسه**: بنشيل الـ!important من
// قاعدة السطر المحدّد ونتأكد إن المحرّك بيرجع رمادي تاني (يعني لو الباج
// رجع، الاختبار بيقع فعلًا).
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');

const POS = path.resolve(__dirname, '..', 'pos');
const htmlSrc = fs.readFileSync(path.join(POS, 'index.html'), 'utf8');
const saleSrc = fs.readFileSync(path.join(POS, 'pos-sale.js'), 'utf8');

// ---------- 1) استخراج كل بلوكات <style> ----------
function allStyleCss(html){
  const out = [];
  const re = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  while((m = re.exec(html))) out.push(m[1]);
  return out.join('\n');
}
const CSS = allStyleCss(htmlSrc);
assert(CSS.length > 500, 'لقينا بلوكات <style> في pos/index.html');

// ---------- 2) بارسر قواعد (بيتعامل مع @media وبيتخطى @keyframes) ----------
function parseRules(css){
  const rules = [];
  let order = 0;
  (function walk(src){
    let i = 0, buf = '';
    while(i < src.length){
      const ch = src[i];
      if(ch === '{'){
        // لاقينا نهاية السيلكتور — هات جسم البلوك بالأقواس المتوازنة
        let depth = 1, j = i + 1;
        while(j < src.length && depth > 0){
          if(src[j] === '{') depth++;
          else if(src[j] === '}') depth--;
          j++;
        }
        const body = src.slice(i + 1, j - 1);
        const sel = buf.trim();
        buf = '';
        i = j;
        if(/^@(media|supports|layer)/i.test(sel)) walk(body);          // ادخل جوه
        else if(/^@/.test(sel)) { /* keyframes/font-face — اتخطى */ }
        else rules.push({ selector: sel, body: body, order: order++ });
        continue;
      }
      buf += ch;
      i++;
    }
  })(css);
  return rules;
}
const RULES = parseRules(CSS);
assert(RULES.length > 50, 'البارسر طلّع قواعد CSS (' + RULES.length + ' قاعدة)');

// ---------- 3) عنصر وهمي: سلسلة الأجداد الحقيقية ----------
// div.cart-area > table.cart-table > tbody > tr(.sel/.ret/.just-added) > td.item-name > div.cart-code
function chainFor(rowClasses){
  return [
    { tag: 'body',  cls: [] },
    { tag: 'div',   cls: ['cart-area'] },
    { tag: 'table', cls: ['cart-table'] },
    { tag: 'tbody', cls: [] },
    { tag: 'tr',    cls: rowClasses },
    { tag: 'td',    cls: ['item-name'] },
    { tag: 'div',   cls: ['cart-code'] }
  ];
}

// ---------- 4) مطابقة سيلكتور مركّب على عنصر ----------
function matchCompound(comp, el){
  const m = comp.match(/^([a-zA-Z][\w-]*|\*)?((?:[.#][\w-]+)*)((?::{1,2}[\w-]+(?:\([^)]*\))?)*)$/);
  if(!m) return null;                       // سيلكتور مش مفهوم للمحرّك
  const tag = m[1], rest = m[2] || '', pseudo = m[3] || '';
  if(/:(hover|active|focus|checked|disabled|first-child|last-child|nth|before|after|placeholder|not)/i.test(pseudo)) return null;
  if(tag && tag !== '*' && tag !== el.tag) return false;
  const ids = [], classes = [];
  (rest.match(/[.#][\w-]+/g) || []).forEach(function(t){
    if(t[0] === '#') ids.push(t.slice(1)); else classes.push(t.slice(1));
  });
  if(ids.length) return false;              // العناصر دي مالهاش id
  for(const c of classes) if(el.cls.indexOf(c) < 0) return false;
  return { a: ids.length, b: classes.length, c: (tag && tag !== '*') ? 1 : 0 };
}

// بيرجع التخصيصية لو السيلكتور مطابق للعنصر الأخير في السلسلة، وإلا null
function matchSelector(sel, chain){
  if(/[\[~^$|]|:not\(|::/.test(sel)) return null;   // برّه قدرة المحرّك
  const parts = sel.trim().split(/\s+/);
  const seq = [];
  for(const p of parts){
    if(p === '>' ) { seq.push('>'); continue; }
    if(p === '+' || p === '~') return null;         // مش مدعوم — تجاهل القاعدة
    seq.push(p);
  }
  // امشي من الآخر للأول
  let ci = chain.length - 1;
  let spec = { a: 0, b: 0, c: 0 };
  let i = seq.length - 1;
  let mustBeParent = false;
  let firstStep = true;
  while(i >= 0){
    const tok = seq[i];
    if(tok === '>'){ mustBeParent = true; i--; continue; }
    let found = -1;
    if(firstStep){
      const r = matchCompound(tok, chain[ci]);
      if(r === null) return null;
      if(r === false) return null;                  // القاعدة مش على عنصرنا
      spec.a += r.a; spec.b += r.b; spec.c += r.c;
      found = ci;
      firstStep = false;
    } else if(mustBeParent){
      const r = matchCompound(tok, chain[ci]);
      if(r === null) return null;
      if(r === false) return null;
      spec.a += r.a; spec.b += r.b; spec.c += r.c;
      found = ci;
    } else {
      for(let k = ci; k >= 0; k--){
        const r = matchCompound(tok, chain[k]);
        if(r === null) return null;
        if(r){ spec.a += r.a; spec.b += r.b; spec.c += r.c; found = k; break; }
      }
      if(found < 0) return null;
    }
    ci = found - 1;
    mustBeParent = false;
    i--;
    if(ci < 0 && i >= 0) return null;
  }
  return spec;
}

// ---------- 5) حساب القيمة الفعلية لخاصية ----------
function resolve(prop, chain, rules){
  let best = null;
  for(const rule of rules){
    for(const sel of rule.selector.split(',')){
      const spec = matchSelector(sel, chain);
      if(!spec) continue;
      const re = new RegExp('(?:^|;)\\s*' + prop + '\\s*:([^;]+)', 'i');
      const dm = rule.body.match(re);
      if(!dm) continue;
      let val = dm[1].trim();
      const important = /!important/i.test(val);
      val = val.replace(/!important/i, '').trim();
      const cand = { val: val, important: important, spec: spec, order: rule.order };
      if(!best) { best = cand; continue; }
      if(cand.important !== best.important){ if(cand.important) best = cand; continue; }
      const s1 = cand.spec, s0 = best.spec;
      const w1 = s1.a * 10000 + s1.b * 100 + s1.c;
      const w0 = s0.a * 10000 + s0.b * 100 + s0.c;
      if(w1 > w0 || (w1 === w0 && cand.order >= best.order)) best = cand;
    }
  }
  return best ? best.val : null;
}

// ---------- 6) تباين الألوان (WCAG) ----------
function hex2rgb(h){
  h = h.trim().replace('#','');
  if(h.length === 3) h = h.split('').map(c=>c+c).join('');
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}
function lum(rgb){
  const s = rgb.map(function(v){
    v = v / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126*s[0] + 0.7152*s[1] + 0.0722*s[2];
}
function contrast(a, b){
  const l1 = lum(hex2rgb(a)), l2 = lum(hex2rgb(b));
  const hi = Math.max(l1,l2), lo = Math.min(l1,l2);
  return (hi + 0.05) / (lo + 0.05);
}

// ---------- 7) الفحوصات ----------
// الكود لسه بيتطبع أصلًا
assert(/class="cart-code"/.test(saleSrc), 'سطر السلة لسه بيطبع <div class="cart-code">');

// خلفية السطر المحدّد — بنجيبها من الـCSS نفسها مش بالإيد
const selRule = RULES.find(r => /tbody\s+tr\.sel\s+td\s*$/.test(r.selector.trim()));
assert(!!selRule, 'قاعدة السطر المحدّد (tr.sel td) موجودة');
const selBgLight = (selRule && (selRule.body.match(/linear-gradient\(\s*(#[0-9a-f]{3,6})/i) || [])[1]) || '#5b9bd5';

// (أ) السطر العادي — أبيض تحت
const plainChain = chainFor([]);
const plainColor = resolve('color', plainChain, RULES);
assert(!!plainColor && /^#/.test(plainColor), 'اللون الفعلي للكود في السطر العادي اتحسب: ' + plainColor);
assert(contrast(plainColor, '#ffffff') >= 4.5,
  'الكود مقروء على الخلفية البيضا (تباين ' + contrast(plainColor, '#ffffff').toFixed(2) + ')');

// (ب) السطر المحدّد — دي كانت الشكوى
const selChain = chainFor(['sel']);
const selColor = resolve('color', selChain, RULES);
assert(!!selColor && /^#/.test(selColor), 'اللون الفعلي للكود في السطر المحدّد اتحسب: ' + selColor);
const selContrast = contrast(selColor, selBgLight);
assert(selContrast >= 2.5,
  'الكود مقروء على السطر المحدّد — تباين ' + selContrast.toFixed(2) + ' على ' + selBgLight + ' (الحد 2.5)');

// (ج) سطر المرتجع المحدّد (خلفية حمرا)
const retRule = RULES.find(r => /tr\.ret\.sel\s+td\s*$/.test(r.selector.trim()));
const retBg = (retRule && (retRule.body.match(/linear-gradient\(\s*(#[0-9a-f]{3,6})/i) || [])[1]) || '#c0392b';
const retColor = resolve('color', chainFor(['ret','sel']), RULES);
assert(!!retColor && contrast(retColor, retBg) >= 2.5,
  'الكود مقروء على سطر المرتجع المحدّد — تباين ' + (retColor ? contrast(retColor, retBg).toFixed(2) : 'null'));

// (د) آخر قطعة اتضافت وهي محددة
const jaColor = resolve('color', chainFor(['just-added','sel']), RULES);
assert(!!jaColor && contrast(jaColor, selBgLight) >= 2.5,
  'الكود مقروء على سطر «آخر قطعة» وهو محدّد');

// (هـ) سُمك وحجم الخط — الشكوى كانت «نخليه bold أكتر وأوضح»
const weight = resolve('font-weight', plainChain, RULES);
assert(parseInt(weight, 10) >= 800, 'سُمك خط الكود ≥ 800 (الفعلي: ' + weight + ')');
const size = parseFloat(resolve('font-size', plainChain, RULES));
assert(size >= 12.5, 'حجم خط الكود ≥ 12.5px (الفعلي: ' + size + 'px)');
const selWeight = resolve('font-weight', selChain, RULES);
assert(parseInt(selWeight, 10) >= 800, 'السُمك متحافظ عليه في السطر المحدّد (' + selWeight + ')');

// ---------- 8) 🧪 اختبار سلبي: رجّع الباج الأصلي وشوف الاختبار بيقع ----------
// الوضع قبل الإصلاح: `.cart-code{ color:#6b7280 !important }` ومفيش أي
// قاعدة للسطر المحدّد. لازم المحرّك يطلّع الرمادي ده بالظبط ويقول إنه
// مش مقروء — وإلا الاختبار كله بلا قيمة.
(function negative(){
  const before = CSS
    .replace(/\.cart-table tbody tr\.sel \.cart-code[\s\S]*?\}/, '')
    .replace(/\.cart-code\s*\{[^}]*\}/, '.cart-code{ font-size:11.5px !important; color:#6b7280 !important; }');
  assert(before !== CSS, 'الاختبار السلبي بنى نسخة «قبل الإصلاح» فعلًا');

  const oldRules = parseRules(before);
  const oldColor = resolve('color', chainFor(['sel']), oldRules);
  assertEq(oldColor, '#6b7280',
    '🧪 سلبي: المحرّك بيطلّع اللون القديم بالظبط (يعني بيقرا cascade مش نص)');
  assert(contrast(oldColor, selBgLight) < 2.0,
    '🧪 سلبي: وبيحكم إنه مش مقروء على الأزرق — تباين ' +
    contrast(oldColor, selBgLight).toFixed(2) + ' (والاختبار فوق بيقع)');

  const oldSize = parseFloat(resolve('font-size', chainFor([]), oldRules));
  assert(oldSize < 12.5, '🧪 سلبي: والحجم القديم (' + oldSize + 'px) كان بيقع في فحص الحجم');
})();
