/* Local OCR preflight only: NEVER approves payments. Backend must independently verify. */
export function inspectReceiptText(raw,{amount,alias,startedAt}={}){
 const text=String(raw||'').replace(/[٠-٩]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).replace(/[۰-۹]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace(/[\u200e\u200f\u061c]/g,'').toLowerCase();
 const provider=/insta\s*pay|انستا\s*باي|إنستا\s*باي/.test(text);
 const success=/(?:تم(?:ت)?\s*(?:عملية\s*)?التحويل\s*بنجاح|transfer\s+successful|successfully\s+transferred|transaction\s+successful|transfer\s+completed)/.test(text);
 const values=[];
 for(const line of text.split(/\r?\n/)){
  const m=line.match(/(?:amount|المبلغ|قيمة\s*التحويل)\s*[:：\-]?\s*(?:egp|جنيه)?\s*([\d,]+(?:\.\d{1,2})?)/);
  if(m)values.push(Math.round(Number(m[1].replace(/,/g,''))*100));
 }
 const amountOk=values.length>0&&new Set(values).size===1&&values[0]===Math.round(Number(amount)*100);
 const ref=text.match(/(?:الرقم\s*المرجعي|رقم\s*(?:المرجع|العملية)|reference\s*(?:number|no\.?|id)?|transaction\s*(?:reference|id))\s*[:：#\-]?\s*([0-9]{10,24})(?!\d)/);
 const normalizedAlias=String(alias||'').trim().toLowerCase().replace(/\s/g,'');
 const recipientSection=(text.split(/(?:إلى|الى|to)\s*(?:المحفظة\s*الإلكترونية|account)?/)[1]||'').split(/(?:الرقم\s*المرجعي|reference)/)[0].replace(/\s/g,'');
 const recipient=!!normalizedAlias&&recipientSection.includes(normalizedAlias);
 const date=text.match(/\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(20\d{2})\s+(\d{1,2}):(\d{2})\s*(am|pm)?\b/);
 let dateOk=false;
 if(date&&Number.isFinite(Number(startedAt))){
  const months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  const h=Number(date[4])% (date[6]?12:24)+(date[6]==='pm'?12:0);
  const receiptUtc=Date.UTC(+date[3],months.indexOf(date[2]),+date[1],h-3,+date[5]);
  // Receipt has minute precision. Compare minute-level Cairo time, no earlier than session minute.
  const minute=Math.floor(receiptUtc/60000),start=Math.floor(Number(startedAt)/60000);
  dateOk=minute>=start&&minute<=Math.floor((Number(startedAt)+120000)/60000);
 }
 const checks={provider,success,amount:amountOk,recipient,reference:!!ref,date:dateOk};
 return {checks,reference:ref?.[1]||null,ready:Object.values(checks).every(Boolean),text};
}
