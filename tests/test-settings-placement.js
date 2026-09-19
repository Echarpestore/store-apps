/* 🧪 مكان كارت إنستاباي في شاشة الصلاحيات — على الـDOM الحقيقي
   ⚠️ الاختبارات القديمة كانت بتفحص **نصوص** في الملف، فعدّى منها باج
      عصر الأقسام الستة لارتفاع صفر. ده بيشغّل الملف فعلًا على هيكل
      الشاشة المنسوخ من pos/index.html. محتاج: npm i jsdom */
const fs=require('fs'); const {JSDOM}=require('jsdom');
const html=fs.readFileSync('pos/index.html','utf8');
const src=fs.readFileSync('pos/instapay-pos.js','utf8');
let p=0,f=0; const t=(n,fn)=>{try{fn();p++;console.log('  ✅ '+n)}catch(e){f++;console.log('  ❌ '+n+' → '+e.message)}};

// هيكل الشاشة الحقيقي
const i=html.indexOf('id="rolesScreen"'); const st=html.lastIndexOf('<div',i);
const j=html.indexOf('class="screen',i+50); const en=html.lastIndexOf('<div',j);
const screenHtml=html.slice(st,en);

function boot(code){
  const dom=new JSDOM('<!doctype html><body>'+screenHtml+'</body>',{runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;
  w.document.getElementById('rolesScreen').classList.add('active');
  const snap={exists:false,data:()=>({})};
  w.db={collection:()=>({doc:()=>({get:async()=>snap,set:async()=>{},onSnapshot:()=>()=>{}})})};
  w.firebase={app:()=>({functions:()=>({httpsCallable:()=>async()=>({data:{}})})})};
  w.eval('var TEST_SETTINGS="pos_test_settings"; var currentBranch="الرحاب";');
  w.eval(code);
  return w;
}
const wait=ms=>new Promise(r=>setTimeout(r,ms));

(async()=>{
  const w=boot(src); await wait(1800);
  const d=w.document, root=d.getElementById('rolesScreen'), card=d.getElementById('ipSetCard');
  const scroller=[...root.children].find(c=>/overflow-y/.test(c.getAttribute('style')||''));

  console.log('\n📍 مكان الكارت');
  t('الكارت اتحقن',()=>{if(!card)throw Error('مفيش كارت')});
  t('الشاشة ليها صندوق إسكرول',()=>{if(!scroller)throw Error('الهيكل اتغيّر')});
  t('🔴 الكارت جوّه صندوق الإسكرول',()=>{if(card.parentElement!==scroller)throw Error('الأب: '+(card.parentElement.id||card.parentElement.className||'الجذر'))});
  t('🔴 جذر الشاشة لسه طفلين بس (عنوان + صندوق)',()=>{if(root.children.length!==2)throw Error(root.children.length+' أطفال — حاجة اتحقنت في الجذر وهتعصر الصندوق')});
  t('الكارت بعد ماكينة الفيزا',()=>{
    const pm=d.getElementById('pmbTerminalId');
    if(!(pm.compareDocumentPosition(card)&w.Node.DOCUMENT_POSITION_FOLLOWING))throw Error('قبلها')});

  console.log('\n👁️ الأقسام الأصلية سليمة');
  ['sellerCodesList','rolePermsWrap','dayStartHour','employeeRolesWrap','pmbTerminalId'].forEach(id=>{
    t(id+' لسه جوّه صندوق الإسكرول ومش مخفي',()=>{
      const e=d.getElementById(id); if(!e)throw Error('اختفى');
      if(!scroller.contains(e))throw Error('خرج من الصندوق');
      for(let x=e;x&&x!==root;x=x.parentElement) if(x.style&&x.style.display==='none')throw Error('أب مخفي')})});
  t('الستة عناوين موجودة',()=>{
    const n=[...scroller.querySelectorAll('h3')].filter(h=>!card.contains(h)).length;
    if(n!==6)throw Error(n+' مش 6')});

  console.log('\n🧪 اختبار سلبي — الحقن القديم في الجذر لازم يتمسك');
  const bad=src.replace(/let target = ready;[\s\S]*?target\.insertAdjacentHTML\('beforeend', settingsHtml\(\)\);/,
                        "host.insertAdjacentHTML('beforeend', settingsHtml());");
  if(bad===src){f++;console.log('  ❌ ماقدرناش نرجّع الباج للاختبار')}
  else{
    const w2=boot(bad); await wait(1800);
    const r2=w2.document.getElementById('rolesScreen');
    t('النسخة القديمة بتطلّع 3 أطفال في الجذر (الباج)',()=>{if(r2.children.length!==3)throw Error('الاختبار مبيمسكش الباج: '+r2.children.length)});
    w2.close();
  }
  w.close();
  console.log('\n===============================\nالنتيجة: '+p+' ناجح · '+f+' فاشل\n===============================\n');
  process.exit(f?1:0);
})();
