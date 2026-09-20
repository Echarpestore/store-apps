require('./helpers/swv');   // إصدار الكاش ≥ N بدل رقم مثبّت
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
t('بيرجع لصفحة التقييم لوحده',()=>has('timer = setTimeout(hide, TOTAL_MS)'));
t('وبسرعة — 10 لـ14 ثانية (كان 22)',()=>{
  const step=+src.match(/var STEP_MS = (\d+)/)[1], n=3;   // 3 لقطات لكل براند
  const total=step*n+1800; if(total<10000||total>14000)throw Error(total+'ms')});
t('لمسة في أي حتة = رجوع فوري',()=>{has("getElementById('aiClose').onclick = hide");
  if(!/#aiClose\{position:absolute;inset:0;/.test(src))throw Error('زرار الإغلاق مش مغطي الشاشة كلها')});
t('مبيعدّلش كود الكشك',()=>{
  const o=baselineOrSkip('/home/claude/repo/store-apps-main/feedback/index.html'); if(o===null) return;
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
  const k=fs.readFileSync('feedback/index.html','utf8');   // الكشك الحالي — مش محتاج الأصل
  if(!/getElementById\('capDisplay'\)/.test(src))throw Error('اسم العنصر غلط');
  if(!k.includes("getElementById('capDisplay')"))throw Error('العنصر مش موجود في الكشك')});
t('appInvite() من الكونسول بتتخطى الفحص',()=>has('return show(true);'));

console.log('\n✨ المحتوى');
// v693: تصميم بالعرض — لقطات حقيقية من التطبيق شمال · QR يمين
const shots=(src.match(/\{ src: '(invite\/[\w-]+\.jpg)'/g)||[]).map(m=>m.match(/'([^']+)'/)[1]);
t('3 لقطات لكل براند، وكل واحدة ملفها موجود فعلًا',()=>{
  if(shots.length!==6)throw Error(shots.length+' مش 6 (3 لكل براند)');
  shots.concat(['invite/app-icon.png']).forEach(p=>{ if(!fs.existsSync('feedback/'+p))throw Error('ملف ناقص: feedback/'+p);
    const kb=fs.statSync('feedback/'+p).size/1024; if(kb>160)throw Error(p+' تقيل ('+kb.toFixed(0)+'KB) — التابلت على نت الفرع') })});
t('كل لقطة ليها عنوان وسطر شرح',()=>{ if((src.match(/\{ src: 'invite\/[^']+',\s+t: '[^']+',\s+s: '[^']+' \}/g)||[]).length!==6)throw Error('لقطة من غير نص') });
t('بالعرض: نصّين — الموبايل شمال والكود يمين',()=>{
  has('#aiWrap.on{display:grid;grid-template-columns:1fr 1fr');
  // الصفحة RTL: العمود 1 = اليمين
  // القاعدة الأساسية (قبل @media الطولي) هي اللي بتتفحص — قاعدة الطولي فيها grid-column:1 للاتنين وكانت بتغطّي على القلب
  const base=src.slice(0, src.indexOf('@media (orientation:portrait){'));
  if(!/\.aiSide\{grid-column:1;/.test(base)||!/\.aiStage\{grid-column:2;/.test(base))throw Error('الترتيب معكوس') });
t('ولو التابلت اتلفّ بالطول بيتظبط (الكود فوق)',()=>has('@media (orientation:portrait){'));
t('لقطة متحمّلتش = بتتشال هي بس والـQR شغال',()=>{has("im.addEventListener('error'");has("im.dataset.bad = '1'")});
t('والموبايل عمره ما يبقى فاضي: شاشة فتح التطبيق تحت اللقطات',()=>{has('<div class="aiSplash"><img src="');has('.aiSplash{position:absolute;inset:0;')});
t('حركة خفيفة على التابلت: transform/opacity/clip-path بس',()=>{
  const kf=(src.match(/@keyframes \w+\{[^@]*\}\}?/g)||[]).join(' ');
  if(/(^|[;{\s])(width|height|top|left|right|bottom|margin[\w-]*|padding[\w-]*|box-shadow|filter)\s*:/.test(kf))throw Error('فيه خاصية بتعمل layout/paint جوّه keyframes') });
t('بيحترم «تقليل الحركة»',()=>has('@media (prefers-reduced-motion:reduce){'));
t('الحركة بتبدأ من الأول كل مرة الشاشة تظهر',()=>{ const sh=src.slice(src.indexOf('async function show(')); const a=sh.indexOf("wrap.classList.remove('on');"), b=sh.indexOf('void wrap.offsetWidth;'), c=sh.indexOf("wrap.classList.add('on');"); if(!(a>0&&b>a&&c>b))throw Error('ترتيب remove → reflow → add اتكسر') });
t('ألوان البراند مش خلفية سودا',()=>{ if(/background:#070809/.test(src))throw Error('الخلفية القديمة لسه موجودة'); has('#E4458E'); has('#E2A646') });
t('مفيش بيانات عميلة حساسة: لقطة كود العضوية مش مستخدمة',()=>{ if(/barcode|membership|code\.jpg/i.test(shots.join(' ')))throw Error('لقطة باركود عضوية') });
t('CACHE_NAME اترفع',()=>{
  if(!swAtLeast(fs.readFileSync('feedback/sw.js','utf8'), 695))throw Error('الكاش ماترفعش')});
t('index.html بيحمّل النسخة الجديدة',()=>{ if(!assetAtLeast(html,'app-invite.js',695))throw Error('?v قديم') });

console.log('\n🏷️ هوية الفرع (v694) — Glow مبيعرضش تطبيق echarpe');
t('نفس قايمة POS لفروع Glow',()=>{ has("var GLOW_BRANCHES = ['Glow'];");
  const pos=fs.readFileSync('pos/pos-core.js','utf8').match(/const GLOW_BRANCHES = (\[[^\]]*\]);/)[1];
  if(src.indexOf('var GLOW_BRANCHES = '+pos+';')<0)throw Error('القايمتين مختلفتين: POS='+pos) });
t('الفرع بيتقري وقت العرض مش وقت التحميل',()=>{ has("localStorage.getItem('feedback_branch')"); has('build(brandKey());') });
t('كل براند: لينكه + كوده + أيقونته',()=>{
  has("url: 'https://www.echarpe.store/loyalty/index.html', qr: QR, icon: 'invite/app-icon.png'");
  has("url: 'https://www.echarpe.store/glow/index.html', qr: QR_GLOW, icon: 'invite/glow-icon.png'");
  if(!fs.existsSync('feedback/invite/glow-icon.png'))throw Error('أيقونة Glow ناقصة') });
t('كودين QR مختلفين فعلًا (مش نفس الكود بلون تاني)',()=>{
  const a=src.match(/var QR = '(<svg.*?<\/svg>)';/)[1], b=src.match(/var QR_GLOW = '(<svg.*?<\/svg>)';/)[1];
  if(a===b)throw Error('نفس الكود'); if(!/viewBox="0 0 33 33"/.test(b))throw Error('كود Glow اتغيّر — اتأكد إنه بيفك للينك الصح') });
t('العنوان باسم البراند',()=>has("'<div class=\"aiTitle\">حمّلي تطبيق ' + BR.name + '</div>'"));
t('مفيش لينك ثابت برّه جدول البراندات',()=>{ if(/var URL_APP/.test(src))throw Error('URL_APP لسه موجود') });
t('Glow من غير لقطات = مفيش طلبات 404 لملفات مش موجودة',()=>{
  const g=src.slice(src.indexOf('    glow: {'), src.indexOf('  function brandKey'));
  (g.match(/src: '([^']*)'/g)||[]).forEach(m=>{ const p=m.match(/'([^']*)'/)[1]; if(p && !fs.existsSync('feedback/'+p))throw Error('ملف مش موجود: '+p) }) });

console.log('\n===============================\nالنتيجة: '+p+' ناجح · '+f+' فاشل\n===============================\n');
process.exit(f?1:0);
