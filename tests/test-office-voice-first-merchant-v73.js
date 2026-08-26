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
const code=[
 fn('ofArNorm'),cn('OF_AR_DIGIT_WORDS'),cn('OF_NUM_SMALL'),fn('ofArabicDigitsOnly'),fn('ofNaturalMoney'),fn('ofVoiceFindMoney'),
 fn('ofVoiceMerchantFromText'),fn('ofLevenshtein'),fn('ofMerchantMatch'),fn('ofVoiceLocalNatural'),
 'this.parse=ofVoiceLocalNatural;'
].join('\n');
const ctx={D:{merchants:[]}};vm.createContext(ctx);vm.runInContext(code,ctx);
let r=ctx.parse('اشتريت من أحمد بـ ٢٣ ألف ودفعت ١٠ آلاف');
assert(r.ok,'first merchant natural purchase should parse locally');
assert.strictEqual(r.needsMerchantCreate,true,'first merchant must be a reviewed new merchant');
assert.strictEqual(r.merchant.name,'احمد');
assert.strictEqual(r.amount,23000); assert.strictEqual(r.payment,10000);
r=ctx.parse('دفعت لأحمد ٥ آلاف');
assert(r.ok,'first merchant payment should parse locally');
assert.strictEqual(r.kind,'payment'); assert.strictEqual(r.amount,5000); assert.strictEqual(r.needsMerchantCreate,true);
console.log('PASS test-office-voice-first-merchant-v73');
