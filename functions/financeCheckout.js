'use strict';
// ECHARPE finance checkout — server authority. Never infer bank settlement from a photo.
const crypto = require('crypto');
const {validateCreditSale,validateBase} = require('./financeIntegrity');
const admin = require('firebase-admin');
const {onCall, HttpsError} = require('firebase-functions/v2/https');
const {defineSecret} = require('firebase-functions/params');
const OWNER_EMAIL = defineSecret('OWNER_EMAIL');
const CREDIT_PIN_PEPPER = defineSecret('CREDIT_PIN_PEPPER');
const db = () => admin.firestore();
const REGION = 'us-central1';
const MONEY = n => {const v=Number(n); if(!Number.isFinite(v)) throw new HttpsError('invalid-argument','المبلغ غير صالح'); return Math.round(v*100);};
const phoneOf = p => {const x=String(p||'').replace(/\D/g,''); if(!/^01\d{9}$/.test(x)) throw new HttpsError('invalid-argument','رقم العميل غير صحيح'); return x;};
const branchOf = v => {const x=String(v||'').trim(); if(!x || x.length>100 || x.includes('/')) throw new HttpsError('invalid-argument','الفرع غير صالح'); return x;};
const fail = (c,m)=>{throw new HttpsError(c,m);};
const stamp = () => Date.now();
const sessionRef = id => db().collection('finance_sessions').doc(String(id||''));
function rand(){return crypto.randomBytes(18).toString('hex');}
async function staff(req, ownerOnly=false){
  const t=req.auth?.token||{}; const email=String(t.email||'').toLowerCase().trim();
  if(!req.auth?.uid || !email || t.firebase?.sign_in_provider==='anonymous') fail('permission-denied','مطلوب حساب موظف موثق');
  const owner=String(OWNER_EMAIL.value()||'').toLowerCase().trim();
  if(!owner) fail('failed-precondition','OWNER_EMAIL غير مضبوط');
  if(email===owner) return {uid:req.auth.uid,email,role:'owner',name:t.name||'Owner'};
  if(ownerOnly) fail('permission-denied','المالك فقط');
  const a=await db().collection('pos_test_settings').doc('staff_access').get();
  const record=(a.data()?.emails||{})[email.replace(/\./g,'_')];
  if(!record || record.active===false) fail('permission-denied','الموظف غير مصرح له بعمليات الرصيد');
  return {uid:req.auth.uid,email,role:'staff',branch:record.branch||'',name:record.name||email};
}
function needTablet(req){if(!req.auth?.uid || req.auth.token?.firebase?.sign_in_provider!=='anonymous') fail('permission-denied','التابلت يجب أن يستخدم حسابه المنفصل');return req.auth.uid;}
async function paired(uid){const d=await db().collection('finance_tablets').doc(uid).get(); if(!d.exists||!d.data().active) fail('permission-denied','التابلت غير مرتبط بالمالك');return d.data();}
const callable=(handler,withPin=false)=>onCall({region:REGION,secrets:withPin?[OWNER_EMAIL,CREDIT_PIN_PEPPER]:[OWNER_EMAIL]},handler);
function pinDigest(pin,salt){const pepper=CREDIT_PIN_PEPPER.value(); if(!pepper) fail('failed-precondition','CREDIT_PIN_PEPPER غير مضبوط'); return crypto.scryptSync(pin,Buffer.from(salt+pepper),32).toString('hex');}
function validPin(pin){if(!/^\d{6}$/.test(String(pin||''))) fail('invalid-argument','الرقم السري يجب أن يكون 6 أرقام');return String(pin);}
function sameHash(a,b){const x=Buffer.from(a||'','hex'),y=Buffer.from(b||'','hex');return x.length===32&&y.length===32&&crypto.timingSafeEqual(x,y);}
function active(s){return s && stamp() < s.expiresAt && !['cancelled','finished','expired'].includes(s.status);}
async function startSession(req,kind,args){
  const who=await staff(req); const branch=branchOf(args.branch);
  if(who.branch && who.branch!==branch && who.role!=='owner') fail('permission-denied','الفرع لا يطابق صلاحية الموظف');
  const b=await db().collection('finance_tablet_branches').doc(branch).get();
  if(!b.exists || !b.data().uid) fail('failed-precondition','الفرع محتاج ربط تابلت');
  const uid=b.data().uid; const sid=rand(), now=stamp();
  const t=db().collection('finance_tablets').doc(uid),s=sessionRef(sid);
  await db().runTransaction(async tx=>{
    const device=await tx.get(t);if(!device.exists||!device.data().active||device.data().branch!==branch)fail('failed-precondition','ربط التابلت غير صالح');
    const oldId=device.data().activeSession;
    if(oldId){const old=await tx.get(sessionRef(oldId));if(old.exists&&active(old.data()))fail('already-exists','فيه طلب دفع شغال على التابلت');}
    tx.create(s,{...args,kind,branch,tabletUid:uid,staffUid:who.uid,staffName:who.name,status:'pending',createdAt:now,expiresAt:now+180000});
    tx.set(t,{activeSession:sid},{merge:true});
  });
  return {sessionId:sid,expiresAt:now+180000};
}
// Display device UID once and pair it only with an authenticated owner.
exports.financePairTablet=callable(async req=>{
  const who=await staff(req,true), uid=String(req.data?.uid||'').trim(),branch=branchOf(req.data?.branch);
  if(!/^[\w-]{15,160}$/.test(uid))fail('invalid-argument','معرف التابلت غير صالح');
  const u=await admin.auth().getUser(uid).catch(()=>null);
  if(!u || u.email || u.phoneNumber || u.providerData.length)fail('failed-precondition','المعرف لا يخص جهازًا بحساب مجهول');
  await db().runTransaction(async tx=>{
    const b=db().collection('finance_tablet_branches').doc(branch),t=db().collection('finance_tablets').doc(uid);
    const old=await tx.get(b); const prev=await tx.get(t);
    if(prev.exists && prev.data().branch!==branch && prev.data().active)fail('failed-precondition','الجهاز مربوط بفرع آخر');
    if(old.exists && old.data().uid && old.data().uid!==uid)fail('failed-precondition','الفرع مربوط بجهاز مختلف؛ افصل الربط بإجراء موثّق');
    tx.set(b,{uid,branch,pairedAt:stamp(),by:who.uid});tx.set(t,{branch,active:true,pairedAt:stamp(),by:who.uid},{merge:true});
  });return {ok:true,branch};
});
// Owner verifies identity OFFLINE by an approved documented procedure BEFORE this call.
exports.creditPinSetupStart=callable(async req=>{
  const who=await staff(req,true),phone=phoneOf(req.data?.phone),branch=branchOf(req.data?.branch);
  if(!req.data?.identityVerified || String(req.data?.verificationNote||'').trim().length<12)
    fail('failed-precondition','مطلوب تحقق هوية موثق وملاحظة من المالك');
  const created=await startSession(req,'pin_setup',{phone,verificationNote:String(req.data.verificationNote).trim(),verifiedBy:who.uid});
  return created;
});
exports.creditStartCheckout=callable(async req=>{
  const phone=phoneOf(req.data?.phone),amount=MONEY(req.data?.amount),total=MONEY(req.data?.invoiceTotal);
  if(amount<=0||total<=0||amount>total)fail('invalid-argument','رصيد الخصم أكبر من الفاتورة');
  const p=await db().collection('credit_pins').doc(phone).get();
  if(!p.exists)fail('failed-precondition','العميل محتاج تفعيل PIN بمعرفة المالك أولًا');
  return startSession(req,'credit',{phone,amountCents:amount,invoiceTotalCents:total});
});
exports.financeTabletPoll=callable(async req=>{
  const uid=needTablet(req),device=await paired(uid),sid=device.activeSession;
  if(!sid)return {status:'idle'};
  const doc=await sessionRef(sid).get(); if(!doc.exists || doc.data().tabletUid!==uid || !active(doc.data()))return {status:'idle'};
  const s=doc.data();
  return {status:s.status,sessionId:sid,kind:s.kind,amount:s.amountCents/100,invoiceTotal:s.invoiceTotalCents/100,
    maskedPhone:s.phone?'••••'+s.phone.slice(-4):null,branch:s.branch,expiresAt:s.expiresAt};
});
exports.creditPinSubmit=callable(async req=>{
  const uid=needTablet(req),device=await paired(uid),sid=String(req.data?.sessionId||'');
  const pincode=validPin(req.data?.pin), ref=sessionRef(sid), initial=await ref.get();
  if(!initial.exists||initial.data().tabletUid!==uid || device.activeSession!==sid || !active(initial.data()) || initial.data().status!=='pending')
    fail('failed-precondition','الطلب انتهى أو لا يخص التابلت');
  const s=initial.data(),p=db().collection('credit_pins').doc(s.phone),guard=db().collection('credit_pin_attempts').doc(s.phone);
  if(s.kind==='pin_setup'){
    if(pincode!==String(req.data?.confirmPin||''))fail('invalid-argument','الرقمان غير متطابقين');
    const salt=crypto.randomBytes(16).toString('hex'), hash=pinDigest(pincode,salt);
    return db().runTransaction(async tx=>{
      const sess=await tx.get(ref),old=await tx.get(p),dev=await tx.get(db().collection('finance_tablets').doc(uid));
      if(!sess.exists||!active(sess.data())||sess.data().status!=='pending'||dev.data()?.activeSession!==sid)fail('failed-precondition','انتهت صلاحية التفعيل');
      tx.set(p,{salt,hash,updatedAt:stamp(),version:(old.data()?.version||0)+1,verifiedBy:s.verifiedBy});
      tx.set(guard,{attempts:0,lockedUntil:0});
      tx.update(ref,{status:'finished',completedAt:stamp()});tx.update(dev.ref,{activeSession:null});return {ok:true};
    });
  }
  if(s.kind!=='credit')fail('invalid-argument','الطلب ليس لصرف رصيد');
  // Password verification outside transaction; transaction rechecks PIN version to stop reset races.
  const pinDoc=await p.get(); if(!pinDoc.exists)fail('failed-precondition','لا يوجد PIN مفعل');
  const matched=sameHash(pinDigest(pincode,pinDoc.data().salt),pinDoc.data().hash);
  return db().runTransaction(async tx=>{
    const sess=await tx.get(ref),pinNow=await tx.get(p),g=await tx.get(guard);
    if(!sess.exists||!active(sess.data())||sess.data().status!=='pending'||sess.data().tabletUid!==uid)fail('failed-precondition','الطلب انتهى');
    if(!pinNow.exists||pinNow.data().version!==pinDoc.data().version)fail('failed-precondition','تم تغيير الرقم السري، حاول من جديد');
    const now=stamp(),attempts=g.data()?.attempts||0;
    if((g.data()?.lockedUntil||0)>now)fail('resource-exhausted','محاولات كثيرة؛ الحساب مقفل مؤقتًا');
    if(!matched){const next=attempts+1;tx.set(guard,{attempts:next,lockedUntil:next>=5?now+900000:0});
      tx.update(ref,{pinAttempts:(sess.data().pinAttempts||0)+1,status:next>=5?'cancelled':'pending'});return {ok:false,remaining:Math.max(0,5-next)};}
    tx.set(guard,{attempts:0,lockedUntil:0});tx.update(ref,{status:'approved',approvedAt:now,approvedUntil:now+120000,approvedPinVersion:pinNow.data().version});return {ok:true};
  });
},true);
exports.creditCheckoutStatus=callable(async req=>{
  const who=await staff(req),sid=String(req.data?.sessionId||''),doc=await sessionRef(sid).get();
  if(!doc.exists || doc.data().staffUid!==who.uid)fail('permission-denied','الجلسة لا تخص الموظف');
  return {status:doc.data().status,expiresAt:doc.data().expiresAt,approvedUntil:doc.data().approvedUntil||0,invoiceCode:doc.data().invoiceCode||null};
});
exports.creditFinalizeSale=callable(async req=>{
  const who=await staff(req),sid=String(req.data?.sessionId||''),sale=req.data?.sale;
  if(!sale||typeof sale!=='object'||Array.isArray(sale))fail('invalid-argument','الفاتورة مطلوبة');
  const code=String(sale.invoiceCode||'');if(!/^[A-Z0-9-]{6,80}$/i.test(code))fail('invalid-argument','كود الفاتورة غير صالح');
  const ref=sessionRef(sid),inv=db().collection('pos_test_sales').doc('CREDIT_'+sid),cust=db().collection('pos_test_customers').doc(String(sale.customerPhone||''));
  const result=await db().runTransaction(async tx=>{
    const invoiceKey=db().collection('finance_invoice_keys').doc(crypto.createHash('sha256').update(code.toUpperCase()).digest('hex'));
    const sess=await tx.get(ref),prev=await tx.get(inv),customer=await tx.get(cust),pin=await tx.get(db().collection('credit_pins').doc(String(sale.customerPhone||''))),key=await tx.get(invoiceKey);
    if(!sess.exists||sess.data().staffUid!==who.uid||sess.data().kind!=='credit')fail('permission-denied','الجلسة لا تخص عملية الرصيد');
    const s=sess.data();if(prev.exists){if(prev.data().invoiceCode!==code)fail('already-exists','الجلسة استُخدمت لفاتورة مختلفة');return {repeat:true,saleId:inv.id,balance:customer.data()?.credit};}
    if(!active(s)||s.status!=='approved'||stamp()>s.approvedUntil)fail('failed-precondition','تأكيد العميل انتهى؛ اطلب PIN من جديد');
    if(!pin.exists||!Number.isInteger(s.approvedPinVersion)||pin.data().version!==s.approvedPinVersion)fail('failed-precondition','تم تغيير PIN منذ موافقة العميل؛ اطلب موافقة جديدة');
    if(key.exists)fail('already-exists','رقم الفاتورة سبق استخدامه في عملية مالية أخرى');
    try { validateCreditSale(sale,s); }catch(e){fail('failed-precondition',e.message);}
    const before=MONEY(customer.data()?.credit||0);if(before<s.amountCents)fail('failed-precondition','رصيد العميل غير كافٍ');
    const after=(before-s.amountCents)/100, now=stamp();
    const immutable={...sale,creditCheckoutSession:sid,creditApplied:s.amountCents/100,creditApprovalAt:s.approvedAt,createdAt:admin.firestore.FieldValue.serverTimestamp()};
    tx.create(invoiceKey,{invoiceCode:code,sessionId:sid,kind:'credit',invoiceId:inv.id,createdAt:now});
    tx.create(inv,immutable);
    tx.set(cust,{credit:after,creditAt:now},{merge:true});
    tx.create(db().collection('credit_ledger').doc(),{phone:s.phone,amount:-s.amountCents/100,balanceAfter:after,type:'spend',invoiceCode:code,by:who.uid,branch:s.branch,at:now,sessionId:sid});
    tx.update(ref,{status:'finished',invoiceCode:code,completedAt:now});
    tx.set(db().collection('finance_tablets').doc(s.tabletUid),{activeSession:null},{merge:true});
    return {repeat:false,saleId:inv.id,balance:after};
  });return {ok:true,...result};
});

