// 🧪 فحص ربط إنستاباي بالـPOS — تركيز على البوابة والتغليف
const fs=require('fs');
const src=fs.readFileSync('pos/instapay-pos.js','utf8');
const html=fs.readFileSync('pos/index.html','utf8');
let p=0,f=0; const t=(n,fn)=>{try{fn();p++;console.log('  ✅ '+n)}catch(e){f++;console.log('  ❌ '+n+' → '+e.message)}};
const has=s=>{if(!src.includes(s))throw Error('ناقص: '+s)};
const no=s=>{if(src.includes(s))throw Error('موجود وماينفعش: '+s)};

console.log('\n🔒 البوابة (أهم حاجة)');
t('مفيش حفظ قبل التأكيد',()=>has('if (usingInsta && cartTotal() > 0 && !approved)'));
t('البوابة بترجع من غير ما تنادي الأصلية',()=>{
  const i=src.indexOf('!approved)'); const seg=src.slice(i,i+400);
  if(!seg.includes('return;'))throw Error('مفيش return');
  if(seg.indexOf('_origConfirmPay')!==-1 && seg.indexOf('_origConfirmPay')<seg.indexOf('return;'))
    throw Error('بتنادي الأصلية قبل الرفض')});
t('التثبيت بعد الحفظ مش قبله',()=>{
  if(src.indexOf('await _origConfirmPay.apply')>src.indexOf("action: 'finalize'"))throw Error('الترتيب مقلوب')});
t('تثبيت مرة واحدة بس',()=>has('!finalizing'));

console.log('\n🪝 التغليف مبيكسرش pos-sale');
t('بيحفظ الدالة الأصلية',()=>{has('const _origConfirmAmt = window.confirmPayAmount');has('const _origConfirmPay = window.confirmPayment')});
t('بينادي الأصلية في كل الحالات العادية',()=>has('_origConfirmAmt.apply(this, arguments)'));
t('مبيفتحش طلب غير لما المبلغ يتقبل',()=>has("selectedPayMethods.has('instapay')"));
t('مبيفتحش طلب في المرتجع',()=>has('cartTotal() > 0'));
// ⚠️ pos-sale.js اتعدّل عن قصد في إصلاح نقط المرتجع (اختباره في
//    test-money-fixes). اللي يهمنا هنا إن **إنستاباي** مالهوش أي
//    سطر جوّاه — الربط كله بالتغليف من برّه.
t('إنستاباي مالهوش سطر في pos-sale',()=>{
  const b=fs.existsSync('pos/pos-sale.js')?fs.readFileSync('pos/pos-sale.js','utf8'):'';
  if(/insta(Pay|Scan|Start|Reset|Finalize)/.test(b))throw Error('إنستاباي دخل pos-sale')});

console.log('\n🧯 الأعطال');
t('فشل فتح الطلب بيشيل إنستاباي من الفاتورة',()=>has("selectedPayMethods.delete('instapay')"));
t('فشل التثبيت بيتبلّغ بصوت عالي',()=>has('تثبيت الانستا باي فشل'));
t('سلة جديدة بتصفّر الطلب',()=>has('window.clearCart = function'));
t('الإلغاء بيتأكد الأول',()=>has("title: 'إلغاء طلب الانستا باي'"));
t('اليدوي بيحذّر إنه مسؤوليتها',()=>has('التأكيد بيتسجّل باسمك'));

console.log('\n⚙️ الإعدادات');
t('فرع مفعّل لازم له عنوان',()=>has("if (on && !alias)"));
t('فرع مفعّل لازم له QR',()=>has('if (on && !_qrData)'));
t('الصورة بتتصغّر قبل الحفظ',()=>{has('const max = 560');has("toDataURL('image/jpeg', 0.88)")});
t('الحقن في شاشة الصلاحيات',()=>{has("getElementById('rolesScreen')")});
t('الكارت مربوط بحارس الجلسة المقفولة',()=>{
  has("getElementById('pmbTerminalId')");has('if (!ready)')});
t('الكارت بيتشال لو الإعدادات اتخفت',()=>has("if (c) c.remove()"));
t('الأقسام بتتطوي',()=>{has('function collapsify(');has('ipFoldBody')});
t('🔴 الطي مبيبدأش مطوي (مبيخفيش محتوى)',()=>{
  if(src.includes('const open = n === 0'))throw Error('لسه بيخفي أقسام من غير طلب');
  if(!src.includes("h.classList.remove('ipShut')"))throw Error('مفيش فتح افتراضي')});
t('شبكة أمان بترجّع المخفي',()=>{has('function unhideOrphans(')});
t('زرار الرصيد ليه لون',()=>has('button#pmCredit{background'));
t('الطي مبيعدّلش كود الشاشة',()=>has("h.dataset.ipFold"));
// ⚠️ pos-reports.js اتعدّل عن قصد للمرتجع بالرصيد (اختباره في
//    test-refund-credit). اللي يهمنا هنا إن **الحقن** مش بيكتب فيه.
t('إنستاباي مالهوش سطر في pos-reports',()=>{
  const b=fs.existsSync('pos/pos-reports.js')?fs.readFileSync('pos/pos-reports.js','utf8'):'';
  if(/ipSetCard|instaPay|collapsify/.test(b))throw Error('الحقن دخل pos-reports')});

console.log('\n🚫 §10 ممنوع prompt/confirm في POS');
// ⚠️ الفحص لازم يشيل التعليقات الأول — الاختبار وقع مرة على كلمة
//    prompt جوّه تعليق بيشرح المنع نفسه (فشل وهمي شكله باج حقيقي).
const code=src.replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|[^:])\/\/.*$/gm,'$1');
t('مفيش confirm()',()=>{if(/[^a-zA-Z.]confirm\(/.test(code))throw Error('لسه فيه confirm')});
t('مفيش prompt()',()=>{if(/[^a-zA-Z.]prompt\(/.test(code))throw Error('لسه فيه prompt')});
t('مفيش alert()',()=>{if(/[^a-zA-Z.]alert\(/.test(code))throw Error('لسه فيه alert')});
t('فيه مودال بديل',()=>{has('function ipAsk(');has("id=\"ipAsk\"")});
t('التأكيد اليدوي خطوة واحدة',()=>has("yes: 'أكّدي وكمّلي'"));

console.log('\n📄 الربط');
t('الملف متحمّل في index.html',()=>{if(!html.includes('instapay-pos.js?v=690'))throw Error('مش متحمّل')});
t('بعد credit-ui',()=>{if(html.indexOf('instapay-pos.js')<html.indexOf('credit-ui.js'))throw Error('الترتيب غلط')});
t('CACHE_NAME اترفع',()=>{const sw=fs.readFileSync('pos/sw.js','utf8');
  if(!/pos-shell-v69[2-9]/.test(sw))throw Error('الكاش ماترفعش')});

console.log('\n===============================\nالنتيجة: '+p+' ناجح · '+f+' فاشل\n===============================\n');
process.exit(f?1:0);
