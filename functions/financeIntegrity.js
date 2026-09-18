// Pure, side-effect free finance sale validation. Requires no Firebase SDK.
'use strict';
class InvalidFinanceSale extends Error { constructor(message){super(message);this.name='InvalidFinanceSale';} }
const fail = message => {throw new InvalidFinanceSale(message);};
function cents(value){
  if(value===null||value===undefined||value===''||typeof value==='boolean')fail('مبلغ مفقود أو غير صحيح');
  const n=Number(value);
  if(!Number.isFinite(n)||Math.abs(n)>10000000||Math.abs(n*100-Math.round(n*100))>0.00001)fail('المبلغ غير صالح أو فيه كسور قرش');
  return Math.round(n*100);
}
function validateBase(sale){
  if(!sale||typeof sale!=='object'||Array.isArray(sale))fail('فاتورة غير صالحة');
  if(!/^[a-z0-9-]{6,80}$/i.test(String(sale.invoiceCode||'')))fail('كود الفاتورة غير صالح');
  if(!sale.branch||typeof sale.branch!=='string'||sale.branch.length>100||sale.branch.includes('/'))fail('الفرع غير صالح');
  if(!Array.isArray(sale.items)||sale.items.length===0||sale.items.length>100)fail('الأصناف غير صالحة');
  if(!sale.payments||typeof sale.payments!=='object'||Array.isArray(sale.payments))fail('طرق الدفع ناقصة');
  const itemsTotal=sale.items.reduce((sum,item)=>{
    if(!item||!Number.isInteger(Number(item.qty))||Number(item.qty)<=0||Number(item.qty)>1000)fail('كمية الصنف غير صحيحة');
    return sum+cents(item.price)*Number(item.qty);
  },0);
  const total=cents(sale.total);
  if(itemsTotal!==total)fail('مجموع الأصناف غير مطابق لإجمالي الفاتورة');
  const payments=Object.entries(sale.payments);
  if(!payments.length)fail('طريقة الدفع غير موجودة');
  const paid=payments.reduce((sum,[name,value])=>{
    if(!['cash','visa','instapay','salary','credit_return'].includes(name))fail('طريقة دفع غير متوقعة');
    return sum+cents(value);
  },0);
  if(paid!==total)fail('طرق الدفع لا تساوي إجمالي الفاتورة');
  return {total,paid};
}
function validateCreditSale(sale,s){
  const {total}=validateBase(sale);
  if(total<0||cents(s.amountCents/100)<=0||total+s.amountCents!==s.invoiceTotalCents)fail('قيمة فاتورة الرصيد اتغيرت');
  if(sale.customerPhone!==s.phone||sale.branch!==s.branch)fail('العميل أو الفرع مختلف عن موافقة التابلت');
  if(sale.items.some(i=>i.isReturn||i.isGiftCard||i.giftCardId))fail('المرتجعات وكروت الهدايا ممنوعة في صرف الرصيد');
  const creditLines=sale.items.filter(i=>i.isCreditSpend===true);
  if(creditLines.length!==1||cents(creditLines[0].price)*Number(creditLines[0].qty)!==-s.amountCents)fail('سطر خصم الرصيد غير مطابق');
  if(sale.items.some(i=>cents(i.price)<0&&!i.isCreditSpend))fail('خصومات أخرى مع الرصيد تحتاج معاملة مستقلة');
  if(Object.entries(sale.payments).some(([k,v])=>!['cash','visa','salary'].includes(k)&&cents(v)!==0))fail('رصيد مع طريقة دفع غير مدعومة');
  if(sale.creditApplied!==undefined && cents(sale.creditApplied)!==s.amountCents)fail('رصيد مصرح به مختلف');
  return true;
}
function validateInstaSale(sale,s){
  const {total}=validateBase(sale);
  if(total<=0||total!==s.invoiceTotalCents||s.amountCents!==total)fail('التحويل لازم يساوي الفاتورة بالكامل');
  if(sale.branch!==s.branch||sale.items.some(i=>i.isReturn||i.isCreditSpend||i.isGiftCard||i.giftCardId))fail('أصناف غير مدعومة في عملية InstaPay');
  if(cents(sale.payments.instapay)!==total||Object.entries(sale.payments).some(([k,v])=>k!=='instapay'&&cents(v)!==0))fail('ممنوع تقسيم InstaPay في الإصدار الحالي');
  return true;
}
module.exports={cents,validateBase,validateCreditSale,validateInstaSale,InvalidFinanceSale};