// Return-to-credit: invoice, returned quantities, customer's balance and ledger are ONE transaction.
// Receipt barcode is a non-spendable reference. Never use it as account authentication.
exports.creditReturnFinalizeSale=callable(async req=>{
  const who=await staff(req),sale=req.data?.sale;
  if(!sale || typeof sale!=='object'||Array.isArray(sale))fail('invalid-argument','بيانات فاتورة المرتجع ناقصة');
  const phone=phoneOf(sale.customerPhone),code=String(sale.invoiceCode||'');
  if(!/^[A-Z0-9-]{6,80}$/i.test(code))fail('invalid-argument','رقم فاتورة المرتجع غير صالح');
  const branch=branchOf(sale.branch);
  try{validateBase(sale);}catch(e){fail('failed-precondition',e.message);}
  if(who.branch&&who.branch!==branch&&who.role!=='owner')fail('permission-denied','الفرع غير مسموح');
  const lines=sale.items;
  if(!Array.isArray(lines)||!lines.length||lines.length>80||lines.some(i=>!i.isReturn||!i.fromInvoice||!Number.isInteger(Number(i.qty))||Number(i.qty)<=0||Number(i.qty)>1000||Number(i.price)>=0||i.isGiftCard||i.giftCardId))
    fail('failed-precondition','رصيد المرتجع متاح لفاتورة مرتجع أصناف فقط؛ بدون استبدال أو كروت هدايا');
  const source=String(lines[0].fromInvoice);
  if(lines.some(i=>String(i.fromInvoice)!==source))fail('failed-precondition','المرتجع يجب أن يرجع فاتورة أصلية واحدة');
  const amount=-MONEY(sale.total);
  if(amount<=0||MONEY(sale.payments?.credit_return)!==-amount||Object.entries(sale.payments||{}).some(([k,v])=>k!=='credit_return'&&MONEY(v)!==0))
    fail('failed-precondition','مرتجع الرصيد يجب أن يكون كامل المبلغ وبطريقة واحدة');
  const inv=db().collection('pos_test_sales').doc('CREDIT_RETURN_'+crypto.createHash('sha256').update(code).digest('hex'));
  const invoiceKey=db().collection('finance_invoice_keys').doc(crypto.createHash('sha256').update(code.toUpperCase()).digest('hex'));
  const origQuery=db().collection('pos_test_sales').where('invoiceCode','==',source).limit(2);
  const cust=db().collection('pos_test_customers').doc(phone), now=stamp();
  const ledger=db().collection('credit_ledger').doc('refund_'+crypto.createHash('sha256').update(code).digest('hex'));
  const log=db().collection('pos_return_log').doc('credit_'+crypto.createHash('sha256').update(code).digest('hex'));
  return db().runTransaction(async tx=>{
    const existing=await tx.get(inv);
    if(existing.exists){
      if(existing.data().invoiceCode!==code||existing.data().customerPhone!==phone)fail('already-exists','عملية مستخدمة لفاتورة أخرى');
      const oldLedger=await tx.get(ledger);
      return {ok:true,repeat:true,saleId:inv.id,creditReceipt:oldLedger.data()?.receiptRef||null,pointsDeduct:existing.data().creditReturnPointsDeduct||0,
        amount:oldLedger.data()?.amount||amount/100,balance:oldLedger.data()?.balanceAfter||null,originalInvoice:source};
    }
    const key=await tx.get(invoiceKey);if(key.exists)fail('already-exists','رقم المرتجع مستخدم بالفعل في عملية مالية أخرى');
    const result=await tx.get(origQuery);
    if(result.size!==1)fail('not-found','الفاتورة الأصلية غير موجودة أو رقمها مكرر');
    const original=result.docs[0],orig=original.data();
    if(orig.customerPhone!==phone)fail('failed-precondition','رقم عميلة المرتجع لا يطابق الفاتورة الأصلية؛ لا تحوّل الرصيد لحساب آخر');
    const paidCredit=MONEY(orig.creditApplied||0),paidCash=MONEY(orig.total||0);
    if(paidCredit>0 && paidCash>0)fail('failed-precondition','الفاتورة الأصلية مدفوعة برصيد + طريقة أخرى؛ تحتاج سياسة رد مختلط معتمدة');
    if(paidCredit>0 && paidCash===0 && amount>paidCredit-MONEY(orig.refundedValue||0))fail('failed-precondition','المبلغ يتجاوز الرصيد الأصلي غير المسترد');
    if(!Array.isArray(orig.items))fail('failed-precondition','أصناف الفاتورة الأصلية غير مسجلة');
    const gross=orig.items.filter(i=>!i.isRedemption&&!i.isRewardDiscount&&!i.isGiftCard&&Number(i.price)>0)
      .reduce((sum,i)=>sum+MONEY(i.price)*Number(i.qty||1),0);
    const originalNet=paidCash+paidCredit;
    if(gross<=0||originalNet<=0||originalNet>gross+1)fail('failed-precondition','بيانات السعر الأصلي غير متسقة');
    const sold=new Map();
    for(const it of orig.items){
      if(it.isRedemption||it.isRewardDiscount||it.isGiftCard||it.giftCardId||Number(it.price)<=0)continue;
      const key=String(it.barcode||'')+'|'+String(it.name||'');
      const item=sold.get(key)||{quantity:0,price:MONEY(it.price)};
      if(item.price!==MONEY(it.price))fail('failed-precondition','الصنف له أكثر من سعر أصلي؛ يحتاج مراجعة');
      item.quantity+=Number(it.qty)||0;sold.set(key,item);
    }
    let calculated=0;const returned={...(orig.returnedQty||{})};
    for(const it of lines){
      const key=String(it.barcode||'')+'|'+String(it.name||''), item=sold.get(key),qty=Number(it.qty);
      if(!item||!Number.isInteger(qty)||item.quantity<(Number(returned[key]||0)+qty))fail('failed-precondition','الصنف أو الكمية سبق استرجاعها');
      const unit=Math.round(item.price*originalNet/gross);
      if(-MONEY(it.price)!==unit)fail('failed-precondition','مبلغ الصنف لا يطابق قيمة الفاتورة الأصلية بعد توزيع الخصم');
      calculated+=unit*qty;returned[key]=(Number(returned[key])||0)+qty;
    }
    if(calculated!==amount||amount>MONEY(orig.total||0)+paidCredit-MONEY(orig.refundedValue||0))
      fail('failed-precondition','مبلغ المرتجع غير مطابق أو تم رده سابقًا');
    const customer=await tx.get(cust);if(!customer.exists)fail('failed-precondition','يجب تسجيل حساب العميلة أولًا');
    const before=MONEY(customer.data().credit||0),after=(before+amount)/100;
    const alreadyPts=Number(orig.pointsRefunded)||0,earned=Math.max(0,Number(orig.loyaltyPointsEarned)||0),refundedBefore=MONEY(orig.refundedValue||0);
    const dueAll=Math.round(earned*Math.min(originalNet,refundedBefore+amount)/originalNet);
    const pointsDeduct=Math.max(0,Math.min(dueAll-alreadyPts,earned-alreadyPts));
    const receiptRef='CR-'+crypto.createHash('sha256').update(code).digest('hex').slice(0,20).toUpperCase();
    const paymentMethods=orig.payments||{};
    const visaRefs=(orig.cardTxns||[orig.cardTxn].filter(Boolean)).map(x=>String(x.ref||x.txn?.ref||x.txn?.transactionId||'')).filter(Boolean).slice(0,2);
    tx.create(invoiceKey,{invoiceCode:code,sessionId:null,kind:'credit_return',invoiceId:inv.id,createdAt:now});
    tx.create(inv,{...sale,creditReturn:{receiptRef,originalInvoice:source,amount:amount/100},creditReturnPointsDeduct:pointsDeduct,createdAt:admin.firestore.FieldValue.serverTimestamp()});
    tx.update(original.ref,{returnedQty:returned,refundedValue:(refundedBefore+amount)/100,pointsRefunded:alreadyPts+pointsDeduct});
    tx.update(cust,{credit:after,creditAt:now});
    tx.create(ledger,{phone,amount:amount/100,balanceAfter:after,type:'return_credit',source:'verified_return',originalInvoice:source,
      invoiceCode:code,receiptRef,originalPayments:paymentMethods,visaRefs,branch,by:who.uid,byName:who.name,at:now,noExpiry:true});
    tx.create(log,{branch,employeeId:who.uid,employeeName:who.name,invoiceCode:code,customerPhone:phone,
      originalInvoice:source,items:lines.map(i=>({name:i.name,barcode:i.barcode||'',qty:i.qty,refund:-Number(i.price)*Number(i.qty)})),
      totalRefund:amount/100,method:'credit_return',creditReceipt:receiptRef,ts:now});
    return {ok:true,repeat:false,saleId:inv.id,amount:amount/100,balance:after,creditReceipt:receiptRef,pointsDeduct,originalInvoice:source,
      originalPayments:paymentMethods,visaRefs};
  });
});



