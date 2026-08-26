'use strict';
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const src=fs.readFileSync('Office/office.js','utf8');
const html=fs.readFileSync('Office/index.html','utf8');
assert(html.includes('id="qgVoiceBtn"'),'voice button');
assert(html.includes('id="ofVoiceOverlay"'),'confirmation overlay');
assert(src.includes("r.lang='ar-EG'"),'Arabic recognition');
assert(src.includes('speechSynthesis.speak'),'voice response');
assert(src.includes("مفيش Firestore write قبل تأكيد"),'no write before confirmation invariant documented');
assert(src.includes("batch.set(ref,{merchantId:mid,type:'order'"),'order write only in commit');
assert(src.includes("batch.set(ref2,{merchantId:mid,type:'payment'"),'payment write in same batch');
assert(src.includes("cashTracked:true"),'supplier payment reduces liquidity');
assert(src.includes("voiceGroupId:group"),'order/payment linked as one voice operation');
assert(src.includes("m.payment>m.before+m.order"),'overpayment warning');
assert(src.includes("score<0.78"),'low-confidence merchant rejected');
assert(src.includes("(list[0].score-list[1].score)<0.12"),'ambiguous merchant rejected');
assert(src.includes("قول الاسم كامل"),'ambiguous name asks for exact name');
assert(src.includes("الحساب قبل الحركة"),'reads balance before');
assert(src.includes("المتبقي للتاجر"),'reads remaining balance');
assert(src.includes("قل تأكيد أو إلغاء"),'voice confirmation');
assert(src.includes("if(_ofVoiceBusy||!_ofVoiceDraft)return"),'double confirm guard');
assert(src.includes("const amount=ofArabicDigitsOnly(moneyPart)"),'strict digit-by-digit amount parser');
assert(html.includes('office.js?v=73'),'v73 cache bust');

// Static parse helpers: extract exact functions.
function fn(name){
 const i=src.indexOf('function '+name+'(');assert(i>=0,name);
 let b=src.indexOf('{',i),d=0;
 for(let j=b;j<src.length;j++){if(src[j]==='{')d++;else if(src[j]==='}'&&--d===0)return src.slice(i,j+1);}
}
const ctx={};vm.createContext(ctx);
vm.runInContext("const OF_AR_DIGIT_WORDS="+src.match(/const OF_AR_DIGIT_WORDS=(\{[\s\S]*?\});/)[1]+";"+fn('ofArNorm')+fn('ofArabicDigitsOnly'),ctx);
assert.equal(ctx.ofArabicDigitsOnly('ثلاثة اثنين خمسة صفر'),3250,'Arabic digit words');
assert.equal(ctx.ofArabicDigitsOnly('٣ ٢ ٥ ٠'),3250,'Arabic numerals');
assert.equal(ctx.ofArabicDigitsOnly('ثلاثة آلاف ومئتين'),null,'free-form amount rejected instead of guessed');
console.log('Office voice merchant v67: PASS');
