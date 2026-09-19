/* 🧪 وصف لفة الطرحة في برومبت التجربة */
const fs=require('fs'); const src=fs.readFileSync('functions/hijabTryOn.js','utf8');
let p=0,f=0; const t=(n,fn)=>{try{fn();p++;console.log('  ✅ '+n)}catch(e){f++;console.log('  ❌ '+n+' → '+e.message)}};
const has=s=>{if(!src.includes(s))throw Error('ناقص: '+s)};

console.log('\n🧕 الاستايل');
t('فيه وصف صريح للفة',()=>has('HIJAB STYLING (mandatory)'));
t('طرف طويل سايب قدام',()=>has('ONE long end fall loosely down the front'));
t('لفة واحدة حوالين الرقبة',()=>has('Wrap the scarf once around the neck'));
t('قماش مرتخي مش مشدود',()=>has('Do NOT pin or pull it tight under the chin'));
t('مفيش دبابيس',()=>has('No visible pins'));
t('مدخّل في البرومبت فعلًا',()=>{
  const i=src.indexOf('const lines = ['); const j=src.indexOf('];', i);
  if(src.slice(i,j).indexOf('DRAPE_STYLE')<0)throw Error('متعرّف ومش مستخدم')});

console.log('\n🛡️ مكسرش الموجود');
t('حماية هوية العميلة زي ما هي',()=>has("Preserve the customer's identity exactly"));
t('منع صور المنتج لوحده زي ما هي',()=>has('NEVER output a product-only image'));
t('وضع الشبكة زي ما هو',()=>has('OUTPUT FORMAT IS STRICT'));
t('البندانة زي ما هي',()=>has('thin under-scarf bandana'));
t('مكان واحد بس بيوصف اللفة',()=>{
  const n=(src.match(/HIJAB STYLING/g)||[]).length; if(n!==1)throw Error(n+' مرة')});

console.log('\n===============================\nالنتيجة: '+p+' ناجح · '+f+' فاشل\n===============================\n');
process.exit(f?1:0);
