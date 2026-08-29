'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(cond, msg){
  if(!cond){ console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('PASS:', msg);
}
function extractFn(src, name){
  const st = src.indexOf('function ' + name + '(');
  if(st < 0) return '';
  const op = src.indexOf('{', st);
  let d = 0;
  for(let i=op;i<src.length;i++){
    if(src[i] === '{') d++;
    else if(src[i] === '}'){ d--; if(d===0) return src.slice(st,i+1); }
  }
  return '';
}

const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root,'pos','pos-sale.js'),'utf8');
const sw = fs.readFileSync(path.join(root,'pos','sw.js'),'utf8');

// Build only the scanner-normalization block in isolation.
const arStart = src.indexOf('const AR_KEYS = {');
const arEnd = src.indexOf('window.normalizeScan = normalizeScan;');
assert(arStart >= 0 && arEnd > arStart, 'scanner normalization block exists');
const block = src.slice(arStart, arEnd + 'window.normalizeScan = normalizeScan;'.length);
const ctx = { window:{} };
vm.createContext(ctx);
vm.runInContext(block, ctx);

// Real failure from Arabic 101 layout with an uppercase scanner barcode:
// F => [, T => ﻹ, G => ﻷ, L => /, X => ْ, H => أ, J => ـ
const arabicLayoutScan = '[ﻹﻷ/02672-ْأـ1';
assert(ctx.normalizeScan(arabicLayoutScan) === 'FTGL02672-XHJ1',
  'uppercase receipt barcode is restored correctly while keyboard layout is Arabic');

// Lowercase path / Arabic ligature path also remains supported.
assert(ctx.fixArabicKeyboard('بفﻻ') === 'ftb', 'lowercase Arabic-layout key mapping still works');

// Plain English scan must be untouched.
assert(ctx.normalizeScan('FTGL02672-XHJ1') === 'FTGL02672-XHJ1', 'English-layout scan is unchanged');

// Normal Arabic product-name typing must not be rewritten as a barcode.
assert(ctx.normalizeScan('طرحة سوداء') === 'طرحة سوداء', 'normal Arabic text stays Arabic');

assert(sw.includes('store-apps-shell-v385'), 'POS service worker bumped to v385 so clients receive the fix');

if(process.exitCode) process.exit(process.exitCode);
console.log('v385 Arabic keyboard scanner regression checks passed');
