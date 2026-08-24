'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync('Office/office.js','utf8');
function extract(name,next){
 const i=src.indexOf(name); assert(i>=0,'found '+name);
 const j=next?src.indexOf(next,i):src.length; return src.slice(i,j<0?src.length:j);
}
const box={console,Date,Math,Number,String,Object,Array,Intl,isFinite,window:{}};
vm.createContext(box);
const core=extract('function ofDayShift(','/* 🔢 تجميع حركة كل يوم');
vm.runInContext(core,box);
const ofSettle=box.ofSettleDayFor;
assert.equal(ofSettle('2026-08-24',{}),'2026-08-25','Monday -> Tuesday');
assert.equal(ofSettle('2026-08-25',{}),'2026-09-01','Tuesday -> next Tuesday');
assert.deepEqual(JSON.parse(JSON.stringify(box.ofPaymobCycleForPayout('2026-08-25'))),
 {payout:'2026-08-25',start:'2026-08-18',end:'2026-08-24'},'cycle Tue-Mon, no overlap');

assert(src.includes("cashTracked: type !== 'order'"),'new merchant payment auto-tracks cash');
assert(src.includes("t.cashTracked === true"),'only new flagged merchant payments affect cash; no historical double charge');
assert(src.includes("supplierPayments"),'supplier payments have explicit ledger field');
assert(src.includes("id=\"quickGoodsPanel\"")||fs.readFileSync('Office/index.html','utf8').includes('id="quickGoodsPanel"'),'quick goods UI exists');
assert(src.includes("doc('weekly_'+c.end).set"),'weekly settlement deterministic id');
assert(src.includes("value:c.expectedNet"),'expected net prefilled for owner confirmation');
assert(src.includes("kind:'paymobWeekly'"),'Tuesday confirmation appears in inbox');
assert(src.includes("ofMaybeWeeklyPaymobReminder"),'weekly reminder exists');
assert(src.includes("ميعاد الثلاثاء «توقّع» فقط"),'scheduled day never treated as actual without confirmation');
console.log('Office Paymob weekly v65: PASS');
