// ============================================================
// load-sales.js — بيحمّل كود تطبيق sales جوه sandbox للاختبار
// بيدعم الشكلين: الملفات المقسومة (sales-app.js) أو index.html القديم
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeSandbox, makeFirebaseStubs } = require('./dom-stubs');

const ROOT = path.resolve(__dirname, '..', '..');           // جذر الريبو
const SALES = path.join(ROOT, 'sales');

function readSalesAppSource(){
  const split = path.join(SALES, 'sales-app.js');
  if (fs.existsSync(split)) return { src: fs.readFileSync(split,'utf8'), from:'sales-app.js' };
  // fallback: استخراج بلوك الموديول من index.html
  const html = fs.readFileSync(path.join(SALES,'index.html'),'utf8');
  const m = html.match(/<script type="module">([\s\S]*?)<\/script>/);
  if(!m) throw new Error('مش لاقي بلوك الموديول في sales/index.html');
  return { src: m[1], from:'index.html (inline)' };
}

function readSalesUiSource(){
  const split = path.join(SALES, 'sales-ui.js');
  if (fs.existsSync(split)) return { src: fs.readFileSync(split,'utf8'), from:'sales-ui.js' };
  const html = fs.readFileSync(path.join(SALES,'index.html'),'utf8');
  const blocks = [...html.matchAll(/<script>(?!.*src=)([\s\S]*?)<\/script>/g)].map(x=>x[1]);
  const ui = blocks.find(b=> b.includes('serviceWorker') && b.includes('renderAnnouncementBanner'));
  if(!ui) throw new Error('مش لاقي بلوك الـ UI في sales/index.html');
  return { src: ui, from:'index.html (inline)' };
}

// بيشيل سطور الـ import ويوفّر بدايلها كـ globals في الـ sandbox
function stripImports(src){
  return src.replace(/^import[\s\S]*?from\s+"[^"]+";\s*$/gm, '');
}

function loadSalesApp(){
  const sandbox = makeSandbox();
  Object.assign(sandbox, makeFirebaseStubs());
  vm.createContext(sandbox);
  const { src, from } = readSalesAppSource();
  vm.runInContext(stripImports(src), sandbox, { filename:'sales-app.js' });
  return { sandbox, from };
}

function loadSalesUi(sandbox){
  const sb = sandbox || makeSandbox();
  if(!sandbox) vm.createContext(sb);
  const { src, from } = readSalesUiSource();
  vm.runInContext(src, sb, { filename:'sales-ui.js' });
  return { sandbox: sb, from };
}

module.exports = { loadSalesApp, loadSalesUi };
