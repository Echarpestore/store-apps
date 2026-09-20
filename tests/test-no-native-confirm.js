#!/usr/bin/env node
// ============================================================
// test-no-native-confirm.js (v707)
// confirm() في Electron نافذة ويندوز بتسرق الـfocus من شاشة POS. اتحوّلت كلها لـposConfirm
// (جوّه الصفحة). الخطر الحقيقي في التحويل: posConfirm بترجّع Promise — و`if(!posConfirm())`
// من غير await = دايمًا «موافق». الملف ده بيمسك الاتنين + سلوك الحراس المتزامنة.
// يتشغّل لوحده: node tests/test-no-native-confirm.js
// ============================================================
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const POS = path.join(ROOT, 'pos');
let pass = 0, fail = 0;
const ok = (c, m) => { if(c){ pass++; } else { fail++; console.error('  ❌ ' + m); } };
const rd = f => fs.readFileSync(path.join(POS, f), 'utf8');

// شيل التعليقات والنصوص الأول — وإلا كلمة confirm جوّه تعليق بيشرح المنع تطلّع فشل وهمي (§0)
function strip(src){
  let out = '', i = 0, n = src.length;
  while(i < n){
    const c = src[i], d = src[i+1];
    if(c === '/' && d === '/'){ while(i < n && src[i] !== '\n') i++; continue; }
    if(c === '/' && d === '*'){ i += 2; while(i < n && !(src[i] === '*' && src[i+1] === '/')) i++; i += 2; continue; }
    if(c === '/'){   // regex literal — جوّاه علامات تنصيص بتلخبط العدّ (pos-admin/products وقعوا كده)
      const prev = out.replace(/\s+$/, '');
      const pc = prev.slice(-1);
      if(!prev || '(,=:[!&|?{};+-*%<>~^'.indexOf(pc) >= 0 || /(^|[^\w$])(return|typeof|case|in|of|void|delete)$/.test(prev)){
        let inClass = false; i++;
        while(i < n && src[i] !== '\n'){
          if(src[i] === '\\'){ i += 2; continue; }
          if(src[i] === '[') inClass = true; else if(src[i] === ']') inClass = false;
          else if(src[i] === '/' && !inClass) break;
          i++;
        }
        i++; out += '/re/'; continue;
      }
    }
    if(c === '"' || c === "'" || c === '`'){
      const q = c; out += q; i++;
      while(i < n && src[i] !== q){
        if(src[i] === '\\'){ i += 2; continue; }
        if(q === '`' && src[i] === '$' && src[i+1] === '{'){   // ${...} كود حقيقي
          let depth = 1; out += '${'; i += 2;
          while(i < n && depth){ if(src[i] === '{') depth++; else if(src[i] === '}') depth--; if(depth) out += src[i]; i++; }
          out += '}'; continue;
        }
        if(src[i] === '\n') out += '\n';
        i++;
      }
      out += q; i++; continue;
    }
    out += c; i++;
  }
  return out;
}
// استخراج دالة بالأقواس المتوازنة (§0) — ولازم نتأكد إنها اتلقت
function extractFn(src, header){
  const at = src.indexOf(header);
  if(at < 0) throw new Error('extractFn: مش لاقي «' + header + '»');
  let i = src.indexOf('{', at + header.length - 1), depth = 0, inS = null;
  for(; i < src.length; i++){
    const c = src[i];
    if(inS){ if(c === '\\'){ i++; continue; } if(c === inS) inS = null; continue; }
    if(c === '/' && src[i+1] === '/'){ while(i < src.length && src[i] !== '\n') i++; continue; }
    if(c === '/' && src[i+1] === '*'){ i = src.indexOf('*/', i) + 1; continue; }
    if(c === '"' || c === "'" || c === '`'){ inS = c; continue; }
    if(c === '{') depth++;
    else if(c === '}'){ depth--; if(depth === 0) return src.slice(at, i + 1); }
  }
  throw new Error('extractFn: أقواس مش متوازنة «' + header + '»');
}

const files = fs.readdirSync(POS).filter(f => /\.js$/.test(f) && !/^test-|\.min\.js$/.test(f) && f !== 'finance-pos.js' /* يتيم مش متحمّل */);

