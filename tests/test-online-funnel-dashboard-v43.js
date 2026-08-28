'use strict';
const fs=require('fs'),assert=require('assert');
const c=fs.readFileSync('pos/chat-staff-ui.js','utf8');
const s=fs.readFileSync('sales/sales-ui.js','utf8');
const h=fs.readFileSync('sales/index.html','utf8');

assert(c.includes('function ccFunnelOwnerPatch(c)'),'staff owner attribution helper');
assert(c.includes('if(r>=6) return {}'),'owner cannot change after order');
assert(c.includes('funnelOwnerName:myName()'),'staff name stored');
assert(c.includes('funnelOwnerBranch:myBranch()'),'staff branch stored');
assert(c.includes('Object.assign({') && c.includes('ccFunnelOwnerPatch(c)'),'normal reply attributes lead');
assert(c.includes('ccFunnelOwnerPatch(c2)'),'outfit reply attributes lead');
assert(c.includes('window.ccOpenPanel = openPanel'),'dashboard can open staff chat');

assert(s.includes('Online Sales Funnel Dashboard v20'),'dashboard exists');
assert(s.includes("getFunnelConvs('customer_chat'"),'dashboard reads existing funnel data');
assert(s.includes("var stages=['view','tryon','cart','checkout','order']"),'funnel stages');
assert(s.includes('function productStats()'),'product conversion');
assert(s.includes('function ownerStats()'),'employee conversion');
assert(s.includes('followUpDueAt'),'overdue followup');
assert(s.includes('salesFunnelOpenLead'),'lead -> chat');
assert(s.includes("p.dataset.salesSection='performance'"),'dashboard is under performance');
assert(s.includes("p.classList.add('sales-panel-hidden')"),'dashboard does not leak onto overview');
assert(s.includes('[data-sales-section-btn="performance"]'),'performance navigation triggers load');
assert(s.includes('Date.now()-_days*86400000'),'range filter');
assert(h.includes('sales-ui.js?v=21'),'sales UI cache bust');
console.log('online funnel dashboard v43: PASS');
