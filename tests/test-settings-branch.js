/* 🧪 إعدادات إنستاباي لكل فرع — تبديل الفرع من غير إعادة تحميل الصفحة
   الباج: الفورم كان بيفضل عارض الفرع القديم، والحفظ بينسخه في الفرع الجديد
   ("القفل في فرع بيقفل كل الفروع"). محتاج: npm i jsdom */
const fs=require('fs'); const {JSDOM}=require('jsdom');
const html=fs.readFileSync('pos/index.html','utf8');
const src=fs.readFileSync('pos/instapay-pos.js','utf8');
let p=0,f=0; const t=(n,fn)=>{try{fn();p++;console.log('  ✅ '+n)}catch(e){f++;console.log('  ❌ '+n+' → '+e.message)}};
const eq=(a,b,m)=>{if(a!==b)throw Error((m||'')+' وجه «'+a+'» والمتوقع «'+b+'»')};
const i=html.indexOf('id="rolesScreen"'); const st=html.lastIndexOf('<div',i);
const j=html.indexOf('class="screen',i+50); const en=html.lastIndexOf('<div',j);
const wait=ms=>new Promise(r=>setTimeout(r,ms));

function boot(code, store){
  const dom=new JSDOM('<!doctype html><body>'+html.slice(st,en)+'</body>',{runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window; w.document.getElementById('rolesScreen').classList.add('active');
  w.__writes=[];
  w.db={collection:()=>({doc:(id)=>({
    get:async()=>({exists:!!store[id],data:()=>store[id]}),
    set:async(v)=>{store[id]=Object.assign({},store[id]||{},v); w.__writes.push(id);},
    onSnapshot:()=>()=>{}})})};
  w.firebase={app:()=>({functions:()=>({httpsCallable:()=>async()=>({data:{}})})})};
  w.showToast=()=>{};
  w.eval('var TEST_SETTINGS="pos_test_settings"; var currentBranch="الرحاب";');
  w.eval(code); return w;
}
const val=(w,id)=>w.document.getElementById(id).value;

(async()=>{
  const store={ 'instapay_الرحاب':{enabled:false,alias:'rehab@instapay',beneficiary:'الرحاب',windowMin:5,qr:'data:image/jpeg;base64,REHAB'} };
  const w=boot(src,store); await wait(1800);

  console.log('\n🏬 الفرع الأول');
  t('بيحمّل إعدادات الرحاب',()=>{eq(val(w,'ipSetAlias'),'rehab@instapay'); eq(val(w,'ipSetEnabled'),'0')});

  console.log('\n🔁 تبديل الفرع من غير reload');
  w.eval('currentBranch="Glow"'); await wait(1800);
  t('العنوان بقى Glow',()=>eq(w.document.getElementById('ipSetBranch').textContent,'Glow'));
  t('🔴 حالة التشغيل مش منقولة من الرحاب',()=>eq(val(w,'ipSetEnabled'),'1'));
  t('🔴 عنوان الرحاب مش ظاهر في Glow',()=>eq(val(w,'ipSetAlias'),''));
  t('🔴 QR الرحاب اتمسح من الفورم',()=>{
    if(w.document.getElementById('ipSetPrev').classList.contains('on'))throw Error('المعاينة لسه ظاهرة')});

  console.log('\n💾 الحفظ في Glow ميلمسش الرحاب');
  w.document.getElementById('ipSetEnabled').value='0';
  w.document.getElementById('ipSetSave').click(); await wait(100);
  t('اتكتب في مستند Glow بس',()=>{eq(w.__writes.join(','),'instapay_Glow')});
  t('الرحاب زي ما هو',()=>{eq(store['instapay_الرحاب'].alias,'rehab@instapay'); eq(store['instapay_الرحاب'].qr,'data:image/jpeg;base64,REHAB')});
  t('🔴 QR الرحاب ماتنسخش في Glow',()=>{if(store['instapay_Glow'].qr)throw Error('اتنسخ: '+store['instapay_Glow'].qr)});

  console.log('\n🔒 حارس الحفظ — الفرع اتغيّر قبل ما الفورم يتحدّث');
  w.__writes.length=0;
  w.eval('currentBranch="الرحاب"');            // تبديل، ومن غير انتظار التحديث
  w.document.getElementById('ipSetSave').click(); await wait(100);
  t('الحفظ اترفض (مفيش كتابة بفورم فرع تاني)',()=>eq(w.__writes.length,0));
  await wait(1800);
  t('والفورم رجع لإعدادات الرحاب',()=>{eq(val(w,'ipSetAlias'),'rehab@instapay'); eq(val(w,'ipSetEnabled'),'0')});

  console.log('\n🧪 اختبار سلبي — النسخة القديمة لازم تقع');
  const bad=src.replace("if (_cardBranch !== null && _cardBranch !== curBranch()) loadSettings();","")
               .replace(/if \(br !== _cardBranch\) \{[\s\S]*?return;\s*\}/,"");
  const store2={ 'instapay_الرحاب':{enabled:false,alias:'rehab@instapay',qr:'data:image/jpeg;base64,REHAB'} };
  const w2=boot(bad,store2); await wait(1800);
  w2.eval('currentBranch="Glow"'); await wait(1800);
  w2.document.getElementById('ipSetSave').click(); await wait(100);
  t('من غير الإصلاح: إعدادات الرحاب بتتنسخ في Glow (الباج)',()=>{
    const g=store2['instapay_Glow']; if(!g||g.alias!=='rehab@instapay')throw Error('الاختبار مبيمسكش الباج')});
  w.close(); w2.close();
  console.log('\n===============================\nالنتيجة: '+p+' ناجح · '+f+' فاشل\n===============================\n');
  process.exit(f?1:0);
})();
