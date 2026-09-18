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
   await wait(1300);
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
  if(!instaSession || instaAmount!==amount || instaInvoiceTotal!==total){
   if(instaSession && instaAmount!==amount)throw Error('تم تغيير المبلغ بعد بدء التحويل؛ ألغِ الجلسة القديمة أولًا');
   const s=await call('instaStart',{amount,invoiceTotal:total,branch:currentBranch});instaSession=s.sessionId;instaAmount=amount;instaInvoiceTotal=total;
   notify('التابلت يعرض بيانات التحويل. ينتظر تصوير الإيصال…');
  }
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
   if(!r.ok)throw Error('فشل تسجيل دليل التحويل');instaSession=null;return {ok:true,value:{id:r.saleId}};
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
window.financeCancelPending=async function(){
 const s=instaSession,credit=window.pendingCreditSpend;
 // Clear only the abandoned attempt: a newer checkout may start during the network await.
 if(instaSession===s){instaSession=null;instaAmount=0;instaInvoiceTotal=0;}
 if(window.pendingCreditSpend===credit)window.pendingCreditSpend=null;
 if(s)await call('financeCancelSession',{sessionId:s});
 if(credit?.sessionId&&!credit._committed)await call('financeCancelSession',{sessionId:credit.sessionId});
};
window.financeSaleReset=function(){instaSession=null;instaAmount=0;instaInvoiceTotal=0;};
})();
