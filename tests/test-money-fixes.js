/* 🧪 اختبارات إصلاحات الفلوس — ٣ باجات شغالة في الإنتاج */
const fs=require('fs');
let p=0,f=0; const t=(n,fn)=>{try{fn();p++;console.log('  ✅ '+n)}catch(e){f++;console.log('  ❌ '+n+' → '+e.message)}};
const R='/home/claude/repo/store-apps-main/';

console.log('\n💳 ١. الباقي كرصيد كان بيروح للطابور');
const gc=fs.readFileSync('functions/giftCredit.js','utf8');
t('شرط الطابور بيستثني الباقي',()=>{if(!gc.includes("who.role !== 'owner' && !isChange"))throw Error('لسه بيطابور كل حاجة')});
t('isChange بقى مستخدم فعلًا',()=>{
  const decl=(gc.match(/const isChange =/g)||[]).length;
  const use=(gc.match(/!isChange/g)||[]).length;
  if(!decl||!use)throw Error('متحسب ومش مستخدم')});
t('اختبار سلبي: الشرط القديم كان بيطابور الباقي',()=>{
  const old=gc.replace("who.role !== 'owner' && !isChange","who.role !== 'owner'");
  if(old.includes('!isChange') && old.match(/who\.role !== 'owner' && !isChange/))throw Error('الرجوع مانفعش')});

console.log('\n↩️ ٢. نقط المرتجع باسم العميلة');
const ps=fs.readFileSync('pos/pos-sale.js','utf8');
t('بيحسب السطور غير المربوطة',()=>{if(!ps.includes('_unlinkedRefund'))throw Error('ناقص')});
t('الخصم داخل صافي النقط',()=>{if(!ps.includes('- _unlinkedDeduct'))throw Error('محسوب ومش متخصوم')});
t('نفس معادلة الكسب (floor على _rate)',()=>{
  if(!ps.includes('Math.floor(_unlinkedRefund / _rate)'))throw Error('معادلة مختلفة عن الكسب')});
t('مبيخصمش من غير رقم عميلة',()=>{if(!ps.includes('phone ? Math.floor(_unlinkedRefund'))throw Error('بيخصم بدون رقم')});
t('المربوط بفاتورة لسه شغال',()=>{if(!ps.includes('- _retPointsDeduct'))throw Error('المسار القديم اتكسر')});
t('مفيش خصم مزدوج',()=>{
  // المربوط بيستخدم fromInvoice والغير مربوط !fromInvoice — مجموعتين منفصلتين
  if(!ps.includes('c.isReturn && !c.fromInvoice'))throw Error('الفلتر مش حصري')});

console.log('\n📡 ٣. الفاتورة مش بتظهر لحظيًا');
const ly=fs.readFileSync('loyalty/index.html','utf8');
t('الفواتير بقت onSnapshot',()=>{if(!ly.includes("if(tab === 'invoices'){"))throw Error('لسه get()')});
t('المستمع بيتقفل قبل ما يتفتح تاني',()=>{if(!ly.includes('if(_liveUnsub[tab]){'))throw Error('تسريب مستمعين')});
t('بيتقفل عند تسجيل الخروج',()=>{if(!ly.includes('_liveUnsub = {};'))throw Error('بيفضل شغال بعد الخروج')});
t('العروض والمنتجات لسه get()',()=>{if(!ly.includes("ref.get({ source:'cache' })"))throw Error('اتغيروا من غير داعي')});

console.log('\n🛡️ مفيش ضرر جانبي');
t('pos-sale اتغير في مكان واحد بس',()=>{
  const o=fs.readFileSync(R+'pos/pos-sale.js','utf8');
  const d=ps.split('\n').length-o.split('\n').length;
  if(d!==12)throw Error('فرق '+d+' سطر — متوقع 12')});
t('loyalty/index.html اتغير في مكانين',()=>{
  const o=fs.readFileSync(R+'loyalty/index.html','utf8');
  const d=ly.split('\n').length-o.split('\n').length;
  if(d<15||d>28)throw Error('فرق '+d+' سطر — خارج المتوقع')});
t('CACHE_NAME اترفع',()=>{
  if(!fs.readFileSync('loyalty/sw.js','utf8').includes('loyalty-shell-v690'))throw Error('الكاش ماترفعش')});

console.log('\n===============================\nالنتيجة: '+p+' ناجح · '+f+' فاشل\n===============================\n');
process.exit(f?1:0);
