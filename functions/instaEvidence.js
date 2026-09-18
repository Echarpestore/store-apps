'use strict';
// InstaPay evidence != bank confirmation. All accepted sales await reconciliation.
const crypto = require('crypto');
const {validateInstaSale}=require('./financeIntegrity');
const {getFirestore,FieldValue}=require('firebase-admin/firestore');
const {getStorage}=require('firebase-admin/storage');
const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {defineSecret}=require('firebase-functions/params');
const {GoogleAuth}=require('google-auth-library');
const OWNER_EMAIL=defineSecret('OWNER_EMAIL');
const db=()=>getFirestore();
const err=(c,m)=>{throw new HttpsError(c,m);};
const fn=f=>onCall({region:'us-central1',secrets:[OWNER_EMAIL],timeoutSeconds:60,memory:'512MiB'},f);
const cents=v=>{const n=Number(v);if(!Number.isFinite(n))err('invalid-argument','مبلغ غير صالح');return Math.round(n*100);};
const clean=v=>String(v||'').trim().toLowerCase().replace(/[\u0660-\u0669]/g,c=>String(c.charCodeAt(0)-0x660)).replace(/[\u06f0-\u06f9]/g,c=>String(c.charCodeAt(0)-0x6f0));
const refKey=r=>crypto.createHash('sha256').update(clean(r)).digest('hex');
const session=id=>db().collection('finance_sessions').doc(String(id||''));
async function staff(req,ownerOnly=false){const t=req.auth?.token||{},email=clean(t.email);if(!req.auth?.uid||!email||t.firebase?.sign_in_provider==='anonymous')err('permission-denied','حساب موظف مطلوب');const owner=clean(OWNER_EMAIL.value());if(!owner)err('failed-precondition','OWNER_EMAIL غير مضبوط');if(email===owner)return {uid:req.auth.uid,role:'owner',name:t.name||'Owner'};if(ownerOnly)err('permission-denied','المالك فقط');const d=await db().collection('pos_test_settings').doc('staff_access').get();const e=(d.data()?.emails||{})[email.replace(/\./g,'_')];if(!e||e.active===false)err('permission-denied','موظف غير مصرح');return {uid:req.auth.uid,role:'staff',name:e.name||email,branch:e.branch||''};}
async function kiosk(req){const uid=req.auth?.uid;if(!uid||req.auth.token?.firebase?.sign_in_provider!=='anonymous')err('permission-denied','التابلت فقط');const d=await db().collection('finance_tablets').doc(uid).get();if(!d.exists||!d.data().active)err('permission-denied','تابلت غير مربوط');return {uid,...d.data()};}
function extractReceipt(text){
 const t=clean(text).replace(/٬/g,',').replace(/٫/g,'.');
 const success=/تم\s*التحويل\s*بنجاح|transfer\s+successful|successfully\s+transferred/.test(t);
 const amt=t.match(/(?:^|\n)\s*([\d,]+(?:\.\d{1,2})?)\s*(?:egp|جنيه)(?:\s|$)/m);
 const reference=t.match(/(?:الرقم\s*المرجعي|reference\s*(?:number|no\.?|id)?)[\s:\n]*([0-9]{10,24})/);
 const date=t.match(/\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(20\d{2})\s+(\d{1,2}):(\d{2})\s*(am|pm)\b/);
 return {success,amountCents:amt?cents(amt[1].replace(/,/g,'')):null,reference:reference?reference[1]:null,date:date?date.slice(1):null,normalized:t};
}
function cairoParts(ms){const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Cairo',year:'numeric',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(ms);return Object.fromEntries(p.map(x=>[x.type,x.value]));}
function nearSession(date,started){if(!date)return false;const [day,mon,year,h,m,ap]=date;let hour=+h%12+(ap==='pm'?12:0);const matches=[];
 // Build against Cairo-local representations across the complete ±5m window; handles midnight and DST.
 for(let k=-5;k<=5;k++){const d=cairoParts(started+k*60000);if(+d.day===+day&&d.month.toLowerCase().startsWith(mon)&&+d.year===+year&&+d.hour===hour&&+d.minute===+m)matches.push(k);}return matches.length>0;
}
function autoCheck(text,s,cfg,confidence){const r=extractReceipt(text);const alias=clean(cfg.alias).replace(/\s/g,'');const beneficiarySection=(r.normalized.split(/(?:إلى|الى|to)\s*(?:المحفظة\s*الإلكترونية|account)?/)[1]||'').split(/(?:الرقم\s*المرجعي|reference)/)[0].replace(/\s/g,'');
 const checks={success:r.success,amount:r.amountCents===s.amountCents,beneficiary:!!alias&&beneficiarySection.includes(alias),reference:!!r.reference,date:nearSession(r.date,s.createdAt),ocr:confidence>=.92&&r.normalized.length>=75};
 return {ok:Object.values(checks).every(Boolean),checks,reference:r.reference,amountCents:r.amountCents,date:r.date};}
async function acceptEvidence(sid,reference,who,mode,details){
 const key=refKey(reference),ref=db().collection('instapay_references').doc(key),sr=session(sid);
 return db().runTransaction(async tx=>{const ss=await tx.get(sr),rr=await tx.get(ref);if(!ss.exists||ss.data().kind!=='instapay')err('failed-precondition','جلسة غير صالحة');const s=ss.data();if(!s.photoPath)err('failed-precondition','لا يوجد تصوير محفوظ');if(s.status==='approved'&&s.reference===reference){if(!rr.exists || rr.data().sessionId!==sid)err('failed-precondition','حجز المرجع غير متطابق');return {ok:true,repeat:true};}
 if(s.status!=='captured'&&s.status!=='pending')err('failed-precondition','عملية غير قابلة للتأكيد');if(Date.now()>s.expiresAt)err('deadline-exceeded','انتهت جلسة الدفع');
 if(rr.exists)err('already-exists','الرقم المرجعي مستخدم بالفعل في فاتورة أخرى');
 tx.create(ref,{sessionId:sid,reference,branch:s.branch,amountCents:s.amountCents,status:'reserved',mode,createdAt:Date.now()});
 tx.update(sr,{status:'approved',reference,mode,approvedBy:who.uid,approvedAt:Date.now(),evidenceCheck:details,bankStatus:'PENDING_BANK_RECONCILIATION'});
 return {ok:true,repeat:false};});
}
exports.instaConfigure=fn(async req=>{const who=await staff(req,true),alias=clean(req.data?.alias),name=String(req.data?.beneficiaryName||'').trim(),bank=String(req.data?.bank||'CIB').trim();if(alias.length<8||alias.length>100||name.length<3)err('invalid-argument','بيانات المستفيد ناقصة');await db().collection('finance_config').doc('instapay').set({alias,name,bank,updatedAt:Date.now(),by:who.uid});return {ok:true};});
exports.instaStart=fn(async req=>{const who=await staff(req),amount=cents(req.data?.amount),invoiceTotal=cents(req.data?.invoiceTotal),branch=String(req.data?.branch||'').trim();if(amount<=0||invoiceTotal<=0||amount!==invoiceTotal||!branch||branch.includes('/'))err('invalid-argument','بيانات فاتورة غير صالحة');if(who.branch&&who.branch!==branch&&who.role!=='owner')err('permission-denied','فرع غير مسموح');const cfg=await db().collection('finance_config').doc('instapay').get();if(!cfg.exists)err('failed-precondition','المستفيد غير مضبوط من المالك');const b=await db().collection('finance_tablet_branches').doc(branch).get();if(!b.exists)err('failed-precondition','التابلت غير مربوط');const uid=b.data().uid,sid=crypto.randomBytes(18).toString('hex'),now=Date.now(),t=db().collection('finance_tablets').doc(uid);await db().runTransaction(async tx=>{const td=await tx.get(t);if(!td.exists||!td.data().active||td.data().branch!==branch)err('failed-precondition','ربط التابلت غير صالح');if(td.data().activeSession){const prior=await tx.get(session(td.data().activeSession));if(prior.exists&&prior.data().expiresAt>now&&!['finished','cancelled'].includes(prior.data().status))err('already-exists','فيه عملية شغالة');}
 tx.create(session(sid),{kind:'instapay',status:'pending',branch,tabletUid:uid,staffUid:who.uid,staffName:who.name,amountCents:amount,invoiceTotalCents:invoiceTotal,recipientAlias:cfg.data().alias,recipientName:cfg.data().name,recipientBank:cfg.data().bank,createdAt:now,expiresAt:now+300000});tx.set(t,{activeSession:sid},{merge:true});});return {sessionId:sid,expiresAt:now+300000};});
exports.instaTabletDetails=fn(async req=>{const tab=await kiosk(req),sid=tab.activeSession;if(!sid)return {status:'idle'};const snap=await session(sid).get();if(!snap.exists||snap.data().tabletUid!==tab.uid||snap.data().kind!=='instapay'||Date.now()>snap.data().expiresAt)return {status:'idle'};const s=snap.data();return {sessionId:sid,status:s.status,amount:s.amountCents/100,recipientAlias:s.recipientAlias,recipientName:s.recipientName,recipientBank:s.recipientBank};});
exports.instaSubmitPhoto=fn(async req=>{
 const tab=await kiosk(req),sid=String(req.data?.sessionId||''),snap=await session(sid).get();if(!snap.exists||snap.data().tabletUid!==tab.uid||tab.activeSession!==sid||snap.data().kind!=='instapay'||Date.now()>snap.data().expiresAt||!['pending','captured'].includes(snap.data().status))err('failed-precondition','جلسة التصوير غير صالحة');
 const raw=String(req.data?.jpeg||''),m=/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(raw);if(!m||raw.length>1100000)err('invalid-argument','الصورة لازم JPEG كاملة وأقل من 800 كيلوبايت');const bytes=Buffer.from(m[1],'base64');if(bytes.length<15000||bytes.length>800000||bytes[0]!==0xff||bytes[1]!==0xd8)err('invalid-argument','صورة غير صحيحة');
 const path='finance-evidence/'+sid+'/'+crypto.randomBytes(12).toString('hex')+'.jpg';await getStorage().bucket().file(path).save(bytes,{resumable:false,contentType:'image/jpeg',metadata:{cacheControl:'private, no-store'}});
 await db().runTransaction(async tx=>{const latest=await tx.get(session(sid));
 if(!latest.exists||latest.data().tabletUid!==tab.uid||latest.data().status!=='pending'||Date.now()>latest.data().expiresAt)err('failed-precondition','جلسة التصوير اتغيرت؛ امنع التصوير المتوازي');
 tx.update(session(sid),{photoPath:path,photoAt:Date.now(),status:'reading'});
 });
 let text='',confidence=0,visionError='';try{const auth=new GoogleAuth({scopes:['https://www.googleapis.com/auth/cloud-vision']});const client=await auth.getClient();const result=await client.request({url:'https://vision.googleapis.com/v1/images:annotate',method:'POST',data:{requests:[{image:{content:bytes.toString('base64')},features:[{type:'DOCUMENT_TEXT_DETECTION'}],imageContext:{languageHints:['ar','en']}}]}});const r=result.data.responses?.[0]||{};if(r.error)throw Error(r.error.message);text=r.fullTextAnnotation?.text||'';const words=(r.fullTextAnnotation?.pages||[]).flatMap(p=>p.blocks||[]).flatMap(b=>b.paragraphs||[]).flatMap(p=>p.words||[]);confidence=words.length?words.reduce((n,w)=>n+(w.confidence||0),0)/words.length:0;}catch(e){visionError=String(e.message||e).slice(0,160);}
 const config=await db().collection('finance_config').doc('instapay').get(),checked=autoCheck(text,snap.data(),config.data()||{},confidence);
 await db().runTransaction(async tx=>{const current=await tx.get(session(sid));if(!current.exists||current.data().status!=='reading'||current.data().photoPath!==path)err('failed-precondition','نتيجة OCR قديمة أو جلسة التصوير اتغيرت');
 tx.update(session(sid),{status:'captured',ocr:{text:text.slice(0,5000),confidence,checks:checked.checks,amountCents:checked.amountCents,reference:checked.reference||null,receiptDate:checked.date||null,error:visionError},ocrAt:Date.now()});});
 if(!checked.ok)return {status:'manual_review',checks:checked.checks,ocrError:visionError};
 const done=await acceptEvidence(sid,checked.reference,{uid:'automatic'},'auto',{checks:checked.checks,amountCents:checked.amountCents});return {status:done.ok?'approved':'manual_review',checks:checked.checks};
});
exports.instaGetEvidence=fn(async req=>{const who=await staff(req),doc=await session(req.data?.sessionId).get();if(!doc.exists||doc.data().kind!=='instapay'||doc.data().staffUid!==who.uid||!doc.data().photoPath)err('permission-denied','الصورة غير متاحة');const [bytes]=await getStorage().bucket().file(doc.data().photoPath).download();if(bytes.length>800000)err('failed-precondition','الصورة كبيرة');return {jpeg:'data:image/jpeg;base64,'+bytes.toString('base64')};});
exports.instaManualApprove=fn(async req=>{const who=await staff(req),sid=String(req.data?.sessionId||''),doc=await session(sid).get();if(!doc.exists||doc.data().staffUid!==who.uid||doc.data().kind!=='instapay'||!doc.data().photoPath)err('failed-precondition','لا يوجد إيصال مصور مرتبط بالموظف');const s=doc.data(),reference=String(req.data?.reference||'').trim(),actual=cents(req.data?.amount),reason=String(req.data?.reason||'').trim();if(!/^\d{10,24}$/.test(reference)||reason.length<12)err('invalid-argument','مطلوب رقم مرجعي واضح وسبب مكتوب');if(actual!==s.amountCents)err('failed-precondition','المبلغ غير مطابق؛ لا يمكن إغلاق الفاتورة مدفوعة بالكامل بدون تسوية الفرق');return acceptEvidence(sid,reference,who,'manual',{amountCents:actual,reason,manualAt:Date.now(),declaredBeneficiary:clean(req.data?.beneficiary)});});
exports.instaStatus=fn(async req=>{const who=await staff(req),doc=await session(req.data?.sessionId).get();if(!doc.exists||doc.data().staffUid!==who.uid||doc.data().kind!=='instapay')err('permission-denied','جلسة غير مصرح بها');const s=doc.data();return {status:s.status,reference:s.reference||null,mode:s.mode||null,ocr:s.ocr?{checks:s.ocr.checks,error:s.ocr.error}:null,photoAvailable:!!s.photoPath,expiresAt:s.expiresAt,invoiceCode:s.invoiceCode||null};});
exports.instaFinalizeSale=fn(async req=>{const who=await staff(req),sid=String(req.data?.sessionId||''),sale=req.data?.sale;if(!sale||!sale.invoiceCode)err('invalid-argument','الفاتورة ناقصة');const sr=session(sid),inv=db().collection('pos_test_sales').doc('INSTA_'+sid);
 return db().runTransaction(async tx=>{const ss=await tx.get(sr),prev=await tx.get(inv);if(!ss.exists||ss.data().kind!=='instapay'||ss.data().staffUid!==who.uid)err('permission-denied','الجلسة لا تخص الموظف');const s=ss.data();if(prev.exists){if(prev.data().invoiceCode!==sale.invoiceCode)err('already-exists','فاتورة مختلفة لنفس التحويل');return {ok:true,repeat:true,saleId:inv.id};}
 if(s.status!=='approved'||Date.now()>s.expiresAt)err('failed-precondition','إثبات التحويل لم تتم الموافقة عليه');try{validateInstaSale(sale,s);}catch(e){err('failed-precondition',e.message);}
 const ref=db().collection('instapay_references').doc(refKey(s.reference)),invoiceKey=db().collection('finance_invoice_keys').doc(crypto.createHash('sha256').update(String(sale.invoiceCode).toUpperCase()).digest('hex'));
 const rr=await tx.get(ref),key=await tx.get(invoiceKey);if(!rr.exists||rr.data().sessionId!==sid||rr.data().status!=='reserved')err('failed-precondition','المرجع غير محجوز للعملية');
 if(key.exists)err('already-exists','رقم الفاتورة سبق استخدامه في عملية مالية أخرى');
 tx.create(invoiceKey,{invoiceCode:sale.invoiceCode,sessionId:sid,kind:'instapay',invoiceId:inv.id,createdAt:Date.now()});
 tx.create(inv,{...sale,instapayEvidence:{sessionId:sid,reference:s.reference,mode:s.mode,bankStatus:'PENDING_BANK_RECONCILIATION'},createdAt:FieldValue.serverTimestamp()});tx.update(ref,{status:'invoiced',invoiceCode:sale.invoiceCode,invoiceId:inv.id});tx.update(sr,{status:'finished',invoiceCode:sale.invoiceCode,completedAt:Date.now()});tx.set(db().collection('finance_tablets').doc(s.tabletUid),{activeSession:null},{merge:true});return {ok:true,repeat:false,saleId:inv.id};});});
exports.instaReconcile=fn(async req=>{const who=await staff(req,true),sid=String(req.data?.sessionId||''),status=String(req.data?.status||'');if(!['BANK_CONFIRMED','BANK_MISSING','AMOUNT_MISMATCH'].includes(status))err('invalid-argument','حالة غير صالحة');const note=String(req.data?.note||'').trim();if(note.length<8)err('invalid-argument','التعليق مطلوب');const sr=session(sid),inv=db().collection('pos_test_sales').doc('INSTA_'+sid);await db().runTransaction(async tx=>{const ss=await tx.get(sr),invoice=await tx.get(inv);if(!ss.exists||!invoice.exists||ss.data().kind!=='instapay'||ss.data().status!=='finished')err('failed-precondition','التحويل غير موجود أو الفاتورة لم تحفظ');if(ss.data().bankStatus==='BANK_CONFIRMED'&&status!=='BANK_CONFIRMED')err('failed-precondition','عملية مؤكدة بنكيًا تحتاج تسوية مستقلة');tx.update(sr,{bankStatus:status,bankNote:note,bankReviewedBy:who.uid,bankReviewedAt:Date.now()});
 tx.update(inv,{'instapayEvidence.bankStatus':status,'instapayEvidence.bankReviewedAt':Date.now(),'instapayEvidence.bankReviewedBy':who.uid});tx.create(db().collection('instapay_reconciliation_log').doc(),{sessionId:sid,reference:ss.data().reference,invoiceCode:ss.data().invoiceCode,status,note,by:who.uid,at:Date.now()});});return {ok:true};});

// Owner-only server-sourced reconciliation (never trust an Office browser to write bank status).
exports.instaOwnerList=fn(async req=>{
 await staff(req,true);
 const ss=await db().collection('finance_sessions').where('kind','==','instapay').orderBy('createdAt','desc').limit(200).get();
 return {rows:ss.docs.map(d=>{const s=d.data();return {sessionId:d.id,branch:s.branch,invoiceCode:s.invoiceCode||'',
   invoiceTotal:s.invoiceTotalCents/100,receiptAmount:Number.isFinite(s.evidenceCheck?.amountCents)?s.evidenceCheck.amountCents/100:(Number.isFinite(s.ocr?.amountCents)?s.ocr.amountCents/100:null),receiptDate:s.ocr?.receiptDate||null,
   amount:s.amountCents/100,reference:s.reference||'',createdAt:s.createdAt,staffName:s.staffName,mode:s.mode||'',
   status:s.status,bankStatus:s.bankStatus||'PENDING_BANK_RECONCILIATION',bankNote:s.bankNote||'',
   hasPhoto:!!s.photoPath,ocrChecks:s.ocr?.checks||null};}).sort((a,b)=>b.createdAt-a.createdAt)};
});
exports.instaOwnerEvidence=fn(async req=>{
 await staff(req,true);const d=await session(req.data?.sessionId).get();
 if(!d.exists||d.data().kind!=='instapay'||!d.data().photoPath)err('not-found','الصورة غير موجودة');
 const [buf]=await getStorage().bucket().file(d.data().photoPath).download();
 if(buf.length>800000)err('failed-precondition','صورة أكبر من الحد');
 return {jpeg:'data:image/jpeg;base64,'+buf.toString('base64')};
});

Object.defineProperty(exports,'__instaTest',{value:{extractReceipt,nearSession,autoCheck,refKey},enumerable:false});
