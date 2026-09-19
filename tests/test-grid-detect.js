/* 🧪 اكتشاف شكل شبكة التجربة من الصورة الراجعة */
const fs=require('fs');
const src=fs.readFileSync('tryon/photo-core.js','utf8');
const i=src.indexOf('var CELL_ASPECT'), j=src.indexOf('function sliceGridProportional');
eval(src.slice(i,j));
let p=0,f=0; const t=(n,fn)=>{try{fn();p++;console.log('  ✅ '+n)}catch(e){f++;console.log('  ❌ '+n+' → '+e.message)}};
const shape=(w,h,n)=>{const r=detectGridLayout(w,h,n,2,2);return r.cols+'x'+r.rows};
const eq=(a,b)=>{if(a!==b)throw Error('وجه '+a+' والمتوقع '+b)};

console.log('\n🔲 الشكل الصح');
t('صورة مربعة بـ4 خانات = 2×2',()=>eq(shape(1024,1024,4),'2x2'));
t('شريط عريض بـ4 خانات = 4 أعمدة',()=>eq(shape(2048,512,4),'4x1'));
t('عمود طويل بـ4 خانات = 4 صفوف',()=>eq(shape(512,2048,4),'1x4'));
t('خانتين عريضة = جنب بعض',()=>eq(shape(1200,800,2),'2x1'));
t('خانتين طويلة = فوق بعض',()=>eq(shape(600,1600,2),'1x2'));
t('3 خانات عريضة = صف واحد',()=>eq(shape(2100,900,3),'3x1'));
t('خانة واحدة',()=>eq(shape(768,1024,1),'1x1'));

console.log('\n🛡️ مبيخترعش تقسيم');
t('نسبة غريبة تمامًا = نرجع للمطلوب',()=>{
  const r=detectGridLayout(4000,80,4,2,2); // شريط مستحيل
  if(r.cols*r.rows!==4)throw Error('عدد الخانات اتكسر')});
t('عدد الخانات دايمًا مضبوط',()=>{
  [1,2,3,4].forEach(n=>{
    [[1024,1024],[2048,512],[512,2048],[1500,1000]].forEach(([w,h])=>{
      const r=detectGridLayout(w,h,n,2,2);
      if(r.cols*r.rows!==n)throw Error(n+' خانة طلعت '+r.cols+'x'+r.rows)})})});

console.log('\n===============================\nالنتيجة: '+p+' ناجح · '+f+' فاشل\n===============================\n');
process.exit(f?1:0);
