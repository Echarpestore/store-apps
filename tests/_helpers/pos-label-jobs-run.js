// مساعد test-sales-labels-v760.js — بيشغّل startPrintJobListener الحقيقية من pos/app.js (async)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'pos', 'app.js'), 'utf8');
function grab(h){ const i = src.indexOf(h); let d = 0, st = false; for(let j = src.indexOf('{', i); j < src.length; j++){ if(src[j] === '{'){ d++; st = true; } else if(src[j] === '}'){ d--; if(st && !d) return src.slice(i, j + 1); } } }
const mode = process.argv[2];
const out = { printed: [], updates: [], toasts: [] };
const job = { type:'labels', branch:'echarpe Madinaty', status:'pending', items:[{ name:'لاصق', price:40, barcode:'555', qty:2 }, { name:'بدون كود', barcode:'', qty:3 }, { name:'طرحة', price:1, barcode:'777', qty:999 }] };
let docStatus = mode === 'taken' ? 'printing' : 'pending';
const ref = { update(d){ out.updates.push(d); return Promise.resolve(); } };
const db = {
  collection(){ return { doc(){ return ref; }, where(){ return this; }, onSnapshot(cb){ setTimeout(() => cb({ docs:[{ id:'J1', data: () => job }] }), 5); return () => {}; } }; },
  runTransaction(fn){ return fn({ get: () => Promise.resolve({ exists:true, data: () => ({ status: docStatus }) }), update: (r, d) => { out.updates.push(d); docStatus = d.status; } }); }
};
const ctx = { console:{ warn(){} }, Promise, Math, Number, String, Date, setTimeout,
  window: { posShell: mode === 'browser' ? undefined : {} }, db, currentBranch:'echarpe Madinaty', _printJobsDone: new Set(),
  allInventory: [{ barcode:'777', name:'طرحة', price:350 }],
  getPrinterCfg: () => (mode === 'noprinter' ? { invoicePrinter:'EPSON' } : { labelPrinter:'ZDesigner GK420t' }),
  _deviceKey: () => 'dev_A', showToast: (m) => out.toasts.push(m), _printGenericJob: () => Promise.resolve(),
  doPrintLabels: (items, o) => { out.printed.push({ items, remote: o && o.remote }); return mode === 'fail' ? Promise.reject(new Error('Printer offline')) : Promise.resolve(items.reduce((s, i) => s + i.qty, 0)); } };
vm.createContext(ctx);
vm.runInContext(grab('function startPrintJobListener(){') + ';startPrintJobListener();', ctx);
setTimeout(() => process.stdout.write(JSON.stringify(out)), 120);
