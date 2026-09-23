// Actual callable handlers and actual tablet module, mocked I/O only. No credentials/network.
const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const path=require('path');
const {makeDb}=require('./helpers/fake-firestore');
const core=require('../functions/instapayCore');
const good=`تم التحويل بنجاح\n1600 EGP\nمن\ncustomer@instapay\nإلى\nshop@instapay\nالرقم المرجعي\n462046147040\nالتاريخ\n23 Sep 2026 2:41 PM`;
const session=()=>({sid:'s1',branch:'Test',status:'scanning',amountCents:160000,aliases:['shop@instapay'],alias:'shop@instapay',scans:0,maxScans:8,monthlyScanCap:1000,expiresAt:Date.now()+600000,startedCivilMin:core.civilMinutes({y:2026,m:9,d:23,hh:14,mm:41}),windowMin:5});
function backend(){
  const db=makeDb({'finance_sessions/s1':session(),'insta_live/Test':{sid:'s1'}});
  const transaction=db.runTransaction.bind(db);let queue=Promise.resolve();
  db.runTransaction=work=>{const result=queue.then(()=>transaction(work));queue=result.catch(()=>{});return result;};
  let text=good,onRead=async()=>{},calls=0,options;
  class HttpsError extends Error{constructor(code,msg){super(msg);this.code=code;}}
  const ctx={exports:{},console,Date,Buffer,require(name){
    if(name==='firebase-functions/v2/https')return {onCall:(_o,fn)=>fn,HttpsError};
    if(name==='firebase-admin/firestore')return {getFirestore:()=>db,FieldValue:{}};
    if(name==='google-auth-library')return {GoogleAuth:class{async getClient(){return {request:async o=>{calls++;options=o;await onRead();return {data:{responses:[{fullTextAnnotation:{text}}]}};}};}}};
    if(name==='./instapayCore')return core;
    if(name==='crypto')return require('crypto');
    throw Error(name);
  }};
  vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'../functions/instapay.js'),'utf8'),ctx);
  return {db,api:ctx.exports,setText:t=>text=t,setRead:f=>onRead=f,calls:()=>calls,options:()=>options,
    scan:sid=>ctx.exports.instaScan({auth:{uid:'tablet'},data:{sid:sid||'s1',image:'a'.repeat(1600)}})};
}
async function tablet(){
  const {JSDOM}=require('jsdom');const dom=new JSDOM('<html><head></head><body></body></html>',{url:'https://test.invalid',runScripts:'outside-only'});
  const w=dom.window;w.localStorage.setItem('feedback_branch','Test');w.fbApp={};w.InstaScanCore=require('../feedback/instapay-scan-core');
  const camera={getTracks:()=>[{stop(){}}],getVideoTracks:()=>[]};
  Object.defineProperty(w.navigator,'mediaDevices',{value:{getUserMedia:async()=>camera}});
  w.HTMLMediaElement.prototype.play=async()=>{};
  w.HTMLCanvasElement.prototype.getContext=function(){return {drawImage(){},translate(){},scale(){},getImageData:()=>{
    const data=new Uint8ClampedArray(this.width*this.height*4);for(let i=0;i<data.length;i+=4)data[i]=data[i+1]=data[i+2]=(i/4)%2?220:20;return {data};
  }};};
  w.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/jpeg;base64,'+'a'.repeat(1600);
  let listener,resolveScan,scans=0;
  const ctx=dom.getInternalVMContext();
  Object.assign(ctx,{getFirestore:()=>({}),getFunctions:()=>({}),doc:()=>({}),getDoc:async()=>({exists:()=>false}),
    onSnapshot:(_r,f)=>listener=f,httpsCallable:(_f,name)=>name==='instaScan'?()=>{scans++;return new Promise(r=>resolveScan=r);}:()=>new Promise(()=>{})});
  w.setInterval=()=>1;w.clearInterval=()=>{};
  Object.defineProperty(w.document,'hidden',{value:false,configurable:true});
  const source=fs.readFileSync(path.join(__dirname,'../feedback/instapay-tablet.js'),'utf8').replace(/^import .*;\s*$/gm,'');
  vm.runInContext(source+'\nwindow.testApi={tick,beginScan,stopCam,get:()=>({curPane,busy,scanGeneration})};',ctx);
  const vid=w.document.getElementById('ipVid');
  Object.defineProperties(vid,{videoWidth:{value:1920},videoHeight:{value:1080},readyState:{value:4}});
  vid.getBoundingClientRect=()=>({width:450,height:600});
  const live=(sid,status)=>listener({exists:()=>true,data:()=>({sid,status,amountCents:160000,alias:'shop@instapay',updatedAt:Date.now()})});
  return {w,live,close:()=>dom.window.close(),scans:()=>scans,resolve:r=>resolveScan({data:r})};
}
(async()=>{
  let count=0;async function check(name,fn){await fn();count++;console.log('PASS '+name);}
  await check('complete scan approves and reserves reference',async()=>{const b=backend();const r=await b.scan();assert.equal(r.ok,true);assert.equal(b.db._store['instapay_references/462046147040'].sid,'s1');assert.equal(b.options().timeout,8000);assert.equal(b.options().retry,false);});
  await check('empty OCR is retryable and serializable',async()=>{const b=backend();b.setText('');const r=await b.scan();assert.equal(r.ok,false);assert.equal(r.fatal,false);assert.equal(r.checks.success,false);assert.equal(b.db._store['finance_sessions/s1'].status,'scanning');for(const v of Object.values(r.checks))assert.equal(typeof v,'boolean');});
  await check('single wrong amount does not terminate; next clear frame succeeds',async()=>{const b=backend();b.setText(good.replace('1600','1800'));assert.equal((await b.scan()).fatal,false);b.setText(good);assert.equal((await b.scan()).ok,true);});
  await check('repeated same wrong amount is rejected',async()=>{const b=backend();b.setText(good.replace('1600','1800'));await b.scan();assert.equal((await b.scan()).fatal,true);});
  await check('no success phrase cannot approve',async()=>{const b=backend();b.setText(good.replace('تم التحويل بنجاح',''));assert.equal((await b.scan()).ok,false);});
  await check('manual approval during OCR cannot be undone',async()=>{const b=backend();b.setText('');b.setRead(async()=>{await b.api.instaPay({auth:{uid:'cashier',token:{firebase:{sign_in_provider:'password'}}},data:{action:'approveManual',sid:'s1'}});});assert.equal((await b.scan()).ok,true);assert.equal(b.db._store['finance_sessions/s1'].mode,'manual');});
  await check('cancelled session is not revived by late OCR',async()=>{const b=backend();b.setRead(async()=>{b.db._store['finance_sessions/s1'].status='cancelled';});await assert.rejects(b.scan(),e=>e.code==='failed-precondition');assert.equal(b.db._store['finance_sessions/s1'].status,'cancelled');});
  await check('new customer screen is never overwritten',async()=>{const b=backend();b.setRead(async()=>{b.db._store['insta_live/Test']={sid:'s2'};});await assert.rejects(b.scan(),e=>e.code==='failed-precondition');assert.equal(b.db._store['insta_live/Test'].sid,'s2');});
  await check('same reference cannot approve a second active session',async()=>{const b=backend();await b.scan();b.db._store['finance_sessions/s2']={...session(),sid:'s2'};b.db._store['insta_live/Test']={sid:'s2'};const r=await b.scan('s2');assert.equal(r.ok,false);assert.equal(r.error,'DUPLICATE');});
  await check('newer scan result wins over a late one',async()=>{const b=backend();b.setRead(async()=>{b.db._store['finance_sessions/s1'].scans=2;});assert.equal((await b.scan()).stale,true);assert.equal(b.db._store['finance_sessions/s1'].status,'scanning');});
  await check('monthly cap prevents paid OCR calls',async()=>{const b=backend();b.db._store['finance_sessions/s1'].monthlyScanCap=1;await b.scan();b.db._store['finance_sessions/s1'].status='scanning';await assert.rejects(b.scan(),e=>e.code==='resource-exhausted');assert.equal(b.calls(),1);});
  await check('first clear camera frame scans without ready network response',async()=>{const t=await tablet();try{t.live('s1','waiting');t.w.document.getElementById('ipDone').onclick();await new Promise(r=>setImmediate(r));assert.equal(t.scans(),1);}finally{t.close();}});
  await check('late scan for old session cannot paint success for next customer',async()=>{const t=await tablet();try{t.live('s1','scanning');await new Promise(r=>setImmediate(r));assert.equal(t.scans(),1);t.live('s2','waiting');t.resolve({ok:true,checks:{amount:true}});await new Promise(r=>setImmediate(r));assert.equal(t.w.testApi.get().curPane,'wait');}finally{t.close();}});
  await check('back to QR is not undone by an in-flight scan',async()=>{const t=await tablet();try{t.live('s1','scanning');await new Promise(r=>setImmediate(r));t.w.document.getElementById('ipBack').onclick();t.resolve({ok:true});await new Promise(r=>setImmediate(r));assert.equal(t.w.testApi.get().curPane,'wait');}finally{t.close();}});
  console.log('InstaPay runtime v707: '+count+' behavioral checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
