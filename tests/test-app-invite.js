/* 🧪 شاشة دعوة التطبيق */
const fs=require('fs'); const src=fs.readFileSync('feedback/app-invite.js','utf8');
const html=fs.readFileSync('feedback/index.html','utf8');
let p=0,f=0; const t=(n,fn)=>{try{fn();p++;console.log('  ✅ '+n)}catch(e){f++;console.log('  ❌ '+n+' → '+e.message)}};
const has=s=>{if(!src.includes(s))throw Error('ناقص: '+s)};

console.log('\n🔲 الـQR');
t('متولّد مسبقًا جوّه الملف',()=>{if(!/<svg[^>]*viewBox="0 0 37 37"/.test(src))throw Error('مش مدفون')});
// ⚠️ الفحص على الكود بعد شيل التعليقات — الاختبار وقع على كلمة
//    CDN جوّه تعليق بيشرح إننا **مش** بنستخدم CDN. تاني مرة يحصل
//    نفس الفخ، فالقاعدة: أي فحص بكلمة ممنوعة يشيل التعليقات الأول.
const code=src.replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|[^:])\/\/.*$/gm,'$1');
t('مفيش مكتبة خارجية',()=>{if(/cdn|unpkg|jsdelivr|qrserver|chart\.googleapis/i.test(code))throw Error('فيه اعتماد خارجي')});
t('مفيش نداء شبكة وقت التشغيل',()=>{if(/fetch\(|XMLHttpRequest/.test(code))throw Error('فيه نداء شبكة')});
t('الرابط صح',()=>has('https://www.echarpe.store/loyalty/index.html'));

console.log('\n🧯 مبيكسرش حاجة');
t('مبيظهرش فوق إنستاباي',()=>{has("getElementById('ipWrap')");has("ip.classList.contains('on')")});
t('بيتقفل لوحده',()=>has('setTimeout(hide, 22000)'));
t('فيه زرار إغلاق',()=>has("getElementById('aiClose')"));
t('مبيعدّلش كود الكشك',()=>{
  const o=fs.readFileSync('/home/claude/repo/store-apps-main/feedback/index.html','utf8');
  const d=html.split('\n').length-o.split('\n').length;
  if(d!==4)throw Error('فرق '+d+' سطر — متوقع 4')});
t('بيراقب شاشة الترحيب',()=>{has("getElementById('capPaneGreet')");has('MutationObserver')});
t('طبقة تحت إنستاباي',()=>{has('z-index:8800')});

console.log('\n🔍 إخفاء لمن عنده التطبيق');
t('بيفحص علامة التطبيق',()=>{has('function hasApp(');has('fcmTokenAt')});
t('بيفحص توكنات البراندات كمان',()=>has("k.indexOf('fcmTokens') === 0"));
t('فشل القراءة = نعرض مش نخفي',()=>has('catch (e) { return false; }'));
t('بيمسك الرقم من غير تعديل الكشك',()=>{has('origSubmit.apply(this, arguments)')});
t('اسم عنصر الرقم مطابق للكشك',()=>{
  const k=fs.readFileSync('/home/claude/repo/store-apps-main/feedback/index.html','utf8');
  if(!/getElementById\('capDisplay'\)/.test(src))throw Error('اسم العنصر غلط');
  if(!k.includes("getElementById('capDisplay')"))throw Error('العنصر مش موجود في الكشك')});
t('appInvite() من الكونسول بتتخطى الفحص',()=>has('return show(true);'));

console.log('\n✨ المحتوى');
t('أربع مميزات',()=>{const n=(src.match(/\{ i: '/g)||[]).length; if(n!==4)throw Error(n+' مش 4')});
t('CACHE_NAME اترفع',()=>{
  if(!fs.readFileSync('feedback/sw.js','utf8').includes('store-apps-shell-v691'))throw Error('الكاش ماترفعش')});

console.log('\n===============================\nالنتيجة: '+p+' ناجح · '+f+' فاشل\n===============================\n');
process.exit(f?1:0);
