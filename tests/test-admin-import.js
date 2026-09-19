/* 🧪 استيراد firebase-admin — الباج اللي كان بيوقّع creditAdjust */
const fs=require('fs');
let p=0,f=0; const t=(n,fn)=>{try{fn();p++;console.log('  ✅ '+n)}catch(e){f++;console.log('  ❌ '+n+' → '+e.message)}};
const FILES=['functions/giftCredit.js','functions/goldPriceUpdate.js'];

console.log('\n🔌 الاستيراد الحديث');
// ⚠️ التعليقات بتتشال الأول — تالت مرة يقع فيها اختبار بسبب كلمة
//    جوّه تعليق بيشرح المنع نفسه. القاعدة مكتوبة في المستند §0.
const strip=x=>x.replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|[^:])\/\/.*$/gm,'$1');
FILES.forEach(fp=>{
  const s=fs.readFileSync(fp,'utf8');
  const code=strip(s);
  const n=fp.split('/').pop();
  t(n+': مفيش استيراد قديم',()=>{
    if(/const admin = require\(['"]firebase-admin['"]\)/.test(code))throw Error('لسه على القديم')});
  t(n+': بيستورد getFirestore',()=>{
    if(!s.includes("require('firebase-admin/firestore')"))throw Error('ناقص')});
  t(n+': FieldValue و Timestamp متغطيين',()=>{
    if(s.includes('admin.firestore.FieldValue')&&!s.includes('FieldValue: FieldValue'))throw Error('FieldValue مش متغطّي');
    if(s.includes('admin.firestore.Timestamp')&&!s.includes('Timestamp: Timestamp'))throw Error('Timestamp مش متغطّي')});
});

console.log('\n🧪 الشكل البديل بيشتغل زي القديم');
t('admin.firestore() دالة وكائن في نفس الوقت',()=>{
  const FieldValue={serverTimestamp:()=>'ts',delete:()=>'del',arrayUnion:x=>x};
  const Timestamp={fromMillis:m=>m};
  const getFirestore=()=>({db:1});
  const admin={firestore:Object.assign(function(){return getFirestore()},{FieldValue,Timestamp})};
  if(admin.firestore().db!==1)throw Error('النداء مش شغال');
  if(admin.firestore.FieldValue.serverTimestamp()!=='ts')throw Error('FieldValue مش شغال');
  if(admin.firestore.FieldValue.delete()!=='del')throw Error('delete مش شغالة');
  if(admin.firestore.Timestamp.fromMillis(9)!==9)throw Error('Timestamp مش شغال')});

console.log('\n🔍 مفيش ملف تاني فاضل');
t('كل ملف بيستخدم admin.firestore اتصلح',()=>{
  FILES.forEach(fp=>{
    const s=fs.readFileSync(fp,'utf8');
    if(s.includes('admin.firestore(')&&!s.includes('getFirestore'))throw Error(fp)})});

console.log('\n===============================\nالنتيجة: '+p+' ناجح · '+f+' فاشل\n===============================\n');
process.exit(f?1:0);
