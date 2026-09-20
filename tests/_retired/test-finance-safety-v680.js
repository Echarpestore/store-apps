'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
let n=0;function check(name,fn){fn();n++;console.log('PASS '+name);}
check('Staff cannot create customer with a positive credit',()=>{
 const rules=read('security/firestore-phase2.rules');
 assert(/!\('credit' in request\.resource\.data\)\s*\|\|\s*request\.resource\.data\.credit\s*==\s*0/.test(rules));
 assert(/!\('creditAt' in request\.resource\.data\)\s*\|\|\s*request\.resource\.data\.creditAt\s*==\s*0/.test(rules));
});
check('Credit finalize invokes strict sale validator',()=>assert(read('functions/financeCheckout.js').includes('validateCreditSale(sale,s)')));
check('InstaPay finalize invokes strict sale validator',()=>assert(read('functions/instaEvidence.js').includes('validateInstaSale(sale,s)')));
check('Owner sees actual OCR receipt amount, not invoice amount',()=>assert(read('functions/instaEvidence.js').includes('s.ocr?.amountCents')));
check('Cash drawer preopen preserved before new finance paths',()=>{
 const s=read('pos/pos-sale.js');assert(/preOpenCashDrawerForSale\(invoiceCode, payments\)[\s\S]{0,270}(?:financeSaleWrite|db\.collection\(TEST_SALES\)\.add)/.test(s));
});
console.log('FINANCE_SAFETY_V680='+n+'/'+n+' PASS');
