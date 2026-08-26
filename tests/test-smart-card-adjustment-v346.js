'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const pos = fs.readFileSync(path.join(ROOT,'pos','pos-sale.js'),'utf8');
const office = fs.readFileSync(path.join(ROOT,'Office','office.js'),'utf8');
function assert(c,m){ if(!c) throw new Error('FAIL: '+m); console.log('✅ '+m); }
function extractFn(s,sig){ const i=s.indexOf(sig); if(i<0)return ''; let j=s.indexOf('{',i),d=0; for(let k=j;k<s.length;k++){if(s[k]==='{')d++;else if(s[k]==='}'&&--d===0)return s.slice(i,k+1);} return ''; }

// Pending must stay locked: current terminal integration has no guaranteed remote cancel.
{
  const f1=extractFn(pos,'function cardCartEditBlockReason()');
  assert(f1.includes("return 'pending'"), 'Pending card attempt remains locked until terminal result');
  assert(pos.includes('استنى قبول/رفض العملية الأول'), 'Cashier gets explicit pending guidance');
}

// Approved can enter adjustment mode explicitly, not silently.
{
  const guard=extractFn(pos,'function blockCartEditAfterCard()');
  assert(guard.includes("confirm("), 'Approved edit requires explicit cashier confirmation');
  assert(guard.includes('_cardAdjustmentMode = true'), 'Approved edit enters Smart Adjustment mode');
  assert(pos.includes('function cardAdjustmentMessage()'), 'Adjustment summary helper exists');
  assert(pos.includes('لازم نرجّع'), 'POS shows exact refund amount after cart reduction');
}

// Refund due is persisted with workflow metadata.
{
  assert(pos.includes("_due.status = 'due'"), 'Refund workflow starts as due');
  assert(pos.includes("_due.statusLabel = 'مستحق الرد'"), 'Refund due has visible Arabic status');
  assert(pos.includes('_due.adjustmentMode = !!_cardAdjustmentMode'), 'Saved refund due is linked to adjustment mode');
}

// Office workflow is three-stage and cannot mark refunded without reference.
{
  assert(office.includes("status === 'refunding'"), 'Office renders refunding state');
  assert(office.includes("status: 'refunding', statusLabel: 'جارٍ الرد'"), 'Office can move due → refunding');
  assert(office.includes("status: 'refunded', statusLabel: 'تم الرد'"), 'Office can move refunding → refunded');
  assert(office.includes("prompt('اكتبي رقم/مرجع عملية الرد"), 'Final refund requires Paymob reference');
  assert(office.includes("item.status !== 'refunding'"), 'Cannot skip directly from due to refunded');
}
console.log('✅ test-smart-card-adjustment-v346 passed');
