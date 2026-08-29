'use strict';
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const src=fs.readFileSync('Office/office.js','utf8');
function fn(name){
 const i=src.indexOf('function '+name+'('); assert(i>=0,'missing '+name);
 let b=src.indexOf('{',i),d=0;
 for(let j=b;j<src.length;j++){ if(src[j]==='{')d++; else if(src[j]==='}'&&--d===0)return src.slice(i,j+1); }
 throw new Error('unterminated '+name);
}
function cn(name){ const m=src.match(new RegExp('const '+name+'=(\\{[\\s\\S]*?\\});')); assert(m,'missing '+name); return 'const '+name+'='+m[1]+';'; }
const code=[fn('ofArNorm'),cn('OF_AR_DIGIT_WORDS'),cn('OF_NUM_SMALL'),fn('ofArabicDigitsOnly'),fn('ofNaturalMoney'),fn('ofVoiceFindMoney'),fn('ofVoiceMerchantFromText'),fn('ofLevenshtein'),fn('ofMerchantMatch'),fn('ofVoiceLocalNatural'),'this.parse=ofVoiceLocalNatural;'].join('\n');
const ctx={D:{merchants:[{id:'m1',name:'أحمد'}]}};vm.createContext(ctx);vm.runInContext(code,ctx);
let r=ctx.parse('اشتريت فاتورة بدون اسم تاجر ١٦٨٠٠');
assert(r.ok,'unnamed invoice must parse'); assert.strictEqual(r.isUnnamedMerchant,true); assert.strictEqual(r.merchant.id,'__unnamed__'); assert.strictEqual(r.amount,16800); assert.strictEqual(r.payment,0);
r=ctx.parse('اشتريت فاتورة من غير اسم تاجر بـ ٢٣ ألف ودفعت ١٠ آلاف');
assert(r.ok,'unnamed invoice + payment must parse'); assert.strictEqual(r.amount,23000); assert.strictEqual(r.payment,10000);
r=ctx.parse('اشتريت من أحمد بـ ٢٣ ألف');
assert(r.ok && !r.isUnnamedMerchant,'named merchant path preserved'); assert.strictEqual(r.merchant.id,'m1'); assert.strictEqual(r.amount,23000);
r=ctx.parse('اشتريت فاتورة بدون اسم تاجر');
assert(!r.ok && r.reason==='amount','missing amount must still be rejected; never invent money');
assert(src.includes("doc(mid),{name:'بدون اسم تاجر',systemUnnamed:true"),'commit must ensure stable system merchant doc');
console.log('PASS test-office-voice-unnamed-merchant-v376');