// Barcode opens account/details only. It cannot mint or redeem a single piaster.
exports.financeLookupCreditReceipt=callable(async req=>{
 await staff(req);const reference=String(req.data?.reference||'').toUpperCase().trim();
 if(!/^CR-[0-9A-F]{20}$/.test(reference))fail('invalid-argument','باركود الرصيد غير صالح');
 const q=await db().collection('credit_ledger').where('receiptRef','==',reference).limit(2).get();
 if(q.size!==1)fail('not-found','إيصال الرصيد غير موجود أو مكرر');
 const l=q.docs[0].data(),c=await db().collection('pos_test_customers').doc(l.phone).get();
 return {ok:true,phone:l.phone,amount:l.amount,originalInvoice:l.originalInvoice,refundInvoice:l.invoiceCode,
  balance:c.data()?.credit||0,originalPayments:l.originalPayments||{},visaRefs:l.visaRefs||[]};
});
// Customer-facing statement requires the owner's previously attested PIN, even though
// the legacy customer app currently uses anonymous auth and an unverified phone for its OTHER pages.
exports.creditCustomerStatement=callable(async req=>{
 if(!req.auth?.uid)fail('unauthenticated','مطلوب فتح تطبيق العميلة');
 const phone=phoneOf(req.data?.phone),pin=validPin(req.data?.pin),p=db().collection('credit_pins').doc(phone),
       guard=db().collection('credit_pin_attempts').doc(phone),pinSnap=await p.get();
 if(!pinSnap.exists)fail('failed-precondition','الرصيد محتاج تفعيل PIN بمعرفة المالك');
 const match=sameHash(pinDigest(pin,pinSnap.data().salt),pinSnap.data().hash);
 const authorized=await db().runTransaction(async tx=>{
   const fresh=await tx.get(p),g=await tx.get(guard),now=stamp();
   if(!fresh.exists||fresh.data().version!==pinSnap.data().version)fail('failed-precondition','اتغير الـPIN؛ حاولي من جديد');
   const state=g.data()||{};
   if((state.lockedUntil||0)>now)fail('resource-exhausted','الحساب مقفول مؤقتًا من محاولات الرقم السري');
   if(!match){const attempts=(state.attempts||0)+1;tx.set(guard,{attempts,lockedUntil:attempts>=5?now+900000:0});return false;}
   tx.set(guard,{attempts:0,lockedUntil:0});return true;
 });
 if(!authorized)fail('permission-denied','الرقم السري غير صحيح');
 const q=await db().collection('credit_ledger').where('phone','==',phone).orderBy('at','desc').limit(50).get();
 const c=await db().collection('pos_test_customers').doc(phone).get();
 return {balance:c.data()?.credit||0,rows:q.docs.map(d=>{
 const a=d.data();return {type:a.type||'',amount:a.amount,balanceAfter:a.balanceAfter,at:a.at||0,
   invoiceCode:a.invoiceCode||'',originalInvoice:a.originalInvoice||'',originalPayments:a.originalPayments||{},
   receiptRef:a.receiptRef||'',reason:a.reason||''};})};
},true);

