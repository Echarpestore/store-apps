'use strict';
// Mock transactional Firestore tests. Not equivalent to Firebase Emulator/device testing.
const assert=require('assert');
const crypto=require('crypto');
const Module=require('module');
const path=require('path');
class E extends Error{constructor(code,message){super(message);this.code=code;}}
const store=new Map();let chain=Promise.resolve();
function clone(x){return x===undefined?undefined:JSON.parse(JSON.stringify(x));}
class Ref{
 constructor(key){this.key=key;this.id=key.split('/').at(-1);}
 get(){return Promise.resolve(snap(this));}
 set(value,{merge}={}){const old=store.get(this.key)||{};store.set(this.key,clone(merge?{...old,...value}:value));return Promise.resolve();}
 update(value){if(!store.has(this.key))throw Error('missing '+this.key);store.set(this.key,{...clone(store.get(this.key)),...clone(value)});return Promise.resolve();}
}
function snap(ref){const v=store.get(ref.key);return {id:ref.id,ref,exists:v!==undefined,data:()=>clone(v)};}
function collection(name){return {doc:(id)=>new Ref(name+'/'+(id===undefined?crypto.randomBytes(8).toString('hex'):id)),where:(field,op,value)=>({limit:(n)=>({get:async()=>({docs:[...store.entries()].filter(([key,data])=>key.startsWith(name+'/')&&data[field]===value).slice(0,n).map(([key])=>snap(new Ref(key))),size:[...store.entries()].filter(([key,data])=>key.startsWith(name+'/')&&data[field]===value).slice(0,n).length})})})};}
const db={collection,runTransaction:async fn=>{
 let release;const prev=chain;chain=new Promise(r=>{release=r});await prev;
 const pending=[];const tx={get:async ref=>{if(ref?.get && !ref.key)return ref.get();return snap(ref);},
 create:(ref,data)=>pending.push(()=>{if(store.has(ref.key))throw new E('already-exists','duplicate');store.set(ref.key,clone(data));}),
 update:(ref,data)=>pending.push(()=>{if(!store.has(ref.key))throw Error('missing');store.set(ref.key,{...store.get(ref.key),...clone(data)});}),
 set:(ref,data,opt={})=>pending.push(()=>{store.set(ref.key,clone(opt.merge?{...(store.get(ref.key)||{}),...data}:data));})};
 try{const result=await fn(tx);pending.forEach(p=>p());return result;}finally{release();}
}};
const admin={firestore:()=>db,auth:()=>({getUser:async uid=>({uid,email:null,phoneNumber:null,providerData:[]})})};
admin.firestore.FieldValue={serverTimestamp:()=>0};
const original=Module._load;
Module._load=function(name,parent,isMain){
 if(name==='firebase-admin')return admin;
 if(name==='firebase-functions/v2/https')return {onCall:(_opts,handler)=>handler,HttpsError:E};
 if(name==='firebase-functions/params')return {defineSecret:name=>({value:()=>name==='OWNER_EMAIL'?'owner@example.test':'privatepepper'})};
 if(name==='google-auth-library')return {GoogleAuth:class{}};
 return original.apply(this,arguments);
};
let finance,insta;
try{
 finance=require('../functions/financeCheckout');insta=require('../functions/instaEvidence');
}finally{Module._load=original;}
const owner={auth:{uid:'owner-uid',token:{email:'owner@example.test',firebase:{sign_in_provider:'password'}}},data:{}};
const tablet={auth:{uid:'tablet-uid',token:{firebase:{sign_in_provider:'anonymous'}}},data:{}};
function put(key,value){store.set(key,clone(value));}
function creditSession(sid,phone,amount=40000){const now=Date.now();if(!store.has('credit_pins/'+phone))put('credit_pins/'+phone,{version:1,salt:'aabb',hash:'aabb'});put('finance_sessions/'+sid,{kind:'credit',staffUid:'owner-uid',tabletUid:'tablet-uid',phone,branch:'madinaty',amountCents:amount,invoiceTotalCents:amount,status:'approved',approvedAt:now,approvedUntil:now+120000,approvedPinVersion:store.get('credit_pins/'+phone).version,expiresAt:now+180000});}
function creditSale(phone,code,amount=400){return {invoiceCode:code,branch:'madinaty',customerPhone:phone,total:0,items:[{price:amount,qty:1,name:'طرح'},{price:-amount,qty:1,isCreditSpend:true}],payments:{cash:0}};}
let passed=0;
async function check(name,fn){await fn();passed++;console.log('  ✓ '+name);}
(async()=>{
 put('finance_tablets/tablet-uid',{branch:'madinaty',active:true,activeSession:null});
 put('pos_test_customers/01011111111',{credit:600});
 const a='a'.repeat(36),b='b'.repeat(36);creditSession(a,'01011111111');creditSession(b,'01011111111');
 await check('two branches cannot spend same last balance concurrently',async()=>{
  const results=await Promise.allSettled([finance.creditFinalizeSale({...owner,data:{sessionId:a,sale:creditSale('01011111111','FTM00001')}}),finance.creditFinalizeSale({...owner,data:{sessionId:b,sale:creditSale('01011111111','FTM00002')}})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
  assert.equal(store.get('pos_test_customers/01011111111').credit,200);
  assert.equal([...store.keys()].filter(k=>k.startsWith('credit_ledger/')&&store.get(k).type==='spend').length,1);
 });
 await check('network retry same session does not debit twice',async()=>{
  const result=await finance.creditFinalizeSale({...owner,data:{sessionId:a,sale:creditSale('01011111111','FTM00001')}});
  assert.equal(result.repeat,true);assert.equal(store.get('pos_test_customers/01011111111').credit,200);
 });
 await check('retry with different invoice forbidden',async()=>{
  await assert.rejects(()=>finance.creditFinalizeSale({...owner,data:{sessionId:a,sale:creditSale('01011111111','FTM99999')}}));
 });
 await check('second credit session cannot reuse completed invoice code',async()=>{
  const sid='9'.repeat(36),phone='01011111111';creditSession(sid,phone,10000);
  await assert.rejects(()=>finance.creditFinalizeSale({...owner,data:{sessionId:sid,sale:creditSale(phone,'FTM00001',100)}}),e=>e.code==='already-exists');
  assert.equal(store.get('pos_test_customers/'+phone).credit,200);
 });
 await check('PIN reset invalidates previously approved checkout',async()=>{
  const sid='8'.repeat(36),phone='01011111111';creditSession(sid,phone,10000);
  const pin=store.get('credit_pins/'+phone);pin.version=2;
  await assert.rejects(()=>finance.creditFinalizeSale({...owner,data:{sessionId:sid,sale:creditSale(phone,'FTM00088',100)}}),e=>e.code==='failed-precondition');
  assert.equal(store.get('pos_test_customers/'+phone).credit,200);
  pin.version=1;
 });
 await check('wrong PIN does not debit',async()=>{
  const sid='c'.repeat(36),phone='01011111111';creditSession(sid,phone,10000);
  store.get('finance_sessions/'+sid).status='pending';store.get('finance_tablets/tablet-uid').activeSession=sid;
  const salt='aabbccddee',hash=crypto.scryptSync('123456',Buffer.from(salt+'privatepepper'),32).toString('hex');
  put('credit_pins/'+phone,{salt,hash,version:1});
  let outcome=await finance.creditPinSubmit({...tablet,data:{sessionId:sid,pin:'111111'}});
  assert.equal(outcome.ok,false);assert.equal(store.get('pos_test_customers/'+phone).credit,200);
  assert.equal(store.get('credit_pin_attempts/'+phone).attempts,1);
 });
 await check('correct PIN approves only that tablet session',async()=>{
  const sid='c'.repeat(36),result=await finance.creditPinSubmit({...tablet,data:{sessionId:sid,pin:'123456'}});
  assert.equal(result.ok,true);assert.equal(store.get('finance_sessions/'+sid).status,'approved');
 });
 await check('five failed PIN submissions lock account',async()=>{
  const sid='d'.repeat(36),phone='01011111111';creditSession(sid,phone,10000);store.get('finance_sessions/'+sid).status='pending';store.get('finance_tablets/tablet-uid').activeSession=sid;
  for(let j=0;j<5;j++)await finance.creditPinSubmit({...tablet,data:{sessionId:sid,pin:'111111'}});
  assert(store.get('credit_pin_attempts/'+phone).lockedUntil>Date.now());
  await assert.rejects(()=>finance.creditPinSubmit({...tablet,data:{sessionId:sid,pin:'123456'}}));
 });
 await check('InstaPay duplicate reference rejected across branches',async()=>{
  const ts=Date.now();const x='e'.repeat(36),y='f'.repeat(36);
  for(const sid of [x,y])put('finance_sessions/'+sid,{kind:'instapay',staffUid:'owner-uid',tabletUid:'tablet-uid',branch:sid===x?'madinaty':'rehab',status:'captured',photoPath:'private/test.jpg',amountCents:85000,invoiceTotalCents:85000,expiresAt:ts+180000,createdAt:ts});
  const data={reference:'777777888888',amount:850,beneficiary:'CIB',reason:'تمت مراجعة الصورة الكاملة يدويًا'};
  const result=await Promise.allSettled([insta.instaManualApprove({...owner,data:{...data,sessionId:x}}),insta.instaManualApprove({...owner,data:{...data,sessionId:y}})]);
  assert.equal(result.filter(x=>x.status==='fulfilled').length,1);assert.equal(result.filter(x=>x.status==='rejected').length,1);
  assert.equal([...store.keys()].filter(k=>k.startsWith('instapay_references/')).length,1);
 });
 await check('InstaPay cannot reuse invoice code already completed by wallet',async()=>{
  const sid='e'.repeat(36),data={invoiceCode:'FTM00001',branch:'madinaty',customerPhone:'01011111111',items:[{name:'طرحة',price:850,qty:1}],payments:{instapay:850},total:850};
  await assert.rejects(()=>insta.instaFinalizeSale({...owner,data:{sessionId:sid,sale:data}}),e=>e.code==='already-exists');
  assert.equal(store.get('instapay_references/'+crypto.createHash('sha256').update('777777888888').digest('hex')).status,'reserved');
 });
 await check('reference screenshot format extracted correctly, but historical receipt rejected',async()=>{
  const text='تم التحويل بنجاح\n1,600 EGP\nمن\nexample.sender@instapay\nACCOUNT xxxx1234\nإلى المحفظة الإلكترونية\nSAMPLE RECIPIENT\n01000000000\nالرقم المرجعي\n777777888888\nالتاريخ\n14 Sep 2026 11:42 PM\nملاحظة\nاختبار فقط';
  const meta={amountCents:160000,createdAt:Date.parse('2026-09-17T23:42:00+03:00')};
  const r=insta.__instaTest.extractReceipt(text);
  assert.equal(r.reference,'777777888888');assert.equal(r.amountCents,160000);
  const result=insta.__instaTest.autoCheck(text,meta,{alias:'01000000000'},0.98);
  assert.equal(result.checks.date,false);assert.equal(result.ok,false);
  const matching=insta.__instaTest.autoCheck(text,{...meta,createdAt:Date.parse('2026-09-14T23:42:00+03:00')},{alias:'01000000000'},0.98);
  assert.equal(matching.checks.beneficiary,true);assert.equal(matching.ok,true);
  assert.equal(insta.__instaTest.autoCheck(text,{...meta,createdAt:Date.parse('2026-09-14T23:42:00+03:00')},{alias:'WRONG-ACCOUNT'},0.98).ok,false);
 });
 await check('manual InstaPay underpayment cannot approve',async()=>{
  const sid='1'.repeat(36);put('finance_sessions/'+sid,{kind:'instapay',staffUid:'owner-uid',tabletUid:'tablet-uid',branch:'madinaty',status:'captured',photoPath:'private/test.jpg',amountCents:85000,expiresAt:Date.now()+180000});
  await assert.rejects(()=>insta.instaManualApprove({...owner,data:{sessionId:sid,reference:'462046147041',amount:800,reason:'مراجعة كاملة وإثبات الفرق'}}));
 });
 console.log('FINANCE TRANSACTION MOCK '+passed+'/'+passed+' PASS; mock only, not emulator or real hardware');
})().catch(e=>{console.error(e);process.exitCode=1;});
