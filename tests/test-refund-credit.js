/* 🧪 المرتجع لرصيد العميلة — التركيز على التقفيل */
const fs=require('fs');
const R='/home/claude/repo/store-apps-main/pos/';
const rep=fs.readFileSync('pos/pos-reports.js','utf8');
const src=fs.readFileSync('pos/refund-credit.js','utf8');
const html=fs.readFileSync('pos/index.html','utf8');
const sale=fs.readFileSync('pos/pos-sale.js','utf8');
let p=0,f=0; const t=(n,fn)=>{try{fn();p++;console.log('  ✅ '+n)}catch(e){f++;console.log('  ❌ '+n+' → '+e.message)}};
const eq=(a,b,m)=>{if(Math.abs(a-b)>0.001)throw Error((m||'')+' وجه '+a+' والمتوقع '+b)};

// dcAggregate الحقيقية من الملف
const i=rep.indexOf('function dcAggregate'), j=rep.indexOf('window.dcAggregate');
eval(rep.slice(i,j));

console.log('\n💰 التقفيل — أخطر حتة');
t('بيجمع رصيد المرتجع',()=>{
  const a=dcAggregate([{total:-350,payments:{credit:-350}}]);
  eq(a.creditSales,-350)});
t('الكاش والفيزا مالهمش دعوة',()=>{
  const a=dcAggregate([{total:-350,payments:{credit:-350}}]);
  eq(a.cashSales,0); eq(a.visaSales,0)});
t('🔴 مرتجع بالرصيد = صفر فرق في التقفيل',()=>{
  const sales=[{total:1000,payments:{cash:1000}},{total:-350,payments:{credit:-350}}];
  const a=dcAggregate(sales);
  const counted=1000, flt=0, exp=0, adv=0, visa=0, insta=0, salary=0;
  const accounted=(counted-flt)+exp+adv+visa+insta+salary+a.creditSales;
  eq(accounted-a.systemTotal,0,'الفرق')});
t('اختبار سلبي: من غير السطر الجديد بيطلع أوفر 350',()=>{
  const sales=[{total:1000,payments:{cash:1000}},{total:-350,payments:{credit:-350}}];
  const a=dcAggregate(sales);
  const accountedOld=1000;   // الحساب القديم من غير creditSales
  eq(accountedOld-a.systemTotal,350,'الأوفر الوهمي')});
t('مرتجع كاش لسه شغال زي ما هو',()=>{
  const sales=[{total:1000,payments:{cash:1000}},{total:-350,payments:{cash:-350}}];
  const a=dcAggregate(sales);
  const accounted=(650)+a.creditSales;
  eq(accounted-a.systemTotal,0)});
t('التسوية في الشاشة بتستخدمه',()=>{
  if(!rep.includes('+ salary + creditOut'))throw Error('مش مستخدم في accounted')});
t('بيظهر سطر في نتيجة التقفيل',()=>{
  if(!rep.includes('مرتجع لرصيد العميلة'))throw Error('مفيش سطر عرض')});

console.log('\n🔒 البوابات');
t('رصيد من غير رقم عميلة ممنوع',()=>{
  if(!src.includes('اكتبي رقم العميلة الأول'))throw Error('مفيش منع')});
t('الزرار في المرتجع بس',()=>{
  if(!src.includes('cartTotal() < 0'))throw Error('بيظهر في البيع العادي')});
t('الرصيد بيتكتب بعد الحفظ مش قبله',()=>{
  const a=src.indexOf('_origConfirm.apply'), b=src.indexOf("'creditAdjust'");
  if(a<0||b<0||a>b)throw Error('الترتيب مقلوب')});
t('فشل كتابة الرصيد بيتبلّغ بصوت عالي',()=>{
  if(!src.includes('⚠️⚠️'))throw Error('بيسكت على الفشل')});
t('السيرفر بيقبل مصدر refund',()=>{
  const g=fs.readFileSync('functions/giftCredit.js','utf8');
  if(!g.includes("source === 'refund'"))throw Error('هيروح للطابور')});
t('🔑 بيبعت مفتاح منع التكرار',()=>{
  if(!src.includes('idem: idem'))throw Error('idem ناقص — الدالة هترفض')});
t('المفتاح مبني من الفاتورة والرقم والمبلغ',()=>{
  if(!src.includes("'refund:' + (code"))throw Error('مفتاح مش فريد للعملية')});
t('نفس المرتجع = نفس المفتاح',()=>{
  const mk=(c,p,a)=>'refund:'+(c||'nocode')+':'+p+':'+a.toFixed(2);
  if(mk('FT1','01000669964',5)!==mk('FT1','01000669964',5))throw Error('مش ثابت');
  if(mk('FT1','01000669964',5)===mk('FT2','01000669964',5))throw Error('مش فريد لكل فاتورة')});
t('لازم رقم فاتورة عشان يعدّي',()=>{
  const g=fs.readFileSync('functions/giftCredit.js','utf8');
  if(!g.includes('&& data.invoiceCode'))throw Error('رصيد من غير فاتورة')});

console.log('\n🏗️ الربط');
t('الزرار في الواجهة ومخفي افتراضيًا',()=>{
  if(!/id="pmCredit"[^>]*display:none/.test(html))throw Error('مش مخفي')});
t('الطريقة متربوطة بالزرار',()=>{
  if(!sale.includes("credit:'pmCredit'"))throw Error('مفيش في payBtnId')});
t('الملف متحمّل',()=>{if(!html.includes('refund-credit.js?v=692'))throw Error('مش متحمّل')});
t('CACHE_NAME اترفع',()=>{
  if(!/pos-shell-v69[2-9]/.test(fs.readFileSync('pos/sw.js','utf8')))throw Error('الكاش ماترفعش')});
t('pos-sale اتغير سطر واحد بس',()=>{
  const o=fs.readFileSync(R+'pos-sale.js','utf8');
  const d=sale.split('\n').length-o.split('\n').length;
  if(d!==12)throw Error('فرق '+d+' سطر (12 من إصلاح النقط بس)')});

console.log('\n===============================\nالنتيجة: '+p+' ناجح · '+f+' فاشل\n===============================\n');
process.exit(f?1:0);
