'use strict';
const fs=require('fs'),assert=require('assert');
const s=fs.readFileSync(__dirname+'/../pos/pos-sale.js','utf8');
assert(s.includes('function clearCardSaleCompleteState()'),'sale-complete reset helper missing');
assert(s.includes('_cardFirstApprovedAt = null;'),'approved marker not cleared');
assert(s.includes('_cardMoneyAtRiskAt = null;'),'risk marker not cleared');
assert(s.includes('_cartEditsAfterCard = [];'),'post-card edits not cleared');
assert(s.includes('_cardAdjustmentMode = false;'),'adjustment mode not cleared');
assert(s.includes('try{ clearCardSaleCompleteState(); paymobReset(); }catch(e){}\n    goToSale();'),'successful sale must fully clear card state before next sale');
const finallyReset=/if\(_saved && typeof paymobReset === 'function'\)\{[\s\S]{0,300}clearCardSaleCompleteState[\s\S]{0,120}paymobReset\(\)/.test(s);
assert(finallyReset,'confirmPayment successful-finally path must also full-reset');
// Generic reset must keep the safety behavior during an active approved sale.
assert(s.includes("if(!_cardFirstApprovedAt){ _cardMoneyAtRiskAt = null;"),'active-sale card risk protection was weakened');
console.log('PASS test-paymob-sale-complete-reset-v353');