exports.financeOwnerCreditLedger=callable(async req=>{
 await staff(req,true);
 const snap=await db().collection('credit_ledger').orderBy('at','desc').limit(150).get();
 return {rows:snap.docs.map(d=>{const row={id:d.id,...d.data()};delete row.createdAt;return row;})};
});
// A cashier may abandon an attempt; keep reserved InstaPay reference for audit, never recycle it.
exports.financeCancelSession=callable(async req=>{
 const who=await staff(req),sid=String(req.data?.sessionId||'');
 if(!/^[0-9a-f]{36}$/.test(sid))fail('invalid-argument','جلسة غير صالحة');
 const sr=sessionRef(sid);
 return db().runTransaction(async tx=>{
  const ss=await tx.get(sr);if(!ss.exists||ss.data().staffUid!==who.uid)fail('permission-denied','الجلسة لا تخص الموظف');
  if(ss.data().status==='finished')return {ok:true,alreadyFinished:true};
  if(ss.data().status==='cancelled')return {ok:true,repeat:true};
  const tab=db().collection('finance_tablets').doc(ss.data().tabletUid),device=await tx.get(tab);
  tx.update(sr,{status:'cancelled',cancelledAt:stamp(),cancelledBy:who.uid});
  if(device.data()?.activeSession===sid)tx.update(tab,{activeSession:null});
  return {ok:true};
 });
});

Object.defineProperty(exports,'__financeTest',{value:{MONEY,phoneOf,branchOf,validPin,sameHash},enumerable:false});