(async function main(){
  console.log('\n🚫 1) مفيش نوافذ نظام في أي ملف POS');
  ok(files.length >= 40, 'اتلقى ملفات POS (' + files.length + ')');
  let nativeHits = [];
  files.forEach(f => {
    strip(rd(f)).split('\n').forEach((ln, i) => {
      const m = ln.match(/(^|[^a-zA-Z0-9_$.])(confirm|prompt|alert)\s*\(/);
      if(m) nativeHits.push(f + ':' + (i + 1) + ' ' + m[2]);
    });
  });
  // الاستثناء الوحيد: شبكة الأمان جوّه posConfirm نفسها (لو askConfirm مش متحمّلة)
  const allowed = nativeHits.filter(h => /^pos-core\.js:/.test(h));
  ok(allowed.length === 1, 'استثناء واحد بس (fallback جوّه posConfirm) — لقيت ' + allowed.length);
  const bad = nativeHits.filter(h => !/^pos-core\.js:/.test(h));
  ok(bad.length === 0, 'نداءات نظام باقية: ' + bad.join(' · '));
  const idx = fs.readFileSync(path.join(POS, 'index.html'), 'utf8');
  ok(!/[^a-zA-Z0-9_$.](confirm|prompt)\s*\(/.test(idx.replace(/<!--[\s\S]*?-->/g, '')), 'index.html مفيهوش confirm/prompt');

  console.log('🔒 2) كل نداء Promise لازم await (وإلا = موافقة دايمة)');
  let calls = 0, naked = [];
  files.forEach(f => {
    const s = strip(rd(f));
    const re = /(posConfirm|confirmForeignBranchAction)\s*\(/g; let m;
    while((m = re.exec(s))){
      const before = s.slice(Math.max(0, m.index - 40), m.index);
      if(/function\s+$/.test(before) || /typeof\s+$/.test(before)) continue;       // التعريف / typeof
      if(/window\.\w*\s*=\s*$/.test(before)) continue;
      calls++; if(process.env.DBG) console.log(f, s.slice(0, m.index).split('\n').length);
      const awaited = /await\s+$/.test(before) || /await\s*\(\s*$/.test(before) || /return\s+await\s+$/.test(before);
      // الحارسين المتزامنين بيستخدموا .then عمدًا
      let depth = 0, j = m.index + m[0].length - 1;
      for(; j < s.length; j++){ if(s[j] === '(') depth++; else if(s[j] === ')'){ depth--; if(!depth) break; } }
      const thened = /^\s*\.then\s*\(/.test(s.slice(j + 1, j + 30));
      if(!awaited && !thened) naked.push(f + ' @' + s.slice(0, m.index).split('\n').length);
    }
  });
  ok(calls === 29, 'اتلقى نداءات كفاية (' + calls + ')');
  ok(naked.length === 0, 'نداء من غير await/then: ' + naked.join(' · '));

  console.log('🏬 3) تبديل الفرع + حارس الفرع المختلف (سلوك فعلي)');
  const core = rd('pos-core.js');
  const code = [extractFn(core, 'function _pcEsc('), extractFn(core, 'function posConfirm('),
    extractFn(core, 'async function confirmForeignBranchAction('), extractFn(core, 'async function doBranchSwitch(')].join('\n');
  function mkCore(answer){
    const asked = [];
    const ctx = { currentBranch:'Rehab', currentEmployee:{name:'x'}, asked,
      askConfirm: o => { asked.push(o); return Promise.resolve(answer); },
      hasPerm: () => true, deviceHomeBranch: () => 'Rehab', isForeignBranchSession: () => ctx.currentBranch !== 'Rehab',
      closeBranchSwitch(){}, myPerms: () => ({label:'مدير'}), document:{ getElementById: () => null },
      refreshForeignBranchWarning(){}, showToast(){}, goToDashboard(){}, window:{}, Promise, String };
    vm.createContext(ctx); vm.runInContext(code, ctx); return ctx;
  }
  let c = mkCore(false); await c.doBranchSwitch('Madinaty');
  ok(c.currentBranch === 'Rehab', 'رفض التبديل = الفرع زي ما هو');
  ok(c.asked.length === 1 && c.asked[0].danger === true, 'السؤال طلع جوّه الصفحة وبلون الخطر');
  c = mkCore(true); await c.doBranchSwitch('Madinaty');
  ok(c.currentBranch === 'Madinaty', 'الموافقة = الفرع اتبدّل');
  c = mkCore(true); await c.doBranchSwitch('Rehab');
  ok(c.asked.length === 0, 'الرجوع لفرع الجهاز من غير سؤال');
  c = mkCore(false); c.currentBranch = 'Madinaty';
  ok((await c.confirmForeignBranchAction('حفظ')) === false, 'حارس الفرع المختلف: الرفض = false');
  c = mkCore(false);
  ok((await c.confirmForeignBranchAction('حفظ')) === true && c.asked.length === 0, 'على فرع الجهاز: true من غير سؤال');
  c = mkCore(true); await c.posConfirm('عنوان <b>x</b>\nشرح <img src=x onerror=1>');
  ok(c.asked[0].title.indexOf('<') < 0 && c.asked[0].message.indexOf('<') < 0, 'النص بيتهرّب (اسم عميلة/صنف فيه HTML)');
  ok(c.asked[0].waitSec === 0, 'الافتراضي من غير عدّاد انتظار');
  // شبكة الأمان: من غير askConfirm مبتعدّيش «موافق» بصمت
  const c2 = { confirm: () => false, window:{}, Promise, String }; vm.createContext(c2);
  vm.runInContext(extractFn(core, 'function _pcEsc(') + '\n' + extractFn(core, 'function posConfirm('), c2);
  ok((await c2.posConfirm('x')) === false, 'من غير askConfirm: بيرجع للنافذة الأصلية مش بيوافق لوحده');
  // اللي بينادوا الحارس
  ok((rd('transfers.js').match(/await confirmForeignBranchAction\(/g) || []).length === 2, 'transfers.js: الاتنين await');
  const sale = rd('pos-sale.js');
  ok(/async function confirmPayment\(\)\{[\s\S]{0,400}await confirmForeignBranchAction\('حفظ الفاتورة والبيع'\)/.test(sale), 'confirmPayment: الحارس await قبل الحفظ');

  console.log('💳 4) الحراس المتزامنة في pos-sale.js (سلوك فعلي)');
  function mkSale(answer, o){
    o = o || {};
    const st = { answer, asked:0, logs:[], toasts:[], appr: o.appr == null ? 500 : o.appr, resolveLater:null };
    const pre = 'let _cardMoneyAtRiskAt = 1; let cardLegs = [{}]; let selectedPayMethods = new Set(["visa1"]); let paymentAmounts = {visa1:500};'
      + 'let _cardAdjustmentMode = false, _cardAdjustmentApprovedAmount = 0, _cardAdjustAsking = false, _resetPayAsking = false;'
      + 'var paymobPending = null;';
    const post = ';this.peek = () => ({ mode:_cardAdjustmentMode, amt:_cardAdjustmentApprovedAmount, n:selectedPayMethods.size, pa:Object.keys(paymentAmounts).length });'
      + 'this.setRisk = v => { _cardMoneyAtRiskAt = v; };';
    const ctx = { st, window:{}, Set, Math, Object, Promise,
      cardApprovedSum: () => st.appr, cartTotal: () => 500,
      posConfirm: () => { st.asked++; return new Promise(r => { st.resolveLater = r; if(!o.manual) r(st.answer); }); },
      showToast: m => st.toasts.push(m), _logActivity: (t, d) => st.logs.push([t, d]),
      document: { getElementById: () => null, querySelectorAll: () => [] } };
    vm.createContext(ctx);
    vm.runInContext(pre + extractFn(sale, 'function cardCartEditBlockReason(') + '\n' + extractFn(sale, 'function blockCartEditAfterCard(')
      + '\n' + extractFn(sale, 'function resetPaymentUI(') + post, ctx);
    return ctx;
  }
  const tick = () => new Promise(r => setTimeout(r, 0));
  let s = mkSale(true);
  ok(s.blockCartEditAfterCard() === true, 'تعديل السلة بعد سحب الكارت: بيتمنع **فورًا** (متزامن)');
  ok(s.peek().mode === false, 'وضع التعديل مبيتفتحش قبل الرد');
  await tick();
  ok(s.peek().mode === true && s.peek().amt === 500, 'الموافقة بتفتح وضع التعديل بالمبلغ المسحوب');
  ok(s.st.logs.some(l => l[0] === 'card_adjustment_started'), 'بيتسجل في النشاط');
  ok(s.blockCartEditAfterCard() === false, 'بعد الفتح: التعديل مسموح (الكاشير تكرر العملية)');
  s = mkSale(false); s.blockCartEditAfterCard(); await tick();
  ok(s.peek().mode === false && s.blockCartEditAfterCard() === true, 'الرفض = السلة مقفولة');
  s = mkSale(true, { manual:true }); s.blockCartEditAfterCard(); s.blockCartEditAfterCard(); s.blockCartEditAfterCard();
  ok(s.st.asked === 1, 'مسح باركود ورا بعض = سؤال واحد مش تلاتة');
  s.setRisk(0); s.st.resolveLater(true); await tick();
  ok(s.peek().mode === false, 'الفاتورة اتحفظت والسؤال مفتوح → الموافقة المتأخرة مبتفتحش حاجة');

  s = mkSale(true, { manual:true });
  let r; try{ r = s.resetPaymentUI(); }catch(e){ r = 'threw:' + e.message; }
  ok(r === false, 'مسح مدفوعات فيها كارت مسحوب: بيرجّع false (ماتمسحش لسه)');
  ok(s.peek().n === 1 && s.peek().pa === 1, 'المدفوعات **ماتمسحتش** قبل الموافقة');
  ok(s.st.logs.length === 0, 'ومتسجلش «اتمسحت» قبل الموافقة');
  s.st.resolveLater(true); await tick();
  ok(s.peek().n === 0 && s.peek().pa === 0, 'الموافقة بتمسح فعلًا');
  ok(s.st.logs.some(l => l[0] === 'card_payments_cleared' && l[1].amount === 500), 'وبتتسجل بالمبلغ');
  s = mkSale(false); try{ s.resetPaymentUI(); }catch(e){} await tick();
  ok(s.peek().n === 1 && s.st.logs.length === 0, 'الرفض = المدفوعات زي ما هي ومفيش تسجيل');
  s = mkSale(true, { appr:0 }); try{ s.resetPaymentUI(); }catch(e){}
  ok(s.st.asked === 0 && s.peek().n === 0, 'من غير كارت مسحوب: مسح عادي من غير سؤال');
  s = mkSale(true, { manual:true }); try{ s.resetPaymentUI(); }catch(e){}
  s.st.appr = 0; s.st.resolveLater(true); await tick();
  ok(s.st.logs.length === 0, 'الكارت اتصفّر والسؤال مفتوح → مفيش تسجيل مسح وهمي');
  ok(/if\(resetPaymentUI\(\) !== false\) showToast/.test(rd('app.js')), 'F8 ميقولش «اتمسحت» لو المسح مستني موافقة');

  console.log('↩️ 5) عكس الفاتورة');
  const rev = extractFn(sale, 'async function reverseReceipt(');
  const iAsk = rev.indexOf('await posConfirm('), iBusy = rev.indexOf("_busyOps.add('reverse_'+saleId)");
  ok(iAsk > 0 && iBusy > iAsk, 'السؤال قبل ما العملية تتعلّم busy');
  ok(/_busyOps\.has\('reverse_'\+saleId\)\) return;[^\n]*\n\s*_busyOps\.add/.test(rev), 'فحص busy متعاد **بعد** السؤال (دوستين ميعكسوش مرتين)');
  ok((rev.match(/await posConfirm\(/g) || []).length === 2, 'التأكيدين (عام + نفس اليوم) موجودين');

  console.log('📦 6) الإصدار');
  ok(+fs.readFileSync(path.join(POS, 'sw.js'), 'utf8').match(/pos-shell-v(\d+)/)[1] >= 707, 'CACHE_NAME اترفع لـv707');
  ok(/pos-sale\.js\?v=707/.test(idx) && /pos-admin\.js\?v=707/.test(idx), 'index.html بيحمّل pos-sale/pos-admin بـv707');

  console.log('\n' + (fail ? '❌' : '✅') + ' test-no-native-confirm: ' + pass + ' ناجح · ' + fail + ' فاشل');
  if(fail) process.exitCode = 1;
})().catch(e => { console.error('💥', e); process.exitCode = 1; });
