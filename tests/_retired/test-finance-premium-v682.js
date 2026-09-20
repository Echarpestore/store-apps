'use strict';
// v682 targeted release checks: guard financial preconditions and live UI start ordering.
const assert=require('assert');
const fs=require('fs');
const vm=require('vm');
const path=require('path');
const root=path.resolve(__dirname,'..');
const get=f=>fs.readFileSync(path.join(root,f),'utf8');
let passed=0;
function check(label,test){assert.ok(test,label);passed++;}
const server=get('functions/financeCheckout.js');
const insta=get('functions/instaEvidence.js');
const pos=get('pos/pos-sale.js');
const finance=get('pos/finance-pos.js');
const html=get('pos/index.html');
const tablet=get('feedback/finance-tablet.js');
const feedback=get('feedback/index.html');
check('New tablet cannot authorize itself by choosing branch',server.includes('exports.financeTabletRequestPair')&&server.includes("status:'pending'")&&server.includes("exports.financeOwnerApprovePair = callable(async req => {\n  const who=await staff(req,true)"));
check('Pair approval is one-time, code-bound and expires',server.includes("v.code!==code||v.expiresAt<=stamp()")&&server.includes("tx.update(r,{status:'approved',code:null"));
check('Paired branch pointer verified',server.includes("assigned.data()?.uid===uid"));
check('Branch takeover rejected',server.includes('req.data?.replaceExisting!==true')&&server.includes('finance_pair_audit')&&server.includes('previous?.data()?.activeSession'));
check('No anonymous direct finance rules bypass',get('security/firestore-phase2.rules').includes('match /{document=**} {\n      allow read, write: if false;'));
check('Only accepted receipt permits invoice',insta.includes("if(s.status!=='approved'||Date.now()>s.expiresAt)"));
check('InstaPay OK requests tablet before printing',pos.indexOf('window.financeStartInstaOnAmountOK(val,total)')>0 && pos.includes('window.financeEnsureInstaApproved'));
check('Mixed payments refused before start',pos.includes('InstaPay يلزم قيمة الفاتورة بالكامل، بدون تقسيم دفع'));
check('Owner controls not on sale screen',html.includes('finOwnerPanel')&&!html.includes('financeOwnerTools'));
check('Return credit legible and scoped',html.includes('button#pmCreditReturn{')&&html.includes('color:#fff!important'));
check('QR shown only if verified configured alias',tablet.includes("String(details.recipientAlias||'').trim().toLowerCase()==='zogzog2000@instapay'"));
check('Tablet branch is discovery not sufficient approval',tablet.includes("call('financeTabletPairStatus'")&&tablet.includes("call('financeTabletRequestPair'")&&tablet.includes('if(!pairReady)return'));
check('No legacy manual UID in daily UI',!html.includes('onclick="financePairTablet()"')&&!tablet.includes('Finance tablet ID:'));
check('Tablet branch event published',feedback.includes("window.financeFeedbackBranch=()=>currentBranch")&&feedback.includes("window.dispatchEvent(new Event('echarpe:branch-changed'))"));
check('Tablet premium motion accessible',tablet.includes('prefers-reduced-motion:reduce')&&tablet.includes('finCardArrive'));
check('Financial backend references modular admin APIs',server.includes('getAuth().getUser(uid)')&&server.includes('const db = () => getFirestore()')&&insta.includes('getStorage().bucket()'));
async function run(){
 const calls=[],toast=[],el={textContent:'',dataset:{}};
 let resolveStart;
 let startMode='pending';
 const ctx={window:{},navigator:{onLine:true},document:{getElementById:id=>id==='finInstaStatus'?el:null},
   currentBranch:'Madinaty',paymentAmounts:{instapay:350},cartTotal:()=>350,showToast:(s)=>toast.push(s),console,
   firebase:{app:()=>({functions:()=>({httpsCallable:name=>async data=>{
    calls.push({name,data});
    if(name==='instaBranchStatus')return {data:{enabled:true,paired:true,ready:true}};
    if(name==='instaStart'){
      if(startMode==='pending')return await new Promise(r=>{resolveStart=r;});
      if(startMode==='error')throw Error('mock server unavailable');
      return {data:{sessionId:'sid-2'}};
    }
    if(name==='instaStatus')return {data:{status:'approved',expiresAt:Date.now()+300000}};
    if(name==='financeCancelSession')return {data:{ok:true}};
    if(name==='instaFinalizeSale')return {data:{ok:true,saleId:'sale-1'}};
    throw Error('Unexpected: '+name);
   }})})},setTimeout,Date};
 vm.runInNewContext(finance,ctx,{filename:'finance-pos.js'});
 const first=ctx.window.financeStartInstaOnAmountOK(350,350);
 const second=ctx.window.financeStartInstaOnAmountOK(350,350);
 await new Promise(r=>setTimeout(r,5));
 check('No duplicate InstaPay session from rapid OK',calls.filter(x=>x.name==='instaStart').length===1);
 check('Branch validated before session starts',calls.some(x=>x.name==='instaBranchStatus')&&calls.findIndex(x=>x.name==='instaBranchStatus')<calls.findIndex(x=>x.name==='instaStart'));
 resolveStart({data:{sessionId:'sid-1'}});
 check('Start resolves after server accepted',await first===true&&await second===true);
 check('Save awaits approved status and reuses started session',await ctx.window.financeEnsureInstaApproved()===true&&calls.filter(x=>x.name==='instaStart').length===1);
 check('Changing started amount rejected without state mutation',!ctx.window.financeCanUseInstaAmount(300,350));
 await ctx.window.financeCancelPending();
 check('Cancel reaches server',calls.some(x=>x.name==='financeCancelSession'&&x.data.sessionId==='sid-1'));
 startMode='success';
 check('New sale starts after cancellation',await ctx.window.financeStartInstaOnAmountOK(350,350)===true);
 await ctx.window.financeCancelPending();
 startMode='error';
 check('Server error fails closed rather than claiming payment',await ctx.window.financeStartInstaOnAmountOK(350,350)===false&&el.dataset.state==='error');
 console.log('FINANCE PREMIUM v682 '+passed+'/'+passed+' PASS (targeted mock/static; NOT real Firebase/hardware)');
}
if(global.assert){console.log('FINANCE PREMIUM v682 '+passed+'/'+passed+' PASS (static only in full harness)');}
else run().catch(e=>{console.error(e);process.exitCode=1;});
