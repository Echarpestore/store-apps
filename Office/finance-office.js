/* ECHARPE Finance Office v679. Read & reconcile only via owner-protected callables. */
(function(){'use strict';
const el=id=>document.getElementById(id);
const call=async(n,data)=>(await ofApp.functions('us-central1').httpsCallable(n)(data||{})).data;
const d=v=>new Date(Number(v)||0).toLocaleString('ar-EG-u-nu-latn');
const money=v=>Number(v||0).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2})+' ج.م';
const node=(tag,text,className)=>{const e=document.createElement(tag);if(text!=null)e.textContent=String(text);if(className)e.className=className;return e;};
const btn=(txt,action)=>{const b=node('button',txt,'ghost');b.type='button';b.addEventListener('click',action);return b;};
let records=[],visible=[],creditRows=[],selected='';
function status(s){el('financeOfficeStatus').textContent=s;}
function render(){const box=el('financeOfficeRows');box.replaceChildren();
 if(!visible.length){box.appendChild(node('p','لا توجد تحويلات مطابقة ضمن أحدث 200 محاولة.','hint'));return;}
 for(const item of visible){
  const c=node('section');c.style.cssText='border:1px solid #e4e8ec;background:#fafbf9;border-radius:14px;padding:14px;margin:10px 0;display:grid;gap:7px';
  const head=node('div');head.style.cssText='display:flex;gap:10px;justify-content:space-between;flex-wrap:wrap';
  head.append(node('b',(item.invoiceCode||'غير محفوظ')+' · '+item.branch),node('b',money(item.amount)));c.appendChild(head);
  c.append(node('div','الفاتورة: '+money(item.invoiceTotal)+' · المقروء من الإيصال: '+(item.receiptAmount==null?'غير مقروء':money(item.receiptAmount))),
    node('div','المرجع: '+(item.reference||'غير مسجل')+' · '+d(item.createdAt)),
    node('div','الموظف: '+(item.staffName||'—')+' · الطريقة: '+(item.mode||'—')),
    node('div','البيع: '+item.status+' · البنك: '+item.bankStatus));
  if(item.bankNote)c.appendChild(node('div','آخر ملاحظة: '+item.bankNote));
  if(item.ocrChecks)c.appendChild(node('small','فحص الصورة: '+Object.entries(item.ocrChecks).map(([k,v])=>k+': '+(v?'✓':'×')).join(' · ')));
  const actions=node('div');actions.style.cssText='display:flex;gap:8px;flex-wrap:wrap';
  if(item.hasPhoto)actions.appendChild(btn('📸 عرض صورة الإيصال',()=>image(item.sessionId)));
  if(item.status==='finished')actions.appendChild(btn('🏦 تسجيل نتيجة مراجعة CIB',()=>reconcile(item)));
  c.appendChild(actions);box.appendChild(c);
 }
}
window.financeOfficeFilter=function(){const v=String(el('financeOfficeSearch').value||'').toLowerCase().trim();
 visible=records.filter(x=>!v||[x.invoiceCode,x.reference,x.branch,x.staffName].some(y=>String(y||'').toLowerCase().includes(v)));render();};
window.financeOfficeRefresh=async function(){
 status('⏳ جارٍ تحميل آخر المحاولات من السيرفر...');
 try{const res=await call('instaOwnerList');records=res.rows||[];window.financeOfficeFilter();
  const pending=records.filter(x=>x.status==='finished'&&x.bankStatus==='PENDING_BANK_RECONCILIATION').length;
  status('آخر '+records.length+' محاولة · '+pending+' فاتورة تنتظر مطابقة بنكية. لا تعتبر الصورة تأكيدًا من CIB.');
 }catch(e){status('⛔ '+(e.message||'يرجى الدخول بحساب المالك وتفعيل الدوال'));}
};
async function image(sid){try{const r=await call('instaOwnerEvidence',{sessionId:sid});
  const w=document.createElement('div');w.style.cssText='position:fixed;inset:0;z-index:2147483300;background:#000e;display:flex;align-items:center;justify-content:center;padding:12px';
  const panel=node('div');panel.style.cssText='max-width:min(630px,100%);max-height:95vh;overflow:auto;background:#fff;border-radius:18px;padding:15px';
  const close=btn('✕ إغلاق',()=>{w.remove();});const img=node('img');img.src=r.jpeg;img.alt='صورة إيصال مقدّمة من العميل؛ غير مؤكدة بنكيًا';img.style.cssText='display:block;max-width:100%;max-height:75vh;object-fit:contain;margin:10px auto';
  panel.append(close,node('p','هذه صورة إثبات فقط وليست كشف حساب بنكي.','hint'),img);w.appendChild(panel);document.body.appendChild(w);
 }catch(e){alert(e.message||'تعذر عرض الصورة');}}
async function reconcile(item){
 const options=['BANK_CONFIRMED','BANK_MISSING','AMOUNT_MISMATCH'];
 const answer=prompt('اكتب النتيجة بعد مراجعة CIB:\nBANK_CONFIRMED = وصل\nBANK_MISSING = لم يصل\nAMOUNT_MISMATCH = مبلغ مختلف');
 if(!answer)return;const target=answer.trim().toUpperCase();if(!options.includes(target)){alert('الحالة غير صحيحة');return;}
 const note=prompt('اكتب مرجع كشف CIB/سبب التسوية (8 حروف على الأقل)');if(!note||note.trim().length<8)return;
 if(!confirm('هل تحققت من كشف حساب CIB فعلًا وتؤكد تسجيل النتيجة؟'))return;
 try{await call('instaReconcile',{sessionId:item.sessionId,status:target,note:note.trim()});await window.financeOfficeRefresh();}
 catch(e){alert(e.message||'لم تسجّل المراجعة');}
}
window.financeOfficeCreditRefresh=async function(){const box=el('financeCreditRows');box.textContent='⏳ جارٍ تحميل الدفتر...';
 try{const res=await call('financeOwnerCreditLedger');creditRows=res.rows||[];box.replaceChildren();
  for(const x of creditRows){const c=node('div');c.style.cssText='border-bottom:1px solid #ebe6e0;padding:12px 3px;display:grid;gap:4px';
   c.append(node('b',(x.type||'رصيد')+' · '+money(x.amount)),
     node('div','العميلة: '+x.phone+' · الرصيد بعدها: '+money(x.balanceAfter)),
     node('small','الفاتورة: '+(x.invoiceCode||'—')+' · الأصلية: '+(x.originalInvoice||'—')+' · '+d(x.at)),
     node('small','الدفع الأصلي: '+JSON.stringify(x.originalPayments||{})+' · فيزا: '+(x.visaRefs||[]).join(', ')),
     node('small','الموظف: '+(x.byName||x.by||'—')+' · الفرع: '+(x.branch||'—')));box.appendChild(c);
  }
  if(!creditRows.length)box.appendChild(node('p','لا توجد حركات.'));
 }catch(e){box.textContent='⛔ '+(e.message||'بحاجة إلى صلاحية المالك');}
};
})();
