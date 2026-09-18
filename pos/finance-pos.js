/* ECHARPE finance bridge v679 — does NOT use localStorage for payment authority.
   Server transaction writes the sale AND debits credit in one atomic commit. */
(function(){
'use strict';
let instaSession = null, instaAmount = 0, instaInvoiceTotal = 0;
const wait = ms => new Promise(r=>setTimeout(r,ms));
function fn(name){return firebase.app().functions('us-central1').httpsCallable(name);}
async function call(name,data){if(!navigator.onLine)throw Error('عمليات الرصيد وإنستا باي تحتاج اتصالًا مباشرًا بالسيرفر');return (await fn(name)(data)).data;}
function msg(e){return String(e?.message||e||'تعذر الاتصال بالسيرفر');}
function notify(t,err){showToast(t,err?'err':'ok');}
function phone(){return String(document.getElementById('customerPhone')?.value||'').trim();}
async function poll(name,sessionId,ms=180000){
 const until=Date.now()+ms;
 while(Date.now()<until){
   const state=await call(name,{sessionId});
   if(state.status==='approved'||state.status==='finished')return state;
   if(state.status==='captured'&&name==='instaStatus')return state;
   if(state.status==='cancelled'||state.status==='expired'||Date.now()>state.expiresAt)throw Error('انتهت صلاحية طلب الدفع، ابدأ من جديد');
   await wait(name==='instaStatus'?850:1300);
 }
 throw Error('مهلة الدفع انتهت. راجع حالة العملية قبل أي محاولة جديدة.');
}
window.financeCreditAuthorize=async function(customerPhone,amount,invoiceTotal){
 try{
   if(!navigator.onLine)throw Error('الرصيد لا يعمل أوفلاين');
   const s=await call('creditStartCheckout',{phone:customerPhone,amount,invoiceTotal,branch:currentBranch});
   notify('العميلة تدخل PIN على تابلت التقييم. في انتظار التأكيد…');
   const state=await poll('creditCheckoutStatus',s.sessionId,175000);
   if(state.status!=='approved')throw Error('العميلة لم توافق');
   notify('العميلة وافقت على الرصيد ✅');return s.sessionId;
 }catch(e){notify(msg(e),true);return null;}
};
window.financePairTablet=async function(){
 try{const uid=await askText({title:'ربط تابلت الفرع',message:'اكتب معرف الجهاز الظاهر على التابلت. الربط للمالك فقط.',placeholder:'Tablet UID'});if(!uid)return;
   await call('financePairTablet',{uid:uid.trim(),branch:currentBranch});notify('تم ربط التابلت');
 }catch(e){notify(msg(e),true);}
};
window.financePinSetup=async function(){
 try{
  const customer=phone();if(!/^01\d{9}$/.test(customer))throw Error('اكتب رقم العميلة الصحيح أولًا');
  const note=await askText({title:'المالك: تفعيل أو إعادة PIN',message:'لا تكمل قبل التحقق من هوية صاحبة الحساب فعليًا. سجّل وسيلة التحقق وسبب الموافقة (12 حرفًا على الأقل).',placeholder:'تفاصيل التحقق من الهوية'});if(!note)return;
  const ok=await askConfirm({title:'اعتماد التحقق من الهوية',message:'أنا المالك، تحققت من أن صاحبة رقم '+customer+' هي صاحبة الحساب. التابلت سيطلب منها إنشاء PIN جديد.',okText:'اعتماد التفعيل'});if(!ok)return;
  await call('creditPinSetupStart',{phone:customer,branch:currentBranch,verificationNote:note,identityVerified:true});notify('اتفتح إعداد PIN على التابلت');
 }catch(e){notify(msg(e),true);}
};
window.financeInstaConfigure=async function(){
 try{const alias=await askText({title:'المالك: مستفيد InstaPay',message:'اكتب InstaPay alias أو الحساب النهائي المستلم (ليس حساب المُرسِل).',placeholder:'name@instapay'});if(!alias)return;
  const beneficiaryName=await askText({title:'اسم المستفيد',message:'اسم المستفيد كما يظهر في الإيصال'});if(!beneficiaryName)return;
  await call('instaConfigure',{alias,beneficiaryName,bank:'CIB'});notify('تم إعداد مستفيد InstaPay');
 }catch(e){notify(msg(e),true);}
};

function setInstaStatus(message,state){
 const el=document.getElementById('finInstaStatus');
 if(el){el.textContent=message||'';el.dataset.state=state||'';}
}
let instaStartPromise=null,instaCancelPromise=null;
let _branchToggleBusy=false;
window.financeRestorePOSFocus=function(){
 // Avoid a native Windows confirm; restore shell and scanner only around a payment action.
 try{if(document.hidden)return;if(typeof markWindowFocusRisk==='function')markWindowFocusRisk('instapay',4000);}catch(_){}
 const restore=()=>{
  try{if(document.hidden)return;
   if(document.hasFocus&& !document.hasFocus()){
    if(window.posShell&&typeof window.posShell.focusWindow==='function')window.posShell.focusWindow();
    window.focus();
   }
   const active=document.activeElement;
   if(active&&active!==document.body&&active!==document.documentElement&&document.contains(active)&&
      active.offsetParent!==null&&/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName))return;
   const screen=document.getElementById('saleScreen'),search=document.getElementById('searchBar');
   if(screen&&screen.offsetParent!==null&&search&&search.offsetParent!==null)search.focus();
  }catch(_){}
 };
 setTimeout(restore,50);setTimeout(restore,320);
};
window.financeCheckInstaBranch=async function(expectedBranch){
 try{
  const branch=String(expectedBranch||currentBranch||'').trim();
  if(!branch)throw Error('اختار الفرع الأول');
  const state=await call('instaBranchStatus',{branch});
  if(currentBranch!==branch)return false;
  if(!state.enabled)throw Error('InstaPay متوقف في هذا الفرع من إعدادات المالك');
  if(!state.paired)throw Error('لا يوجد تابلت معتمد لهذا الفرع؛ اربطه من الصلاحيات أولًا');
  return true;
 }catch(e){notify(msg(e),true);return false;}
};
window.financeOwnerBranchStatus=async function(){
 const host=document.getElementById('finOwnerBranchStatus');if(!host)return;
 const branch=currentBranch;host.textContent='جارٍ فحص حالة '+branch+'…';
 try{
  const state=await call('instaBranchStatus',{branch});if(branch!==currentBranch)return;
  host.textContent='الفرع: '+branch+' · InstaPay: '+(state.enabled?'مفعّل':'متوقف')+' · التابلت: '+(state.paired?'معتمد':'غير مربوط');
  const b=document.getElementById('finOwnerBranchToggle');if(b){b.textContent=state.enabled?'إيقاف InstaPay لهذا الفرع':'تفعيل InstaPay لهذا الفرع';b.disabled=_branchToggleBusy;}
 }catch(e){host.textContent='تعذّر فحص حالة الفرع: '+msg(e);}
};
window.financeOwnerToggleBranch=async function(){
 if(_branchToggleBusy)return;
 const branch=currentBranch;
 try{
  const state=await call('instaBranchStatus',{branch});
  const enable=!state.enabled;
  if(enable&&!state.paired)throw Error('لازم تابلت معتمد قبل التفعيل');
  const ok=await askConfirm({title:(enable?'تفعيل':'إيقاف')+' InstaPay · '+branch,
   message:enable?'هيتاح بدء طلبات جديدة على تابلت الفرع بعد التفعيل.':'الإيقاف يمنع طلبات InstaPay الجديدة فقط، ومش بيرجع تحويلات بنكية.',
   okText:enable?'تفعيل هذا الفرع':'إيقاف هذا الفرع',danger:!enable,waitSec:0});
  if(!ok||branch!==currentBranch)return;
  _branchToggleBusy=true;const btn=document.getElementById('finOwnerBranchToggle');if(btn)btn.disabled=true;
  await call('instaOwnerBranchSet',{branch,enabled:enable});notify('تم '+(enable?'تفعيل':'إيقاف')+' InstaPay للفرع '+branch);
 }catch(e){notify(msg(e),true);}
 finally{_branchToggleBusy=false;await window.financeOwnerBranchStatus();}
};
window.financeShowPairRequests=async function(){
 const host=document.getElementById('finOwnerPairRequests');if(!host)return;
 host.textContent='جارٍ تحميل طلبات تابلت '+currentBranch+'…';
 try{
  const data=await call('financeOwnerPairRequests',{branch:currentBranch});host.replaceChildren();
  if(!data.rows.length){host.textContent='لا توجد أجهزة جديدة تنتظر الاعتماد. افتح شاشة التقييم على تابلت الفرع.';return;}
  data.rows.forEach(r=>{
   const row=document.createElement('div');row.className='finPairRequest';
   const info=document.createElement('div');
   const title=document.createElement('strong');title.textContent='طلب ربط · '+data.branch;
   const code=document.createElement('div');code.className='finPairCode';code.textContent=r.code;
   info.append(title,code);
   const button=document.createElement('button');button.type='button';button.className='finApproveBtn';button.textContent=r.replacesExisting?'استبدال الجهاز القديم':'اعتماد التابلت';
   button.onclick=async()=>{
    const ok=await askConfirm({title:r.replacesExisting?'استبدال تابلت الفرع':'اعتماد تابلت الفرع',
      message:'تأكد أن الرمز '+r.code+' ظاهر الآن على تابلت '+data.branch+' الفعلي. '+
        (r.replacesExisting?'التابلت القديم هيتفصل، وممنوع الاستبدال أثناء أي عملية مالية.':'لا توافق على جهاز غير معروف.'),
      okText:r.replacesExisting?'أوافق على استبدال الجهاز':'اعتماد هذا الجهاز',cancelText:'إلغاء'});
    if(!ok)return;
    button.disabled=true;
    try{await call('financeOwnerApprovePair',{requestId:r.requestId,branch:data.branch,code:r.code,replaceExisting:!!r.replacesExisting});notify('تم اعتماد التابلت؛ هيشتغل تلقائيًا الآن');await window.financeShowPairRequests();}
    catch(e){notify(msg(e),true);button.disabled=false;}
   };
   row.append(info,button);host.appendChild(row);
  });
 }catch(e){host.textContent='تعذر جلب الطلبات: '+msg(e);}
};
window.financeStartInstaOnAmountOK=function(amount,invoiceTotal){
 // Reserve the in-flight promise BEFORE any async branch/network check.
 if(instaStartPromise)return instaStartPromise;
 const requestedBranch=currentBranch;
 const promise=(async()=>{
  try{
   if(instaCancelPromise)await instaCancelPromise;
   if(!navigator.onLine)throw Error('اتصال الإنترنت مطلوب لإرسال الدفع للتابلت');
   if(!Number.isFinite(amount)||amount<=0||Math.abs(amount-invoiceTotal)>.005)
    throw Error('InstaPay يجب أن يغطي الفاتورة بالكامل في الإصدار الحالي');
   if(instaSession){
    if(instaAmount!==amount||instaInvoiceTotal!==invoiceTotal)
     throw Error('لا يمكن تغيير مبلغ جلسة قائمة؛ ألغِ الطلب القديم أولًا');
    setInstaStatus('الطلب ظاهر على التابلت · في انتظار تصوير الإيصال','pending');return true;
   }
   if(!await window.financeCheckInstaBranch(requestedBranch))return false;
   if(currentBranch!==requestedBranch)throw Error('الفرع اتغير أثناء إنشاء الطلب');
   setInstaStatus('جارٍ إرسال المبلغ إلى تابلت الفرع…','pending');
   const s=await call('instaStart',{amount,invoiceTotal,branch:requestedBranch});
   if(!s?.sessionId)throw Error('السيرفر لم يؤكد إنشاء جلسة InstaPay');
   instaSession=s.sessionId;instaAmount=amount;instaInvoiceTotal=invoiceTotal;
   setInstaStatus('تم إرسال '+amount.toFixed(2)+' ج.م · في انتظار تصوير الإيصال','pending');
   return true;
  }catch(e){setInstaStatus(msg(e),'error');notify(msg(e),true);return false;}
 })();
 instaStartPromise=promise;
 promise.finally(()=>{if(instaStartPromise===promise)instaStartPromise=null;}).catch(()=>{});
 return promise;
};

async function manual(sid,state){
 const evidence=await call('instaGetEvidence',{sessionId:sid});
 if(!evidence.jpeg)throw Error('صورة الإثبات غير متاحة — لا يمكن التأكيد اليدوي');
 // Data URI delivered through authenticated callable; no public Storage link.
 const ov=document.createElement('div');ov.style.cssText='position:fixed;inset:0;z-index:2147483000;background:#000e;display:flex;align-items:center;justify-content:center;padding:12px';
 ov.innerHTML='<div style="width:min(540px,100%);max-height:95vh;overflow:auto;background:#171a21;color:#fff;padding:18px;border-radius:20px;font-family:Cairo;text-align:center"><h3>راجع الإيصال كاملًا قبل التأكيد</h3><img alt="إيصال التحويل" style="width:100%;max-height:65vh;object-fit:contain;border-radius:10px"/><div style="display:flex;gap:10px;margin-top:10px"><button id="finReview" style="flex:1;padding:15px;border:0;border-radius:12px;background:#16a34a;color:white">راجعت الإيصال</button><button id="finCancel" style="flex:1;padding:15px;border:0;border-radius:12px">إلغاء</button></div></div>';
 document.body.appendChild(ov);ov.querySelector('img').src=evidence.jpeg;
 const approved=await new Promise(resolve=>{ov.querySelector('#finReview').onclick=()=>resolve(true);ov.querySelector('#finCancel').onclick=()=>resolve(false);});ov.remove();
 if(!approved)throw Error('المراجعة اليدوية اتلغت');
 const reference=await askText({title:'الرقم المرجعي الأصلي',message:'اكتبه كما يظهر بالإيصال، بدون تخمين'});if(!reference)throw Error('يجب إدخال المرجع');
 const amount=await askText({title:'قيمة التحويل',message:'تأكد من المبلغ بالقرش',type:'number'});if(amount===null)throw Error('تم إلغاء المراجعة');
 const beneficiary=await askText({title:'المستفيد',message:'اكتب المستفيد الظاهر على الإيصال'});if(!beneficiary)throw Error('المستفيد مطلوب');
 const reason=await askText({title:'سبب التأكيد اليدوي',message:'اكتب سبب تجاوز القراءة، بما فيه أي اختلاف (12 حرفًا على الأقل)'});if(!reason)throw Error('السبب مطلوب');
 const result=await call('instaManualApprove',{sessionId:sid,reference,amount,beneficiary,reason});if(!result.ok)throw Error('رفض السيرفر التأكيد');
 return result;
}
window.financeEnsureInstaApproved=async function(){
 const amount=Number(paymentAmounts.instapay)||0;
 if(amount<=0)return true;
 const total=cartTotal();
 try{
  if(instaStartPromise)await instaStartPromise;
  if(!instaSession){throw Error('طلب InstaPay لم يبدأ؛ افتح مبلغ InstaPay واضغط OK مرة أخرى');}
  if(instaAmount!==amount || instaInvoiceTotal!==total)throw Error('الفاتورة أو المبلغ تغير بعد بدء الدفع؛ لا يمكن الحفظ');
  let state=await poll('instaStatus',instaSession,295000);
  if(state.status==='captured'){
   notify('التصوير وصل؛ المراجعة الآلية لم تُطابق كل البيانات',true);
   await manual(instaSession,state);
   state=await call('instaStatus',{sessionId:instaSession});
  }
  if(state.status!=='approved'&&state.status!=='finished')throw Error('إثبات InstaPay لم يُقبل');
  return true;
 }catch(e){notify(msg(e),true);return false;}
};
window.financeSaleWrite=async function(sale){
 if(!navigator.onLine)throw Error('لا يمكن إتمام فاتورة مالية قبل تأكيد السيرفر');
 const p=window.pendingCreditSpend;
 if(Number(sale.payments?.credit_return)<0){
   if(p || Number(sale.payments?.instapay)>0)throw Error('مرتجع الرصيد لا يقبل تقسيم طرق الدفع');
   const payload={...sale};delete payload.createdAt;
   const result=await call('creditReturnFinalizeSale',{sale:payload});
   if(!result.ok)throw Error('لم يؤكد السيرفر إضافة الرصيد');
   window.financeReturnPointsDeduct=result.pointsDeduct;window.financeCreditSlipPending={...result,refundInvoice:sale.invoiceCode};
   return {ok:true,value:{id:result.saleId}};
 }
 if(p && Number(sale.payments?.instapay)>0)throw Error('الدفع المختلط رصيد + InstaPay مش مدعوم في نفس المعاملة حتى يتعمل تسوية ذرّية');
 if(p){
   if(!p.sessionId)throw Error('رصيد من غير موافقة PIN');
   if(Math.abs((Number(sale.total)||0)+p.amount-p.invoiceTotal)>.005)throw Error('السلة اتغيرت بعد موافقة العميلة');
   const data={...sale};delete data.createdAt;
   const r=await call('creditFinalizeSale',{sessionId:p.sessionId,sale:data});
   if(!r.ok)throw Error('لم يثبت السيرفر خصم الرصيد');p._committed=true;return {ok:true,value:{id:r.saleId}};
 }
 if((Number(sale.payments?.instapay)||0)>0){
   if(!instaSession)throw Error('مطلوب إثبات InstaPay مصوّر ومقبول');
   if(instaInvoiceTotal!==sale.total)throw Error('تغيّر مبلغ الفاتورة بعد الفحص');
   const data={...sale};delete data.createdAt;
   const r=await call('instaFinalizeSale',{sessionId:instaSession,sale:data});
   if(!r.ok)throw Error('فشل تسجيل دليل التحويل');instaSession=null;instaAmount=0;instaInvoiceTotal=0;setInstaStatus('','');return {ok:true,value:{id:r.saleId}};
 }
 throw Error('غير مدعوم');
};

window.financeScanCreditReceipt=async function(code){
 try{const d=await call('financeLookupCreditReceipt',{reference:code});
  const el=document.getElementById('customerPhone');if(!el)throw Error('خانة العميلة غير موجودة');
  if(window.pendingCreditSpend)throw Error('لازم تكملي دفع الرصيد المفتوح أولًا');
  el.value=d.phone;
  if(typeof refreshCustomerInfo==='function')await refreshCustomerInfo();
  notify('إيصال '+code+' · رصيد متاح '+Number(d.balance).toFixed(2)+' ج.م. الصرف يحتاج PIN العميلة على التابلت.');
 }catch(e){notify(msg(e),true);}
};
window.financeHasActiveInsta=()=>!!instaSession||!!instaStartPromise;
window.financeCanUseInstaAmount=(amount,total)=>!instaSession||(instaAmount===amount&&instaInvoiceTotal===total);
window.financeCancellationPending=()=>!!instaCancelPromise;
window.financeCancelPending=async function(){
 if(instaCancelPromise)return instaCancelPromise;
 const action=(async()=>{
  if(instaStartPromise)await instaStartPromise.catch(()=>{});
  const s=instaSession,credit=window.pendingCreditSpend;
  if(s){const result=await call('financeCancelSession',{sessionId:s});
   if(!result?.ok||result.alreadyFinished)throw Error('الإلغاء لم يُعتمد؛ راجع العملية قبل مسح المدفوعات');}
  if(credit?.sessionId&&!credit._committed){const result=await call('financeCancelSession',{sessionId:credit.sessionId});
   if(!result?.ok||result.alreadyFinished)throw Error('جلسة الرصيد لم تُلغَ؛ راجع العملية قبل المسح');}
  if(instaSession===s){instaSession=null;instaAmount=0;instaInvoiceTotal=0;}
  if(window.pendingCreditSpend===credit)window.pendingCreditSpend=null;
  setInstaStatus('','');
 })();
 instaCancelPromise=action;
 try{return await action;}finally{instaCancelPromise=null;}
};
window.financeSaleReset=function(){if(!instaSession&&!instaStartPromise){instaAmount=0;instaInvoiceTotal=0;setInstaStatus('','');}};
})();
