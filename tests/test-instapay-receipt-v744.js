/* 🧪 v744 — بيانات تحويل إنستاباي (أكده البنك) بتتطبع على الفاتورة · ومش على إيصال الهدية */
const fs=require('fs'), path=require('path'); const src=fs.readFileSync(path.join(__dirname,'..','pos','app.js'),'utf8');
let P=0,F=0; const ok=(c,m)=>{ if(c){P++;console.log('  ✅ '+m);} else {F++;console.log('  ❌ '+m);} };
function extractFn(h){const at=src.indexOf(h);let i=src.indexOf('{',at),d=0;for(;i<src.length;i++){if(src[i]==='{')d++;else if(src[i]==='}'){d--;if(!d)break;}}return src.slice(at,i+1);}
const need=['function buildReceiptHTML(data){'];
let code=need.map(extractFn).join('\n');
// minimal env
const env={ receiptDesignConfig:null, RECEIPT_LABELS:{ar:{}}, currencyLabel:()=>'ج.م' };
try{
  const defCfg = extractFn('function defaultReceiptConfig(');
  const ks='const RECEIPT_ELEMENTS'; const blocksSrc = src.slice(src.indexOf(ks), src.indexOf('];', src.indexOf(ks))+2);
  const f=new Function('window','document','receiptDesignConfig','RECEIPT_LABELS','currencyLabel','receiptBarcodeImg','_deviceBrand','escapeHtml', blocksSrc+'\n'+defCfg+'\n'+code+'\nreturn buildReceiptHTML;');
  const b=f({},{},null,{ar:{}},()=>'ج.م',()=>'',()=>'echarpe',(x)=>String(x));
  const html=b({dateStr:'x',empName:'a',branch:'Glow',items:[{name:'طرحة',qty:1,unit:'5.00',line:'5.00'}],totalStr:'5.00',payStr:'instapay: 5.00',invoiceNo:'1',scanCode:'1',
    instaTxn:{fromFirst:'MOHAMED',bankRef:'d5d953ad',bankAt:Date.now(),amount:5}});
  ok(/INSTAPAY - BANK CONFIRMED/.test(html) && /FROM: MOHAMED/.test(html) && /BANK REF: d5d953ad/.test(html), 'الفاتورة فيها: مؤكد من البنك · اسم المحوّل الأول · مرجع البنك');
  ok(!/INSTAPAY/.test(b({dateStr:'x',items:[],totalStr:'5',payStr:'',invoiceNo:'1',scanCode:'1'})), 'فاتورة من غير تأكيد بنك = مفيش بلوك');
  const g=b({dateStr:'x',items:[],totalStr:'5',payStr:'',invoiceNo:'1',scanCode:'1',giftMode:true,instaTxn:{fromFirst:'M',bankRef:'r',bankAt:1}});
  ok(!/INSTAPAY/.test(g), 'إيصال الهدية مفيهوش بيانات الدفع');
}catch(e){ ok(false, 'crash: '+e.message.slice(0,150)); }
console.log(`\nالنتيجة: ${P} ناجح · ${F} فاشل`);
if (typeof assert === 'function') assert(F === 0, 'test-instapay-receipt-v744: ' + F); else if (F) process.exitCode = 1;
