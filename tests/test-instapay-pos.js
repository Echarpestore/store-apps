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
t('مفيش تعديل مباشر على pos-sale',()=>{
  const a=fs.readFileSync('/home/claude/repo/store-apps-main/pos/pos-sale.js','utf8');
  const b=fs.existsSync('pos/pos-sale.js')?fs.readFileSync('pos/pos-sale.js','utf8'):a;
  if(a!==b)throw Error('pos-sale.js اتغير')});

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
t('الحقن مبيعدّلش pos-reports',()=>{
  const a=fs.readFileSync('/home/claude/repo/store-apps-main/pos/pos-reports.js','utf8');
  const b=fs.existsSync('pos/pos-reports.js')?fs.readFileSync('pos/pos-reports.js','utf8'):a;
  if(a!==b)throw Error('pos-reports.js اتغير')});

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
  if(!sw.includes('pos-shell-v690'))throw Error('الكاش ماترفعش')});

console.log('\n===============================\nالنتيجة: '+p+' ناجح · '+f+' فاشل\n===============================\n');
process.exit(f?1:0);
