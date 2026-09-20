'use strict';
// Focused operational regression tests; mocks only, NOT deployed Firebase or physical tablet.
const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module'),vm=require('vm');
const root=path.resolve(__dirname,'..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const state=new Map();
class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}
function snap(ref){const v=state.get(ref.key);return {exists:v!==undefined,data:()=>v,id:ref.id,ref};}
const db={collection(name){return {doc(id){const ref={key:name+'/'+(id||('id-'+Math.random())),id};ref.get=async()=>snap(ref);return ref;}}},runTransaction:async fn=>{const updates=[];const tx={get:async r=>snap(r),set:(r,v,opt)=>updates.push(()=>state.set(r.key,opt?.merge?{...state.get(r.key),...v}:v)),update:(r,v)=>updates.push(()=>state.set(r.key,{...state.get(r.key),...v})),create:(r,v)=>updates.push(()=>{assert(!state.has(r.key));state.set(r.key,v);})};const res=await fn(tx);updates.forEach(fn=>fn());return res;}};
const orig=Module._load, options={};Module._load=function(name,parent,isMain){
 if(name==='firebase-admin/firestore')return {getFirestore:()=>db,FieldValue:{serverTimestamp:()=>0}};
 if(name==='firebase-admin/auth')return {getAuth:()=>({getUser:async uid=>({uid,providerData:[]})})};
 if(name==='firebase-admin/storage')return {getStorage:()=>({bucket:()=>({})})};
 if(name==='firebase-functions/v2/https')return {onCall:(opt,fn)=>{options[fn.name||'handler']=opt;return fn;},HttpsError};
 if(name==='firebase-functions/params')return {defineSecret:()=>({value:()=> 'owner@example.test'})};
 if(name==='google-auth-library')return {GoogleAuth:class {}};
 return orig.apply(this,arguments);
};
let insta,finance;try{insta=require('../functions/instaEvidence');finance=require('../functions/financeCheckout');}finally{Module._load=orig;}
const owner={auth:{uid:'owner-1',token:{email:'owner@example.test',firebase:{sign_in_provider:'password'}}},data:{branch:'Glow'}};
const tablet={auth:{uid:'tablet-1',token:{firebase:{sign_in_provider:'anonymous'}}},data:{}};
const now=Date.now();let passed=0;
async function test(name,fn){await fn();passed++;}
(async()=>{
 await test('unpaired branch cannot be advertised ready',async()=>{const r=await insta.instaBranchStatus(owner);assert.equal(r.ready,false);assert.equal(r.paired,false);});
 await test('cannot enable branch without owner-approved tablet',async()=>{await assert.rejects(()=>insta.instaOwnerBranchSet({...owner,data:{branch:'Glow',enabled:true}}),e=>e.code==='failed-precondition');});
 await test('anonymous tablet cannot enable branch',async()=>{await assert.rejects(()=>insta.instaOwnerBranchSet({...tablet,data:{branch:'Glow',enabled:true}}),e=>e.code==='permission-denied');});
 state.set('finance_tablet_branches/Glow',{uid:'tablet-1'});state.set('finance_tablets/tablet-1',{active:true,branch:'Glow',activeSession:null});
 await test('paired branch defaults to enabled for backwards compatibility',async()=>{const r=await insta.instaBranchStatus(owner);assert.equal(r.ready,true);});
 await test('owner disables branch server-side',async()=>{const r=await insta.instaOwnerBranchSet({...owner,data:{branch:'Glow',enabled:false}});assert.equal(r.enabled,false);assert.equal((await insta.instaBranchStatus(owner)).ready,false);});
 await test('server rejects InstaPay start for disabled branch',async()=>{
  state.set('finance_config/instapay',{alias:'zogzog2000@instapay',name:'Recipient',bank:'CIB'});
  await assert.rejects(()=>insta.instaStart({...owner,data:{branch:'Glow',amount:350,invoiceTotal:350}}),e=>e.code==='failed-precondition');
  assert.equal([...state.keys()].filter(k=>k.startsWith('finance_sessions/')).length,0);
 });
 await test('owner re-enables branch and starts one server session',async()=>{
  await insta.instaOwnerBranchSet({...owner,data:{branch:'Glow',enabled:true}});
  const s=await insta.instaStart({...owner,data:{branch:'Glow',amount:350,invoiceTotal:350}});
  assert(/^[0-9a-f]{36}$/.test(s.sessionId));assert.equal(state.get('finance_sessions/'+s.sessionId).amountCents,35000);
 });
 const sid=state.get('finance_tablets/tablet-1').activeSession;
 await test('owner cannot disable branch with active InstaPay payment',async()=>{
  await assert.rejects(()=>insta.instaOwnerBranchSet({...owner,data:{branch:'Glow',enabled:false}}),e=>e.code==='failed-precondition');
  assert.equal((await insta.instaBranchStatus(owner)).enabled,true);
 });
 await test('pending InstaPay cancellation clears tablet once server confirms',async()=>{
  const r=await finance.financeCancelSession({...owner,data:{sessionId:sid}});
  assert.equal(r.ok,true);assert.equal(state.get('finance_sessions/'+sid).status,'cancelled');assert.equal(state.get('finance_tablets/tablet-1').activeSession,null);
 });
 await test('cancel retry is idempotent',async()=>{const r=await finance.financeCancelSession({...owner,data:{sessionId:sid}});assert.equal(r.repeat,true);});
 await test('captured transfer cannot be cleared by cashier',async()=>{
  const id='b'.repeat(36);state.set('finance_sessions/'+id,{kind:'instapay',staffUid:'owner-1',tabletUid:'tablet-1',status:'captured',photoPath:'private.jpg'});
  state.get('finance_tablets/tablet-1').activeSession=id;
  await assert.rejects(()=>finance.financeCancelSession({...owner,data:{sessionId:id}}),e=>e.code==='failed-precondition');
  assert.equal(state.get('finance_sessions/'+id).status,'captured');
 });
 await test('completed invoice cannot be cancelled as a pending session',async()=>{
  const id='c'.repeat(36);state.set('finance_sessions/'+id,{kind:'instapay',staffUid:'owner-1',tabletUid:'tablet-1',status:'finished'});
  const r=await finance.financeCancelSession({...owner,data:{sessionId:id}});assert.equal(r.alreadyFinished,true);
 });
 await test('tablet details requires paired anonymous auth',async()=>{await assert.rejects(()=>insta.instaTabletDetails(owner),e=>e.code==='permission-denied');});
 const pos=read('pos/pos-sale.js'),financeJs=read('pos/finance-pos.js'),tab=read('feedback/finance-tablet.js'),html=read('pos/index.html');
 await test('clear waits for cancellation and uses in-app confirm, no native confirm for InstaPay',()=>{
  assert(pos.includes('await window.financeCancelPending();'));assert(pos.includes('resetPaymentUI(true);'));
  assert(!pos.includes("!confirm('فيه طلب InstaPay"));
 });
 await test('tablet remains disabled until recipient details load, offers retry',()=>{
  assert(tab.includes('id="finTransferred" disabled'));assert(tab.includes('id="finRetryDetails"'));
  assert(tab.includes('button.disabled=false;button.textContent'));assert(tab.includes("call('instaTabletDetails')"));
 });
 await test('mismatched recipient never shows legacy QR',()=>{assert(tab.includes("String(details.recipientAlias||'').trim().toLowerCase()==='zogzog2000@instapay'"));});
 await test('POS focus restored after payment OK, cancel and clear',()=>{
  assert(pos.includes('if(window.financeRestorePOSFocus)window.financeRestorePOSFocus();'));
  assert(financeJs.includes('window.financeRestorePOSFocus=function()'));
 });
 await test('F8 does not falsely report synchronous clearing with InstaPay active',()=>{
  assert(html.includes('e.stopImmediatePropagation()'));assert(html.includes("e.key!=='F8'"));
 });
 await test('Cloud Run public transport limited to callable with Firebase auth guards',()=>{
  assert(read('functions/instaEvidence.js').includes("invoker:'public'"));
  assert(read('functions/instaEvidence.js').includes("async function kiosk(req)"));
  assert(read('functions/instaEvidence.js').includes("const who=await staff(req,true)"));
 });
 await test('owner settings visible in permissions only',()=>{
  assert(html.includes('id="finOwnerBranchToggle"'));assert(html.indexOf('id="finOwnerBranchToggle"')>html.indexOf('id="rolesScreen"'));
 });
 console.log('INSTA OPERATIONS v683 '+passed+'/'+passed+' PASS (MOCK/STATIC; Firebase + Lenovo NOT tested)');
})().catch(e=>{console.error(e);process.exitCode=1;});
