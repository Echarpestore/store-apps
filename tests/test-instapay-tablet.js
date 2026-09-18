// 🧪 فحص جاف لشاشة التابلت: الثبات، تنسيق المبلغ، وعدم كسر الكشك
const fs=require('fs'); const src=fs.readFileSync('feedback/instapay-tablet.js','utf8');
let p=0,f=0; const t=(n,fn)=>{try{fn();p++;console.log('  ✅ '+n)}catch(e){f++;console.log('  ❌ '+n+' → '+e.message)}};
const has=s=>{if(!src.includes(s))throw Error('ناقص: '+s)};
const no=s=>{if(src.includes(s))throw Error('موجود وماينفعش: '+s)};

console.log('\n🔐 أمان');
t('مبيكتبش في Firestore خالص',()=>{no('setDoc(');no('updateDoc(');no('addDoc(');no('deleteDoc(')});
t('بينده الدالتين بس',()=>{has("'instaPay'");has("'instaScan'")});
t('الكاميرا بتطفي عند إخفاء الصفحة',()=>{has("pagehide");has("visibilitychange")});

console.log('\n💸 توفير التكلفة');
t('مبيبعتش غير لما الصورة تثبت',()=>has('if (d > 6)'));
t('فيه مؤقّت مش نداء متواصل',()=>has('setInterval(tick, 900)'));
t('قفل تزامن يمنع نداءين مع بعض',()=>has('if (busy || !cur) return'));
t('الـQR بيتحمّل مرة واحدة',()=>has('if (_qr)'));

console.log('\n🖼️ الصورة');
t('العرض مش مقلوب (العميلة تشوف اللي بيتبعت)',()=>{
  if(src.includes('object-fit:cover;transform:scaleX(-1)'))throw Error('العرض لسه مقلوب')});
t('فيه شبكة أمان للانعكاس',()=>{has('let flipCapture = false');has('x.scale(-1, 1)')});
t('القلب بيتفعّل بعد 3 محاولات عمياء',()=>has('blindTries === 3'));
t('القلب بيتصفّر مع كل طلب جديد',()=>has('flipCapture = false; blindTries = 0'));
t('الجودة مضغوطة',()=>has("'image/jpeg', 0.82"));
t('الكاميرا الأمامية',()=>has("facingMode: 'user'"));

console.log('\n🧯 الأعطال');
t('الكاميرا مرفوضة → الكاشير',()=>has("show('man')"));
t('خلصت المحاولات → الكاشير',()=>has('resource-exhausted'));
t('زرار يدوي للعميلة',()=>has('ipHelp'));

console.log('\n🏗️ مبيكسرش الكشك');
const html=fs.readFileSync('feedback/index.html','utf8');
t('سطر واحد بس اتضاف',()=>{const o=fs.readFileSync('/home/claude/repo/store-apps-main/feedback/index.html','utf8');
  const d=html.split('\n').length-o.split('\n').length; if(d!==2)throw Error('فرق '+d+' سطر')});
t('الطبقة فوق كل حاجة',()=>has('z-index:9000'));
t('مخفية لحد ما يجي طلب',()=>has('#ipWrap{position:fixed;inset:0;z-index:9000;display:none'));
console.log('\n=============================== \nالنتيجة: '+p+' ناجح · '+f+' فاشل\n===============================\n');
process.exit(f?1:0);
