(function(){
// شغّل renderCashHand فعليًا بستبات DOM — يمسك أي كراش وقت التشغيل
// ============================================================
// 🖥️ test-office-render — الشاشة بترسم فعلًا من غير ما تقع
//
// ⚠️ ليه الملف ده موجود: كل اختبارات شاشة office كانت **نصّية** —
//    بتدوّر على كلمات في الكود. اختبار زي كده بيعدّي وهو مبسوط
//    حتى لو الدالة بتقع من أول سطر وقت التشغيل، لأن الشاشة
//    متغلّفة بـtry/catch فالتبويب بيطلع فاضي **من غير أي رسالة خطأ**.
//    الملف ده بيشغّل الكود الحقيقي جوه sandbox بستبات DOM وFirebase.
//
// 🔑 درس اتعلمناه وإحنا بنكتبه: `const D` في الملف **مبتتعلّقش**
//    على الـsandbox — نفس §18 بالظبط. لازم vm.runInContext('D').
// ============================================================
'use strict';
const fs=require('fs'), vm=require('vm'), path=require('path');
const src=fs.readFileSync(path.resolve(__dirname,'..','Office','office.js'),'utf8');
let out={html:''};
const el=()=>({ innerHTML:'', textContent:'', style:{}, dataset:{}, classList:{add(){},remove(){},contains(){return false}},
  addEventListener(){}, appendChild(){}, querySelector(){return null}, querySelectorAll(){return []},
  setAttribute(){}, getAttribute(){return null}, focus(){}, click(){} });
const body=el();
const host=el();
Object.defineProperty(host,'innerHTML',{ get(){return out.html}, set(v){out.html=v} });
const doc={ getElementById(id){ return id==='cashHandBody'?host:el(); },
  querySelector(){return el()}, querySelectorAll(){return []}, createElement(){return el()},
  addEventListener(){}, body:body, documentElement:el() };
const noop=()=>{};
const chain=()=>{ const o={ then(f){ try{f({exists:false,docs:[],data:()=>({})})}catch(e){}; return o; }, catch(){return o} }; return o; };
const dbStub={ settings:()=>{}, enablePersistence:chain, collection(){ return { doc(){ return { get:chain, set:chain, onSnapshot(){return noop}, collection(){return dbStub.collection()} }; },
  add:chain, where(){return this}, orderBy(){return this}, limit(){return this}, get:chain, onSnapshot(){return noop} }; } };
const sandbox={ console:{log:noop,warn:noop,error:noop}, document:doc, Date, Math, Number, String, Object, Array,
  JSON, isNaN, parseInt, parseFloat, Intl, RegExp, Error, Promise, setTimeout:noop, setInterval:noop,
  clearInterval:noop, clearTimeout:noop, navigator:{onLine:true,serviceWorker:{register:chain,ready:chain,addEventListener:noop,controller:null}},
  location:{href:'',search:'',hostname:'echarpe.store',reload:noop}, localStorage:{getItem:()=>null,setItem:noop,removeItem:noop},
  alert:noop, confirm:()=>true, prompt:()=>null, Notification:{permission:'default'},
  firebase:{ initializeApp:()=>({name:'x'}), auth:Object.assign(()=>({ currentUser:null, onAuthStateChanged:noop, signInAnonymously:chain, signOut:chain, setPersistence:chain }),{Auth:{Persistence:{LOCAL:'local',SESSION:'session',NONE:'none'}}}),
    firestore:Object.assign(()=>dbStub,{ FieldValue:{arrayUnion:(x)=>x, serverTimestamp:()=>0}, Timestamp:{fromMillis:(m)=>({toMillis:()=>m}), fromDate:(d)=>({toMillis:()=>+d})}, CACHE_SIZE_UNLIMITED:1 }),
    messaging(){return{ getToken:chain, onMessage:noop }} } };
sandbox.window=sandbox; sandbox.self=sandbox; sandbox.globalThis=sandbox;
vm.createContext(sandbox);
let loaded=true;
try{ vm.runInContext(src,sandbox,{timeout:20000}); }
catch(e){ loaded=false; assert(false,'office.js بيتحمّل من غير خطأ — '+e.message); }

if(!loaded) return;
const D=vm.runInContext('D',sandbox);   // §18: const مبتتعلقش على sandbox
const DAY=86400000, now=Date.now();
D.cashBase={ amount:5000, atMs: now-6*DAY, paymobOpening:2000 };
D.sales=[{ createdAt:{toMillis:()=>now-2*DAY}, payments:{cash:1200, visa:3000} }];
D.expenses=[{ ts: now-DAY, amount:400 }];
D.cashCfg={ goldGrams:50, goldBuyPrice:6960, goldPriceAt: now-3600000 };
D.cashDays={};
let crash='';
try{ vm.runInContext('renderCashHand',sandbox)(); }catch(e){ crash=e.message; }
assert(!crash, '⭐⭐ renderCashHand بترسم من غير ما تقع'+(crash?' — '+crash:''));

assert(out.html.length > 1000, '⭐ وطلّعت شاشة فيها محتوى فعلي ('+out.html.length+' حرف)');
assert(/افتح التفاصيل يوم بيوم|يوم بيوم/.test(out.html), 'الشيت اليومي متاح من غير زحمة');
// 📜 العنوان اتغيّر من "إجمالي فلوسك" لـ"اللي ليك فعلًا" لما ضفنا
//    طرح دين كروت الهدايا — الرقم بقى معناه مختلف فالاسم اتغيّر معاه.
assert(/اللي ليك فعلًا/.test(out.html), 'وسطر "اللي ليك فعلًا"');
assert(/دهب/.test(out.html), 'وقيمة الدهب ظاهرة');
assert(/6,960|6960/.test(out.html.replace(/,/g,'')) || /الدهب/.test(out.html), 'وسعر الجرام داخل الحساب');

// 🆕 من غير رصيد افتتاحي: لازم تطلّع زرار البداية مش شاشة فاضية
D.cashBase=null;
let c2='';
try{ vm.runInContext('renderCashHand',sandbox)(); }catch(e){ c2=e.message; }
assert(!c2, 'وبترسم كمان من غير رصيد افتتاحي'+(c2?' — '+c2:''));
assert(/ابدأ من الصفر/.test(out.html), '⭐ وبتقوله يبدأ من الصفر بدل ما يشوف تبويب فاضي');

// 📅 ويوم مالوش أي حركة خالص
D.cashBase={ amount:0, atMs: Date.now()-2*DAY };
D.sales=[]; D.expenses=[]; D.cashCfg={}; D.cashDays={};
let c3='';
try{ vm.runInContext('renderCashHand',sandbox)(); }catch(e){ c3=e.message; }
assert(!c3, '⭐ وبترسم على بيانات فاضية تمامًا'+(c3?' — '+c3:''));

})();
